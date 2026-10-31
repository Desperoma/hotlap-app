-- 0033 : XP des drives de test, circuits proches pour la carte, édition complète d'un circuit
-- (dev), retrait d'un signalement.

-- 1. driver_xp : les builds de test comptent aussi les drives simulés des autres (comme les
--    badges de rang et les classements, 0030 / 0032). Sinon un pilote qui n'a que des drives
--    de test affiche 0 XP sur sa fiche alors que son badge montre un niveau.
--    Même barème que xp_total (0032) : modifier les deux ensemble.
drop function if exists public.driver_xp(uuid);
create or replace function public.driver_xp(p_user uuid, p_include_sim boolean default false)
returns table (
  xp bigint, distance_m bigint, drive_count int, tracks_visited int, sessions int,
  personal_bests int, categories int, achievements int,
  distance_xp bigint, tracks_xp int, sessions_xp int, pb_xp int, categories_xp int
)
language sql stable security definer set search_path = '' as $$
  with d as (
    select dr.id, dr.distance_m, dr.circuit_id, dr.mode, dr.lap_time_ms, dr.started_at
    from public.drives dr
    where auth.uid() is not null and dr.owner_id = p_user
      and (not dr.is_simulated or p_user = auth.uid() or coalesce(p_include_sim, false))
      and not public.is_blocked_with(p_user)
  ), verified as (
    select d.id, d.circuit_id, d.lap_time_ms, d.started_at, c.category
    from d join public.circuits c on c.id = d.circuit_id
    where d.mode = 'circuit' and exists (select 1 from public.drive_laps l where l.drive_id = d.id)
  ), pb as (
    select count(*)::int as n from (
      select v.lap_time_ms,
             min(v.lap_time_ms) over (partition by v.circuit_id order by v.started_at
                                      rows between unbounded preceding and 1 preceding) as prev_best
      from verified v where v.lap_time_ms is not null
    ) x where x.prev_best is not null and x.lap_time_ms < x.prev_best
  ), agg as (
    select coalesce(sum(d.distance_m), 0)::bigint as dist, count(*)::int as drives,
           count(distinct d.circuit_id)::int as tracks,
           (select count(*)::int from verified) as sess,
           (select count(distinct category)::int from verified) as cats,
           (select n from pb) as pbs
    from d
  )
  select
    (a.dist / 100) + a.tracks * 100 + case when a.sess > 0 then 250 else 0 end + a.sess * 100 + a.pbs * 200 + a.cats * 150,
    a.dist, a.drives, a.tracks, a.sess, a.pbs, a.cats, 0,
    a.dist / 100, a.tracks * 100, case when a.sess > 0 then 250 else 0 end + a.sess * 100, a.pbs * 200, a.cats * 150
  from agg a
$$;
revoke all on function public.driver_xp(uuid, boolean) from public, anon;
grant execute on function public.driver_xp(uuid, boolean) to authenticated;

-- 2. Carte : circuits autour d'un point (centre de l'écran), les plus proches d'abord.
--    Rayon plafonné à 2 000 km, au plus 200 repères : la carte reste fluide.
create or replace function public.map_circuits_near(
  p_lat double precision, p_lng double precision, p_radius_m double precision default 100000, p_limit int default 200
)
returns table (id uuid, name text, city text, country_code text, kind text, lap_length_m int,
               lat double precision, lng double precision, category text, has_path boolean, has_area boolean)
language sql stable security invoker set search_path = '' as $$
  with c as (
    select ci.*, public.circuit_point(ci) as pt from public.circuits ci
  ), here as (
    select extensions.st_makepoint(p_lng, p_lat)::extensions.geography as g,
           least(greatest(coalesce(p_radius_m, 100000), 1000), 2000000) as r
  )
  select c.id, c.name, c.city, c.country_code::text, c.kind, c.lap_length_m,
         extensions.st_y(c.pt), extensions.st_x(c.pt), c.category, c.path is not null, c.area is not null
  from c, here h
  where c.pt is not null
    and p_lat between -90 and 90 and p_lng between -180 and 180
    and extensions.st_dwithin(c.pt::extensions.geography, h.g, h.r)
  order by extensions.st_distance(c.pt::extensions.geography, h.g)
  limit least(greatest(coalesce(p_limit, 200), 1), 300)
$$;
grant execute on function public.map_circuits_near(double precision, double precision, double precision, int) to authenticated;

-- 3. Garde-fou des tracés (0029) : + remise à zéro volontaire de la ligne de départ.
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
  if new.start_line is null and current_setting('hotlap.reset_start_line', true) is distinct from 'on' then
    new.start_line := old.start_line;
  end if;
  return new;
end;
$$;

-- Comptes dev : toutes les infos d'un circuit (nom, catégorie, ville, pays, site, ligne de départ).
create or replace function public.dev_update_circuit(
  p_circuit uuid, p_name text, p_category text, p_city text default null, p_country_code text default null,
  p_website text default null, p_reset_start_line boolean default false
)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.is_dev() then raise exception 'dev_only'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'name_required'; end if;
  if p_country_code is not null and trim(p_country_code) <> '' and trim(p_country_code) !~ '^[A-Za-z]{2}$' then
    raise exception 'country_code_invalid';
  end if;
  update public.circuits
     set name = left(trim(p_name), 120),
         category = p_category,
         city = nullif(left(trim(coalesce(p_city, '')), 120), ''),
         country_code = nullif(upper(trim(coalesce(p_country_code, ''))), ''),
         website = nullif(left(trim(coalesce(p_website, '')), 300), ''),
         updated_at = now()
   where id = p_circuit;
  if not found then raise exception 'circuit_not_found'; end if;
  -- La ligne de départ se replace au prochain drive (le trigger garde l'ancienne si on met null,
  -- sauf quand hotlap.reset_start_line est posé pour la transaction).
  if coalesce(p_reset_start_line, false) then
    perform set_config('hotlap.reset_start_line', 'on', true);
    update public.circuits set start_line = null where id = p_circuit;
  end if;
end;
$$;
revoke all on function public.dev_update_circuit(uuid, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.dev_update_circuit(uuid, text, text, text, text, text, boolean) to authenticated;

-- Emprise (zone « tu es sur le circuit ») dessinée à la main : polygone fermé automatiquement.
-- Le repère du circuit suit le centre de la nouvelle zone.
create or replace function public.dev_set_circuit_area(p_circuit uuid, p_points jsonb)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  ring extensions.geometry;
  poly extensions.geometry;
begin
  if not public.is_dev() then raise exception 'dev_only'; end if;
  if jsonb_typeof(p_points) <> 'array' or jsonb_array_length(p_points) < 3 or jsonb_array_length(p_points) > 500 then
    raise exception 'area_points_invalid';
  end if;
  select extensions.st_makeline(array_agg(extensions.st_setsrid(extensions.st_makepoint((e.v->>0)::float8, (e.v->>1)::float8), 4326) order by e.i))
    into ring
  from jsonb_array_elements(p_points) with ordinality as e(v, i);
  if not extensions.st_equals(extensions.st_startpoint(ring), extensions.st_endpoint(ring)) then
    ring := extensions.st_addpoint(ring, extensions.st_startpoint(ring));
  end if;
  poly := extensions.st_makepolygon(ring);
  if not extensions.st_isvalid(poly) then raise exception 'area_self_intersects'; end if;
  update public.circuits
     set area = poly::extensions.geography,
         location = extensions.st_centroid(poly)::extensions.geography,
         updated_at = now()
   where id = p_circuit;
  if not found then raise exception 'circuit_not_found'; end if;
end;
$$;
revoke all on function public.dev_set_circuit_area(uuid, jsonb) from public, anon;
grant execute on function public.dev_set_circuit_area(uuid, jsonb) to authenticated;

-- 4. Retirer un signalement : son auteur, ou un dev.
create or replace function public.delete_report(p_report uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from public.reports r
   where r.id = p_report and (r.reporter_id = auth.uid() or public.is_dev());
  if not found then raise exception 'report_not_found'; end if;
end;
$$;
revoke all on function public.delete_report(uuid) from public, anon;
grant execute on function public.delete_report(uuid) to authenticated;
