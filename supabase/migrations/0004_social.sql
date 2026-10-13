-- =============================================================================
-- 0004 : fil « World » et petits garde-fous sociaux
-- =============================================================================

-- Fil World : drives publics de tout le monde, du plus récent au plus ancien.
-- Le classement (récence, engagement, proximité) viendra dans une version suivante.
create or replace function public.feed_world(p_limit int default 20, p_before timestamptz default now())
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
  where d.visibility = 'public' and d.created_at < p_before
  order by d.created_at desc
  limit least(p_limit, 50)
$$;
revoke all on function public.feed_world(int, timestamptz) from anon, public;
grant execute on function public.feed_world(int, timestamptz) to authenticated;

-- Commentaires : pas de texte vide ou fait uniquement d'espaces.
alter table public.comments drop constraint if exists comments_body_check;
alter table public.comments add constraint comments_body_check
  check (char_length(btrim(body)) between 1 and 1000);

-- Anti-spam simple : 10 commentaires par minute et par utilisateur.
create or replace function public.check_comment_rate()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (select count(*) from public.comments
      where user_id = new.user_id and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'Too many comments, slow down a little';
  end if;
  return new;
end;
$$;

create trigger comments_rate before insert on public.comments
  for each row execute function public.check_comment_rate();
