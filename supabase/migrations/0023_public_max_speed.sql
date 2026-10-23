-- =============================================================================
-- 0023 : vitesse max visible par tous (décision du 23/10, à revoir si les stores l'exigent)
--
-- 1. drives.max_speed_kmh devient lisible pour qui peut voir le drive (RLS can_see_drive).
--    La vitesse moyenne et les points bruts (drive_points) restent au seul propriétaire.
-- 2. user_vehicle_stats : drives, distance et vitesse max par véhicule d'un conducteur,
--    calculés sur les drives que je peux voir, si son garage m'est visible
--    (details_visibility). Le propriétaire voit tous ses drives (hors drives simulés).
-- =============================================================================

grant select (max_speed_kmh) on public.drives to authenticated;

create or replace function public.user_vehicle_stats(p_user uuid)
returns table (vehicle_id uuid, drive_count int, distance_m bigint, max_speed_kmh real)
language sql
stable
security definer
set search_path = ''
as $$
  select d.vehicle_id, count(*)::int, sum(d.distance_m)::bigint, max(d.max_speed_kmh)
  from public.drives d
  where d.owner_id = p_user and d.vehicle_id is not null and not d.is_simulated
    and auth.uid() is not null
    and (p_user = auth.uid()
         or (public.can_see_details(p_user) and public.can_see_drive(d.owner_id, d.visibility)))
  group by d.vehicle_id
$$;
revoke all on function public.user_vehicle_stats(uuid) from public, anon;
grant execute on function public.user_vehicle_stats(uuid) to authenticated;
