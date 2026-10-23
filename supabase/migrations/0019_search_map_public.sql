-- =============================================================================
-- 0019 : recherche (drives, utilisateurs, circuits) et carte des drives publics
--
-- - map_public_drives : drives publics dont le premier point visible est dans la zone
--   affichée (chargés au fil des déplacements de la carte). Même forme que map_drives.
-- - map_circuits : circuits de la zone affichée (repère au centre du site).
-- - search_drives / search_users / search_circuits : recherche texte.
-- Visibilité : can_see_drive et blocages, comme partout ; jamais le départ réel.
-- =============================================================================

-- 1. Carte : drives publics de la zone affichée -------------------------------------
-- Index en géométrie : une zone affichée peut couvrir la moitié du globe (trop large pour
-- une comparaison en géographie).
create index if not exists drives_start_point_public_geom on public.drives
  using gist ((start_point_public::extensions.geometry)) where visibility = 'public';

create or replace function public.map_public_drives(
  p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision,
  p_limit int default 200
)
returns table (
  drive_id uuid, owner_id uuid, source text, title text, started_at timestamptz,
  distance_m int, duration_s int, score int, lat double precision, lng double precision,
  username text, display_name text, avatar_url text, vehicle text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.owner_id, 'public', d.title, d.started_at, d.distance_m, d.duration_s, d.score,
         extensions.st_y(d.start_point_public::extensions.geometry),
         extensions.st_x(d.start_point_public::extensions.geometry),
         p.username, p.display_name, p.avatar_url,
         (select nullif(trim(concat_ws(' ', v.make, v.model)), '') from public.vehicles v where v.id = d.vehicle_id)
  from public.drives d
  join public.profiles p on p.id = d.owner_id
  where auth.uid() is not null
    and d.visibility = 'public'
    and d.start_point_public is not null
    and (d.start_point_public::extensions.geometry) operator(extensions.&&) extensions.st_makeenvelope(
          greatest(p_min_lng, -180), greatest(p_min_lat, -90), least(p_max_lng, 180), least(p_max_lat, 90), 4326
        )
    and not public.is_blocked_with(d.owner_id)
  order by d.score desc nulls last, d.started_at desc
  limit least(greatest(coalesce(p_limit, 200), 1), 300)
$$;

-- 2. Carte : circuits de la zone affichée -------------------------------------------
create or replace function public.map_circuits(
  p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision,
  p_limit int default 300
)
returns table (id uuid, name text, city text, country_code text, kind text, lap_length_m int, lat double precision, lng double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, c.city, c.country_code::text, c.kind, c.lap_length_m,
         extensions.st_y(c.pt), extensions.st_x(c.pt)
  from (
    select ci.*, coalesce(
             extensions.st_centroid(ci.area::extensions.geometry),
             extensions.st_centroid(ci.path::extensions.geometry),
             extensions.st_centroid(ci.start_line::extensions.geometry)
           ) as pt
    from public.circuits ci
  ) c
  where c.pt is not null
    and extensions.st_y(c.pt) between p_min_lat and p_max_lat
    and extensions.st_x(c.pt) between p_min_lng and p_max_lng
  order by c.name
  limit least(greatest(coalesce(p_limit, 300), 1), 500)
$$;

-- 3. Recherche -------------------------------------------------------------------------
-- Échappe % et _ d'une saisie utilisateur pour LIKE.
create or replace function public.like_escape(p text)
returns text language sql immutable set search_path = '' as $$
  select replace(replace(replace(coalesce(p, ''), '\', '\\'), '%', '\%'), '_', '\_')
$$;

-- Drives visibles dont le titre contient la saisie (2 caractères minimum).
create or replace function public.search_drives(p_query text, p_limit int default 20)
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
    and length(trim(coalesce(p_query, ''))) >= 2
    and d.title ilike '%' || public.like_escape(trim(p_query)) || '%'
    and public.can_see_drive(d.owner_id, d.visibility)
  order by (d.title ilike public.like_escape(trim(p_query)) || '%') desc, d.like_count desc, d.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

-- Utilisateurs (pseudo ou nom affiché), hors blocages.
create or replace function public.search_users(p_query text, p_limit int default 20)
returns table (id uuid, username text, display_name text, avatar_url text, i_follow boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url, public.is_following(auth.uid(), p.id)
  from public.profiles p
  where auth.uid() is not null
    and length(trim(coalesce(p_query, ''))) >= 2
    and (p.username ilike public.like_escape(ltrim(trim(p_query), '@')) || '%'
         or p.display_name ilike '%' || public.like_escape(trim(p_query)) || '%')
    and p.id <> auth.uid()
    and not public.is_blocked_with(p.id)
  order by (lower(p.username) = lower(ltrim(trim(p_query), '@'))) desc,
           (p.username ilike public.like_escape(ltrim(trim(p_query), '@')) || '%') desc,
           p.username
  limit least(greatest(coalesce(p_limit, 20), 1), 50)
$$;

create or replace function public.search_circuits(p_query text, p_limit int default 10)
returns table (id uuid, name text, city text, country_code text, kind text, lap_length_m int, lat double precision, lng double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id, c.name, c.city, c.country_code::text, c.kind, c.lap_length_m,
         extensions.st_y(c.pt), extensions.st_x(c.pt)
  from (
    select ci.*, coalesce(
             extensions.st_centroid(ci.area::extensions.geometry),
             extensions.st_centroid(ci.path::extensions.geometry),
             extensions.st_centroid(ci.start_line::extensions.geometry)
           ) as pt
    from public.circuits ci
  ) c
  where length(trim(coalesce(p_query, ''))) >= 2
    and (c.name ilike '%' || public.like_escape(trim(p_query)) || '%'
         or c.city ilike public.like_escape(trim(p_query)) || '%')
  order by (c.name ilike public.like_escape(trim(p_query)) || '%') desc, c.name
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;

revoke all on function public.map_public_drives(double precision, double precision, double precision, double precision, int) from public, anon;
revoke all on function public.map_circuits(double precision, double precision, double precision, double precision, int) from public, anon;
revoke all on function public.search_drives(text, int) from public, anon;
revoke all on function public.search_users(text, int) from public, anon;
revoke all on function public.search_circuits(text, int) from public, anon;
grant execute on function public.map_public_drives(double precision, double precision, double precision, double precision, int) to authenticated;
grant execute on function public.map_circuits(double precision, double precision, double precision, double precision, int) to authenticated;
grant execute on function public.search_drives(text, int) to authenticated;
grant execute on function public.search_users(text, int) to authenticated;
grant execute on function public.search_circuits(text, int) to authenticated;
grant execute on function public.like_escape(text) to authenticated;
