-- =============================================================================
-- 0020 : zone privée au départ et à l'arrivée seulement ; garage selon le réglage
--
-- 1. Zone privée (corrige 0014). Retirer TOUT ce qui passe dans la zone coupait le
--    tracé quand un drive A → B traversait le quartier du domicile : le trou
--    dessinait la zone, donc l'emplacement du domicile. Désormais on ne retire que
--    le début (jusqu'à la première sortie de la zone) et la fin (depuis la dernière
--    entrée). Un drive qui part et arrive ailleurs reste entier.
-- 2. Garage. La lecture de vehicles autorise aussi le véhicule d'un drive visible
--    (pour l'afficher sur ce drive) : la liste « garage » d'un profil en profitait et
--    montrait des véhicules malgré le réglage « followers ». La liste passe par
--    user_garage, qui applique strictement details_visibility.
-- =============================================================================

-- 1. Zone : départ et arrivée ------------------------------------------------------
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
  first_out int;
  last_out int;
  kept extensions.geometry;
begin
  if p_path is null then
    return null;
  end if;
  g := p_path::extensions.geometry;
  select center, enabled into z from public.home_zones where user_id = p_owner;
  if not found or not z.enabled then
    return extensions.st_multi(g);
  end if;

  -- Premier et dernier point hors de la zone.
  select min(k) filter (where outside), max(k) filter (where outside)
    into first_out, last_out
  from (
    select (dp).path[1] as k,
           extensions.st_distance((dp).geom::extensions.geography, z.center) > public.home_zone_radius_m() as outside
    from extensions.st_dumppoints(g) dp
  ) pts;

  if first_out is null or last_out is null or last_out <= first_out then
    return null; -- tout le drive est dans la zone (ou il n'en sort qu'un point)
  end if;

  select extensions.st_makeline(array_agg((dp).geom order by (dp).path[1]))
    into kept
  from extensions.st_dumppoints(g) dp
  where (dp).path[1] between first_out and last_out;

  return extensions.st_multi(kept);
end;
$$;
revoke all on function public.mask_drive_path(extensions.geography, uuid) from public, anon, authenticated;

-- Recalcul des drives des utilisateurs qui ont une zone.
do $$ begin perform public.refresh_owner_public_paths(user_id) from public.home_zones; end $$;

-- 2. Garage d'un profil ----------------------------------------------------------------
create or replace function public.user_garage(p_user uuid)
returns table (id uuid, make text, model text, year int, color text, is_primary boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.make, v.model, v.year, v.color, v.is_primary
  from public.vehicles v
  where v.owner_id = p_user
    and auth.uid() is not null
    and public.can_see_details(p_user)
  order by v.is_primary desc, v.created_at
$$;
revoke all on function public.user_garage(uuid) from public, anon;
grant execute on function public.user_garage(uuid) to authenticated;
