-- =============================================================================
-- 0022 : invitations dans un crew ; région du profil public ; puissance, poids et
--        statistiques des véhicules
--
-- 1. Profil public : la région (State / Province) suit details_visibility, comme la ville.
-- 2. Véhicules : puissance (kW) et poids (kg), saisis par le conducteur ou repris du
--    catalogue (vehicle_models, rempli par l'import Wikidata). Le garage d'un profil
--    (user_garage) les renvoie. my_vehicle_stats : drives, distance et vitesse max par
--    véhicule, pour son seul propriétaire (la vitesse max n'est jamais montrée aux autres).
-- 3. Crews : un admin (ou n'importe quel membre d'un crew ouvert) invite quelqu'un ;
--    l'invité reçoit une notification et accepte (il entre directement, même dans un
--    crew sur demande) ou refuse. Écritures uniquement par fonctions.
-- =============================================================================

-- 1. Région du profil public ------------------------------------------------------------
create or replace view public.public_profiles as
  select p.id, p.username, p.display_name, p.avatar_url, p.bio, p.country_code,
         case when public.can_see_details(p.id) then p.home_city end as home_city,
         p.created_at, p.follow_policy,
         case when public.can_see_details(p.id) then p.region end as region
  from public.profiles p;
revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

-- 2. Véhicules : caractéristiques et statistiques ------------------------------------------
alter table public.vehicles
  add column if not exists power_kw  real check (power_kw is null or power_kw between 1 and 2500),
  add column if not exists weight_kg int  check (weight_kg is null or weight_kg between 200 and 8000);
alter table public.vehicle_models
  add column if not exists power_kw  real,
  add column if not exists weight_kg int;

drop function if exists public.user_garage(uuid);
create function public.user_garage(p_user uuid)
returns table (id uuid, make text, model text, year int, color text, is_primary boolean, power_kw real, weight_kg int)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.make, v.model, v.year, v.color, v.is_primary, v.power_kw, v.weight_kg
  from public.vehicles v
  where v.owner_id = p_user
    and auth.uid() is not null
    and public.can_see_details(p_user)
  order by v.is_primary desc, v.created_at
$$;
revoke all on function public.user_garage(uuid) from public, anon;
grant execute on function public.user_garage(uuid) to authenticated;

-- Par véhicule de l'utilisateur connecté ; les drives simulés (tests) ne comptent pas.
create or replace function public.my_vehicle_stats()
returns table (vehicle_id uuid, drive_count int, distance_m bigint, max_speed_kmh real)
language sql
stable
security definer
set search_path = ''
as $$
  select d.vehicle_id, count(*)::int, sum(d.distance_m)::bigint, max(d.max_speed_kmh)
  from public.drives d
  where d.owner_id = auth.uid() and d.vehicle_id is not null and not d.is_simulated
  group by d.vehicle_id
$$;
revoke all on function public.my_vehicle_stats() from public, anon;
grant execute on function public.my_vehicle_stats() to authenticated;

-- 3. Invitations dans un crew -------------------------------------------------------------
create table if not exists public.crew_invites (
  crew_id     uuid not null references public.crews (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,  -- invité
  invited_by  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (crew_id, user_id),
  check (user_id <> invited_by)
);
create index if not exists crew_invites_user on public.crew_invites (user_id);
alter table public.crew_invites enable row level security;
drop policy if exists "crew invites read" on public.crew_invites;
create policy "crew invites read" on public.crew_invites for select to authenticated
  using (user_id = auth.uid() or invited_by = auth.uid() or public.my_crew_role(crew_id) in ('owner', 'admin'));
grant select on public.crew_invites to authenticated;
grant all on public.crew_invites to service_role;

alter type public.notification_type add value if not exists 'crew_invite';
alter table public.notifications add column if not exists crew_id uuid references public.crews (id) on delete cascade;

-- Inviter. Renvoie 'invited', 'already_member', ou 'joined' (l'invité avait déjà demandé à
-- entrer et un admin l'invite : la demande est acceptée).
create or replace function public.invite_to_crew(p_crew_id uuid, p_user_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  my_role public.crew_role := public.my_crew_role(p_crew_id);
  c record;
  st public.crew_member_status;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select id, join_policy into c from public.crews where id = p_crew_id;
  if not found or my_role is null then raise exception 'crew_forbidden'; end if;
  if my_role = 'member' and c.join_policy <> 'open' then raise exception 'crew_forbidden'; end if;
  if p_user_id is null or p_user_id = me or not exists (select 1 from public.profiles where id = p_user_id)
     or public.is_blocked_with(p_user_id) then
    raise exception 'crew_invite_unavailable';
  end if;

  select status into st from public.crew_members where crew_id = p_crew_id and user_id = p_user_id;
  if found and st = 'active' then return 'already_member'; end if;
  if found and st = 'pending' and my_role in ('owner', 'admin') then
    update public.crew_members set status = 'active', joined_at = now()
    where crew_id = p_crew_id and user_id = p_user_id;
    return 'joined';
  end if;

  insert into public.crew_invites (crew_id, user_id, invited_by) values (p_crew_id, p_user_id, me)
  on conflict (crew_id, user_id) do nothing;
  if found then
    delete from public.notifications where user_id = p_user_id and crew_id = p_crew_id and type = 'crew_invite';
    insert into public.notifications (user_id, actor_id, type, crew_id) values (p_user_id, me, 'crew_invite', p_crew_id);
  end if;
  return 'invited';
end;
$$;

-- Accepter (entrée directe, même dans un crew sur demande) ou refuser. Renvoie 'active' ou 'declined'.
create or replace function public.respond_crew_invite(p_crew_id uuid, p_accept boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv record;
begin
  if me is null then raise exception 'Not signed in'; end if;
  delete from public.crew_invites where crew_id = p_crew_id and user_id = me returning * into inv;
  if not found then raise exception 'crew_invite_not_found'; end if;
  delete from public.notifications where user_id = me and crew_id = p_crew_id and type = 'crew_invite';
  if not p_accept then return 'declined'; end if;
  if public.is_blocked_with(inv.invited_by) then raise exception 'crew_invite_not_found'; end if;
  if not exists (select 1 from public.crew_members where crew_id = p_crew_id and user_id = me)
     and (select count(*) from public.crew_members where user_id = me) >= 20 then
    raise exception 'crew_limit_member';
  end if;
  insert into public.crew_members (crew_id, user_id, role, status) values (p_crew_id, me, 'member', 'active')
  on conflict (crew_id, user_id) do update set status = 'active', joined_at = now()
    where public.crew_members.status = 'pending';
  return 'active';
end;
$$;

-- Annuler une invitation : son auteur ou un admin du crew.
create or replace function public.cancel_crew_invite(p_crew_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.crew_invites i
  where i.crew_id = p_crew_id and i.user_id = p_user_id
    and (i.invited_by = auth.uid() or public.my_crew_role(p_crew_id) in ('owner', 'admin'));
  if found then
    delete from public.notifications where user_id = p_user_id and crew_id = p_crew_id and type = 'crew_invite';
  end if;
end;
$$;

-- Mes invitations en attente.
create or replace function public.my_crew_invites()
returns table (crew_id uuid, crew_name text, member_count int, invited_by uuid, inviter_username text,
               inviter_display_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.crew_id, c.name, c.member_count, i.invited_by, p.username, p.display_name, i.created_at
  from public.crew_invites i
  join public.crews c on c.id = i.crew_id
  join public.profiles p on p.id = i.invited_by
  where i.user_id = auth.uid() and not public.is_blocked_with(i.invited_by)
  order by i.created_at desc
$$;

-- Entré dans le crew par un autre chemin (demande acceptée, crew ouvert) : l'invitation tombe.
create or replace function public.on_crew_member_drop_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'active' then
    delete from public.crew_invites where crew_id = new.crew_id and user_id = new.user_id;
    delete from public.notifications where user_id = new.user_id and crew_id = new.crew_id and type::text = 'crew_invite';
  end if;
  return new;
end;
$$;
drop trigger if exists crew_members_drop_invite on public.crew_members;
create trigger crew_members_drop_invite after insert or update of status on public.crew_members
  for each row execute function public.on_crew_member_drop_invite();

revoke all on function public.invite_to_crew(uuid, uuid) from public, anon;
revoke all on function public.respond_crew_invite(uuid, boolean) from public, anon;
revoke all on function public.cancel_crew_invite(uuid, uuid) from public, anon;
revoke all on function public.my_crew_invites() from public, anon;
revoke all on function public.on_crew_member_drop_invite() from public, anon, authenticated;
grant execute on function public.invite_to_crew(uuid, uuid) to authenticated;
grant execute on function public.respond_crew_invite(uuid, boolean) to authenticated;
grant execute on function public.cancel_crew_invite(uuid, uuid) to authenticated;
grant execute on function public.my_crew_invites() to authenticated;

-- Notifications : le crew de l'invitation (nom, invitation encore en attente).
drop function if exists public.my_notifications(int, timestamptz);
create function public.my_notifications(p_limit int default 30, p_before timestamptz default now())
returns table (
  id bigint, type public.notification_type, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text,
  drive_id uuid, drive_title text, comment_excerpt text,
  i_follow boolean, request_pending boolean,
  crew_id uuid, crew_name text, invite_pending boolean
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.type, n.created_at, n.read_at,
         n.actor_id, p.username, p.display_name, p.avatar_url,
         n.drive_id, d.title, left(c.body, 120),
         public.is_following(auth.uid(), n.actor_id),
         exists (select 1 from public.follow_requests r where r.requester_id = n.actor_id and r.target_id = auth.uid()),
         n.crew_id, cr.name,
         exists (select 1 from public.crew_invites i where i.crew_id = n.crew_id and i.user_id = auth.uid())
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
