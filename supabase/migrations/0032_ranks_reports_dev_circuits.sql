-- =============================================================================
-- 0032 : classements sans trou (blocage), niveaux de plusieurs conducteurs, signalements,
--        liste des comptes bloqués, création et catégorie de circuits (devs)
-- =============================================================================

-- 1. Classements : un conducteur bloqué (dans un sens ou dans l'autre) est retiré AVANT le
--    calcul des rangs ; avant, il était retiré après et laissait un trou (1, 3, 4…).
create or replace function public.leaderboard_sprint(
  p_kind text, p_scope text default 'world', p_country text default null, p_vehicle uuid default null,
  p_limit int default 50, p_class text default null, p_include_sim boolean default false
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
      and (not s.is_simulated or s.owner_id = auth.uid() or coalesce(p_include_sim, false))
      and not public.is_blocked_with(s.owner_id)
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
  order by r.rk
$$;

create or replace function public.leaderboard_laps(
  p_circuit uuid, p_scope text default 'world', p_country text default null, p_vehicle uuid default null,
  p_limit int default 50, p_class text default null, p_include_sim boolean default false
)
returns table (rank int, user_id uuid, username text, display_name text, avatar_url text,
               make text, model text, time_ms int, drive_id uuid, achieved_at timestamptz, is_me boolean,
               is_simulated boolean, hpi int, cls text)
language sql stable security definer set search_path = '' as $$
  with mk as (
    select public.catalog_key(v.make) || ':' || public.catalog_key(v.model) as k
    from public.vehicles v where v.id = p_vehicle and v.owner_id = auth.uid()
  ), runs as (
    select d.owner_id, d.lap_time_ms as time_ms, d.id as drive_id, d.started_at as achieved_at, d.is_simulated, v.make, v.model,
           public.vehicle_hpi(d.vehicle_id) as hpi
    from public.drives d
    left join public.vehicles v on v.id = d.vehicle_id
    where auth.uid() is not null and d.circuit_id = p_circuit and d.lap_time_ms is not null
      and (not d.is_simulated or d.owner_id = auth.uid() or coalesce(p_include_sim, false))
      and not public.is_blocked_with(d.owner_id)
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
         r.drive_id, r.achieved_at, r.owner_id = auth.uid(), r.is_simulated, r.hpi, public.class_of_hpi(r.hpi)
  from ranked r join public.profiles p on p.id = r.owner_id
  where (r.rk <= least(greatest(coalesce(p_limit, 50), 1), 200) or r.owner_id = auth.uid())
  order by r.rk
$$;

create or replace function public.leaderboard_score(
  p_scope text default 'world', p_country text default null, p_limit int default 50, p_class text default null, p_include_sim boolean default false
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
      and (not d.is_simulated or d.owner_id = auth.uid() or coalesce(p_include_sim, false))
      and not public.is_blocked_with(d.owner_id)
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
  order by r.rk
$$;

revoke all on function public.leaderboard_sprint(text, text, text, uuid, int, text, boolean) from public, anon;
revoke all on function public.leaderboard_laps(uuid, text, text, uuid, int, text, boolean) from public, anon;
revoke all on function public.leaderboard_score(text, text, int, text, boolean) from public, anon;
grant execute on function public.leaderboard_sprint(text, text, text, uuid, int, text, boolean) to authenticated;
grant execute on function public.leaderboard_laps(uuid, text, text, uuid, int, text, boolean) to authenticated;
grant execute on function public.leaderboard_score(text, text, int, text, boolean) to authenticated;


-- 2. Niveaux de plusieurs conducteurs (badges de rang dans le fil, les classements, les drives).
--    Même barème que driver_xp (0028), modifier les deux ensemble. Visible quel que soit le
--    réglage de confidentialité du profil. Drives simulés : ceux de l'utilisateur pour lui-même,
--    et ceux de tout le monde dans les builds de test (p_include_sim).
create or replace function public.xp_total(p_user uuid, p_with_sim boolean)
returns bigint language sql stable security definer set search_path = '' as $$
  with d as (
    select dr.id, dr.distance_m, dr.circuit_id, dr.mode, dr.lap_time_ms, dr.started_at
    from public.drives dr where dr.owner_id = p_user and (not dr.is_simulated or p_with_sim)
  ), verified as (
    select d.id, d.circuit_id, d.lap_time_ms, d.started_at, c.category
    from d join public.circuits c on c.id = d.circuit_id
    where d.mode = 'circuit' and exists (select 1 from public.drive_laps l where l.drive_id = d.id)
  ), pb as (
    select count(*)::int as n from (
      select v.lap_time_ms, min(v.lap_time_ms) over (partition by v.circuit_id order by v.started_at
        rows between unbounded preceding and 1 preceding) as prev_best
      from verified v where v.lap_time_ms is not null
    ) x where x.prev_best is not null and x.lap_time_ms < x.prev_best
  ), agg as (
    select coalesce(sum(d.distance_m), 0)::bigint as dist, count(distinct d.circuit_id)::int as tracks,
           (select count(*)::int from verified) as sess, (select count(distinct category)::int from verified) as cats,
           (select n from pb) as pbs
    from d
  )
  select (a.dist / 100) + a.tracks * 100 + case when a.sess > 0 then 250 else 0 end + a.sess * 100 + a.pbs * 200 + a.cats * 150
  from agg a
$$;
revoke all on function public.xp_total(uuid, boolean) from public, anon, authenticated;

create or replace function public.driver_levels(p_users uuid[], p_include_sim boolean default false)
returns table (user_id uuid, xp bigint)
language sql stable security definer set search_path = '' as $$
  select u.id, public.xp_total(u.id, u.id = auth.uid() or coalesce(p_include_sim, false))
  from (select distinct unnest(p_users[1:100]) as id) u
  where auth.uid() is not null and not public.is_blocked_with(u.id)
$$;
revoke all on function public.driver_levels(uuid[], boolean) from public, anon;
grant execute on function public.driver_levels(uuid[], boolean) to authenticated;

-- 3. Mes signalements, avec le contenu signalé (titre du drive, commentaire, pseudo).
create or replace function public.my_reports()
returns table (id uuid, target_type text, target_id uuid, reason text, status text, created_at timestamptz, label text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.target_type::text, r.target_id, r.reason::text, r.status::text, r.created_at,
         case r.target_type::text
           when 'drive' then (select d.title from public.drives d where d.id = r.target_id)
           when 'comment' then (select left(c.body, 140) from public.comments c where c.id = r.target_id)
           when 'user' then (select '@' || p.username from public.profiles p where p.id = r.target_id)
           else null end
  from public.reports r
  where r.reporter_id = auth.uid()
  order by r.created_at desc
  limit 100
$$;
revoke all on function public.my_reports() from public, anon;
grant execute on function public.my_reports() to authenticated;

-- Signalements de tout le monde (devs) et changement de statut.
create or replace function public.dev_reports(p_status text default 'open')
returns table (id uuid, target_type text, target_id uuid, reason text, status text, created_at timestamptz,
               label text, reporter text, details text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.target_type::text, r.target_id, r.reason::text, r.status::text, r.created_at,
         case r.target_type::text
           when 'drive' then (select d.title from public.drives d where d.id = r.target_id)
           when 'comment' then (select left(c.body, 140) from public.comments c where c.id = r.target_id)
           when 'user' then (select '@' || p.username from public.profiles p where p.id = r.target_id)
           else null end,
         (select p.username from public.profiles p where p.id = r.reporter_id), r.details
  from public.reports r
  where public.is_dev() and (p_status is null or r.status::text = p_status)
  order by r.created_at desc
  limit 200
$$;
revoke all on function public.dev_reports(text) from public, anon;
grant execute on function public.dev_reports(text) to authenticated;

create or replace function public.dev_set_report_status(p_report uuid, p_status text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'dev_only'; end if;
  update public.reports set status = p_status::public.report_status where id = p_report;
end;
$$;
revoke all on function public.dev_set_report_status(uuid, text) from public, anon;
grant execute on function public.dev_set_report_status(uuid, text) to authenticated;

-- 4. Comptes que j'ai bloqués (Settings > Blocked accounts).
create or replace function public.my_blocked()
returns table (user_id uuid, username text, display_name text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.blocked_id, p.username, p.display_name, p.avatar_url, b.created_at
  from public.blocks b join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;
revoke all on function public.my_blocked() from public, anon;
grant execute on function public.my_blocked() to authenticated;

-- 5. Circuits (devs) : catégorie, création depuis la carte (emprise de 400 m autour du point,
--    le tracé se dessine ensuite avec dev_set_circuit_path).
create or replace function public.dev_set_circuit_category(p_circuit uuid, p_category text)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'dev_only'; end if;
  update public.circuits set category = p_category, updated_at = now() where id = p_circuit;
  if not found then raise exception 'circuit_not_found'; end if;
end;
$$;
revoke all on function public.dev_set_circuit_category(uuid, text) from public, anon;
grant execute on function public.dev_set_circuit_category(uuid, text) to authenticated;

create or replace function public.dev_create_circuit(p_name text, p_category text, p_lat double precision, p_lng double precision)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  pt extensions.geography;
  new_id uuid;
begin
  if not public.is_dev() then raise exception 'dev_only'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'invalid_coordinates'; end if;
  pt := extensions.st_makepoint(p_lng, p_lat)::extensions.geography;
  insert into public.circuits (name, kind, category, location, area)
  values (trim(p_name), 'track', p_category, pt, extensions.st_buffer(pt, 400)::extensions.geography)
  returning id into new_id;
  -- Le trigger de catégorie devine d'après le nom : on remet le choix du dev.
  update public.circuits set category = p_category where id = new_id;
  return new_id;
end;
$$;
revoke all on function public.dev_create_circuit(text, text, double precision, double precision) from public, anon;
grant execute on function public.dev_create_circuit(text, text, double precision, double precision) to authenticated;
