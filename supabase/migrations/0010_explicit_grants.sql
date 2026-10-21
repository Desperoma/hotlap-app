-- =============================================================================
-- 0010 : droits d'accès explicites (Data API)
--
-- À partir du 30 octobre 2026, Supabase n'accorde plus automatiquement l'accès à l'API aux
-- nouvelles tables du schéma public : une table sans GRANT renvoie « permission denied ».
-- Les tables existantes gardent leurs droits, mais une base recréée depuis ces migrations
-- (nouveau projet, branche de prévisualisation, supabase db reset) n'en aurait aucun.
--
-- Cette migration déclare donc tous les droits, et resserre ceux accordés automatiquement :
--   - anon (non connecté) : aucun accès aux tables. L'app ne lit rien avant la connexion,
--     et la connexion passe par l'Auth Supabase et l'Edge Function sign-in.
--   - authenticated : lecture / écriture, toujours filtrées par la RLS ; pas de TRUNCATE.
--   - service_role : tout (scripts d'administration, Edge Functions).
--
-- RÈGLE POUR LA SUITE : toute nouvelle table reçoit ses GRANT dans la migration qui la crée.
-- =============================================================================

revoke all on all tables in schema public from anon, authenticated;

-- Tables de l'app : lecture / écriture via la RLS
grant select, insert, update, delete on
  public.profiles, public.vehicles, public.routes, public.drive_points, public.drive_media,
  public.follows, public.likes, public.comments, public.reports, public.blocks,
  public.crews, public.crew_members
to authenticated;

-- Référentiels en lecture seule (écritures par fonctions ou par l'équipe)
grant select on
  public.vehicle_makes, public.vehicle_models, public.vehicle_make_aliases, public.vehicle_model_aliases,
  public.circuits, public.country_rules
to authenticated;

-- Drives : écriture sur la table, lecture seulement des colonnes publiques (voir 0002) :
-- max_speed_kmh, path et start_point restent illisibles directement.
grant insert, update, delete on public.drives to authenticated;
grant select (
  id, owner_id, vehicle_id, route_id, circuit_id, title, description,
  started_at, ended_at, distance_m, duration_s, avg_speed_kmh, max_lateral_g,
  score, score_breakdown, score_version, lap_time_ms, visibility,
  like_count, comment_count, created_at, is_simulated
) on public.drives to authenticated;

-- Vue des profils publics
grant select on public.public_profiles to authenticated;

-- Administration : tout pour la clé service (login_attempts et catalog_review_queue n'ont que ça)
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
