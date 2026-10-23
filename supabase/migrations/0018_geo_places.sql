-- =============================================================================
-- 0018 : référentiel des lieux (GeoNames, licence CC BY 4.0)
--
-- Pays, régions (niveau admin1) et villes des pays retenus : Europe, Canada, États-Unis,
-- Australie, Japon, Qatar, Émirats arabes unis, Arabie saoudite. Rempli par
-- `npm run geo:import` (scripts/import-geonames.ts), relançable.
-- Sert à l'onboarding et au profil (choix de la région, autocomplétion de la ville) et à la
-- recherche de lieux sur la carte. La saisie libre reste possible si un lieu manque.
-- Attribution à afficher dans l'app (écran À propos) : « Lieux : GeoNames (CC BY 4.0) ».
-- =============================================================================

create table if not exists public.geo_countries (
  code        text primary key check (code ~ '^[A-Z]{2}$'),
  name        text not null,
  continent   text,
  geonames_id integer
);

create table if not exists public.geo_admin1 (
  code         text primary key,              -- « FR.44 », comme dans GeoNames
  country_code text not null references public.geo_countries (code) on delete cascade,
  name         text not null,
  search_name  text not null,                 -- minuscules sans accents
  geonames_id  integer
);
create index if not exists geo_admin1_country on public.geo_admin1 (country_code, name);

create table if not exists public.geo_cities (
  id           integer primary key,           -- geonameid
  country_code text not null references public.geo_countries (code) on delete cascade,
  admin1_code  text,                          -- « FR.44 » (peut manquer)
  name         text not null,
  search_name  text not null,                 -- minuscules sans accents
  population   integer not null default 0,
  location     extensions.geography(point, 4326) not null
);
create index if not exists geo_cities_search on public.geo_cities (country_code, search_name text_pattern_ops);
create index if not exists geo_cities_search_any on public.geo_cities (search_name text_pattern_ops);
create index if not exists geo_cities_location on public.geo_cities using gist (location);

alter table public.geo_countries enable row level security;
alter table public.geo_admin1 enable row level security;
alter table public.geo_cities enable row level security;
drop policy if exists "geo countries read" on public.geo_countries;
create policy "geo countries read" on public.geo_countries for select to authenticated using (true);
drop policy if exists "geo admin1 read" on public.geo_admin1;
create policy "geo admin1 read" on public.geo_admin1 for select to authenticated using (true);
drop policy if exists "geo cities read" on public.geo_cities;
create policy "geo cities read" on public.geo_cities for select to authenticated using (true);
revoke all on public.geo_countries, public.geo_admin1, public.geo_cities from anon;
grant select on public.geo_countries, public.geo_admin1, public.geo_cities to authenticated;
grant all on public.geo_countries, public.geo_admin1, public.geo_cities to service_role;

-- Villes commençant par p_query (déjà normalisé côté app, minuscules sans accents),
-- éventuellement filtrées par pays et région ; les plus peuplées d'abord.
create or replace function public.geo_search_cities(
  p_query text, p_country text default null, p_admin1 text default null, p_limit int default 10
)
returns table (
  id integer, name text, country_code text, admin1_code text, admin1_name text,
  population integer, lat double precision, lng double precision
)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.country_code, c.admin1_code, a.name,
         c.population, extensions.st_y(c.location::extensions.geometry), extensions.st_x(c.location::extensions.geometry)
  from public.geo_cities c
  left join public.geo_admin1 a on a.code = c.admin1_code
  where length(coalesce(p_query, '')) >= 2
    and c.search_name like replace(replace(replace(p_query, '\', ''), '%', ''), '_', '\_') || '%'
    and (p_country is null or c.country_code = p_country)
    and (p_admin1 is null or c.admin1_code = p_admin1)
  order by (c.search_name = p_query) desc, c.population desc, c.name
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;

revoke all on function public.geo_search_cities(text, text, text, int) from public, anon;
grant execute on function public.geo_search_cities(text, text, text, int) to authenticated;
