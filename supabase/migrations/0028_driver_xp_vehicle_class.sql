-- =============================================================================
-- 0028 : niveaux (XP), rangs et classes de véhicules
-- =============================================================================
-- L'XP est recalculée à chaque lecture à partir des drives enregistrés (rien n'est stocké) :
-- elle est donc rétroactive, et l'app ne peut pas l'augmenter elle-même. Le niveau et le rang
-- se déduisent du total côté app (src/features/levels/levels.ts, même barème).
--
-- Barème (document HOTLAP Driver Ranks) :
--   distance            10 XP par km roulé (1 XP par 100 m)
--   nouveau circuit     +100 XP par circuit différent où l'on a roulé
--   1re session validée +250 XP (une fois)
--   session validée     +100 XP chacune (drive lancé depuis un circuit, au moins un tour chronométré)
--   record perso battu  +200 XP chaque fois qu'un drive bat son meilleur tour précédent sur ce circuit
--   nouvelle catégorie  +150 XP par catégorie de circuit (racing, dirt, karting…) où l'on a une session validée
--   événements, succès  pas encore dans l'app : 0
-- Les drives simulés (outils de test) ne comptent que pour leur auteur, comme la vitesse max du garage.

create or replace function public.driver_xp(p_user uuid)
returns table (
  xp bigint, distance_m bigint, drive_count int, tracks_visited int, sessions int,
  personal_bests int, categories int, achievements int,
  distance_xp bigint, tracks_xp int, sessions_xp int, pb_xp int, categories_xp int
)
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select dr.id, dr.distance_m, dr.circuit_id, dr.mode, dr.lap_time_ms, dr.started_at
    from public.drives dr
    where auth.uid() is not null and dr.owner_id = p_user
      and (not dr.is_simulated or p_user = auth.uid())
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
revoke all on function public.driver_xp(uuid) from public, anon;
grant execute on function public.driver_xp(uuid) to authenticated;

-- Classe d'un véhicule (HPI) : l'app la calcule avec la puissance, le poids et le meilleur
-- 0-100 km/h mesuré avec ce véhicule (sinon une estimation par le rapport poids/puissance).
-- Meilleur 0-100 réel (drives non simulés) par véhicule, sur les drives visibles.
create or replace function public.vehicle_best_0_100(p_vehicles uuid[])
returns table (vehicle_id uuid, time_ms int)
language sql
stable
security definer
set search_path = ''
as $$
  select s.vehicle_id, min(s.time_ms)::int
  from public.sprint_results s
  join public.drives d on d.id = s.drive_id
  where auth.uid() is not null and s.kind = '0_100' and not s.is_simulated
    and s.vehicle_id = any (p_vehicles[1:200])
    and public.can_see_drive(d.owner_id, d.visibility)
  group by s.vehicle_id
$$;
revoke all on function public.vehicle_best_0_100(uuid[]) from public, anon;
grant execute on function public.vehicle_best_0_100(uuid[]) to authenticated;
