-- =============================================================================
-- 0014 : zone privée autour du domicile (remplace les 1,6 km masqués au départ
-- et à l'arrivée)
--
-- Masquer une longueur fixe au début et à la fin ne marche pas sur un drive court
-- (un drive de 1 000 m disparaissait entièrement) et ne protège rien quand le
-- drive part d'ailleurs. À la place, l'utilisateur donne son adresse et tout ce
-- qui passe près de chez lui est retiré du tracé vu par les autres.
--
-- - L'adresse est convertie en coordonnées sur le téléphone ; la base ne stocke
--   NI l'adresse NI le point du domicile, seulement le centre de la zone.
-- - Ce centre est décalé au hasard (jusqu'à 300 m) du domicile, et la zone a un
--   rayon de 1 300 m : le domicile est toujours à au moins 1 km du bord. Sans ce
--   décalage, le centre d'un cercle se retrouve à partir de deux ou trois drives
--   qui en sortent, et donc le domicile.
-- - Option activée par défaut, désactivable (home_zones.enabled).
-- - Le tracé public (path_public) et son premier point (start_point_public) sont
--   calculés et stockés par la base, non lisibles directement. Local Discover
--   cherche sur start_point_public : il ne révèle plus le point de départ réel.
-- =============================================================================

-- 1. Zone ----------------------------------------------------------------------
create table public.home_zones (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  center      extensions.geography (Point, 4326) not null,  -- centre décalé, jamais le domicile
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- Aucun accès direct : tout passe par les fonctions ci-dessous.
alter table public.home_zones enable row level security;
revoke all on public.home_zones from anon, authenticated;

create or replace function public.home_zone_radius_m()
returns int language sql immutable set search_path = '' as $$ select 1300 $$;   -- 1 000 m garantis + 300 m de décalage max

-- 2. Tracé public --------------------------------------------------------------
-- Tracé moins la zone de son propriétaire (si elle est active). Null si rien ne reste.
create or replace function public.mask_drive_path(p_path extensions.geography, p_owner uuid)
returns extensions.geometry
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  z record;
  g extensions.geometry;
begin
  if p_path is null then
    return null;
  end if;
  select center, enabled into z from public.home_zones where user_id = p_owner;
  if not found or not z.enabled then
    return p_path::extensions.geometry;
  end if;
  g := extensions.st_difference(
    p_path::extensions.geometry,
    extensions.st_buffer(z.center, public.home_zone_radius_m(), 'quad_segs=16')::extensions.geometry
  );
  if g is null or extensions.st_isempty(g) then
    return null;
  end if;
  return g;
end;
$$;

alter table public.drives
  add column path_public extensions.geometry (Geometry, 4326),
  add column start_point_public extensions.geography (Point, 4326);
create index drives_start_point_public on public.drives using gist (start_point_public);
-- Pas de grant : ces colonnes restent illisibles via l'API, comme path et start_point (0002).

-- (Comparaisons en texte : search_path vide, les opérateurs PostGIS ne sont pas résolus.)
-- Recalculé à chaque insertion, et à chaque mise à jour qui touche le tracé ou tente
-- d'écrire les colonnes publiques (la valeur fournie par le client est ignorée).
create or replace function public.set_drive_public_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.path::text is not distinct from old.path::text
     and new.owner_id = old.owner_id
     and new.path_public::text is not distinct from old.path_public::text
     and new.start_point_public::text is not distinct from old.start_point_public::text
     and not coalesce(current_setting('hotlap.refresh_zone', true), '') = 'on' then
    return new;
  end if;
  new.path_public := public.mask_drive_path(new.path, new.owner_id);
  new.start_point_public := case
    when new.path_public is null then null
    else extensions.st_startpoint(extensions.st_geometryn(new.path_public, 1))::extensions.geography
  end;
  return new;
end;
$$;

create trigger drives_public_path before insert or update on public.drives
  for each row execute function public.set_drive_public_path();

-- Un changement de zone recalcule tous les drives de l'utilisateur.
create or replace function public.refresh_owner_public_paths(p_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('hotlap.refresh_zone', 'on', true);
  update public.drives set path_public = path_public where owner_id = p_owner;
  perform set_config('hotlap.refresh_zone', '', true);
end;
$$;

create or replace function public.on_home_zone_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_owner_public_paths(coalesce(new.user_id, old.user_id));
  return null;
end;
$$;

create trigger home_zones_refresh after insert or update or delete on public.home_zones
  for each row execute function public.on_home_zone_change();

-- Drives déjà enregistrés (aucune zone encore : tracé public = tracé complet).
do $$ begin perform public.refresh_owner_public_paths(id) from public.profiles; end $$;

-- 3. Lecture du tracé ------------------------------------------------------------
-- Complet pour le propriétaire, sans la zone privée pour les autres.
create or replace function public.drive_path_public(p_drive_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d record;
begin
  select owner_id, visibility, path, path_public into d from public.drives where id = p_drive_id;
  if not found or d.path is null or not public.can_see_drive(d.owner_id, d.visibility) then
    return null;
  end if;
  if d.owner_id = auth.uid() then
    return extensions.st_asgeojson(d.path)::json;
  end if;
  if d.path_public is null then
    return null;
  end if;
  return extensions.st_asgeojson(d.path_public)::json;
end;
$$;

-- Aperçus du fil (0007) et de la carte : même règle, tracé simplifié (~10 m).
create or replace function public.drive_path_previews(p_drive_ids uuid[])
returns table (drive_id uuid, path json)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d record;
  g extensions.geometry;
begin
  if auth.uid() is null then return; end if;
  for d in
    select dr.id, dr.owner_id, dr.visibility, dr.path, dr.path_public
    from public.drives dr
    where dr.id = any (p_drive_ids[1:50]) and dr.path is not null
  loop
    if not public.can_see_drive(d.owner_id, d.visibility) then continue; end if;
    g := case when d.owner_id = auth.uid() then d.path::extensions.geometry else d.path_public end;
    if g is null then continue; end if;
    drive_id := d.id;
    path := extensions.st_asgeojson(extensions.st_simplifypreservetopology(g, 0.0001), 5)::json;
    return next;
  end loop;
end;
$$;
revoke all on function public.drive_path_previews(uuid[]) from public, anon;
grant execute on function public.drive_path_previews(uuid[]) to authenticated;

-- Carte (0011) : le repère d'un drive des autres est le premier point visible.
create or replace function public.map_drives(p_limit int default 200)
returns table (
  drive_id uuid,
  owner_id uuid,
  source text,
  title text,
  started_at timestamptz,
  distance_m int,
  duration_s int,
  score int,
  lat double precision,
  lng double precision,
  username text,
  display_name text,
  avatar_url text,
  vehicle text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  d record;
  g extensions.geometry;
  pin extensions.geometry;
begin
  if me is null then return; end if;
  for d in
    with crew_mates as (
      select distinct m.user_id from public.crew_members m
      where m.status = 'active' and m.user_id <> me
        and m.crew_id in (select c.crew_id from public.crew_members c where c.user_id = me and c.status = 'active')
    ),
    friends as (
      select f.following_id as user_id from public.follows f where f.follower_id = me
    )
    select dr.id, dr.owner_id, dr.visibility, dr.path, dr.path_public, dr.title, dr.started_at, dr.distance_m, dr.duration_s, dr.score,
           dr.vehicle_id,
           case when dr.owner_id = me then 'me'
                when dr.owner_id in (select user_id from crew_mates) then 'crew'
                else 'friend' end as src
    from public.drives dr
    where dr.path is not null
      and (dr.owner_id = me
           or dr.owner_id in (select user_id from crew_mates)
           or dr.owner_id in (select user_id from friends))
    order by dr.started_at desc
    limit least(greatest(p_limit, 1), 300)
  loop
    if not public.can_see_drive(d.owner_id, d.visibility) then continue; end if;
    g := d.path::extensions.geometry;
    if d.owner_id = me then
      pin := extensions.st_startpoint(g);
    else
      -- Premier point visible, après la zone privée du propriétaire.
      if d.path_public is null then continue; end if;
      pin := extensions.st_startpoint(extensions.st_geometryn(d.path_public, 1));
    end if;

    drive_id := d.id;
    owner_id := d.owner_id;
    source := d.src;
    title := d.title;
    started_at := d.started_at;
    distance_m := d.distance_m;
    duration_s := d.duration_s;
    score := d.score;
    lat := extensions.st_y(pin);
    lng := extensions.st_x(pin);
    select p.username, p.display_name, p.avatar_url into username, display_name, avatar_url
      from public.profiles p where p.id = d.owner_id;
    vehicle := null;
    if d.vehicle_id is not null then
      select nullif(trim(concat_ws(' ', v.make, v.model)), '') into vehicle
        from public.vehicles v where v.id = d.vehicle_id;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.map_drives(int) from public, anon;
grant execute on function public.map_drives(int) to authenticated;

drop function if exists public.privacy_zone_m();

-- Local Discover : premier point visible, plus le départ réel.
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
    and d.start_point_public is not null
    and extensions.st_dwithin(d.start_point_public, extensions.st_makepoint(p_lng, p_lat)::extensions.geography, least(p_radius_m, 200000))
    and public.can_see_drive(d.owner_id, d.visibility)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

-- 4. API de la zone ------------------------------------------------------------
-- Enregistre la zone à partir du domicile (coordonnées issues de l'adresse, sur le
-- téléphone). Seul le centre décalé est gardé ; la zone est activée.
create or replace function public.set_home_zone(p_lat double precision, p_lng double precision)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  home extensions.geography;
  c extensions.geography;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'Invalid coordinates';
  end if;
  home := extensions.st_makepoint(p_lng, p_lat)::extensions.geography;
  -- Point tiré uniformément dans un disque de 300 m autour du domicile.
  c := extensions.st_project(home, 300 * sqrt(random()), 2 * pi() * random());
  insert into public.home_zones (user_id, center, enabled, updated_at)
  values (auth.uid(), c, true, now())
  on conflict (user_id) do update set center = excluded.center, enabled = true, updated_at = now();
end;
$$;

create or replace function public.set_home_zone_enabled(p_enabled boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  update public.home_zones set enabled = coalesce(p_enabled, true), updated_at = now()
  where user_id = auth.uid() and enabled is distinct from coalesce(p_enabled, true);
end;
$$;

create or replace function public.clear_home_zone()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.home_zones where user_id = auth.uid()
$$;

-- Pour l'écran de réglage : la zone telle que les autres la subissent (centre décalé).
create or replace function public.my_home_zone()
returns table (enabled boolean, lat double precision, lng double precision, radius_m int)
language sql
stable
security definer
set search_path = ''
as $$
  select z.enabled,
         extensions.st_y(z.center::extensions.geometry),
         extensions.st_x(z.center::extensions.geometry),
         public.home_zone_radius_m()
  from public.home_zones z
  where z.user_id = auth.uid()
$$;

revoke execute on function public.mask_drive_path(extensions.geography, uuid) from public, anon, authenticated;
revoke execute on function public.set_drive_public_path() from public, anon, authenticated;
revoke execute on function public.refresh_owner_public_paths(uuid) from public, anon, authenticated;
revoke execute on function public.on_home_zone_change() from public, anon, authenticated;
revoke all on function public.drives_nearby(double precision, double precision, int, int) from anon, public;
revoke all on function public.drive_path_public(uuid) from anon, public;
revoke all on function public.set_home_zone(double precision, double precision) from anon, public;
revoke all on function public.set_home_zone_enabled(boolean) from anon, public;
revoke all on function public.clear_home_zone() from anon, public;
revoke all on function public.my_home_zone() from anon, public;
grant execute on function public.drives_nearby(double precision, double precision, int, int) to authenticated;
grant execute on function public.drive_path_public(uuid) to authenticated;
grant execute on function public.set_home_zone(double precision, double precision) to authenticated;
grant execute on function public.set_home_zone_enabled(boolean) to authenticated;
grant execute on function public.clear_home_zone() to authenticated;
grant execute on function public.my_home_zone() to authenticated;
