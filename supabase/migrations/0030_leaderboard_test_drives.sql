-- =============================================================================
-- 0030 : drives de test dans les classements (phase de test)
-- =============================================================================
-- Les drives simulés (outils de test) n'apparaissaient que pour leur auteur : pendant les tests,
-- où presque tous les drives sont simulés, chacun ne voyait que lui-même. Avec p_include_sim,
-- les builds de test (EXPO_PUBLIC_TEST_TOOLS=1, Expo Go via npm run update:go) montrent aussi les
-- drives simulés visibles des autres, marqués TEST. L'app publiée ne l'envoie jamais.
-- La visibilité ne change pas : un drive « Only me » reste invisible des autres.

drop function if exists public.leaderboard_sprint(text, text, text, uuid, int, text);
drop function if exists public.leaderboard_laps(uuid, text, text, uuid, int, text);
drop function if exists public.leaderboard_score(text, text, int, text);

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
    and not public.is_blocked_with(r.owner_id)
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

revoke all on function public.leaderboard_sprint(text, text, text, uuid, int, text, boolean) from public, anon;
revoke all on function public.leaderboard_laps(uuid, text, text, uuid, int, text, boolean) from public, anon;
revoke all on function public.leaderboard_score(text, text, int, text, boolean) from public, anon;
grant execute on function public.leaderboard_sprint(text, text, text, uuid, int, text, boolean) to authenticated;
grant execute on function public.leaderboard_laps(uuid, text, text, uuid, int, text, boolean) to authenticated;
grant execute on function public.leaderboard_score(text, text, int, text, boolean) to authenticated;

