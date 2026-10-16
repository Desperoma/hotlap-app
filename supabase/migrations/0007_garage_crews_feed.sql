-- =============================================================================
-- 0007 : garage, crews, carte dans le fil, photo de profil, connexion par pseudo
--
-- 1. Garage : plusieurs véhicules par utilisateur, un seul favori (is_primary).
--    set_primary_vehicle change le favori d'un coup ; supprimer le favori en désigne un autre.
--    Un drive ne peut être rattaché qu'à un véhicule de son propriétaire.
-- 2. Crews : groupes de conducteurs. Ouverts (on rejoint directement) ou sur demande
--    (un admin valide). Toutes les écritures passent par des fonctions qui vérifient les rôles.
--    Fil « Crews » : drives visibles des membres de mes crews.
-- 3. Aperçu du tracé dans le fil : drive_path_previews renvoie, pour une page du fil, les tracés
--    simplifiés et privés de leurs zones de confidentialité (mêmes règles que drive_path_public).
-- 4. Photo de profil : bucket public « avatars », un dossier par utilisateur.
-- 5. login_attempts : limite les essais de l'Edge Function sign-in (connexion par email ou pseudo).
-- =============================================================================

-- 1. Garage ------------------------------------------------------------------------

create or replace function public.set_primary_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and owner_id = auth.uid()) then
    raise exception 'vehicle_not_found';
  end if;
  update public.vehicles set is_primary = false where owner_id = auth.uid() and is_primary and id <> p_vehicle_id;
  update public.vehicles set is_primary = true where id = p_vehicle_id;
end;
$$;
revoke all on function public.set_primary_vehicle(uuid) from public, anon;
grant execute on function public.set_primary_vehicle(uuid) to authenticated;

-- 20 véhicules maximum par garage.
create or replace function public.check_garage_size()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (select count(*) from public.vehicles where owner_id = new.owner_id) >= 20 then
    raise exception 'garage_full';
  end if;
  return new;
end;
$$;
create trigger vehicles_garage_size before insert on public.vehicles
  for each row execute function public.check_garage_size();

-- Le favori supprimé est remplacé par le véhicule le plus ancien restant.
create or replace function public.promote_next_vehicle()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if old.is_primary then
    update public.vehicles set is_primary = true
    where id = (select id from public.vehicles where owner_id = old.owner_id order by created_at limit 1);
  end if;
  return null;
end;
$$;
create trigger vehicles_promote_next after delete on public.vehicles
  for each row execute function public.promote_next_vehicle();

-- Champs texte du garage : longueurs raisonnables.
alter table public.vehicles add constraint vehicles_text_length
  check (char_length(make) between 1 and 60 and char_length(model) between 1 and 80
         and (nickname is null or char_length(nickname) <= 40));

-- Un drive ne peut pointer que vers un véhicule de son propriétaire.
create or replace function public.check_drive_vehicle()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.vehicle_id is not null
     and not exists (select 1 from public.vehicles v where v.id = new.vehicle_id and v.owner_id = new.owner_id) then
    raise exception 'vehicle_not_in_garage';
  end if;
  return new;
end;
$$;
create trigger drives_vehicle_owner before insert or update of vehicle_id on public.drives
  for each row execute function public.check_drive_vehicle();

revoke execute on function public.check_garage_size() from public, anon, authenticated;
revoke execute on function public.promote_next_vehicle() from public, anon, authenticated;
revoke execute on function public.check_drive_vehicle() from public, anon, authenticated;

-- 2. Crews -------------------------------------------------------------------------

create type public.crew_join_policy as enum ('open', 'approval');
create type public.crew_role as enum ('owner', 'admin', 'member');
create type public.crew_member_status as enum ('active', 'pending');

create table public.crews (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 3 and 40),
  name_key      text not null,
  description   text check (char_length(description) <= 280),
  home_city     text check (char_length(home_city) <= 80),
  country_code  char(2),
  join_policy   public.crew_join_policy not null default 'open',
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  member_count  int not null default 0,
  created_at    timestamptz not null default now()
);
-- Pas deux crews au même nom, à la casse, aux accents et à la ponctuation près.
create unique index crews_name_key on public.crews (name_key);
create index crews_name_trgm on public.crews using gin (name_key extensions.gin_trgm_ops);

create table public.crew_members (
  crew_id    uuid not null references public.crews (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.crew_role not null default 'member',
  status     public.crew_member_status not null default 'active',
  joined_at  timestamptz not null default now(),
  primary key (crew_id, user_id)
);
create index crew_members_user on public.crew_members (user_id);

alter table public.crews enable row level security;
alter table public.crew_members enable row level security;

-- Rôle de l'utilisateur connecté dans un crew (null si non membre actif).
create or replace function public.my_crew_role(p_crew_id uuid)
returns public.crew_role
language sql
stable
security definer set search_path = ''
as $$
  select role from public.crew_members
  where crew_id = p_crew_id and user_id = auth.uid() and status = 'active'
$$;
revoke all on function public.my_crew_role(uuid) from public, anon;
grant execute on function public.my_crew_role(uuid) to authenticated;

-- Lecture : les crews sont publics ; les membres actifs aussi. Les demandes en attente ne sont
-- visibles que par leur auteur et par les admins du crew. Aucune écriture directe : fonctions ci-dessous.
create policy "crews read" on public.crews for select to authenticated
  using (not public.is_blocked_with(owner_id));
create policy "crew members read" on public.crew_members for select to authenticated
  using (
    not public.is_blocked_with(user_id)
    and (
      status = 'active'
      or user_id = auth.uid()
      or public.my_crew_role(crew_id) in ('owner', 'admin')
    )
  );

-- Compteur de membres actifs tenu par la base.
create or replace function public.bump_crew_count()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  cid uuid := coalesce(new.crew_id, old.crew_id);
begin
  update public.crews set member_count =
    (select count(*) from public.crew_members where crew_id = cid and status = 'active')
  where id = cid;
  return null;
end;
$$;
create trigger crew_members_count after insert or update or delete on public.crew_members
  for each row execute function public.bump_crew_count();
revoke execute on function public.bump_crew_count() from public, anon, authenticated;

create or replace function public.create_crew(
  p_name text, p_description text default null, p_join_policy public.crew_join_policy default 'open',
  p_home_city text default null, p_country_code text default null
)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  cid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if (select count(*) from public.crews where owner_id = auth.uid()) >= 5 then
    raise exception 'crew_limit_owner';
  end if;
  if (select count(*) from public.crew_members where user_id = auth.uid()) >= 20 then
    raise exception 'crew_limit_member';
  end if;
  if exists (select 1 from public.crews where name_key = public.catalog_key(p_name)) then
    raise exception 'crew_name_taken';
  end if;
  insert into public.crews (name, name_key, description, join_policy, home_city, country_code, owner_id)
  values (btrim(p_name), public.catalog_key(p_name), nullif(btrim(p_description), ''), p_join_policy,
          nullif(btrim(p_home_city), ''), nullif(upper(p_country_code), ''), auth.uid())
  returning id into cid;
  insert into public.crew_members (crew_id, user_id, role, status) values (cid, auth.uid(), 'owner', 'active');
  return cid;
end;
$$;

create or replace function public.update_crew(
  p_crew_id uuid, p_name text, p_description text, p_join_policy public.crew_join_policy,
  p_home_city text default null, p_country_code text default null
)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.my_crew_role(p_crew_id) is distinct from 'owner' and public.my_crew_role(p_crew_id) is distinct from 'admin' then
    raise exception 'crew_forbidden';
  end if;
  if exists (select 1 from public.crews where name_key = public.catalog_key(p_name) and id <> p_crew_id) then
    raise exception 'crew_name_taken';
  end if;
  update public.crews set
    name = btrim(p_name), name_key = public.catalog_key(p_name),
    description = nullif(btrim(p_description), ''), join_policy = p_join_policy,
    home_city = nullif(btrim(p_home_city), ''), country_code = nullif(upper(p_country_code), '')
  where id = p_crew_id;
  -- Passage en « ouvert » : les demandes en attente sont acceptées.
  if p_join_policy = 'open' then
    update public.crew_members set status = 'active' where crew_id = p_crew_id and status = 'pending';
  end if;
end;
$$;

create or replace function public.delete_crew(p_crew_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.my_crew_role(p_crew_id) is distinct from 'owner' then raise exception 'crew_forbidden'; end if;
  delete from public.crews where id = p_crew_id;
end;
$$;

-- Rejoindre : direct si le crew est ouvert, sinon demande en attente. Renvoie le statut.
create or replace function public.join_crew(p_crew_id uuid)
returns public.crew_member_status
language plpgsql
security definer set search_path = ''
as $$
declare
  c record;
  st public.crew_member_status;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id, owner_id, join_policy into c from public.crews where id = p_crew_id;
  if not found or public.is_blocked_with(c.owner_id) then raise exception 'crew_not_found'; end if;
  select status into st from public.crew_members where crew_id = p_crew_id and user_id = auth.uid();
  if found then return st; end if;
  if (select count(*) from public.crew_members where user_id = auth.uid()) >= 20 then
    raise exception 'crew_limit_member';
  end if;
  st := case when c.join_policy = 'open' then 'active' else 'pending' end;
  insert into public.crew_members (crew_id, user_id, role, status) values (p_crew_id, auth.uid(), 'member', st);
  return st;
end;
$$;

-- Quitter (ou annuler sa demande). Le propriétaire doit d'abord transmettre le crew ou le supprimer.
create or replace function public.leave_crew(p_crew_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.my_crew_role(p_crew_id) = 'owner' then raise exception 'crew_owner_cannot_leave'; end if;
  delete from public.crew_members where crew_id = p_crew_id and user_id = auth.uid();
end;
$$;

-- Accepter ou refuser une demande (admins).
create or replace function public.answer_crew_request(p_crew_id uuid, p_user_id uuid, p_accept boolean)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.my_crew_role(p_crew_id) not in ('owner', 'admin') or public.my_crew_role(p_crew_id) is null then
    raise exception 'crew_forbidden';
  end if;
  if p_accept then
    update public.crew_members set status = 'active', joined_at = now()
    where crew_id = p_crew_id and user_id = p_user_id and status = 'pending';
  else
    delete from public.crew_members where crew_id = p_crew_id and user_id = p_user_id and status = 'pending';
  end if;
end;
$$;

-- Retirer un membre. Un admin retire des membres ; seul le propriétaire retire un admin.
create or replace function public.remove_crew_member(p_crew_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  me public.crew_role := public.my_crew_role(p_crew_id);
  them public.crew_role;
begin
  select role into them from public.crew_members where crew_id = p_crew_id and user_id = p_user_id;
  if not found then return; end if;
  if me is null or me = 'member' or them = 'owner' or (them = 'admin' and me <> 'owner') then
    raise exception 'crew_forbidden';
  end if;
  delete from public.crew_members where crew_id = p_crew_id and user_id = p_user_id;
end;
$$;

-- Nommer ou retirer un admin (propriétaire).
create or replace function public.set_crew_role(p_crew_id uuid, p_user_id uuid, p_role public.crew_role)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.my_crew_role(p_crew_id) is distinct from 'owner' then raise exception 'crew_forbidden'; end if;
  if p_role = 'owner' or p_user_id = auth.uid() then raise exception 'crew_forbidden'; end if;
  update public.crew_members set role = p_role
  where crew_id = p_crew_id and user_id = p_user_id and status = 'active';
end;
$$;

-- Transmettre le crew à un membre actif ; l'ancien propriétaire devient admin.
create or replace function public.transfer_crew(p_crew_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if public.my_crew_role(p_crew_id) is distinct from 'owner' then raise exception 'crew_forbidden'; end if;
  if not exists (select 1 from public.crew_members where crew_id = p_crew_id and user_id = p_user_id and status = 'active') then
    raise exception 'crew_member_not_found';
  end if;
  update public.crew_members set role = 'admin' where crew_id = p_crew_id and user_id = auth.uid();
  update public.crew_members set role = 'owner' where crew_id = p_crew_id and user_id = p_user_id;
  update public.crews set owner_id = p_user_id where id = p_crew_id;
end;
$$;

-- Recherche par nom (ou les crews les plus fournis sans texte).
create or replace function public.search_crews(p_query text default '', p_limit int default 20)
returns setof public.crews
language sql
stable
security invoker
set search_path = ''
as $$
  select c.* from public.crews c
  where public.catalog_key(p_query) = ''
     or c.name_key like '%' || public.catalog_key(p_query) || '%'
     or extensions.similarity(c.name_key, public.catalog_key(p_query)) > 0.3
  order by (c.name_key = public.catalog_key(p_query)) desc, c.member_count desc, c.created_at
  limit least(p_limit, 50)
$$;

-- Fil « Crews » : drives visibles des membres de mes crews (sauf les miens).
create or replace function public.feed_crews(p_limit int default 20, p_before timestamptz default now())
returns setof public.drive_card
language sql
stable
security invoker
set search_path = ''
as $$
  select d.id, d.owner_id, d.vehicle_id, d.route_id, d.circuit_id, d.title, d.description,
         d.started_at, d.ended_at, d.distance_m, d.duration_s, d.avg_speed_kmh, d.max_lateral_g,
         d.score, d.score_breakdown, d.score_version, d.lap_time_ms, d.visibility,
         d.like_count, d.comment_count, d.created_at
  from public.drives d
  where d.created_at < p_before
    and d.owner_id <> auth.uid()
    and d.owner_id in (
      select m.user_id from public.crew_members m
      where m.status = 'active'
        and m.crew_id in (select crew_id from public.crew_members where user_id = auth.uid() and status = 'active')
    )
    and public.can_see_drive(d.owner_id, d.visibility)
  order by d.created_at desc
  limit least(p_limit, 50)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_crew(text, text, public.crew_join_policy, text, text)',
    'update_crew(uuid, text, text, public.crew_join_policy, text, text)',
    'delete_crew(uuid)', 'join_crew(uuid)', 'leave_crew(uuid)',
    'answer_crew_request(uuid, uuid, boolean)', 'remove_crew_member(uuid, uuid)',
    'set_crew_role(uuid, uuid, public.crew_role)', 'transfer_crew(uuid, uuid)',
    'search_crews(text, int)', 'feed_crews(int, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Signaler un crew (nom ou description inappropriés) : exigence des stores pour tout contenu publié.
alter type public.report_target add value if not exists 'crew';

-- 3. Aperçu des tracés dans le fil ---------------------------------------------------
-- Même règle que drive_path_public (complet pour le propriétaire, 1,6 km masqués au départ et
-- à l'arrivée pour les autres, rien si le drive n'est pas visible), tracé simplifié (~10 m)
-- pour rester léger. 50 drives maximum par appel.
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
  cut double precision;
begin
  if auth.uid() is null then return; end if;
  for d in
    select dr.id, dr.owner_id, dr.visibility, dr.path
    from public.drives dr
    where dr.id = any (p_drive_ids[1:50]) and dr.path is not null
  loop
    if not public.can_see_drive(d.owner_id, d.visibility) then continue; end if;
    g := d.path::extensions.geometry;
    if d.owner_id <> auth.uid() then
      cut := public.privacy_zone_m() / nullif(extensions.st_length(d.path), 0);
      if cut is null or cut >= 0.45 then continue; end if;
      g := extensions.st_linesubstring(g, cut, 1 - cut);
    end if;
    drive_id := d.id;
    path := extensions.st_asgeojson(extensions.st_simplifypreservetopology(g, 0.0001), 5)::json;
    return next;
  end loop;
end;
$$;
revoke all on function public.drive_path_previews(uuid[]) from public, anon;
grant execute on function public.drive_path_previews(uuid[]) to authenticated;

-- 4. Photo de profil -------------------------------------------------------------------
-- Bucket public : la photo de profil est publique comme le pseudo. Chemin : <user_id>/<fichier>.jpg
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "avatars upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
-- Lister ses propres fichiers (pour supprimer l'ancienne photo) ; l'affichage passe par l'URL publique.
create policy "avatars read own" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Le nom affiché reste court.
alter table public.profiles add constraint profiles_display_name_length
  check (display_name is null or char_length(display_name) <= 40);

-- 5. Tentatives de connexion (Edge Function sign-in, clé service uniquement) -----------------
create table public.login_attempts (
  id          bigint generated always as identity primary key,
  key         text not null,          -- 'id:<email ou pseudo normalisé>' ou 'ip:<adresse>'
  created_at  timestamptz not null default now()
);
create index login_attempts_key_time on public.login_attempts (key, created_at);
alter table public.login_attempts enable row level security;  -- aucune policy : illisible depuis l'app
revoke all on public.login_attempts from anon, authenticated;
