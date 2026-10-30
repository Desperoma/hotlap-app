-- =============================================================================
-- 0031 : Community — les posts des autres d'abord
-- =============================================================================
-- Même fil que 0027 ; seul l'ordre change : les drives des autres passent avant les miens
-- (mes posts restent visibles, après ceux des autres, dans chaque tri).

create or replace function public.community_feed(
  p_source text default 'world', p_category text default 'all', p_sort text default 'latest',
  p_lat double precision default null, p_lng double precision default null,
  p_limit int default 20, p_offset int default 0
)
returns table (
  id uuid, owner_id uuid, vehicle_id uuid, route_id uuid, circuit_id uuid,
  title text, description text, started_at timestamptz, ended_at timestamptz,
  distance_m int, duration_s int, avg_speed_kmh real, max_lateral_g real,
  score int, score_breakdown jsonb, score_version int, lap_time_ms int,
  visibility public.visibility, like_count int, comment_count int, created_at timestamptz,
  mode text, is_simulated boolean, elevation_gain_m int,
  badge_kind text, badge_time_ms int, badge_exit_kmh real, badge_rank int, badge_prev_ms int
)
language sql
stable
-- Lit start_point_public (Nearby), drive_points (dénivelé) et tous les temps (rang) : definer,
-- avec can_see_drive sur chaque drive renvoyé ou compté. Aucune position n'est renvoyée.
security definer
set search_path = ''
as $$
  with base as (
    select d.*
    from public.drives d
    where auth.uid() is not null
      and public.can_see_drive(d.owner_id, d.visibility)
      and case coalesce(p_source, 'world')
        when 'world' then d.visibility = 'public' or d.owner_id = auth.uid()
        when 'following' then d.owner_id = auth.uid()
          or d.owner_id in (select f.following_id from public.follows f where f.follower_id = auth.uid())
        when 'crews' then d.owner_id <> auth.uid() and d.owner_id in (
          select m.user_id from public.crew_members m
          where m.status = 'active'
            and m.crew_id in (select c.crew_id from public.crew_members c where c.user_id = auth.uid() and c.status = 'active'))
        else false end
      and case coalesce(p_category, 'all')
        when 'all' then true
        when 'performance' then d.mode in ('sprint', 'circuit') or d.lap_time_ms is not null
          or exists (select 1 from public.sprint_results s where s.drive_id = d.id)
        when 'road_trip' then d.mode = 'free' and d.circuit_id is null
        when 'laps' then d.lap_time_ms is not null
        else exists (select 1 from public.sprint_results s where s.drive_id = d.id and s.kind = p_category)
        end
      and case coalesce(p_sort, 'latest')
        when 'nearby' then p_lat is not null and p_lng is not null
          and d.visibility = 'public' and d.start_point_public is not null
          and extensions.st_dwithin(d.start_point_public, extensions.st_makepoint(p_lng, p_lat)::extensions.geography, 50000)
        when 'top' then d.created_at > now() - interval '30 days'
        else true end
  ), page as (
    select b.*
    from base b
    order by
      (b.owner_id = auth.uid()),
      case when p_sort = 'top'
        then (b.like_count + 2 * b.comment_count + 1)::float8
             / power(extract(epoch from (now() - b.created_at)) / 3600 + 2, 1.2) end desc nulls last,
      b.created_at desc
    limit least(greatest(coalesce(p_limit, 20), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select p.id, p.owner_id, p.vehicle_id, p.route_id, p.circuit_id, p.title, p.description,
         p.started_at, p.ended_at, p.distance_m, p.duration_s, p.avg_speed_kmh, p.max_lateral_g,
         p.score, p.score_breakdown, p.score_version, p.lap_time_ms, p.visibility,
         p.like_count, p.comment_count, p.created_at,
         p.mode, p.is_simulated, elev.gain, b.kind, b.time_ms, b.exit_kmh, b.rk, b.prev_ms
  from page p
  -- Dénivelé positif (routes seulement) : 1 point sur 5 pour lisser le bruit de l'altitude GPS.
  left join lateral (
    select round(sum(greatest(z.a - z.prev_a, 0)))::int as gain
    from (
      select q.altitude as a, lag(q.altitude) over (order by q.ts) as prev_a
      from (
        select dp.altitude, dp.ts, row_number() over (order by dp.ts) as rn
        from public.drive_points dp where dp.drive_id = p.id and dp.altitude is not null
      ) q where q.rn % 5 = 1
    ) z
    where p.mode = 'free' and p.circuit_id is null
  ) elev on true
  -- Temps mis en avant : l'épreuve filtrée, sinon la première dans l'ordre 0-100 → 2 000 m,
  -- sinon le meilleur tour.
  left join lateral (
    select x.kind, x.time_ms, x.exit_kmh, x.at,
           case when p.is_simulated then null else 1 + (
             select count(*) from (
               select distinct on (s2.owner_id) s2.owner_id, s2.time_ms
               from public.sprint_results s2 join public.drives d2 on d2.id = s2.drive_id
               where x.kind <> 'lap' and s2.kind = x.kind and not s2.is_simulated and s2.owner_id <> p.owner_id
                 and public.can_see_drive(d2.owner_id, d2.visibility)
               order by s2.owner_id, s2.time_ms
             ) o where o.time_ms < x.time_ms
           ) + (
             select count(*) from (
               select distinct on (d3.owner_id) d3.owner_id, d3.lap_time_ms
               from public.drives d3
               where x.kind = 'lap' and d3.circuit_id = p.circuit_id and d3.lap_time_ms is not null
                 and not d3.is_simulated and d3.owner_id <> p.owner_id
                 and public.can_see_drive(d3.owner_id, d3.visibility)
               order by d3.owner_id, d3.lap_time_ms
             ) o where o.lap_time_ms < x.time_ms
           ) end::int as rk,
           case when x.kind = 'lap' then (
             select min(d4.lap_time_ms) from public.drives d4
             where d4.owner_id = p.owner_id and d4.circuit_id = p.circuit_id and d4.id <> p.id
               and d4.started_at < p.started_at and d4.lap_time_ms is not null and d4.is_simulated = p.is_simulated)
           else (
             select min(s3.time_ms) from public.sprint_results s3
             where s3.owner_id = p.owner_id and s3.kind = x.kind and s3.drive_id <> p.id
               and s3.achieved_at < x.at and s3.is_simulated = p.is_simulated)
           end as prev_ms
    from (
      (select s.kind, s.time_ms, s.exit_speed_kmh as exit_kmh, s.achieved_at as at
       from public.sprint_results s
       where s.drive_id = p.id
         and (coalesce(p_category, 'all') not in ('0_100', '0_200', '500m', '1000m', '2000m') or s.kind = p_category)
         and coalesce(p_category, 'all') <> 'laps'
       order by array_position(array['0_100', '0_200', '500m', '1000m', '2000m'], s.kind)
       limit 1)
      union all
      (select 'lap', p.lap_time_ms, null::real, p.started_at
       where p.lap_time_ms is not null and p.circuit_id is not null)
      limit 1
    ) x
  ) b on true
  order by
    (p.owner_id = auth.uid()),
    case when p_sort = 'top'
      then (p.like_count + 2 * p.comment_count + 1)::float8
           / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.2) end desc nulls last,
    p.created_at desc
$$;
revoke all on function public.community_feed(text, text, text, double precision, double precision, int, int) from public, anon;
grant execute on function public.community_feed(text, text, text, double precision, double precision, int, int) to authenticated;

