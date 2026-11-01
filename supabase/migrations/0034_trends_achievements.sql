-- 0034 : tendances de la page Community, et succès (achievements).

-- 1. Tendances : les types de drive les plus faits (Sprint, route ouverte, chaque catégorie de
--    circuit) sur 30 jours, sinon depuis le début. Pour chacun, la photo du drive visible le plus
--    engageant : likes + 3 × commentaires (+ 5 × partages quand le partage existera).
--    Le décompte est global (un nombre, rien d'identifiable) ; la photo vient d'un drive que la
--    personne qui regarde a le droit de voir.
create or replace function public.community_trends(p_include_sim boolean default false)
returns table (
  key text, drive_count int, drive_id uuid, title text, photo_path text, score int,
  user_id uuid, username text, display_name text, avatar_url text
)
language sql stable security definer set search_path = '' as $$
  with base as (
    select d.id, d.owner_id, d.title, d.visibility, d.like_count, d.comment_count, d.created_at,
           case when d.mode = 'sprint' then 'sprint'
                when d.circuit_id is not null then 'circuit_' || coalesce(c.category, 'racing')
                else 'open_road' end as key
    from public.drives d
    left join public.circuits c on c.id = d.circuit_id
    where auth.uid() is not null and (not d.is_simulated or coalesce(p_include_sim, false))
  ), recent as (
    select * from base where created_at > now() - interval '30 days'
  ), pool as (
    select * from recent where exists (select 1 from recent)
    union all
    select * from base where not exists (select 1 from recent)
  ), counts as (
    select key, count(*)::int as n from pool group by key
  )
  select k.key, k.n, cover.id, cover.title, cover.storage_path, cover.score,
         cover.owner_id, pr.username, pr.display_name, pr.avatar_url
  from counts k
  left join lateral (
    -- partages : pas encore en place, ils compteront 5 points chacun
    select b.id, b.title, b.owner_id, m.storage_path, (b.like_count + 3 * b.comment_count)::int as score
    from base b
    join lateral (
      select dm.storage_path from public.drive_media dm
      where dm.drive_id = b.id and dm.type = 'photo' order by dm.position limit 1
    ) m on true
    where b.key = k.key and public.can_see_drive(b.owner_id, b.visibility) and not public.is_blocked_with(b.owner_id)
    order by b.like_count + 3 * b.comment_count desc, b.created_at desc
    limit 1
  ) cover on true
  left join public.profiles pr on pr.id = cover.owner_id
  order by k.n desc, k.key
  limit 8
$$;
revoke all on function public.community_trends(boolean) from public, anon;
grant execute on function public.community_trends(boolean) to authenticated;

-- 2. Succès -------------------------------------------------------------------------------
-- Catalogue : du plus facile (tier 1) au quasi impossible (tier 5). Les textes sont dans l'app
-- (src/features/achievements/catalog.ts, même clés) ; l'XP, la métrique et le seuil font foi ici.
create table if not exists public.achievements (
  key             text primary key,
  tier            int not null check (tier between 1 and 5),
  sort            int not null,
  xp              int not null check (xp > 0),
  metric          text not null,
  target          numeric not null,
  lower_is_better boolean not null default false
);
alter table public.achievements enable row level security;
drop policy if exists "achievements read" on public.achievements;
create policy "achievements read" on public.achievements for select to authenticated using (true);
grant select on public.achievements to authenticated;

insert into public.achievements (key, tier, sort, xp, metric, target, lower_is_better) values
  ('first_drive',        1, 10,   50, 'drives',            1,      false),
  ('first_comment',      1, 20,   25, 'comments',          1,      false),
  ('car_specs',          1, 30,   25, 'car_specs',         1,      false),
  ('follow_5',           1, 40,   50, 'following',         5,      false),
  ('distance_50',        1, 50,   50, 'distance_km',       50,     false),
  ('crew_join',          2, 10,   75, 'crews',             1,      false),
  ('drives_10',          2, 20,  100, 'drives',            10,     false),
  ('first_session',      2, 30,  100, 'sessions',          1,      false),
  ('likes_10',           2, 40,  100, 'likes',             10,     false),
  ('distance_250',       2, 50,  100, 'distance_km',       250,    false),
  ('sprint_0_100_10',    2, 60,  100, 'best_0_100_s',      10,     true),
  ('drives_50',          3, 10,  250, 'drives',            50,     false),
  ('distance_1000',      3, 20,  250, 'distance_km',       1000,   false),
  ('circuit_speed_200',  3, 30,  250, 'circuit_top_speed', 200,    false),
  ('tracks_5',           3, 40,  300, 'tracks',            5,      false),
  ('laps_100',           3, 50,  300, 'laps',              100,    false),
  ('likes_100',          3, 60,  300, 'likes',             100,    false),
  ('sprint_0_100_6',     3, 70,  300, 'best_0_100_s',      6,      true),
  ('categories_all',     4, 10,  500, 'track_categories',  6,      false),
  ('distance_10000',     4, 20,  750, 'distance_km',       10000,  false),
  ('tracks_25',          4, 30,  750, 'tracks',            25,     false),
  ('circuit_speed_300',  4, 40,  750, 'circuit_top_speed', 300,    false),
  ('sprint_0_100_4',     4, 50,  750, 'best_0_100_s',      4,      true),
  ('drives_365',         4, 60, 1000, 'drives',            365,    false),
  ('distance_100000',    5, 10, 2500, 'distance_km',       100000, false),
  ('tracks_100',         5, 20, 2500, 'tracks',            100,    false),
  ('circuit_speed_400',  5, 30, 3000, 'circuit_top_speed', 400,    false),
  ('sprint_0_100_25',    5, 40, 3000, 'best_0_100_s',      2.5,    true),
  ('sprint_0_200_7',     5, 50, 3000, 'best_0_200_s',      7,      true)
on conflict (key) do update set tier = excluded.tier, sort = excluded.sort, xp = excluded.xp,
  metric = excluded.metric, target = excluded.target, lower_is_better = excluded.lower_is_better;

create table if not exists public.user_achievements (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  key           text not null references public.achievements (key) on delete cascade,
  completed_at  timestamptz not null default now(),
  collected_at  timestamptz,
  primary key (user_id, key)
);
alter table public.user_achievements enable row level security;
drop policy if exists "user achievements read own" on public.user_achievements;
create policy "user achievements read own" on public.user_achievements for select to authenticated using (user_id = auth.uid());
grant select on public.user_achievements to authenticated;

-- Phase de test : les drives simulés comptent pour les succès (comme pour les classements des
-- builds de test). Passer à false avant la sortie publique.
create or replace function public.achievements_count_simulated()
returns boolean language sql immutable set search_path = '' as $$ select true $$;

-- Valeur de chaque métrique pour un conducteur.
create or replace function public.achievement_metrics(p_user uuid)
returns table (metric text, value numeric)
language sql stable security definer set search_path = '' as $$
  with d as (
    select dr.* from public.drives dr
    where dr.owner_id = p_user and (not dr.is_simulated or public.achievements_count_simulated())
  ), v as (
    select d.id, d.circuit_id, c.category
    from d join public.circuits c on c.id = d.circuit_id
    where d.mode = 'circuit' and exists (select 1 from public.drive_laps l where l.drive_id = d.id)
  ), s as (
    select sr.kind, min(sr.time_ms) as t from public.sprint_results sr join d on d.id = sr.drive_id group by sr.kind
  )
  select x.metric, x.value from (values
    ('drives',            (select count(*) from d)::numeric),
    ('distance_km',       (select coalesce(sum(d.distance_m), 0) / 1000.0 from d)),
    ('sessions',          (select count(*) from v)::numeric),
    ('tracks',            (select count(distinct v.circuit_id) from v)::numeric),
    ('track_categories',  (select count(distinct v.category) from v)::numeric),
    ('laps',              (select count(*) from public.drive_laps l join d on d.id = l.drive_id)::numeric),
    ('circuit_top_speed', (select max(d.max_speed_kmh) from d where d.circuit_id is not null)::numeric),
    ('best_0_100_s',      (select s.t / 1000.0 from s where s.kind = '0_100')),
    ('best_0_200_s',      (select s.t / 1000.0 from s where s.kind = '0_200')),
    ('likes',             (select coalesce(sum(d.like_count), 0) from d)::numeric),
    ('comments',          (select count(*) from public.comments c where c.user_id = p_user)::numeric),
    ('following',         (select count(*) from public.follows f where f.follower_id = p_user)::numeric),
    ('crews',             (select count(*) from public.crew_members cm where cm.user_id = p_user and cm.status = 'active')::numeric),
    ('car_specs',         (select count(*) from public.vehicles ve where ve.owner_id = p_user and ve.power_kw is not null and ve.weight_kg is not null)::numeric)
  ) as x(metric, value)
$$;
revoke all on function public.achievement_metrics(uuid) from public, anon, authenticated;

-- Notifications : nouveau type « succès réalisé », envoyé par le conducteur à lui-même.
alter type public.notification_type add value if not exists 'achievement';
alter table public.notifications add column if not exists achievement_key text references public.achievements (key) on delete cascade;
alter table public.notifications drop constraint if exists notifications_check;
alter table public.notifications add constraint notifications_check check (user_id <> actor_id or type::text = 'achievement');

-- Enregistre les succès nouvellement réalisés et prévient le conducteur (une fois par succès).
-- plpgsql : le corps n'est validé qu'à l'exécution (la valeur d'enum vient d'être ajoutée).
create or replace function public.refresh_achievements(p_user uuid)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  n int;
begin
  if p_user is null then return 0; end if;
  with m as (select * from public.achievement_metrics(p_user)),
  done as (
    insert into public.user_achievements (user_id, key)
    select p_user, a.key
    from public.achievements a join m on m.metric = a.metric
    where m.value is not null
      and case when a.lower_is_better then m.value <= a.target else m.value >= a.target end
    on conflict do nothing
    returning key
  )
  insert into public.notifications (user_id, actor_id, type, achievement_key)
  select p_user, p_user, 'achievement', done.key from done;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.refresh_achievements(uuid) from public, anon, authenticated;

-- Appelé par l'app (ouverture du garage, fin d'un drive) : rattrape ce que les triggers n'ont
-- pas vu et renvoie le nombre de succès à collecter.
create or replace function public.sync_achievements()
returns int language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null then return 0; end if;
  perform public.refresh_achievements(auth.uid());
  return (select count(*)::int from public.user_achievements ua where ua.user_id = auth.uid() and ua.collected_at is null);
end;
$$;
revoke all on function public.sync_achievements() from public, anon;
grant execute on function public.sync_achievements() to authenticated;

-- Liste des succès avec la progression du conducteur connecté.
create or replace function public.my_achievements()
returns table (key text, tier int, sort int, xp int, metric text, target numeric, lower_is_better boolean,
               value numeric, completed_at timestamptz, collected_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.key, a.tier, a.sort, a.xp, a.metric, a.target, a.lower_is_better, m.value, ua.completed_at, ua.collected_at
  from public.achievements a
  left join public.achievement_metrics(auth.uid()) m on m.metric = a.metric
  left join public.user_achievements ua on ua.user_id = auth.uid() and ua.key = a.key
  where auth.uid() is not null
  order by a.tier, a.sort
$$;
revoke all on function public.my_achievements() from public, anon;
grant execute on function public.my_achievements() to authenticated;

-- Collecter un succès réalisé : l'XP s'ajoute au niveau. Renvoie l'XP gagnée.
create or replace function public.collect_achievement(p_key text)
returns int language plpgsql volatile security definer set search_path = '' as $$
declare
  gained int;
begin
  update public.user_achievements ua set collected_at = now()
   where ua.user_id = auth.uid() and ua.key = p_key and ua.collected_at is null;
  if not found then raise exception 'achievement_not_collectable'; end if;
  select a.xp into gained from public.achievements a where a.key = p_key;
  return gained;
end;
$$;
revoke all on function public.collect_achievement(text) from public, anon;
grant execute on function public.collect_achievement(text) to authenticated;

-- Triggers : chaque écriture qui peut faire avancer un succès relance le calcul pour la
-- personne concernée. Une erreur de calcul ne bloque jamais l'écriture d'origine.
create or replace function public.on_achievement_source()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  j jsonb := to_jsonb(new);
  who uuid;
begin
  begin
    who := case tg_table_name
      when 'comments' then (j->>'user_id')::uuid
      when 'crew_members' then (j->>'user_id')::uuid
      when 'follows' then (j->>'follower_id')::uuid
      when 'drive_laps' then (select d.owner_id from public.drives d where d.id = (j->>'drive_id')::uuid)
      when 'likes' then (select d.owner_id from public.drives d where d.id = (j->>'drive_id')::uuid)
      else (j->>'owner_id')::uuid  -- drives, sprint_results, vehicles
    end;
    perform public.refresh_achievements(who);
  exception when others then
    null;
  end;
  return null;
end;
$$;

drop trigger if exists achievements_drives on public.drives;
create trigger achievements_drives after insert or update of distance_m, max_speed_kmh, mode, circuit_id, is_simulated
  on public.drives for each row execute function public.on_achievement_source();
drop trigger if exists achievements_sprints on public.sprint_results;
create trigger achievements_sprints after insert on public.sprint_results for each row execute function public.on_achievement_source();
drop trigger if exists achievements_laps on public.drive_laps;
create trigger achievements_laps after insert on public.drive_laps for each row execute function public.on_achievement_source();
drop trigger if exists achievements_likes on public.likes;
create trigger achievements_likes after insert on public.likes for each row execute function public.on_achievement_source();
drop trigger if exists achievements_comments on public.comments;
create trigger achievements_comments after insert on public.comments for each row execute function public.on_achievement_source();
drop trigger if exists achievements_follows on public.follows;
create trigger achievements_follows after insert on public.follows for each row execute function public.on_achievement_source();
drop trigger if exists achievements_crews on public.crew_members;
create trigger achievements_crews after insert or update of status on public.crew_members for each row execute function public.on_achievement_source();
drop trigger if exists achievements_vehicles on public.vehicles;
create trigger achievements_vehicles after insert or update of power_kw, weight_kg on public.vehicles for each row execute function public.on_achievement_source();

-- Notifications : + clé du succès (remplace 0022).
drop function if exists public.my_notifications(int, timestamptz);
create function public.my_notifications(p_limit int default 30, p_before timestamptz default now())
returns table (
  id bigint, type public.notification_type, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text,
  drive_id uuid, drive_title text, comment_excerpt text,
  i_follow boolean, request_pending boolean,
  crew_id uuid, crew_name text, invite_pending boolean, achievement_key text
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.type, n.created_at, n.read_at,
         n.actor_id, p.username, p.display_name, p.avatar_url,
         n.drive_id, d.title, left(c.body, 120),
         public.is_following(auth.uid(), n.actor_id),
         exists (select 1 from public.follow_requests r where r.requester_id = n.actor_id and r.target_id = auth.uid()),
         n.crew_id, cr.name,
         exists (select 1 from public.crew_invites i where i.crew_id = n.crew_id and i.user_id = auth.uid()),
         n.achievement_key
  from public.notifications n
  join public.profiles p on p.id = n.actor_id
  left join public.drives d on d.id = n.drive_id
  left join public.comments c on c.id = n.comment_id
  left join public.crews cr on cr.id = n.crew_id
  where n.user_id = auth.uid() and n.created_at < p_before
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;
revoke all on function public.my_notifications(int, timestamptz) from public, anon;
grant execute on function public.my_notifications(int, timestamptz) to authenticated;

-- 3. XP : les succès collectés s'ajoutent (remplace xp_total de 0032 et driver_xp de 0033).
create or replace function public.achievements_xp(p_user uuid)
returns table (n int, xp bigint)
language sql stable security definer set search_path = '' as $$
  select count(*)::int, coalesce(sum(a.xp), 0)::bigint
  from public.user_achievements ua join public.achievements a on a.key = ua.key
  where ua.user_id = p_user and ua.collected_at is not null
$$;
revoke all on function public.achievements_xp(uuid) from public, anon, authenticated;

create or replace function public.xp_total(p_user uuid, p_with_sim boolean)
returns bigint language sql stable security definer set search_path = '' as $$
  with d as (
    select dr.id, dr.distance_m, dr.circuit_id, dr.mode, dr.lap_time_ms, dr.started_at
    from public.drives dr where dr.owner_id = p_user and (not dr.is_simulated or p_with_sim)
  ), verified as (
    select d.id, d.circuit_id, d.lap_time_ms, d.started_at, c.category
    from d join public.circuits c on c.id = d.circuit_id
    where d.mode = 'circuit' and exists (select 1 from public.drive_laps l where l.drive_id = d.id)
  ), pb as (
    select count(*)::int as n from (
      select v.lap_time_ms, min(v.lap_time_ms) over (partition by v.circuit_id order by v.started_at
        rows between unbounded preceding and 1 preceding) as prev_best
      from verified v where v.lap_time_ms is not null
    ) x where x.prev_best is not null and x.lap_time_ms < x.prev_best
  ), agg as (
    select coalesce(sum(d.distance_m), 0)::bigint as dist, count(distinct d.circuit_id)::int as tracks,
           (select count(*)::int from verified) as sess, (select count(distinct category)::int from verified) as cats,
           (select n from pb) as pbs
    from d
  )
  select (a.dist / 100) + a.tracks * 100 + case when a.sess > 0 then 250 else 0 end + a.sess * 100 + a.pbs * 200 + a.cats * 150
         + (select ax.xp from public.achievements_xp(p_user) ax)
  from agg a
$$;
revoke all on function public.xp_total(uuid, boolean) from public, anon, authenticated;

drop function if exists public.driver_xp(uuid, boolean);
create function public.driver_xp(p_user uuid, p_include_sim boolean default false)
returns table (
  xp bigint, distance_m bigint, drive_count int, tracks_visited int, sessions int,
  personal_bests int, categories int, achievements int,
  distance_xp bigint, tracks_xp int, sessions_xp int, pb_xp int, categories_xp int, achievements_xp bigint
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
  ), ach as (
    select * from public.achievements_xp(p_user) where auth.uid() is not null and not public.is_blocked_with(p_user)
  )
  select
    (a.dist / 100) + a.tracks * 100 + case when a.sess > 0 then 250 else 0 end + a.sess * 100 + a.pbs * 200 + a.cats * 150
      + coalesce((select ach.xp from ach), 0),
    a.dist, a.drives, a.tracks, a.sess, a.pbs, a.cats, coalesce((select ach.n from ach), 0),
    a.dist / 100, a.tracks * 100, case when a.sess > 0 then 250 else 0 end + a.sess * 100, a.pbs * 200, a.cats * 150,
    coalesce((select ach.xp from ach), 0)
  from agg a
$$;
revoke all on function public.driver_xp(uuid, boolean) from public, anon;
grant execute on function public.driver_xp(uuid, boolean) to authenticated;
