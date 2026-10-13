-- =============================================================================
-- 0005 : modération (exigences App Store 1.2 et Google Play UGC)
--
-- - Signaler un drive, un commentaire ou un conducteur (table reports).
-- - Bloquer un conducteur : ses drives et commentaires disparaissent pour moi et
--   les miens pour lui ; plus d'abonnement, de like ni de commentaire entre nous.
-- - Supprimer son compte depuis l'app (delete_my_account).
-- =============================================================================

create type public.report_target as enum ('drive', 'comment', 'user');
create type public.report_reason as enum ('dangerous_driving', 'spam', 'harassment', 'inappropriate', 'other');
create type public.report_status as enum ('open', 'reviewed', 'actioned', 'dismissed');

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  public.report_target not null,
  target_id    uuid not null,
  reason       public.report_reason not null,
  details      text check (char_length(details) <= 1000),
  status       public.report_status not null default 'open',
  created_at   timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_open on public.reports (created_at) where status = 'open';

alter table public.reports enable row level security;
-- Écrire un signalement ; relire les siens. Le traitement se fait côté équipe (service role).
create policy "reports insert" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy "reports read own" on public.reports for select to authenticated
  using (reporter_id = auth.uid());

create table public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocks enable row level security;
create policy "blocks read own" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "blocks insert" on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "blocks delete" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Blocage dans un sens ou dans l'autre entre l'utilisateur connecté et quelqu'un.
create or replace function public.is_blocked_with(other uuid)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1 from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = other)
       or (b.blocker_id = other and b.blocked_id = auth.uid())
  )
$$;

-- Bloquer retire les abonnements dans les deux sens.
create or replace function public.on_block()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  return new;
end;
$$;
create trigger blocks_unfollow after insert on public.blocks
  for each row execute function public.on_block();

-- Un drive n'est plus visible entre deux utilisateurs qui se bloquent : likes,
-- commentaires, points et photos suivent can_see_drive.
create or replace function public.can_see_drive(d_owner uuid, d_visibility public.visibility)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select
    d_owner = auth.uid()
    or (
      not public.is_blocked_with(d_owner)
      and (
        d_visibility = 'public'
        or (
          d_visibility = 'followers'
          and exists (
            select 1 from public.follows f
            where f.follower_id = auth.uid() and f.following_id = d_owner
          )
        )
      )
    )
$$;

-- Commentaires : on ne voit pas ceux d'un utilisateur bloqué.
drop policy if exists "comments read" on public.comments;
create policy "comments read" on public.comments for select to authenticated
  using (
    not public.is_blocked_with(user_id)
    and exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility))
  );

-- Pas d'abonnement vers ou depuis quelqu'un avec qui on est bloqué.
drop policy if exists "follows insert" on public.follows;
create policy "follows insert" on public.follows for insert to authenticated
  with check (follower_id = auth.uid() and not public.is_blocked_with(following_id));

-- Suppression du compte : supprime l'utilisateur d'auth.users, ce qui efface en cascade
-- profil, véhicules, drives, points, likes, commentaires, abonnements et signalements.
-- Les fichiers Storage sont supprimés par l'app juste avant (la base ne les voit pas).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;
revoke all on function public.is_blocked_with(uuid) from anon, public;
grant execute on function public.is_blocked_with(uuid) to authenticated;
