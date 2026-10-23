-- =============================================================================
-- 0025 : classement « Score » — meilleur score d'un drive sur route ouverte (hors circuit),
-- toutes voitures confondues. Meilleur drive par conducteur, sur les drives que je peux voir ;
-- drives simulés exclus. Portées : world, country, friends, crews (pas de « même modèle »).
-- =============================================================================

create or replace function public.leaderboard_score(
  p_scope text default 'world', p_country text default null, p_limit int default 50
)
returns table (rank int, user_id uuid, username text, display_name text, avatar_url text,
               make text, model text, score int, distance_m int, drive_id uuid, achieved_at timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with cand as (
    select distinct on (d.owner_id) d.owner_id, d.score, d.distance_m, d.id as drive_id, d.started_at as achieved_at,
           v.make, v.model
    from public.drives d
    left join public.vehicles v on v.id = d.vehicle_id
    where auth.uid() is not null and d.score is not null and d.circuit_id is null and not d.is_simulated
      and coalesce(p_scope, 'world') <> 'model'
      and public.can_see_drive(d.owner_id, d.visibility)
      and public.leaderboard_scope_ok(d.owner_id, p_scope, p_country, null, null, null)
    order by d.owner_id, d.score desc, d.started_at
  ), ranked as (
    select rank() over (order by c.score desc, c.achieved_at)::int as rk, c.* from cand c
  )
  select r.rk, r.owner_id, p.username, p.display_name, p.avatar_url, r.make, r.model, r.score, r.distance_m,
         r.drive_id, r.achieved_at, r.owner_id = auth.uid()
  from ranked r join public.profiles p on p.id = r.owner_id
  where (r.rk <= least(greatest(coalesce(p_limit, 50), 1), 200) or r.owner_id = auth.uid())
    and not public.is_blocked_with(r.owner_id)
  order by r.rk
$$;
revoke all on function public.leaderboard_score(text, text, int) from public, anon;
grant execute on function public.leaderboard_score(text, text, int) to authenticated;
