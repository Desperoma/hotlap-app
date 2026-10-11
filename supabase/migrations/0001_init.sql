-- =============================================================================
-- HotLap — schéma initial (MVP)
-- À appliquer sur un projet Supabase : `npx supabase db push`
-- ou à coller dans SQL Editor du dashboard.
-- =============================================================================

create extension if not exists postgis with schema extensions;

create type public.visibility as enum ('private', 'followers', 'public');
create type public.media_type as enum ('photo', 'video');

-- -----------------------------------------------------------------------------
-- Profils (1-1 avec auth.users, créé automatiquement à l'inscription)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text not null unique check (username ~ '^[a-zA-Z0-9_.]{3,24}$'),
  display_name  text,
  first_name    text,
  last_name     text,
  birth_date    date check (birth_date > '1900-01-01'),
  phone         text,                        -- facultatif, NON vérifié (pas de SMS), jamais affiché aux autres
  country_code  char(2),                     -- ISO 3166-1 alpha-2
  region        text,                        -- département, Land, État…
  home_city     text,
  avatar_url    text,
  bio           text check (char_length(bio) <= 280),
  onboarded_at  timestamptz,                 -- null tant que l'onboarding n'est pas terminé
  created_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'driver_' || substr(new.id::text, 1, 8)),
    new.raw_user_meta_data ->> 'username',
    nullif(new.raw_user_meta_data ->> 'phone', '')
  );
  return new;
end;
$$;

-- La date de naissance conditionne l'autorisation d'enregistrer : une fois saisie,
-- l'utilisateur ne peut plus la changer lui-même (correction via le support).
create or replace function public.lock_birth_date()
returns trigger
language plpgsql
as $$
begin
  if old.birth_date is not null and new.birth_date is distinct from old.birth_date
     and current_user in ('authenticated', 'anon') then
    raise exception 'birth_date_locked';
  end if;
  return new;
end;
$$;

create trigger profiles_lock_birth_date before update on public.profiles
  for each row execute function public.lock_birth_date();

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Connexion par username : renvoie l'email associé.
-- ATTENTION : permet de retrouver l'email d'un username connu. À remplacer avant la bêta
-- publique par une Edge Function qui fait la connexion côté serveur.
create or replace function public.email_for_username(p_username text)
returns text
language sql
security definer set search_path = ''
stable
as $$
  select u.email::text
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(p_username)
$$;

-- -----------------------------------------------------------------------------
-- Catalogue véhicules + garage
-- -----------------------------------------------------------------------------
-- Source principale : Wikidata (licence CC0), importée par scripts/import-wikidata.ts.
-- Complétée par la saisie manuelle des utilisateurs (source = 'user', non vérifiée).
--
-- Dédoublonnage, en trois niveaux :
--   1. name_key : nom normalisé (minuscules, sans accents ni ponctuation ni espaces).
--      « Mégane R.S. », « megane rs » et « Megane-RS » donnent tous « meganers » : un seul modèle
--      possible par clé et par marque (index unique).
--   2. Alias : autres noms d'une même marque ou d'un même modèle (Wikidata altLabel, fusions).
--   3. Proximité (pg_trgm) : à la saisie manuelle, l'app propose les modèles proches avant de créer
--      une entrée ; l'équipe fusionne ensuite les doublons restants (merge_vehicle_model).
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create type public.catalog_source as enum ('wikidata', 'import', 'user');

create or replace function public.catalog_key(t text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))), '[^a-z0-9]+', '', 'g')
$$;

create table public.vehicle_makes (
  id            serial primary key,
  name          text not null,
  name_key      text generated always as (public.catalog_key(name)) stored,
  wikidata_qid  text unique,                  -- ex. Q6746 ; null si saisie manuelle
  source        public.catalog_source not null default 'wikidata',
  is_verified   boolean not null default true,
  merged_into   int references public.vehicle_makes (id),  -- doublon fusionné dans cette marque
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index vehicle_makes_key on public.vehicle_makes (name_key) where merged_into is null;
create index vehicle_makes_trgm on public.vehicle_makes using gin (name_key extensions.gin_trgm_ops);

create table public.vehicle_models (
  id            serial primary key,
  make_id       int not null references public.vehicle_makes (id) on delete cascade,
  name          text not null,
  name_key      text generated always as (public.catalog_key(name)) stored,
  wikidata_qid  text unique,
  year_from     int,
  year_to       int,                          -- null = toujours produit ou inconnu
  source        public.catalog_source not null default 'wikidata',
  is_verified   boolean not null default true,
  merged_into   int references public.vehicle_models (id),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create unique index vehicle_models_key on public.vehicle_models (make_id, name_key) where merged_into is null;
create index vehicle_models_trgm on public.vehicle_models using gin (name_key extensions.gin_trgm_ops);

create table public.vehicle_make_aliases (
  make_id    int not null references public.vehicle_makes (id) on delete cascade,
  alias      text not null,
  alias_key  text generated always as (public.catalog_key(alias)) stored,
  primary key (make_id, alias_key)
);
create table public.vehicle_model_aliases (
  model_id   int not null references public.vehicle_models (id) on delete cascade,
  alias      text not null,
  alias_key  text generated always as (public.catalog_key(alias)) stored,
  primary key (model_id, alias_key)
);
create index vehicle_model_aliases_trgm on public.vehicle_model_aliases using gin (alias_key extensions.gin_trgm_ops);

create table public.vehicles (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  model_id    int references public.vehicle_models (id) on delete set null,  -- null si saisie libre
  make        text not null,
  model       text not null,
  year        int check (year between 1900 and 2100),
  nickname    text,
  photo_url   text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);
-- Un seul véhicule principal par utilisateur.
create unique index vehicles_one_primary on public.vehicles (owner_id) where is_primary;

-- -----------------------------------------------------------------------------
-- Routes (tronçons de route ouverte) et circuits
-- -----------------------------------------------------------------------------
create table public.routes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  country_code    char(2),
  region          text,
  path            extensions.geography (LineString, 4326) not null,
  distance_m      int not null check (distance_m > 0),
  sinuosity       real,                      -- degrés de virage par km, calculé à la création
  -- Chrono désactivé par défaut sur route ouverte. Seule l'équipe HotLap l'active, route par
  -- route, après vérification législative (ex. tronçon d'autobahn sans limitation), sans
  -- nouvelle version d'app. Pas de policy update : modifiable uniquement côté admin.
  timing_enabled  boolean not null default false,
  legal_basis     text,                      -- texte ou référence qui autorise le chrono
  legal_checked_at timestamptz,
  legal_checked_by text,
  created_by      uuid references public.profiles (id) on delete set null,
  is_verified     boolean not null default false,
  created_at      timestamptz not null default now(),
  check (not timing_enabled or (legal_basis is not null and legal_checked_at is not null))
);
create index routes_path on public.routes using gist (path);

create table public.circuits (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  country_code    char(2),
  city            text,
  kind            text not null default 'track' check (kind in ('track', 'closed_road')),
  path            extensions.geography (LineString, 4326),
  lap_length_m    int,
  start_line      extensions.geography (LineString, 4326),  -- ligne de départ / arrivée pour le chrono
  area            extensions.geography (Polygon, 4326),     -- emprise du site : « l'utilisateur est sur le circuit »
  website         text,
  created_at      timestamptz not null default now()
);
create index circuits_path on public.circuits using gist (path);
create index circuits_area on public.circuits using gist (area);

-- -----------------------------------------------------------------------------
-- Âges minimums par pays pour enregistrer un drive
-- -----------------------------------------------------------------------------
-- Une ligne par pays où l'app est déployée, remplie et vérifiée par l'équipe (sources légales).
-- La ligne '**' sert de valeur par défaut pour un pays sans règle vérifiée.
create table public.country_rules (
  country_code     char(2) primary key,       -- ISO 3166-1 alpha-2, ou '**' = défaut
  country_name     text not null,
  min_age_road     int not null check (min_age_road between 10 and 25),
  min_age_circuit  int not null check (min_age_circuit between 6 and 25),
  legal_source     text,                       -- référence du texte ou de l'organisme
  notes            text,
  verified_at      timestamptz,                -- null = non vérifiée, à ne pas considérer comme sûre
  updated_at       timestamptz not null default now()
);
insert into public.country_rules (country_code, country_name, min_age_road, min_age_circuit, notes)
values ('**', 'Par défaut', 18, 18, 'Valeur prudente tant que le pays n''a pas de règle vérifiée');

-- -----------------------------------------------------------------------------
-- Drives
-- -----------------------------------------------------------------------------
create table public.drives (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.profiles (id) on delete cascade,
  vehicle_id     uuid references public.vehicles (id) on delete set null,
  route_id       uuid references public.routes (id) on delete set null,
  circuit_id     uuid references public.circuits (id) on delete set null,
  title          text not null check (char_length(title) between 1 and 80),
  description    text check (char_length(description) <= 2000),
  started_at     timestamptz not null,
  ended_at       timestamptz not null,
  distance_m     int not null default 0 check (distance_m >= 0),
  duration_s     int not null default 0 check (duration_s >= 0),
  avg_speed_kmh  real,
  max_speed_kmh  real,   -- jamais exposée publiquement (voir cadrage, sécurité routière)
  max_lateral_g  real,
  score          int,                        -- score global du drive
  score_breakdown jsonb,
  score_version  int,                        -- version de la formule : permet de tout recalculer quand elle change                     -- détail : distance, sinuosité, dénivelé, chrono…
  lap_time_ms    int,                        -- uniquement circuit ou route à chrono autorisé
  path           extensions.geography (LineString, 4326),
  start_point    extensions.geography (Point, 4326),
  visibility     public.visibility not null default 'private',
  like_count     int not null default 0,
  comment_count  int not null default 0,
  created_at     timestamptz not null default now(),
  check (ended_at >= started_at),
  check (route_id is null or circuit_id is null)
);
-- Un chrono n'est accepté que sur circuit ou sur une route où il est activé.
create or replace function public.check_drive_timing()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.lap_time_ms is not null
     and new.circuit_id is null
     and not exists (select 1 from public.routes r where r.id = new.route_id and r.timing_enabled) then
    raise exception 'lap_time_ms interdit hors circuit ou route à chrono autorisé';
  end if;
  return new;
end;
$$;

create trigger drives_timing before insert or update on public.drives
  for each row execute function public.check_drive_timing();

create index drives_owner_created on public.drives (owner_id, created_at desc);
create index drives_public_created on public.drives (created_at desc) where visibility = 'public';
create index drives_start_point on public.drives using gist (start_point);

create table public.drive_points (
  id        bigint generated always as identity primary key,
  drive_id  uuid not null references public.drives (id) on delete cascade,
  ts        timestamptz not null,
  lat       double precision not null,
  lng       double precision not null,
  altitude  real,
  speed     real,
  accuracy  real,
  g_lat     real,
  g_long    real
);
create index drive_points_drive_ts on public.drive_points (drive_id, ts);

create table public.drive_media (
  id            uuid primary key default gen_random_uuid(),
  drive_id      uuid not null references public.drives (id) on delete cascade,
  owner_id      uuid not null references public.profiles (id) on delete cascade,
  storage_path  text not null,
  type          public.media_type not null,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Social
-- -----------------------------------------------------------------------------
create table public.follows (
  follower_id   uuid not null references public.profiles (id) on delete cascade,
  following_id  uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following on public.follows (following_id);

create table public.likes (
  drive_id    uuid not null references public.drives (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (drive_id, user_id)
);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  drive_id    uuid not null references public.drives (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);
create index comments_drive_created on public.comments (drive_id, created_at);

-- Compteurs dénormalisés pour le fil
create or replace function public.bump_drive_counter()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  col text := case tg_table_name when 'likes' then 'like_count' else 'comment_count' end;
  delta int := case tg_op when 'INSERT' then 1 else -1 end;
  did uuid := case tg_op when 'INSERT' then new.drive_id else old.drive_id end;
begin
  execute format('update public.drives set %I = greatest(0, %I + $1) where id = $2', col, col)
    using delta, did;
  return null;
end;
$$;

create trigger likes_count after insert or delete on public.likes
  for each row execute function public.bump_drive_counter();
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.bump_drive_counter();

-- -----------------------------------------------------------------------------
-- Visibilité : qui peut voir un drive ?
-- -----------------------------------------------------------------------------
create or replace function public.can_see_drive(d_owner uuid, d_visibility public.visibility)
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select
    d_owner = auth.uid()
    or d_visibility = 'public'
    or (
      d_visibility = 'followers'
      and exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.following_id = d_owner
      )
    )
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.vehicle_makes  enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.vehicles       enable row level security;
alter table public.routes         enable row level security;
alter table public.circuits       enable row level security;
alter table public.country_rules  enable row level security;
alter table public.vehicle_make_aliases  enable row level security;
alter table public.vehicle_model_aliases enable row level security;
alter table public.drives         enable row level security;
alter table public.drive_points   enable row level security;
alter table public.drive_media    enable row level security;
alter table public.follows        enable row level security;
alter table public.likes          enable row level security;
alter table public.comments       enable row level security;

-- Profils : lisibles par tous les connectés, modifiables par leur propriétaire
-- La table complète (date de naissance, téléphone, nom) n'est lisible que par son propriétaire.
-- Les autres utilisateurs passent par la vue public_profiles, plus bas.
create policy "profiles read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Catalogue : entrées vérifiées visibles par tous, entrées manuelles visibles par leur auteur.
-- Les connectés peuvent proposer une entrée (non vérifiée) ; la validation se fait côté admin.
-- Pas d'insertion directe : la saisie manuelle passe par propose_vehicle, qui dédoublonne.
create policy "makes read" on public.vehicle_makes for select
  using (merged_into is null and (is_verified or created_by = auth.uid()));
create policy "models read" on public.vehicle_models for select
  using (merged_into is null and (is_verified or created_by = auth.uid()));
create policy "make aliases read"  on public.vehicle_make_aliases  for select using (true);
create policy "model aliases read" on public.vehicle_model_aliases for select using (true);

-- Routes : vérifiées visibles par tous, proposées visibles par leur auteur.
-- timing_enabled et is_verified ne se changent que côté admin (pas de policy update).
create policy "routes read" on public.routes for select to authenticated
  using (is_verified or created_by = auth.uid());
create policy "routes propose" on public.routes for insert to authenticated
  with check (created_by = auth.uid() and not is_verified and not timing_enabled);

-- Circuits : référentiel en lecture seule
create policy "circuits read" on public.circuits for select using (true);

-- Règles par pays : lecture seule pour tous, écriture côté admin uniquement
create policy "country rules read" on public.country_rules for select using (true);

-- Véhicules : visibles par les connectés (badge dans le fil), gérés par le propriétaire
create policy "vehicles read"  on public.vehicles for select to authenticated using (true);
create policy "vehicles write" on public.vehicles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Drives
create policy "drives read" on public.drives for select to authenticated
  using (public.can_see_drive(owner_id, visibility));
create policy "drives insert" on public.drives for insert to authenticated
  with check (owner_id = auth.uid());
create policy "drives update" on public.drives for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "drives delete" on public.drives for delete to authenticated
  using (owner_id = auth.uid());

-- Points GPS et médias : suivent la visibilité du drive parent
create policy "points read" on public.drive_points for select to authenticated
  using (exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility)));
create policy "points insert" on public.drive_points for insert to authenticated
  with check (exists (select 1 from public.drives d where d.id = drive_id and d.owner_id = auth.uid()));

create policy "media read" on public.drive_media for select to authenticated
  using (exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility)));
create policy "media write" on public.drive_media for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Follows
create policy "follows read"   on public.follows for select to authenticated using (true);
create policy "follows insert" on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy "follows delete" on public.follows for delete to authenticated using (follower_id = auth.uid());

-- Likes et commentaires : seulement sur un drive visible
create policy "likes read" on public.likes for select to authenticated
  using (exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility)));
create policy "likes insert" on public.likes for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility)));
create policy "likes delete" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "comments read" on public.comments for select to authenticated
  using (exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility)));
create policy "comments insert" on public.comments for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.drives d where d.id = drive_id and public.can_see_drive(d.owner_id, d.visibility)));
create policy "comments delete" on public.comments for delete to authenticated
  using (user_id = auth.uid()
    or exists (select 1 from public.drives d where d.id = drive_id and d.owner_id = auth.uid()));

-- Profil public : ce que les autres utilisateurs voient (sans nom, date de naissance ni téléphone).
-- Vue exécutée avec les droits de son propriétaire pour contourner la policy « read own » :
-- elle n'expose volontairement que des colonnes publiques.
create view public.public_profiles as
  select id, username, display_name, avatar_url, bio, country_code, home_city, created_at
  from public.profiles;
revoke all on public.public_profiles from anon;
grant select on public.public_profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Lecture côté app
-- -----------------------------------------------------------------------------

-- Fil Following : drives des comptes suivis + les miens, du plus récent au plus ancien.
create or replace function public.feed_following(p_limit int default 20, p_before timestamptz default now())
returns setof public.drives
language sql
stable
security invoker
as $$
  select d.*
  from public.drives d
  where d.created_at < p_before
    and (
      d.owner_id = auth.uid()
      or d.owner_id in (select following_id from public.follows where follower_id = auth.uid())
    )
    and public.can_see_drive(d.owner_id, d.visibility)
  order by d.created_at desc
  limit p_limit
$$;

-- Local Discover : drives publics partis à moins de p_radius_m d'un point.
create or replace function public.drives_nearby(p_lat double precision, p_lng double precision, p_radius_m int default 50000, p_limit int default 20)
returns setof public.drives
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select d.*
  from public.drives d
  where d.visibility = 'public'
    and d.start_point is not null
    and st_dwithin(d.start_point, st_makepoint(p_lng, p_lat)::geography, p_radius_m)
  order by d.created_at desc
  limit p_limit
$$;

-- Tracé en GeoJSON pour l'affichage carte.
create or replace function public.drive_path_geojson(p_drive_id uuid)
returns json
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select st_asgeojson(d.path)::json from public.drives d where d.id = p_drive_id
$$;

-- Autorisation d'enregistrer un drive à cet endroit, pour l'utilisateur connecté.
--   p_country_code : pays où se trouve le téléphone (géocodage inverse côté app) ;
--                    à défaut, le pays déclaré à l'onboarding.
--   Contexte : 'circuit' si la position est dans l'emprise d'un circuit référencé, sinon 'road'.
--   Âge : calculé à partir de la date de naissance déclarée à l'onboarding.
create or replace function public.recording_context(p_lat double precision, p_lng double precision, p_country_code text default null)
returns table (
  allowed       boolean,
  context       text,
  country_code  text,
  circuit_id    uuid,
  circuit_name  text,
  min_age       int,
  user_age      int,
  rule_verified boolean,
  reason        text
)
language plpgsql
stable
security invoker
set search_path = public, extensions
as $$
declare
  v_birth   date;
  v_country text;
  v_rule    public.country_rules;
  v_circuit public.circuits;
  v_age     int;
  v_min     int;
begin
  select p.birth_date, p.country_code into v_birth, v_country from public.profiles p where p.id = auth.uid();
  v_country := upper(coalesce(nullif(p_country_code, ''), v_country));

  select * into v_circuit from public.circuits c
  where c.area is not null and st_covers(c.area, st_makepoint(p_lng, p_lat)::geography)
  limit 1;

  select * into v_rule from public.country_rules r where r.country_code = v_country;
  if not found then
    select * into v_rule from public.country_rules r where r.country_code = '**';
  end if;

  v_min := case when v_circuit.id is not null then v_rule.min_age_circuit else v_rule.min_age_road end;
  v_age := case when v_birth is null then null else extract(year from age(current_date, v_birth))::int end;

  return query select
    v_age is not null and v_age >= v_min,
    case when v_circuit.id is not null then 'circuit' else 'road' end,
    v_country,
    v_circuit.id,
    v_circuit.name,
    v_min,
    v_age,
    v_rule.verified_at is not null,
    case
      when v_age is null then 'birth_date_missing'
      when v_age < v_min then 'under_min_age'
      else 'ok'
    end;
end;
$$;


-- -----------------------------------------------------------------------------
-- Catalogue : suggestions, saisie manuelle dédoublonnée, fusion des doublons
-- -----------------------------------------------------------------------------

-- Modèles proches d'une saisie, pour une marque (nom ou alias), du plus proche au moins proche.
create or replace function public.suggest_vehicle_models(p_make_id int, p_query text, p_limit int default 5)
returns table (model_id int, name text, similarity real)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with q as (select public.catalog_key(p_query) as k),
  cand as (
    select m.id, m.name, similarity(m.name_key, q.k) as sim
    from public.vehicle_models m, q
    where m.make_id = p_make_id and m.merged_into is null
      and (m.is_verified or m.created_by = auth.uid())
      and (m.name_key % q.k or m.name_key like q.k || '%' or q.k like m.name_key || '%')
    union all
    select m.id, m.name, similarity(a.alias_key, q.k)
    from public.vehicle_model_aliases a join public.vehicle_models m on m.id = a.model_id, q
    where m.make_id = p_make_id and m.merged_into is null and m.is_verified
      and (a.alias_key % q.k or a.alias_key like q.k || '%')
  )
  select id, name, max(sim)::real from cand group by id, name
  order by max(sim) desc, name
  limit p_limit
$$;

-- Saisie manuelle d'une voiture. Renvoie la marque et le modèle à utiliser :
-- l'existant si le nom (ou un alias) correspond exactement après normalisation,
-- sinon une nouvelle entrée non vérifiée, visible seulement par son auteur jusqu'à validation.
create or replace function public.propose_vehicle(p_make text, p_model text)
returns table (make_id int, model_id int, make_created boolean, model_created boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_make int; v_model int;
  v_make_new boolean := false; v_model_new boolean := false;
  k_make text := public.catalog_key(p_make);
  k_model text := public.catalog_key(p_model);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if length(k_make) < 2 or length(k_model) < 1 then raise exception 'invalid_name'; end if;

  -- Marque : nom exact, puis alias, puis la propre saisie non vérifiée de l'utilisateur
  select m.id into v_make from public.vehicle_makes m
    where m.name_key = k_make and m.merged_into is null and (m.is_verified or m.created_by = v_uid) limit 1;
  if v_make is null then
    select a.make_id into v_make from public.vehicle_make_aliases a
      join public.vehicle_makes m on m.id = a.make_id and m.merged_into is null and m.is_verified
      where a.alias_key = k_make limit 1;
  end if;
  if v_make is null then
    insert into public.vehicle_makes (name, source, is_verified, created_by)
      values (initcap(trim(p_make)), 'user', false, v_uid)
      on conflict (name_key) where merged_into is null do nothing
      returning id into v_make;
    v_make_new := v_make is not null;
    if v_make is null then  -- même nom déjà proposé par un autre utilisateur, en attente de validation
      select m.id into v_make from public.vehicle_makes m where m.name_key = k_make and m.merged_into is null;
    end if;
  end if;

  -- Modèle : même logique, dans la marque
  select m.id into v_model from public.vehicle_models m
    where m.make_id = v_make and m.name_key = k_model and m.merged_into is null limit 1;
  if v_model is null then
    select a.model_id into v_model from public.vehicle_model_aliases a
      join public.vehicle_models m on m.id = a.model_id and m.make_id = v_make and m.merged_into is null and m.is_verified
      where a.alias_key = k_model limit 1;
  end if;
  if v_model is null then
    insert into public.vehicle_models (make_id, name, source, is_verified, created_by)
      values (v_make, trim(p_model), 'user', false, v_uid)
      returning id into v_model;
    v_model_new := true;
  end if;

  return query select v_make, v_model, v_make_new, v_model_new;
end;
$$;

-- Fusion d'un modèle en doublon dans le modèle de référence (équipe uniquement) :
-- les voitures des utilisateurs suivent, l'ancien nom devient un alias.
create or replace function public.merge_vehicle_model(p_duplicate int, p_canonical int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_duplicate = p_canonical then return; end if;
  update public.vehicles set model_id = p_canonical where model_id = p_duplicate;
  insert into public.vehicle_model_aliases (model_id, alias)
    select p_canonical, name from public.vehicle_models where id = p_duplicate
    on conflict do nothing;
  update public.vehicle_model_aliases set model_id = p_canonical
    where model_id = p_duplicate
      and alias_key not in (select alias_key from public.vehicle_model_aliases where model_id = p_canonical);
  update public.vehicle_models set merged_into = p_canonical where id = p_duplicate;
end;
$$;

-- Même chose pour une marque : ses modèles sont rattachés à la marque de référence
-- (et fusionnés si le même modèle y existe déjà).
create or replace function public.merge_vehicle_make(p_duplicate int, p_canonical int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record; v_target int;
begin
  if p_duplicate = p_canonical then return; end if;
  for r in select id, name_key from public.vehicle_models where make_id = p_duplicate and merged_into is null loop
    select id into v_target from public.vehicle_models
      where make_id = p_canonical and name_key = r.name_key and merged_into is null;
    if v_target is not null then
      perform public.merge_vehicle_model(r.id, v_target);
    else
      update public.vehicle_models set make_id = p_canonical where id = r.id;
    end if;
  end loop;
  insert into public.vehicle_make_aliases (make_id, alias)
    select p_canonical, name from public.vehicle_makes where id = p_duplicate on conflict do nothing;
  update public.vehicles v set make = c.name from public.vehicle_makes c
    where c.id = p_canonical and v.make in (select name from public.vehicle_makes where id = p_duplicate);
  update public.vehicle_makes set merged_into = p_canonical where id = p_duplicate;
end;
$$;

-- File de validation pour l'équipe : saisies manuelles en attente, avec le modèle vérifié le plus proche.
create view public.catalog_review_queue as
  select m.id as model_id, mk.name as make, m.name as model, m.created_at,
         (select count(*) from public.vehicles v where v.model_id = m.id) as used_by,
         best.id as closest_id, best.name as closest_name, best.sim as closest_similarity
  from public.vehicle_models m
  join public.vehicle_makes mk on mk.id = m.make_id
  left join lateral (
    select c.id, c.name, extensions.similarity(c.name_key, m.name_key) as sim
    from public.vehicle_models c
    where c.make_id = m.make_id and c.is_verified and c.merged_into is null and c.id <> m.id
    order by extensions.similarity(c.name_key, m.name_key) desc limit 1
  ) best on true
  where m.source = 'user' and not m.is_verified and m.merged_into is null
  order by used_by desc, m.created_at;

revoke all on public.catalog_review_queue from anon, authenticated;
revoke execute on function public.merge_vehicle_model(int, int) from public, anon, authenticated;
revoke execute on function public.merge_vehicle_make(int, int) from public, anon, authenticated;
grant execute on function public.suggest_vehicle_models(int, text, int) to authenticated;
grant execute on function public.propose_vehicle(text, text) to authenticated;

grant execute on function public.email_for_username(text) to anon, authenticated;
grant execute on function public.recording_context(double precision, double precision, text) to authenticated;
