-- =============================================================================
-- 0002 : confidentialité des drives
--
-- 1. Les points GPS bruts (vitesse point par point, départ exact) ne sont lisibles
--    que par le propriétaire du drive.
-- 2. Les colonnes sensibles de drives (vitesse max, tracé complet, point de départ)
--    ne sont plus lisibles directement : privilèges par colonne.
-- 3. Les autres utilisateurs voient un tracé raccourci au départ et à l'arrivée
--    (zone de confidentialité, comme Strava) via drive_path_public().
-- 4. Le propriétaire lit ses propres données complètes via my_drive_private().
-- =============================================================================

-- 1. Points bruts : propriétaire uniquement ----------------------------------
drop policy if exists "points read" on public.drive_points;
create policy "points read own" on public.drive_points for select to authenticated
  using (exists (select 1 from public.drives d where d.id = drive_id and d.owner_id = auth.uid()));

-- 2. Colonnes lisibles de drives ----------------------------------------------
revoke select on public.drives from anon, authenticated;
grant select (
  id, owner_id, vehicle_id, route_id, circuit_id, title, description,
  started_at, ended_at, distance_m, duration_s, avg_speed_kmh, max_lateral_g,
  score, score_breakdown, score_version, lap_time_ms, visibility,
  like_count, comment_count, created_at
) on public.drives to authenticated;

-- Les fonctions de fil renvoyaient « setof drives » (toutes les colonnes) : elles
-- échoueraient désormais. Elles renvoient la même liste de colonnes que ci-dessus.
drop function if exists public.feed_following(int, timestamptz);
drop function if exists public.drives_nearby(double precision, double precision, int, int);
drop function if exists public.drive_path_geojson(uuid);

create type public.drive_card as (
  id uuid, owner_id uuid, vehicle_id uuid, route_id uuid, circuit_id uuid,
  title text, description text, started_at timestamptz, ended_at timestamptz,
  distance_m int, duration_s int, avg_speed_kmh real, max_lateral_g real,
  score int, score_breakdown jsonb, score_version int, lap_time_ms int,
  visibility public.visibility, like_count int, comment_count int, created_at timestamptz
);

create or replace function public.feed_following(p_limit int default 20, p_before timestamptz default now())
returns setof public.drive_card
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id, d.owner_id, d.vehicle_id, d.route_id, d.circuit_id, d.title, d.description,
         d.started_at, d.ended_at, d.distance_m, d.duration_s, d.avg_speed_kmh, d.max_lateral_g,
         d.score, d.score_breakdown, d.score_version, d.lap_time_ms, d.visibility,
         d.like_count, d.comment_count, d.created_at
  from public.drives d
  where d.created_at < p_before
    and (
      d.owner_id = auth.uid()
      or d.owner_id in (select following_id from public.follows where follower_id = auth.uid())
    )
    and public.can_see_drive(d.owner_id, d.visibility)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

-- Local Discover : lit start_point (colonne non exposée), d'où security definer.
-- Ne renvoie que des drives publics et jamais la position elle-même.
create or replace function public.drives_nearby(p_lat double precision, p_lng double precision, p_radius_m int default 50000, p_limit int default 20)
returns setof public.drive_card
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.owner_id, d.vehicle_id, d.route_id, d.circuit_id, d.title, d.description,
         d.started_at, d.ended_at, d.distance_m, d.duration_s, d.avg_speed_kmh, d.max_lateral_g,
         d.score, d.score_breakdown, d.score_version, d.lap_time_ms, d.visibility,
         d.like_count, d.comment_count, d.created_at
  from public.drives d
  where auth.uid() is not null
    and d.visibility = 'public'
    and d.start_point is not null
    and extensions.st_dwithin(d.start_point, extensions.st_makepoint(p_lng, p_lat)::extensions.geography, least(p_radius_m, 200000))
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

-- 3. Tracé affichable ----------------------------------------------------------
-- Zone de confidentialité : longueur masquée au départ et à l'arrivée pour les autres
-- utilisateurs. Le propriétaire voit son tracé complet.
create or replace function public.privacy_zone_m()
returns int language sql immutable set search_path = '' as $$ select 300 $$;

create or replace function public.drive_path_public(p_drive_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d record;
  len double precision;
  cut double precision;
begin
  select owner_id, visibility, path into d from public.drives where id = p_drive_id;
  if not found or d.path is null or not public.can_see_drive(d.owner_id, d.visibility) then
    return null;
  end if;
  if d.owner_id = auth.uid() then
    return extensions.st_asgeojson(d.path)::json;
  end if;
  len := extensions.st_length(d.path);
  cut := public.privacy_zone_m() / nullif(len, 0);
  -- Tracé trop court pour garder quelque chose après masquage : on ne montre rien.
  if cut is null or cut >= 0.45 then
    return null;
  end if;
  return extensions.st_asgeojson(
    extensions.st_linesubstring(d.path::extensions.geometry, cut, 1 - cut)
  )::json;
end;
$$;

-- 4. Données privées du propriétaire -----------------------------------------
create or replace function public.my_drive_private(p_drive_id uuid)
returns table (max_speed_kmh real)
language sql
stable
security definer
set search_path = ''
as $$
  select d.max_speed_kmh from public.drives d
  where d.id = p_drive_id and d.owner_id = auth.uid()
$$;

revoke all on function public.drives_nearby(double precision, double precision, int, int) from anon, public;
revoke all on function public.drive_path_public(uuid) from anon, public;
revoke all on function public.my_drive_private(uuid) from anon, public;
grant execute on function public.feed_following(int, timestamptz) to authenticated;
grant execute on function public.drives_nearby(double precision, double precision, int, int) to authenticated;
grant execute on function public.drive_path_public(uuid) to authenticated;
grant execute on function public.my_drive_private(uuid) to authenticated;
