-- =============================================================================
-- 0029 : classes de véhicules dans les classements, classement Score corrigé,
--        comptes développeurs, demandes de changement de date de naissance,
--        visibilité par défaut des drives
-- =============================================================================

-- 1. HPI et classe (même calcul que src/features/garage/hpi.ts, npm run levels:test) -------
--   HPI = 999 × (0,60 P + 0,40 A) ; P : ch/t de 30 (0) à 800 (1), log ; A : 0-100 de 15 s (0) à 2,5 s (1), log.
--   0-100 : meilleur mesuré (drives réels), sinon estimé = max(2,3 ; 12 × (82 / ch_t)^0,86).
create or replace function public.hpi_of(p_power_kw real, p_weight_kg int, p_best_ms int)
returns int language sql immutable set search_path = '' as $$
  with h as (
    select (p_power_kw * 1.341) / (p_weight_kg / 1000.0) as hpt
    where p_power_kw > 0 and p_weight_kg > 0
  ), t as (
    select hpt, case when p_best_ms > 0 then p_best_ms / 1000.0 else greatest(2.3, 12 * power(82 / hpt, 0.86)) end as s from h
  )
  select round(999 * (0.6 * least(1, greatest(0, ln(hpt / 30) / ln(800 / 30.0)))
                    + 0.4 * least(1, greatest(0, ln(15 / s) / ln(15 / 2.5)))))::int
  from t
$$;

create or replace function public.class_of_hpi(p_hpi int)
returns text language sql immutable set search_path = '' as $$
  select case when p_hpi is null then null when p_hpi < 300 then 'D' when p_hpi < 500 then 'C' when p_hpi < 650 then 'B'
              when p_hpi < 800 then 'A' when p_hpi < 900 then 'S1' when p_hpi < 950 then 'S2' else 'X' end
$$;

-- HPI d'un véhicule (meilleur 0-100 réel avec cette voiture). Interne : sans contrôle d'accès.
create or replace function public.vehicle_hpi(p_vehicle uuid)
returns int language sql stable security definer set search_path = '' as $$
  select public.hpi_of(v.power_kw, v.weight_kg,
    (select min(s.time_ms)::int from public.sprint_results s where s.vehicle_id = v.id and s.kind = '0_100' and not s.is_simulated))
  from public.vehicles v where v.id = p_vehicle
$$;
revoke all on function public.vehicle_hpi(uuid) from public, anon, authenticated;
grant execute on function public.hpi_of(real, int, int) to authenticated;
grant execute on function public.class_of_hpi(int) to authenticated;

-- Classe des véhicules des drives que je vois (fil, détail d'un drive) ou de mes véhicules.
create or replace function public.vehicle_classes(p_vehicles uuid[])
returns table (vehicle_id uuid, hpi int, cls text)
language sql stable security definer set search_path = '' as $$
  select v.id, h.hpi, public.class_of_hpi(h.hpi)
  from public.vehicles v
  cross join lateral (select public.vehicle_hpi(v.id) as hpi) h
  where auth.uid() is not null and v.id = any (p_vehicles[1:200]) and h.hpi is not null
    and (v.owner_id = auth.uid() or public.can_see_details(v.owner_id)
         or exists (select 1 from public.drives d where d.vehicle_id = v.id and public.can_see_drive(d.owner_id, d.visibility)))
$$;
revoke all on function public.vehicle_classes(uuid[]) from public, anon;
grant execute on function public.vehicle_classes(uuid[]) to authenticated;

-- 2. Classements : colonne classe + filtre par classe (p_class) -----------------------------
-- Score : les drives simulés de l'utilisateur comptent pour lui (marqués TEST), comme les
-- sprints ; avant, ils étaient exclus et un compte qui ne fait que des tests ne voyait rien.
drop function if exists public.leaderboard_sprint(text, text, text, uuid, int);
drop function if exists public.leaderboard_laps(uuid, text, text, uuid, int);
drop function if exists public.leaderboard_score(text, text, int);

create or replace function public.leaderboard_sprint(
  p_kind text, p_scope text default 'world', p_country text default null, p_vehicle uuid default null,
  p_limit int default 50, p_class text default null
)
returns table (rank int, user_id uuid, username text, display_name text, avatar_url text,
               make text, model text, time_ms int, exit_speed_kmh real, drive_id uuid, achieved_at timestamptz,
               is_me boolean, is_simulated boolean, hpi int, cls text)
language sql stable security definer set search_path = '' as $$
  with mk as (
    select public.catalog_key(v.make) || ':' || public.catalog_key(v.model) as k
    from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid()
  ), runs as (
    select s.*, v.make, v.model, public.vehicle_hpi(s.vehicle_id) as hpi
    from public.sprint_results s
    join public.drives d on d.id = s.drive_id
    left join public.vehicles v on v.id = s.vehicle_id
    where auth.uid() is not null and s.kind = p_kind
      and public.can_see_drive(d.owner_id, d.visibility)
      and (not s.is_simulated or s.owner_id = auth.uid())
      and public.leaderboard_scope_ok(s.owner_id, p_scope, p_country, (select k from mk), v.make, v.model)
  ), cand as (
    select distinct on (r.owner_id) r.* from runs r
    where p_class is null or public.class_of_hpi(r.hpi) = p_class
    order by r.owner_id, r.time_ms, r.achieved_at
  ), ranked as (
    select rank() over (order by c.time_ms, c.achieved_at)::int as rk, c.* from cand c
  )
  select r.rk, r.owner_id, p.username, p.display_name, p.avatar_url, r.make, r.model, r.time_ms, r.exit_speed_kmh,
         r.drive_id, r.achieved_at, r.owner_id = auth.uid(), r.is_simulated, r.hpi, public.class_of_hpi(r.hpi)
  from ranked r join public.profiles p on p.id = r.owner_id
  where (r.rk <= least(greatest(coalesce(p_limit, 50), 1), 200) or r.owner_id = auth.uid())
    and not public.is_blocked_with(r.owner_id)
  order by r.rk
$$;

create or replace function public.leaderboard_laps(
  p_circuit uuid, p_scope text default 'world', p_country text default null, p_vehicle uuid default null,
  p_limit int default 50, p_class text default null
)
returns table (rank int, user_id uuid, username text, display_name text, avatar_url text,
               make text, model text, time_ms int, drive_id uuid, achieved_at timestamptz, is_me boolean,
               hpi int, cls text)
language sql stable security definer set search_path = '' as $$
  with mk as (
    select public.catalog_key(v.make) || ':' || public.catalog_key(v.model) as k
    from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid()
  ), runs as (
    select d.owner_id, d.lap_time_ms as time_ms, d.id as drive_id, d.started_at as achieved_at, v.make, v.model,
           public.vehicle_hpi(d.vehicle_id) as hpi
    from public.drives d
    left join public.vehicles v on v.id = d.vehicle_id
    where auth.uid() is not null and d.circuit_id = p_circuit and d.lap_time_ms is not null
      and not d.is_simulated
      and public.can_see_drive(d.owner_id, d.visibility)
      and public.leaderboard_scope_ok(d.owner_id, p_scope, p_country, (select k from mk), v.make, v.model)
  ), cand as (
    select distinct on (r.owner_id) r.* from runs r
    where p_class is null or public.class_of_hpi(r.hpi) = p_class
    order by r.owner_id, r.time_ms, r.achieved_at
  ), ranked as (
    select rank() over (order by c.time_ms, c.achieved_at)::int as rk, c.* from cand c
  )
  select r.rk, r.owner_id, p.username, p.display_name, p.avatar_url, r.make, r.model, r.time_ms,
         r.drive_id, r.achieved_at, r.owner_id = auth.uid(), r.hpi, public.class_of_hpi(r.hpi)
  from ranked r join public.profiles p on p.id = r.owner_id
  where (r.rk <= least(greatest(coalesce(p_limit, 50), 1), 200) or r.owner_id = auth.uid())
    and not public.is_blocked_with(r.owner_id)
  order by r.rk
$$;

create or replace function public.leaderboard_score(
  p_scope text default 'world', p_country text default null, p_limit int default 50, p_class text default null
)
returns table (rank int, user_id uuid, username text, display_name text, avatar_url text,
               make text, model text, score int, distance_m int, drive_id uuid, achieved_at timestamptz, is_me boolean,
               is_simulated boolean, hpi int, cls text)
language sql stable security definer set search_path = '' as $$
  with runs as (
    select d.owner_id, d.score, d.distance_m, d.id as drive_id, d.started_at as achieved_at, d.is_simulated,
           v.make, v.model, public.vehicle_hpi(d.vehicle_id) as hpi
    from public.drives d
    left join public.vehicles v on v.id = d.vehicle_id
    where auth.uid() is not null and d.score is not null and d.circuit_id is null
      and (not d.is_simulated or d.owner_id = auth.uid())
      and coalesce(p_scope, 'world') <> 'model'
      and public.can_see_drive(d.owner_id, d.visibility)
      and public.leaderboard_scope_ok(d.owner_id, p_scope, p_country, null, null, null)
  ), cand as (
    select distinct on (r.owner_id) r.* from runs r
    where p_class is null or public.class_of_hpi(r.hpi) = p_class
    order by r.owner_id, r.score desc, r.achieved_at
  ), ranked as (
    select rank() over (order by c.score desc, c.achieved_at)::int as rk, c.* from cand c
  )
  select r.rk, r.owner_id, p.username, p.display_name, p.avatar_url, r.make, r.model, r.score, r.distance_m,
         r.drive_id, r.achieved_at, r.owner_id = auth.uid(), r.is_simulated, r.hpi, public.class_of_hpi(r.hpi)
  from ranked r join public.profiles p on p.id = r.owner_id
  where (r.rk <= least(greatest(coalesce(p_limit, 50), 1), 200) or r.owner_id = auth.uid())
    and not public.is_blocked_with(r.owner_id)
  order by r.rk
$$;

revoke all on function public.leaderboard_sprint(text, text, text, uuid, int, text) from public, anon;
revoke all on function public.leaderboard_laps(uuid, text, text, uuid, int, text) from public, anon;
revoke all on function public.leaderboard_score(text, text, int, text) from public, anon;
grant execute on function public.leaderboard_sprint(text, text, text, uuid, int, text) to authenticated;
grant execute on function public.leaderboard_laps(uuid, text, text, uuid, int, text) to authenticated;
grant execute on function public.leaderboard_score(text, text, int, text) to authenticated;

-- 3. Comptes développeurs ------------------------------------------------------------------
-- Un dev voit tous les profils et tous les drives comme leur auteur (tracé complet, zone du
-- domicile comprise, points bruts), et peut corriger le tracé d'un circuit. Le statut ne se
-- donne que depuis le SQL Editor :  update public.profiles set is_dev = true where username = '…';
alter table public.profiles add column if not exists is_dev boolean not null default false;

create or replace function public.guard_is_dev()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then new.is_dev := false;
    elsif new.is_dev is distinct from old.is_dev then raise exception 'is_dev_locked';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_is_dev on public.profiles;
create trigger profiles_guard_is_dev before insert or update on public.profiles
  for each row execute function public.guard_is_dev();
revoke all on function public.guard_is_dev() from public, anon, authenticated;

create or replace function public.is_dev()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_dev from public.profiles p where p.id = auth.uid()), false)
$$;
revoke all on function public.is_dev() from public, anon;
grant execute on function public.is_dev() to authenticated;

create or replace function public.can_see_details(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid() or public.is_dev()
    or (
      not public.is_blocked_with(p_owner)
      and exists (
        select 1 from public.profiles p
        where p.id = p_owner
          and (p.details_visibility = 'public'
               or (p.details_visibility = 'followers' and public.is_following(auth.uid(), p_owner)))
      )
    )
$$;

create or replace function public.can_see_drive(d_owner uuid, d_visibility public.visibility)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    d_owner = auth.uid() or public.is_dev()
    or (
      not public.is_blocked_with(d_owner)
      and (
        d_visibility = 'public'
        or (d_visibility = 'followers' and public.is_following(auth.uid(), d_owner))
        or (d_visibility = 'friends'
            and public.is_following(auth.uid(), d_owner)
            and public.is_following(d_owner, auth.uid()))
      )
    )
$$;

-- Tracé complet (comme l'auteur) pour un dev.
create or replace function public.drive_path_public(p_drive_id uuid)
returns json language plpgsql stable security definer set search_path = '' as $$
declare
  d record;
begin
  select owner_id, visibility, path, path_public into d from public.drives where id = p_drive_id;
  if not found or d.path is null or not public.can_see_drive(d.owner_id, d.visibility) then
    return null;
  end if;
  if d.owner_id = auth.uid() or public.is_dev() then
    return extensions.st_asgeojson(d.path)::json;
  end if;
  if d.path_public is null then
    return null;
  end if;
  return extensions.st_asgeojson(d.path_public)::json;
end;
$$;

create or replace function public.drive_path_previews(p_drive_ids uuid[])
returns table (drive_id uuid, path json) language plpgsql stable security definer set search_path = '' as $$
declare
  d record;
  g extensions.geometry;
  dev boolean := public.is_dev();
begin
  if auth.uid() is null then return; end if;
  for d in
    select dr.id, dr.owner_id, dr.visibility, dr.path, dr.path_public
    from public.drives dr
    where dr.id = any (p_drive_ids[1:50]) and dr.path is not null
  loop
    if not public.can_see_drive(d.owner_id, d.visibility) then continue; end if;
    g := case when d.owner_id = auth.uid() or dev then d.path::extensions.geometry else d.path_public end;
    if g is null then continue; end if;
    drive_id := d.id;
    path := extensions.st_asgeojson(extensions.st_simplifypreservetopology(g, 0.0001), 5)::json;
    return next;
  end loop;
end;
$$;

create or replace function public.my_drive_private(p_drive_id uuid)
returns table (max_speed_kmh real) language sql stable security definer set search_path = '' as $$
  select d.max_speed_kmh from public.drives d
  where d.id = p_drive_id and (d.owner_id = auth.uid() or public.is_dev())
$$;

-- Points bruts (télémétrie) : l'auteur, et les devs.
drop policy if exists "points read own" on public.drive_points;
create policy "points read own" on public.drive_points for select to authenticated
  using (exists (select 1 from public.drives d where d.id = drive_id and (d.owner_id = auth.uid() or public.is_dev())));

-- Correction du tracé d'un circuit depuis l'app (devs). p_points : [[lng, lat], …], 3 points ou plus.
-- Un tracé « manual » n'est plus remplacé ni par l'import OSM ni par l'apprentissage d'un drive.
create or replace function public.dev_set_circuit_path(p_circuit uuid, p_points jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  line extensions.geography;
begin
  if not public.is_dev() then raise exception 'dev_only'; end if;
  perform set_config('hotlap.manual_path', 'on', true); -- laisse passer le trigger qui protège les tracés manuels
  if p_points is null then
    update public.circuits set path = null, path_source = null, lap_length_m = null, updated_at = now() where id = p_circuit;
    return;
  end if;
  if jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) < 3 or jsonb_array_length(p_points) > 5000 then
    raise exception 'path_points_invalid';
  end if;
  select extensions.st_makeline(array_agg(extensions.st_makepoint((e.v->>0)::float8, (e.v->>1)::float8) order by e.i))::extensions.geography
    into line
  from jsonb_array_elements(p_points) with ordinality as e(v, i);
  update public.circuits
     set path = line, path_source = 'manual', lap_length_m = round(extensions.st_length(line)), updated_at = now()
   where id = p_circuit;
  if not found then raise exception 'circuit_not_found'; end if;
end;
$$;
revoke all on function public.dev_set_circuit_path(uuid, jsonb) from public, anon;
grant execute on function public.dev_set_circuit_path(uuid, jsonb) to authenticated;

create or replace function public.on_circuit_keep_learned_path()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Tracé corrigé à la main : seul un autre réglage manuel (dev_set_circuit_path) le remplace.
  if old.path_source = 'manual' and coalesce(new.path_source, '') <> 'manual'
     and current_setting('hotlap.manual_path', true) is distinct from 'on' then
    new.path := old.path;
    new.path_source := old.path_source;
    new.lap_length_m := old.lap_length_m;
  elsif new.path is null and old.path is not null and old.path_source = 'drive' then
    new.path := old.path;
    new.path_source := old.path_source;
    new.lap_length_m := coalesce(new.lap_length_m, old.lap_length_m);
  end if;
  if new.start_line is null then new.start_line := old.start_line; end if;
  return new;
end;
$$;

-- 4. Demandes de changement de date de naissance ------------------------------------------
-- La date est verrouillée après l'onboarding (âge minimal) : l'utilisateur fait une demande,
-- un dev l'accepte ou la refuse depuis l'app.
create table if not exists public.birth_date_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  requested    date not null check (requested > '1900-01-01' and requested < current_date),
  reason       text check (char_length(reason) <= 500),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles (id) on delete set null
);
create unique index if not exists birth_date_requests_one_pending on public.birth_date_requests (user_id) where status = 'pending';
alter table public.birth_date_requests enable row level security;
drop policy if exists "bdr read" on public.birth_date_requests;
create policy "bdr read" on public.birth_date_requests for select to authenticated
  using (user_id = auth.uid() or public.is_dev());
drop policy if exists "bdr insert" on public.birth_date_requests;
create policy "bdr insert" on public.birth_date_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and decided_at is null and decided_by is null);
drop policy if exists "bdr cancel" on public.birth_date_requests;
create policy "bdr cancel" on public.birth_date_requests for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');
grant select, insert, delete on public.birth_date_requests to authenticated;

create or replace function public.dev_decide_birth_date(p_request uuid, p_approve boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  r record;
begin
  if not public.is_dev() then raise exception 'dev_only'; end if;
  select * into r from public.birth_date_requests where id = p_request and status = 'pending' for update;
  if not found then raise exception 'request_not_found'; end if;
  if p_approve then
    -- Fonction du propriétaire de la base : le verrou (lock_birth_date) ne s'applique pas.
    update public.profiles set birth_date = r.requested where id = r.user_id;
  end if;
  update public.birth_date_requests
     set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid()
   where id = p_request;
end;
$$;
revoke all on function public.dev_decide_birth_date(uuid, boolean) from public, anon;
grant execute on function public.dev_decide_birth_date(uuid, boolean) to authenticated;

-- Demandes en attente avec le pseudo et la date actuelle (devs).
create or replace function public.dev_birth_date_requests()
returns table (id uuid, user_id uuid, username text, current_birth date, requested date, reason text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.user_id, p.username, p.birth_date, r.requested, r.reason, r.created_at
  from public.birth_date_requests r join public.profiles p on p.id = r.user_id
  where public.is_dev() and r.status = 'pending'
  order by r.created_at
$$;
revoke all on function public.dev_birth_date_requests() from public, anon;
grant execute on function public.dev_birth_date_requests() to authenticated;

-- 5. Visibilité par défaut des nouveaux drives (Settings > Privacy) -----------------------
alter table public.profiles add column if not exists default_drive_visibility public.visibility not null default 'private';
