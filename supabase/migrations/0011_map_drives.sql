-- Carte « Map » : un repère par drive, pour mes drives, ceux de mes crews et ceux de mes amis
-- (personnes que je suis). Mêmes règles de visibilité que le fil (can_see_drive).
--
-- Position du repère :
--  - mes drives : le vrai départ ;
--  - les autres : le début du tracé visible, après la zone de confidentialité de 1,6 km
--    (comme drive_path_public). Un drive trop court pour rester visible n'a pas de repère.
-- Le tracé s'affiche au toucher, via drive_path_previews (déjà soumis aux mêmes règles).
--
-- source : 'me' | 'crew' | 'friend' (un membre de crew que je suis compte comme 'crew').

create or replace function public.map_drives(p_limit int default 200)
returns table (
  drive_id uuid,
  owner_id uuid,
  source text,
  title text,
  started_at timestamptz,
  distance_m int,
  duration_s int,
  score int,
  lat double precision,
  lng double precision,
  username text,
  display_name text,
  avatar_url text,
  vehicle text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  me uuid := auth.uid();
  d record;
  g extensions.geometry;
  cut double precision;
  pin extensions.geometry;
begin
  if me is null then return; end if;
  for d in
    with crew_mates as (
      select distinct m.user_id from public.crew_members m
      where m.status = 'active' and m.user_id <> me
        and m.crew_id in (select c.crew_id from public.crew_members c where c.user_id = me and c.status = 'active')
    ),
    friends as (
      select f.following_id as user_id from public.follows f where f.follower_id = me
    )
    select dr.id, dr.owner_id, dr.visibility, dr.path, dr.title, dr.started_at, dr.distance_m, dr.duration_s, dr.score,
           dr.vehicle_id,
           case when dr.owner_id = me then 'me'
                when dr.owner_id in (select user_id from crew_mates) then 'crew'
                else 'friend' end as src
    from public.drives dr
    where dr.path is not null
      and (dr.owner_id = me
           or dr.owner_id in (select user_id from crew_mates)
           or dr.owner_id in (select user_id from friends))
    order by dr.started_at desc
    limit least(greatest(p_limit, 1), 300)
  loop
    if not public.can_see_drive(d.owner_id, d.visibility) then continue; end if;
    g := d.path::extensions.geometry;
    if d.owner_id = me then
      pin := extensions.st_startpoint(g);
    else
      cut := public.privacy_zone_m() / nullif(extensions.st_length(d.path), 0);
      if cut is null or cut >= 0.45 then continue; end if;
      pin := extensions.st_lineinterpolatepoint(g, cut);
    end if;

    drive_id := d.id;
    owner_id := d.owner_id;
    source := d.src;
    title := d.title;
    started_at := d.started_at;
    distance_m := d.distance_m;
    duration_s := d.duration_s;
    score := d.score;
    lat := extensions.st_y(pin);
    lng := extensions.st_x(pin);
    select p.username, p.display_name, p.avatar_url into username, display_name, avatar_url
      from public.profiles p where p.id = d.owner_id;
    vehicle := null;
    if d.vehicle_id is not null then
      select nullif(trim(concat_ws(' ', v.make, v.model)), '') into vehicle
        from public.vehicles v where v.id = d.vehicle_id;
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.map_drives(int) from public, anon;
grant execute on function public.map_drives(int) to authenticated;
