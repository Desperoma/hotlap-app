-- =============================================================================
-- 0013 : abonnements « à la Instagram », Friends, réglages de confidentialité du profil
--
-- - Friends = deux personnes qui se suivent mutuellement.
-- - Visibilité d'un drive : private (moi) < friends (abonnement réciproque) <
--   followers (ceux qui me suivent) < public (tout le monde).
-- - Réglage de compte follow_policy : 'open' (on s'abonne librement) ou 'approval'
--   (chaque abonnement est une demande à accepter ou refuser).
-- - Réglage de compte details_visibility pour le garage et la ville : public, followers ou
--   private. Pseudo, nom affiché, bio et photo restent toujours publics.
-- - Les listes followers / following ne sont lisibles que par la personne concernée ;
--   les nombres passent par profile_stats.
-- =============================================================================

create type public.follow_policy as enum ('open', 'approval');
create type public.details_visibility as enum ('public', 'followers', 'private');

alter table public.profiles
  add column follow_policy public.follow_policy not null default 'open',
  add column details_visibility public.details_visibility not null default 'followers';

-- 1. Aides ------------------------------------------------------------------------
create or replace function public.is_following(p_follower uuid, p_following uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.follows f where f.follower_id = p_follower and f.following_id = p_following)
$$;

-- Garage et ville d'un utilisateur visibles par moi ?
create or replace function public.can_see_details(p_owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner = auth.uid()
    or (
      not public.is_blocked_with(p_owner)
      and exists (
        select 1 from public.profiles p
        where p.id = p_owner
          and (p.details_visibility = 'public'
               or (p.details_visibility = 'followers' and public.is_following(auth.uid(), p_owner)))
      )
    )
$$;

-- 2. Visibilité des drives (remplace 0005) ------------------------------------------
create or replace function public.can_see_drive(d_owner uuid, d_visibility public.visibility)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    d_owner = auth.uid()
    or (
      not public.is_blocked_with(d_owner)
      and (
        d_visibility = 'public'
        or (d_visibility = 'followers' and public.is_following(auth.uid(), d_owner))
        or (d_visibility = 'friends'
            and public.is_following(auth.uid(), d_owner)
            and public.is_following(d_owner, auth.uid()))
      )
    )
$$;

-- 3. Profil public : la ville suit details_visibility ----------------------------------
create or replace view public.public_profiles as
  select p.id, p.username, p.display_name, p.avatar_url, p.bio, p.country_code,
         case when public.can_see_details(p.id) then p.home_city end as home_city,
         p.created_at, p.follow_policy
  from public.profiles p;
revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

-- Garage : visible selon details_visibility ; le véhicule d'un drive visible reste
-- affiché sur ce drive.
drop policy if exists "vehicles read" on public.vehicles;
create policy "vehicles read" on public.vehicles for select to authenticated
  using (
    owner_id = auth.uid()
    or public.can_see_details(owner_id)
    or exists (
      select 1 from public.drives d
      where d.vehicle_id = vehicles.id and public.can_see_drive(d.owner_id, d.visibility)
    )
  );

-- 4. Abonnements --------------------------------------------------------------------
create or replace function public.accepts_open_follows(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.follow_policy = 'open' from public.profiles p where p.id = p_user), false)
$$;

-- Les listes ne concernent que moi ; on peut retirer un de ses followers.
drop policy if exists "follows read" on public.follows;
create policy "follows read" on public.follows for select to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid());
drop policy if exists "follows insert" on public.follows;
create policy "follows insert" on public.follows for insert to authenticated
  with check (
    follower_id = auth.uid() and following_id <> auth.uid()
    and not public.is_blocked_with(following_id)
    and public.accepts_open_follows(following_id)
  );
drop policy if exists "follows delete" on public.follows;
create policy "follows delete" on public.follows for delete to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid());

-- Demandes d'abonnement (comptes en 'approval')
create table public.follow_requests (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  target_id    uuid not null references public.profiles (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (requester_id, target_id),
  check (requester_id <> target_id)
);
create index follow_requests_target on public.follow_requests (target_id, created_at desc);
alter table public.follow_requests enable row level security;
create policy "follow requests read" on public.follow_requests for select to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
-- Annuler sa demande, ou refuser une demande reçue
create policy "follow requests delete" on public.follow_requests for delete to authenticated
  using (requester_id = auth.uid() or target_id = auth.uid());
grant select, delete on public.follow_requests to authenticated;
grant all on public.follow_requests to service_role;

-- S'abonner : direct si le compte est ouvert, sinon demande. Renvoie 'following' ou 'requested'.
create or replace function public.follow_user(p_target uuid)
returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_target is null or p_target = me then raise exception 'Invalid user'; end if;
  if public.is_blocked_with(p_target) then raise exception 'Not allowed'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then raise exception 'Unknown user'; end if;
  if public.is_following(me, p_target) then return 'following'; end if;
  if public.accepts_open_follows(p_target) then
    insert into public.follows (follower_id, following_id) values (me, p_target) on conflict do nothing;
    return 'following';
  end if;
  insert into public.follow_requests (requester_id, target_id) values (me, p_target) on conflict do nothing;
  return 'requested';
end;
$$;

create or replace function public.answer_follow_request(p_requester uuid, p_accept boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  delete from public.follow_requests where requester_id = p_requester and target_id = me;
  if not found then raise exception 'No such request'; end if;
  if p_accept and not public.is_blocked_with(p_requester) then
    insert into public.follows (follower_id, following_id) values (p_requester, me) on conflict do nothing;
  end if;
end;
$$;

-- Passer son compte en 'open' accepte les demandes en attente.
create or replace function public.on_follow_policy_open()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.follow_policy = 'open' and old.follow_policy is distinct from 'open' then
    insert into public.follows (follower_id, following_id)
      select r.requester_id, r.target_id from public.follow_requests r
      where r.target_id = new.id and not public.is_blocked_with(r.requester_id)
      on conflict do nothing;
    delete from public.follow_requests where target_id = new.id;
  end if;
  return new;
end;
$$;
create trigger profiles_follow_policy_open after update of follow_policy on public.profiles
  for each row execute function public.on_follow_policy_open();

-- Bloquer supprime aussi les demandes dans les deux sens.
create or replace function public.on_block_requests()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.follow_requests
  where (requester_id = new.blocker_id and target_id = new.blocked_id)
     or (requester_id = new.blocked_id and target_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_drop_requests after insert on public.blocks
  for each row execute function public.on_block_requests();

-- 5. Lecture pour l'app ----------------------------------------------------------------
-- Nombres d'un profil (drives visibles par moi) et relation avec moi.
create or replace function public.profile_stats(p_user uuid)
returns table (
  drives int, followers int, following int, best_score int,
  i_follow boolean, follows_me boolean, requested boolean
)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.drives d where d.owner_id = p_user and public.can_see_drive(d.owner_id, d.visibility)),
    (select count(*)::int from public.follows f where f.following_id = p_user),
    (select count(*)::int from public.follows f where f.follower_id = p_user),
    (select max(d.score) from public.drives d where d.owner_id = p_user and public.can_see_drive(d.owner_id, d.visibility)),
    public.is_following(auth.uid(), p_user),
    public.is_following(p_user, auth.uid()),
    exists (select 1 from public.follow_requests r where r.requester_id = auth.uid() and r.target_id = p_user)
  where auth.uid() is not null and not public.is_blocked_with(p_user)
$$;

-- Mes listes : 'followers', 'following' ou 'requests' (demandes reçues).
create or replace function public.my_people(p_kind text)
returns table (
  id uuid, username text, display_name text, avatar_url text,
  i_follow boolean, follows_me boolean, since timestamptz
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_url,
         public.is_following(auth.uid(), p.id), public.is_following(p.id, auth.uid()), x.since
  from (
    select f.follower_id as uid, f.created_at as since from public.follows f
      where p_kind = 'followers' and f.following_id = auth.uid()
    union all
    select f.following_id, f.created_at from public.follows f
      where p_kind = 'following' and f.follower_id = auth.uid()
    union all
    select r.requester_id, r.created_at from public.follow_requests r
      where p_kind = 'requests' and r.target_id = auth.uid()
  ) x
  join public.profiles p on p.id = x.uid
  where auth.uid() is not null
  order by x.since desc
  limit 500
$$;

revoke execute on function public.on_follow_policy_open() from public, anon, authenticated;
revoke execute on function public.on_block_requests() from public, anon, authenticated;
revoke all on function public.is_following(uuid, uuid) from public, anon;
revoke all on function public.can_see_details(uuid) from public, anon;
revoke all on function public.accepts_open_follows(uuid) from public, anon;
revoke all on function public.follow_user(uuid) from public, anon;
revoke all on function public.answer_follow_request(uuid, boolean) from public, anon;
revoke all on function public.profile_stats(uuid) from public, anon;
revoke all on function public.my_people(text) from public, anon;
grant execute on function public.is_following(uuid, uuid) to authenticated;
grant execute on function public.can_see_details(uuid) to authenticated;
grant execute on function public.accepts_open_follows(uuid) to authenticated;
grant execute on function public.follow_user(uuid) to authenticated;
grant execute on function public.answer_follow_request(uuid, boolean) to authenticated;
grant execute on function public.profile_stats(uuid) to authenticated;
grant execute on function public.my_people(text) to authenticated;
