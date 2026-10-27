-- =============================================================================
-- 0026 : drive sur circuit, tours chronométrés, catégories de circuits
--
-- 1. circuits.category : racing, dirt (terre / rallye), offroad, drag, karting, drift. Rempli par
--    l'import (tags OSM, nom) ; ici un premier classement à partir du nom et du type.
-- 2. circuit_detail : tracé, emprise et cadre d'un circuit pour l'écran circuit (vue fixe).
-- 3. Drive sur circuit (drives.mode = 'circuit') : la ligne de départ se place là où le drive
--    démarre, perpendiculaire au tracé (circuit_start_line). La base détecte les passages de
--    ligne depuis drive_points (record_drive_laps, même algorithme que src/features/circuit/laps.ts),
--    enregistre les tours (drive_laps) et le meilleur dans drives.lap_time_ms (classement Laps).
-- 4. Circuit avec emprise mais sans tracé : le meilleur tour du premier drive devient son tracé.
-- =============================================================================

-- 1. Catégories ----------------------------------------------------------------------------
alter table public.circuits add column if not exists category text not null default 'racing';
alter table public.circuits drop constraint if exists circuits_category_check;
alter table public.circuits add constraint circuits_category_check
  check (category in ('racing', 'dirt', 'offroad', 'drag', 'karting', 'drift'));
alter table public.circuits add column if not exists path_source text;  -- 'osm' | 'drive' (appris)

create or replace function public.circuit_category_guess(p_name text, p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_name ~* 'drift' then 'drift'
    when p_name ~* '(drag|dragway|dragstrip|quarter mile|1/4)' then 'drag'
    when p_kind = 'karting' or p_name ~* 'kart' then 'karting'
    when p_name ~* '(rally|rallye|dirt|terre|gravel|autocross|auto-cross|stock car|speedway)' then 'dirt'
    when p_name ~* '(off.?road|4x4|tout.?terrain|motocross|moto-cross|cross country|trial|enduro)' then 'offroad'
    else 'racing' end
$$;
update public.circuits set category = public.circuit_category_guess(name, kind) where category = 'racing';

-- Carte et recherche : + catégorie et présence d'un tracé (remplace 0021).
drop function if exists public.map_circuits(double precision, double precision, double precision, double precision, int);
create function public.map_circuits(
  p_min_lat double precision, p_min_lng double precision,
  p_max_lat double precision, p_max_lng double precision,
  p_limit int default 300
)
returns table (id uuid, name text, city text, country_code text, kind text, lap_length_m int,
               lat double precision, lng double precision, category text, has_path boolean, has_area boolean)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.city, c.country_code::text, c.kind, c.lap_length_m,
         extensions.st_y(c.pt), extensions.st_x(c.pt), c.category, c.path is not null, c.area is not null
  from (select ci.*, public.circuit_point(ci) as pt from public.circuits ci) c
  where c.pt is not null
    and extensions.st_y(c.pt) between p_min_lat and p_max_lat
    and extensions.st_x(c.pt) between p_min_lng and p_max_lng
  order by (c.kind = 'track') desc, c.lap_length_m desc nulls last, c.name
  limit least(greatest(coalesce(p_limit, 300), 1), 500)
$$;
grant execute on function public.map_circuits(double precision, double precision, double precision, double precision, int) to authenticated;

drop function if exists public.search_circuits(text, int);
create function public.search_circuits(p_query text, p_limit int default 10)
returns table (id uuid, name text, city text, country_code text, kind text, lap_length_m int,
               lat double precision, lng double precision, category text)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.name, c.city, c.country_code::text, c.kind, c.lap_length_m,
         extensions.st_y(c.pt), extensions.st_x(c.pt), c.category
  from (select ci.*, public.circuit_point(ci) as pt from public.circuits ci) c
  where c.pt is not null
    and length(trim(coalesce(p_query, ''))) >= 2
    and (c.name ilike '%' || public.like_escape(trim(p_query)) || '%'
         or c.city ilike public.like_escape(trim(p_query)) || '%')
  order by (c.name ilike public.like_escape(trim(p_query)) || '%') desc, c.name
  limit least(greatest(coalesce(p_limit, 10), 1), 30)
$$;
grant execute on function public.search_circuits(text, int) to authenticated;

-- 2. Détail d'un circuit ------------------------------------------------------------------
create or replace function public.circuit_detail(p_id uuid)
returns table (id uuid, name text, city text, country_code text, kind text, category text, lap_length_m int,
               website text, path json, area json, start_line json, path_source text,
               min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision)
language sql stable security definer set search_path = '' as $$
  select c.id, c.name, c.city, c.country_code::text, c.kind, c.category, c.lap_length_m, c.website,
         extensions.st_asgeojson(c.path)::json, extensions.st_asgeojson(c.area)::json,
         extensions.st_asgeojson(c.start_line)::json, c.path_source,
         extensions.st_ymin(b.box), extensions.st_xmin(b.box), extensions.st_ymax(b.box), extensions.st_xmax(b.box)
  from public.circuits c
  cross join lateral (
    select extensions.st_envelope(extensions.st_collect(array_remove(array[
      c.area::extensions.geometry, c.path::extensions.geometry, public.circuit_point(c)], null))) as box
  ) b
  where c.id = p_id and auth.uid() is not null
$$;
revoke all on function public.circuit_detail(uuid) from public, anon;
grant execute on function public.circuit_detail(uuid) to authenticated;

-- 3. Ligne de départ ------------------------------------------------------------------------
-- Segment de 2 × p_half_m perpendiculaire au tracé, au point du tracé le plus proche de (lat, lng).
-- Sans tracé : null (l'app et record_drive_laps prennent alors la direction de départ du drive).
create or replace function public.circuit_start_line(p_circuit uuid, p_lat double precision, p_lng double precision, p_half_m double precision default 25)
returns extensions.geography
language plpgsql stable security definer set search_path = '' as $$
declare
  g extensions.geometry;
  f double precision; a extensions.geometry; b extensions.geometry; p extensions.geometry;
  kx double precision; dx double precision; dy double precision; n double precision;
begin
  select ci.path::extensions.geometry into g from public.circuits ci where ci.id = p_circuit;
  if g is null then return null; end if;
  f := extensions.st_linelocatepoint(g, extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326));
  p := extensions.st_lineinterpolatepoint(g, f);
  a := extensions.st_lineinterpolatepoint(g, greatest(f - 0.002, 0));
  b := extensions.st_lineinterpolatepoint(g, least(f + 0.002, 1));
  return public.perpendicular_line(extensions.st_y(p), extensions.st_x(p),
    extensions.st_y(b) - extensions.st_y(a), extensions.st_x(b) - extensions.st_x(a), p_half_m);
end;
$$;

-- Segment centré sur (lat, lng), perpendiculaire à la direction (dlat, dlng), de 2 × half_m.
create or replace function public.perpendicular_line(p_lat double precision, p_lng double precision,
  p_dlat double precision, p_dlng double precision, p_half_m double precision)
returns extensions.geography language plpgsql immutable set search_path = '' as $$
declare
  ky constant double precision := 110540; kx double precision := 111320 * cos(radians(p_lat));
  ex double precision := p_dlng * kx; ey double precision := p_dlat * ky; n double precision;
begin
  n := sqrt(ex * ex + ey * ey);
  if n < 1e-9 then return null; end if;
  -- Normale (-ey, ex), convertie en degrés.
  return extensions.st_makeline(
    extensions.st_makepoint(p_lng - (-ey / n) * p_half_m / kx, p_lat - (ex / n) * p_half_m / ky),
    extensions.st_makepoint(p_lng + (-ey / n) * p_half_m / kx, p_lat + (ex / n) * p_half_m / ky)
  )::extensions.geography;
end;
$$;
revoke all on function public.circuit_start_line(uuid, double precision, double precision, double precision) from public, anon;
grant execute on function public.circuit_start_line(uuid, double precision, double precision, double precision) to authenticated;
grant execute on function public.perpendicular_line(double precision, double precision, double precision, double precision, double precision) to authenticated;

-- 4. Drives sur circuit et tours ---------------------------------------------------------------
alter table public.drives drop constraint if exists drives_mode_check;
alter table public.drives add constraint drives_mode_check check (mode in ('free', 'sprint', 'circuit'));
alter table public.drives add column if not exists start_line extensions.geography (LineString, 4326);
grant select (start_line) on public.drives to authenticated;

create table if not exists public.drive_laps (
  drive_id    uuid not null references public.drives (id) on delete cascade,
  lap_no      int not null check (lap_no > 0),
  time_ms     int not null check (time_ms > 0),
  started_at  timestamptz not null,
  primary key (drive_id, lap_no)
);
alter table public.drive_laps enable row level security;
drop policy if exists "laps read" on public.drive_laps;
create policy "laps read" on public.drive_laps for select to authenticated
  using (exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility)));
grant select on public.drive_laps to authenticated;
grant all on public.drive_laps to service_role;

-- Passages de ligne (voir src/features/circuit/laps.ts, qui fait le même calcul en direct).
-- Coordonnées planes locales autour du centre de la ligne ; un passage compte s'il se fait dans
-- le sens de la course (celui du départ) et au moins 10 s après le précédent. Tour valide :
-- 15 s et 200 m au minimum.
create or replace function public.lap_crossings(p_drive uuid, p_line extensions.geography)
returns table (cross_at double precision)
language plpgsql stable security definer set search_path = '' as $$
declare
  l extensions.geometry := p_line::extensions.geometry;
  lat0 double precision; lng0 double precision; kx double precision; ky constant double precision := 110540;
  lax double precision; lay double precision; lbx double precision; lby double precision;
  ux double precision; uy double precision; nx double precision; ny double precision;
  t double precision[]; x double precision[]; y double precision[];
  i int; n int; d1 double precision; d2 double precision; den double precision; s double precision; u double precision;
  last double precision := null; dir double precision := 0; tc double precision;
begin
  lat0 := extensions.st_y(extensions.st_centroid(l)); lng0 := extensions.st_x(extensions.st_centroid(l));
  kx := 111320 * cos(radians(lat0));
  lax := (extensions.st_x(extensions.st_startpoint(l)) - lng0) * kx; lay := (extensions.st_y(extensions.st_startpoint(l)) - lat0) * ky;
  lbx := (extensions.st_x(extensions.st_endpoint(l)) - lng0) * kx;   lby := (extensions.st_y(extensions.st_endpoint(l)) - lat0) * ky;
  ux := lbx - lax; uy := lby - lay;
  select array_agg(extract(epoch from dp.ts)::double precision order by dp.ts, dp.id),
         array_agg((dp.lng - lng0) * kx order by dp.ts, dp.id),
         array_agg((dp.lat - lat0) * ky order by dp.ts, dp.id)
    into t, x, y from public.drive_points dp where dp.drive_id = p_drive;
  n := coalesce(array_length(t, 1), 0);
  for i in 2..n loop
    -- Côtés de la ligne avant / après (produit vectoriel).
    d1 := ux * (y[i - 1] - lay) - uy * (x[i - 1] - lax);
    d2 := ux * (y[i] - lay) - uy * (x[i] - lax);
    continue when d1 = d2 or (d1 > 0) = (d2 > 0) and d1 <> 0 and d2 <> 0;
    continue when d1 = 0 and d2 = 0;
    -- Intersection avec le segment de ligne (u entre 0 et 1).
    s := d1 / (d1 - d2);
    den := ux * ux + uy * uy;
    u := ((x[i - 1] + s * (x[i] - x[i - 1]) - lax) * ux + (y[i - 1] + s * (y[i] - y[i - 1]) - lay) * uy) / den;
    continue when u < 0 or u > 1 or s < 0 or s > 1;
    -- Sens de la course : celui du premier passage.
    if dir = 0 then dir := sign(d2 - d1); end if;
    continue when sign(d2 - d1) <> dir;
    tc := t[i - 1] + s * (t[i] - t[i - 1]);
    continue when last is not null and tc - last < 10;
    last := tc;
    cross_at := tc;
    return next;
  end loop;
end;
$$;
revoke all on function public.lap_crossings(uuid, extensions.geography) from public, anon, authenticated;

-- Après la sauvegarde d'un drive sur circuit : ligne de départ, tours, meilleur tour, tracé appris.
create or replace function public.record_drive_laps(p_drive uuid)
returns table (lap_no int, time_ms int, started_at timestamptz)
language plpgsql volatile security definer set search_path = '' as $$
declare
  d record; c record; line extensions.geography;
  p0 record; p1 record;
  prev double precision := null; k int := 0; best int := null; best_from double precision; best_to double precision;
  cr record; dist double precision; ms int;
begin
  select dr.id, dr.owner_id, dr.circuit_id, dr.mode, dr.is_simulated into d from public.drives dr where dr.id = p_drive;
  if not found or d.owner_id is distinct from auth.uid() then raise exception 'drive_not_found'; end if;
  if d.mode <> 'circuit' or d.circuit_id is null then raise exception 'circuit_mode_required'; end if;
  select ci.id, ci.path, ci.area into c from public.circuits ci where ci.id = d.circuit_id;

  -- Ligne de départ : là où le drive a démarré, perpendiculaire au tracé ; sans tracé, à la
  -- direction des 30 premiers mètres du drive.
  select dp.lat, dp.lng into p0 from public.drive_points dp where dp.drive_id = p_drive order by dp.ts, dp.id limit 1;
  if p0 is null then raise exception 'drive_has_no_points'; end if;
  -- Un vrai drive doit démarrer sur le circuit (emprise, à 200 m près).
  if not d.is_simulated and c.area is not null and not extensions.st_dwithin(
       c.area, extensions.st_makepoint(p0.lng, p0.lat)::extensions.geography, 200) then
    raise exception 'circuit_start_outside';
  end if;
  if c.path is not null then
    line := public.circuit_start_line(d.circuit_id, p0.lat, p0.lng);
  else
    select dp.lat, dp.lng into p1 from public.drive_points dp
    where dp.drive_id = p_drive
      and extensions.st_distance(extensions.st_makepoint(dp.lng, dp.lat)::extensions.geography,
                                 extensions.st_makepoint(p0.lng, p0.lat)::extensions.geography) >= 30
    order by dp.ts, dp.id limit 1;
    if p1 is not null then line := public.perpendicular_line(p0.lat, p0.lng, p1.lat - p0.lat, p1.lng - p0.lng, 25); end if;
  end if;
  update public.drives set start_line = line where id = p_drive;
  delete from public.drive_laps dl where dl.drive_id = p_drive;
  if line is null then return; end if;

  for cr in select lc.cross_at from public.lap_crossings(p_drive, line) lc loop
    if prev is not null then
      select coalesce(extensions.st_length(extensions.st_makeline(array_agg(extensions.st_makepoint(dp.lng, dp.lat) order by dp.ts, dp.id))::extensions.geography), 0)
        into dist from public.drive_points dp
        where dp.drive_id = p_drive and extract(epoch from dp.ts) between prev and cr.cross_at;
      ms := round((cr.cross_at - prev) * 1000);
      if ms >= 15000 and dist >= 200 then
        k := k + 1;
        insert into public.drive_laps (drive_id, lap_no, time_ms, started_at) values (p_drive, k, ms, to_timestamp(prev));
        if best is null or ms < best then best := ms; best_from := prev; best_to := cr.cross_at; end if;
      end if;
    end if;
    prev := cr.cross_at;
  end loop;

  update public.drives set lap_time_ms = best where id = p_drive;

  -- Circuit sans tracé : le meilleur tour d'un vrai drive devient son tracé.
  if best is not null and c.path is null and not d.is_simulated then
    update public.circuits ci set
      path = (select extensions.st_makeline(array_agg(extensions.st_makepoint(dp.lng, dp.lat) order by dp.ts, dp.id))::extensions.geography
              from public.drive_points dp where dp.drive_id = p_drive and extract(epoch from dp.ts) between best_from and best_to),
      path_source = 'drive', updated_at = now()
    where ci.id = d.circuit_id and ci.path is null;
    update public.circuits ci set lap_length_m = round(extensions.st_length(ci.path))
    where ci.id = d.circuit_id and ci.lap_length_m is null and ci.path is not null;
  end if;

  return query select dl.lap_no, dl.time_ms, dl.started_at from public.drive_laps dl where dl.drive_id = p_drive order by dl.lap_no;
end;
$$;
revoke all on function public.record_drive_laps(uuid) from public, anon;
grant execute on function public.record_drive_laps(uuid) to authenticated;

update public.circuits set path_source = 'osm' where path is not null and path_source is null;

-- Circuit créé sans catégorie (saisie, ancien import) : déduite du nom et du type.
create or replace function public.on_circuit_category()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.category is null or new.category = 'racing' then
    new.category := public.circuit_category_guess(new.name, new.kind);
  end if;
  return new;
end;
$$;
drop trigger if exists circuits_category on public.circuits;
create trigger circuits_category before insert on public.circuits
  for each row execute function public.on_circuit_category();

-- Relancer l'import (upsert) ne doit pas effacer un tracé appris par un drive.
create or replace function public.on_circuit_keep_learned_path()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.path is null and old.path is not null and old.path_source = 'drive' then
    new.path := old.path;
    new.path_source := old.path_source;
    new.lap_length_m := coalesce(new.lap_length_m, old.lap_length_m);
  end if;
  if new.start_line is null then new.start_line := old.start_line; end if;
  return new;
end;
$$;
drop trigger if exists circuits_keep_learned_path on public.circuits;
create trigger circuits_keep_learned_path before update on public.circuits
  for each row execute function public.on_circuit_keep_learned_path();
