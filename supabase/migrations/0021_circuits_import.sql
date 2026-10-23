-- =============================================================================
-- 0021 : référentiel des circuits (import OpenStreetMap + Wikidata)
--
-- - OpenStreetMap (ODbL, attribution « © les contributeurs d'OpenStreetMap ») :
--   emprise du site (area) et tracé de la piste (path).
-- - Wikidata (CC0) : nom, longueur, site web, et circuits absents d'OSM (point seul).
-- - Ville : la plus proche du référentiel GeoNames (0018), calculée après l'import.
-- Rempli par `npm run circuits:import` (scripts/import-circuits.ts), relançable :
-- clés osm_ref (« way/123 », « relation/456 ») et wikidata_id.
-- Les circuits créés à la main (sans ces clés) ne sont jamais touchés.
-- =============================================================================

alter table public.circuits
  add column if not exists location    extensions.geography (Point, 4326),
  add column if not exists osm_ref     text,
  add column if not exists wikidata_id text,
  add column if not exists source      text,
  add column if not exists updated_at  timestamptz not null default now();

-- Index uniques complets (pas partiels) : nécessaires à l'upsert de l'import.
create unique index if not exists circuits_osm_ref on public.circuits (osm_ref);
create unique index if not exists circuits_wikidata on public.circuits (wikidata_id);
create index if not exists circuits_location on public.circuits using gist (location);

alter table public.circuits drop constraint if exists circuits_kind_check;
alter table public.circuits add constraint circuits_kind_check check (kind in ('track', 'karting', 'closed_road'));

-- Point d'un circuit : location, sinon centre de l'emprise / du tracé.
create or replace function public.circuit_point(c public.circuits)
returns extensions.geometry language sql stable set search_path = '' as $$
  select coalesce(
    c.location::extensions.geometry,
    extensions.st_centroid(c.area::extensions.geometry),
    extensions.st_centroid(c.path::extensions.geometry),
    extensions.st_centroid(c.start_line::extensions.geometry)
  )
$$;

-- Remplace 0019 : tient compte de location.
create or replace function public.map_circuits(
  p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision,
  p_limit int default 300
)
returns table (id uuid, name text, city text, country_code text, kind text, lap_length_m int, lat double precision, lng double precision)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.city, c.country_code::text, c.kind, c.lap_length_m,
         extensions.st_y(c.pt), extensions.st_x(c.pt)
  from (select ci.*, public.circuit_point(ci) as pt from public.circuits ci) c
  where c.pt is not null
    and extensions.st_y(c.pt) between p_min_lat and p_max_lat
    and extensions.st_x(c.pt) between p_min_lng and p_max_lng
  order by (c.kind = 'track') desc, c.lap_length_m desc nulls last, c.name
  limit least(greatest(coalesce(p_limit, 300), 1), 500)
$$;

create or replace function public.search_circuits(p_query text, p_limit int default 10)
returns table (id uuid, name text, city text, country_code text, kind text, lap_length_m int, lat double precision, lng double precision)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.city, c.country_code::text, c.kind, c.lap_length_m,
         extensions.st_y(c.pt), extensions.st_x(c.pt)
  from (select ci.*, public.circuit_point(ci) as pt from public.circuits ci) c
  where c.pt is not null
    and length(trim(coalesce(p_query, ''))) >= 2
    and (c.name ilike '%' || public.like_escape(trim(p_query)) || '%'
         or c.city ilike public.like_escape(trim(p_query)) || '%')
  order by (c.name ilike public.like_escape(trim(p_query)) || '%') desc, c.name
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;

-- Après import : ville la plus proche (moins de 30 km) et pays manquant.
create or replace function public.circuits_fill_places()
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
begin
  with near as (
    select ci.id, g.name, g.country_code
    from public.circuits ci
    cross join lateral (
      select gc.name, gc.country_code
      from public.geo_cities gc
      where extensions.st_dwithin(gc.location, public.circuit_point(ci)::extensions.geography, 30000)
      order by gc.location operator(extensions.<->) public.circuit_point(ci)::extensions.geography
      limit 1
    ) g
    where (ci.city is null or ci.country_code is null) and public.circuit_point(ci) is not null
  )
  update public.circuits c
  set city = coalesce(c.city, near.name),
      country_code = coalesce(c.country_code, near.country_code)
  from near
  where near.id = c.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.circuit_point(public.circuits) from public, anon;
grant execute on function public.circuit_point(public.circuits) to authenticated;
revoke all on function public.circuits_fill_places() from public, anon, authenticated;
grant execute on function public.circuits_fill_places() to service_role;
grant all on public.circuits to service_role;
