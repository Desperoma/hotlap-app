-- =============================================================================
-- 0024 : mode Sprint et classements
--
-- 1. drives.mode : 'free' (drive libre) ou 'sprint' (mode dédié choisi avant le départ).
-- 2. sprint_results : meilleurs temps d'un drive en départ arrêté (0-100, 0-200 km/h, 500 m,
--    1 000 m, 2 000 m). Calculés PAR LA BASE depuis drive_points (sprint_times, même algorithme
--    que src/features/sprint/sprint.ts), jamais envoyés par l'app. Un chrono n'est accepté que
--    sur circuit ou sur une Route à chrono autorisé (comme lap_time_ms) ; les drives simulés
--    (outils de test) sont gardés mais marqués et exclus des classements des autres.
-- 3. Classements : sprints (monde, pays, amis, crews, même modèle) et meilleurs tours par
--    circuit. Meilleur résultat par conducteur, sur les drives que je peux voir.
-- =============================================================================

alter table public.drives add column if not exists mode text not null default 'free';
alter table public.drives drop constraint if exists drives_mode_check;
alter table public.drives add constraint drives_mode_check check (mode in ('free', 'sprint'));
grant select (mode) on public.drives to authenticated;

create table if not exists public.sprint_results (
  id              bigint generated always as identity primary key,
  drive_id        uuid not null references public.drives (id) on delete cascade,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  vehicle_id      uuid references public.vehicles (id) on delete set null,
  kind            text not null check (kind in ('0_100', '0_200', '500m', '1000m', '2000m')),
  time_ms         int not null check (time_ms > 0),
  exit_speed_kmh  real,
  circuit_id      uuid references public.circuits (id) on delete set null,
  is_simulated    boolean not null default false,
  achieved_at     timestamptz not null,
  created_at      timestamptz not null default now(),
  unique (drive_id, kind)
);
create index if not exists sprint_results_kind on public.sprint_results (kind, time_ms);
create index if not exists sprint_results_owner on public.sprint_results (owner_id);
alter table public.sprint_results enable row level security;
drop policy if exists "sprints read" on public.sprint_results;
create policy "sprints read" on public.sprint_results for select to authenticated
  using (exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility)));
grant select on public.sprint_results to authenticated;
grant all on public.sprint_results to service_role;

-- Calcul (voir l'en-tête de src/features/sprint/sprint.ts) --------------------------------
create or replace function public.sprint_times(p_drive uuid)
returns table (kind text, time_ms int, exit_speed_kmh real, start_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stop_ms constant double precision := 2 / 3.6;
  break_ms constant double precision := 15 / 3.6;
  kinds constant text[] := array['0_100', '0_200', '500m', '1000m', '2000m'];
  speeds constant double precision[] := array[100 / 3.6, 200 / 3.6, null, null, null];
  dists constant double precision[] := array[null, null, 500, 1000, 2000];
  min_ms constant int[] := array[1500, 4000, 9000, 15000, 25000];
  t double precision[]; v double precision[]; x double precision[];
  n int; i int; s int; j int; k int;
  t0 double precision; x0 double precision; vmax double precision; dt double precision;
  tc double precision; ex double precision; f double precision; ms int;
  done boolean[];
  best_ms int[] := array[null, null, null, null, null]::int[];
  best_ex double precision[] := array[null, null, null, null, null]::double precision[];
  best_t0 double precision[] := array[null, null, null, null, null]::double precision[];
begin
  -- Séries : temps (s), vitesse (m/s ; repli distance / temps), distance cumulée (m).
  with p as (
    select extract(epoch from dp.ts)::double precision as ts, dp.speed,
           coalesce(extensions.st_distance(
             extensions.st_makepoint(lag(dp.lng) over w, lag(dp.lat) over w)::extensions.geography,
             extensions.st_makepoint(dp.lng, dp.lat)::extensions.geography, false), 0) as step,
           extract(epoch from dp.ts - lag(dp.ts) over w)::double precision as dts
    from public.drive_points dp where dp.drive_id = p_drive
    window w as (order by dp.ts, dp.id)
  ), q as (
    select ts, step, sum(step) over (order by ts rows unbounded preceding) as cum,
           case when speed is not null and speed >= 0 then speed
                when dts > 0 then step / dts else 0 end as vel
    from p
  )
  select array_agg(ts order by ts), array_agg(vel order by ts), array_agg(cum order by ts) into t, v, x from q;
  n := coalesce(array_length(t, 1), 0);
  i := 1;
  while i < n loop
    if not (v[i] <= stop_ms and v[i + 1] > stop_ms) then i := i + 1; continue; end if;
    s := i; t0 := t[s]; x0 := x[s]; vmax := 0; done := array[false, false, false, false, false];
    j := s + 1;
    while j <= n loop
      exit when v[j] <= stop_ms or v[j] < vmax - break_ms;
      vmax := greatest(vmax, v[j]);
      dt := t[j] - t[j - 1];
      for k in 1..5 loop
        continue when done[k];
        tc := null; ex := v[j];
        if speeds[k] is not null and v[j - 1] < speeds[k] and v[j] >= speeds[k] then
          tc := t[j - 1] + ((speeds[k] - v[j - 1]) / (v[j] - v[j - 1])) * dt;
          ex := speeds[k];
        elsif dists[k] is not null and x[j - 1] - x0 < dists[k] and x[j] - x0 >= dists[k] then
          f := (dists[k] - (x[j - 1] - x0)) / (x[j] - x[j - 1]);
          tc := t[j - 1] + f * dt;
          ex := v[j - 1] + f * (v[j] - v[j - 1]);
        end if;
        continue when tc is null;
        done[k] := true;
        ms := round((tc - t0) * 1000);
        continue when ms < min_ms[k];
        if best_ms[k] is null or ms < best_ms[k] then
          best_ms[k] := ms; best_ex[k] := ex; best_t0[k] := t0;
        end if;
      end loop;
      j := j + 1;
    end loop;
    i := greatest(j, s + 1);
  end loop;

  for k in 1..5 loop
    if best_ms[k] is not null then
      kind := kinds[k]; time_ms := best_ms[k];
      exit_speed_kmh := round((best_ex[k] * 3.6 * 10)::numeric) / 10;
      start_at := to_timestamp(best_t0[k]);
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function public.sprint_times(uuid) from public, anon, authenticated;

-- Enregistrer les sprints d'un drive (appelé par l'app après la sauvegarde d'un drive Sprint).
create or replace function public.record_drive_sprints(p_drive uuid)
returns table (kind text, time_ms int, exit_speed_kmh real)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  d record;
begin
  select dr.id, dr.owner_id, dr.vehicle_id, dr.circuit_id, dr.route_id, dr.mode, dr.is_simulated
    into d from public.drives dr where dr.id = p_drive;
  if not found or d.owner_id is distinct from auth.uid() then raise exception 'drive_not_found'; end if;
  if d.mode <> 'sprint' then raise exception 'sprint_mode_required'; end if;
  if d.circuit_id is null and not d.is_simulated
     and not exists (select 1 from public.routes r where r.id = d.route_id and r.timing_enabled) then
    raise exception 'sprint_place_not_allowed';
  end if;
  delete from public.sprint_results sr where sr.drive_id = p_drive;
  insert into public.sprint_results (drive_id, owner_id, vehicle_id, kind, time_ms, exit_speed_kmh, circuit_id, is_simulated, achieved_at)
  select p_drive, d.owner_id, d.vehicle_id, st.kind, st.time_ms, st.exit_speed_kmh, d.circuit_id, d.is_simulated, st.start_at
  from public.sprint_times(p_drive) st;
  return query select sr.kind, sr.time_ms, sr.exit_speed_kmh from public.sprint_results sr where sr.drive_id = p_drive
    order by array_position(array['0_100', '0_200', '500m', '1000m', '2000m'], sr.kind);
end;
$$;
revoke all on function public.record_drive_sprints(uuid) from public, anon;
grant execute on function public.record_drive_sprints(uuid) to authenticated;

-- La voiture d'un drive change (récap, détail) : ses sprints suivent.
create or replace function public.on_drive_vehicle_sprints()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.sprint_results set vehicle_id = new.vehicle_id where drive_id = new.id;
  return new;
end;
$$;
drop trigger if exists drives_vehicle_sprints on public.drives;
create trigger drives_vehicle_sprints after update of vehicle_id on public.drives
  for each row execute function public.on_drive_vehicle_sprints();
revoke all on function public.on_drive_vehicle_sprints() from public, anon, authenticated;

-- 3. Classements ---------------------------------------------------------------------------
-- Portée : 'world' | 'country' (pays du profil du conducteur) | 'friends' (moi + mes abonnements)
-- | 'crews' (moi + membres actifs de mes crews) | 'model' (même modèle que p_vehicle).
create or replace function public.leaderboard_scope_ok(
  p_owner uuid, p_scope text, p_country text, p_model_key text, p_vehicle_make text, p_vehicle_model text
) returns boolean language sql stable security definer set search_path = '' as $$
  select case coalesce(p_scope, 'world')
    when 'world' then true
    when 'country' then exists (select 1 from public.profiles p where p.id = p_owner and p.country_code = upper(p_country))
    when 'friends' then p_owner = auth.uid() or public.is_following(auth.uid(), p_owner)
    when 'crews' then p_owner = auth.uid() or exists (
      select 1 from public.crew_members a join public.crew_members b on b.crew_id = a.crew_id
      where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_owner and b.status = 'active')
    when 'model' then p_model_key is not null
      and public.catalog_key(coalesce(p_vehicle_make, '')) || ':' || public.catalog_key(coalesce(p_vehicle_model, '')) = p_model_key
    else false end
$$;
revoke all on function public.leaderboard_scope_ok(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.leaderboard_sprint(
  p_kind text, p_scope text default 'world', p_country text default null, p_vehicle uuid default null, p_limit int default 50
)
returns table (rank int, user_id uuid, username text, display_name text, avatar_url text,
               make text, model text, time_ms int, exit_speed_kmh real, drive_id uuid, achieved_at timestamptz,
               is_me boolean, is_simulated boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with mk as (
    select public.catalog_key(v.make) || ':' || public.catalog_key(v.model) as k
    from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid()
  ), cand as (
    select distinct on (s.owner_id) s.owner_id, s.time_ms, s.exit_speed_kmh, s.drive_id, s.achieved_at, s.is_simulated,
           v.make, v.model
    from public.sprint_results s
    join public.drives d on d.id = s.drive_id
    left join public.vehicles v on v.id = s.vehicle_id
    where auth.uid() is not null and s.kind = p_kind
      and public.can_see_drive(d.owner_id, d.visibility)
      and (not s.is_simulated or s.owner_id = auth.uid())
      and public.leaderboard_scope_ok(s.owner_id, p_scope, p_country, (select k from mk), v.make, v.model)
    order by s.owner_id, s.time_ms, s.achieved_at
  ), ranked as (
    select rank() over (order by c.time_ms, c.achieved_at)::int as rk, c.* from cand c
  )
  select r.rk, r.owner_id, p.username, p.display_name, p.avatar_url, r.make, r.model, r.time_ms, r.exit_speed_kmh,
         r.drive_id, r.achieved_at, r.owner_id = auth.uid(), r.is_simulated
  from ranked r join public.profiles p on p.id = r.owner_id
  where (r.rk <= least(greatest(coalesce(p_limit, 50), 1), 200) or r.owner_id = auth.uid())
    and not public.is_blocked_with(r.owner_id)
  order by r.rk
$$;
revoke all on function public.leaderboard_sprint(text, text, text, uuid, int) from public, anon;
grant execute on function public.leaderboard_sprint(text, text, text, uuid, int) to authenticated;

create or replace function public.leaderboard_laps(
  p_circuit uuid, p_scope text default 'world', p_country text default null, p_vehicle uuid default null, p_limit int default 50
)
returns table (rank int, user_id uuid, username text, display_name text, avatar_url text,
               make text, model text, time_ms int, drive_id uuid, achieved_at timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with mk as (
    select public.catalog_key(v.make) || ':' || public.catalog_key(v.model) as k
    from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid()
  ), cand as (
    select distinct on (d.owner_id) d.owner_id, d.lap_time_ms as time_ms, d.id as drive_id, d.started_at as achieved_at,
           v.make, v.model
    from public.drives d
    left join public.vehicles v on v.id = d.vehicle_id
    where auth.uid() is not null and d.circuit_id = p_circuit and d.lap_time_ms is not null
      and not d.is_simulated
      and public.can_see_drive(d.owner_id, d.visibility)
      and public.leaderboard_scope_ok(d.owner_id, p_scope, p_country, (select k from mk), v.make, v.model)
    order by d.owner_id, d.lap_time_ms, d.started_at
  ), ranked as (
    select rank() over (order by c.time_ms, c.achieved_at)::int as rk, c.* from cand c
  )
  select r.rk, r.owner_id, p.username, p.display_name, p.avatar_url, r.make, r.model, r.time_ms,
         r.drive_id, r.achieved_at, r.owner_id = auth.uid()
  from ranked r join public.profiles p on p.id = r.owner_id
  where (r.rk <= least(greatest(coalesce(p_limit, 50), 1), 200) or r.owner_id = auth.uid())
    and not public.is_blocked_with(r.owner_id)
  order by r.rk
$$;
revoke all on function public.leaderboard_laps(uuid, text, text, uuid, int) from public, anon;
grant execute on function public.leaderboard_laps(uuid, text, text, uuid, int) to authenticated;

-- Circuits qui ont déjà des tours chronométrés visibles (liste du classement « Laps »).
create or replace function public.circuits_with_laps(p_limit int default 50)
returns table (id uuid, name text, city text, country_code text, laps int)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.city, c.country_code::text, count(*)::int
  from public.drives d join public.circuits c on c.id = d.circuit_id
  where auth.uid() is not null and d.lap_time_ms is not null and not d.is_simulated
    and public.can_see_drive(d.owner_id, d.visibility)
  group by c.id
  order by count(*) desc, c.name
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function public.circuits_with_laps(int) from public, anon;
grant execute on function public.circuits_with_laps(int) to authenticated;
