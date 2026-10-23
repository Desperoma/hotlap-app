-- =============================================================================
-- 0016 : notifications (cloche)
--
-- Types : like, comment, follow (nouvel abonné), follow_request (demande reçue),
-- follow_accepted (ma demande a été acceptée). Créées par la base (triggers), jamais
-- par l'app ; lisibles et supprimables par leur seul destinataire. Pas de push pour
-- l'instant : l'app interroge unread_notifications_count.
-- =============================================================================

create type public.notification_type as enum ('like', 'comment', 'follow', 'follow_request', 'follow_accepted');

create table public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,   -- destinataire
  actor_id    uuid not null references public.profiles (id) on delete cascade,   -- auteur de l'action
  type        public.notification_type not null,
  drive_id    uuid references public.drives (id) on delete cascade,
  comment_id  uuid references public.comments (id) on delete cascade,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  check (user_id <> actor_id)
);
create index notifications_user on public.notifications (user_id, created_at desc);
create index notifications_unread on public.notifications (user_id) where read_at is null;
-- Un seul « like » et un seul « follow » par personne et par objet (liker / unliker en boucle)
create unique index notifications_like_once on public.notifications (user_id, actor_id, drive_id) where type = 'like';
create unique index notifications_follow_once on public.notifications (user_id, actor_id, type)
  where type in ('follow', 'follow_request', 'follow_accepted');

alter table public.notifications enable row level security;
create policy "notifications read own" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "notifications delete own" on public.notifications for delete to authenticated
  using (user_id = auth.uid());
grant select, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- 1. Création -------------------------------------------------------------------------
create or replace function public.notify(
  p_user uuid, p_actor uuid, p_type public.notification_type, p_drive uuid default null, p_comment uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is null or p_actor is null or p_user = p_actor then return; end if;
  if exists (select 1 from public.blocks b
             where (b.blocker_id = p_user and b.blocked_id = p_actor)
                or (b.blocker_id = p_actor and b.blocked_id = p_user)) then
    return;
  end if;
  if p_type in ('follow', 'follow_request', 'follow_accepted') then
    -- Une nouvelle action remplace l'ancienne (re-follow après unfollow) : elle redevient non lue.
    delete from public.notifications where user_id = p_user and actor_id = p_actor and type = p_type;
  end if;
  insert into public.notifications (user_id, actor_id, type, drive_id, comment_id)
  values (p_user, p_actor, p_type, p_drive, p_comment)
  on conflict do nothing;
end;
$$;

create or replace function public.on_like_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify((select d.owner_id from public.drives d where d.id = new.drive_id), new.user_id, 'like', new.drive_id);
    return new;
  end if;
  delete from public.notifications where type = 'like' and actor_id = old.user_id and drive_id = old.drive_id;
  return old;
end;
$$;
create trigger likes_notify after insert or delete on public.likes
  for each row execute function public.on_like_notify();

create or replace function public.on_comment_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify((select d.owner_id from public.drives d where d.id = new.drive_id), new.user_id, 'comment', new.drive_id, new.id);
  return new;
end;
$$;
create trigger comments_notify after insert on public.comments
  for each row execute function public.on_comment_notify();

-- Abonnement : « nouvel abonné » pour la personne suivie, sauf quand il vient d'une demande
-- acceptée (answer_follow_request, ou passage du compte en « open ») : c'est alors le
-- demandeur qui reçoit « demande acceptée ».
create or replace function public.on_follow_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('hotlap.accepting_requests', true), '') = 'on' then
    perform public.notify(new.follower_id, new.following_id, 'follow_accepted');
  else
    perform public.notify(new.following_id, new.follower_id, 'follow');
  end if;
  return new;
end;
$$;
create trigger follows_notify after insert on public.follows
  for each row execute function public.on_follow_notify();

create or replace function public.on_follow_request_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify(new.target_id, new.requester_id, 'follow_request');
    return new;
  end if;
  -- Demande annulée, refusée ou acceptée : la notification de demande n'a plus lieu d'être.
  delete from public.notifications where type = 'follow_request' and user_id = old.target_id and actor_id = old.requester_id;
  return old;
end;
$$;
create trigger follow_requests_notify after insert or delete on public.follow_requests
  for each row execute function public.on_follow_request_notify();

-- Accepter une demande (0013) : signale l'acceptation au demandeur.
create or replace function public.answer_follow_request(p_requester uuid, p_accept boolean)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Not signed in'; end if;
  delete from public.follow_requests where requester_id = p_requester and target_id = me;
  if not found then raise exception 'No such request'; end if;
  if p_accept and not public.is_blocked_with(p_requester) then
    perform set_config('hotlap.accepting_requests', 'on', true);
    insert into public.follows (follower_id, following_id) values (p_requester, me) on conflict do nothing;
    perform set_config('hotlap.accepting_requests', '', true);
  end if;
end;
$$;

create or replace function public.on_follow_policy_open()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.follow_policy = 'open' and old.follow_policy is distinct from 'open' then
    perform set_config('hotlap.accepting_requests', 'on', true);
    insert into public.follows (follower_id, following_id)
      select r.requester_id, r.target_id from public.follow_requests r
      where r.target_id = new.id and not public.is_blocked_with(r.requester_id)
      on conflict do nothing;
    perform set_config('hotlap.accepting_requests', '', true);
    delete from public.follow_requests where target_id = new.id;
  end if;
  return new;
end;
$$;

-- Bloquer efface les notifications entre les deux personnes.
create or replace function public.on_block_notifications()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.notifications
  where (user_id = new.blocker_id and actor_id = new.blocked_id)
     or (user_id = new.blocked_id and actor_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_drop_notifications after insert on public.blocks
  for each row execute function public.on_block_notifications();

-- 2. Lecture ------------------------------------------------------------------------------
create or replace function public.my_notifications(p_limit int default 30, p_before timestamptz default now())
returns table (
  id bigint, type public.notification_type, created_at timestamptz, read_at timestamptz,
  actor_id uuid, actor_username text, actor_display_name text, actor_avatar_url text,
  drive_id uuid, drive_title text, comment_excerpt text,
  i_follow boolean, request_pending boolean
)
language sql stable security definer set search_path = '' as $$
  select n.id, n.type, n.created_at, n.read_at,
         n.actor_id, p.username, p.display_name, p.avatar_url,
         n.drive_id, d.title, left(c.body, 120),
         public.is_following(auth.uid(), n.actor_id),
         exists (select 1 from public.follow_requests r where r.requester_id = n.actor_id and r.target_id = auth.uid())
  from public.notifications n
  join public.profiles p on p.id = n.actor_id
  left join public.drives d on d.id = n.drive_id
  left join public.comments c on c.id = n.comment_id
  where n.user_id = auth.uid() and n.created_at < p_before
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100)
$$;

create or replace function public.unread_notifications_count()
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null
$$;

-- Tout marquer comme lu (ou seulement certaines).
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns void language sql volatile security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;

revoke execute on function public.notify(uuid, uuid, public.notification_type, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.on_like_notify() from public, anon, authenticated;
revoke execute on function public.on_comment_notify() from public, anon, authenticated;
revoke execute on function public.on_follow_notify() from public, anon, authenticated;
revoke execute on function public.on_follow_request_notify() from public, anon, authenticated;
revoke execute on function public.on_follow_policy_open() from public, anon, authenticated;
revoke execute on function public.on_block_notifications() from public, anon, authenticated;
revoke all on function public.my_notifications(int, timestamptz) from public, anon;
revoke all on function public.unread_notifications_count() from public, anon;
revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.my_notifications(int, timestamptz) to authenticated;
grant execute on function public.unread_notifications_count() to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
