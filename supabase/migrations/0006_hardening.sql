-- =============================================================================
-- 0006 : durcissement suite à l'analyse de sécurité Supabase (Security Advisor)
-- =============================================================================

-- search_path figé sur les fonctions qui ne l'avaient pas.
alter function public.lock_birth_date() set search_path = '';
alter function public.catalog_key(text) set search_path = '';

-- Fonctions de trigger : elles n'ont pas à être appelables via l'API (/rest/v1/rpc).
-- Les triggers continuent de fonctionner : le droit EXECUTE n'est pas vérifié au déclenchement.
revoke execute on function public.bump_drive_counter() from public, anon, authenticated;
revoke execute on function public.check_comment_rate() from public, anon, authenticated;
revoke execute on function public.check_drive_timing() from public, anon, authenticated;
revoke execute on function public.check_media_limit() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.on_block() from public, anon, authenticated;
revoke execute on function public.lock_birth_date() from public, anon, authenticated;

-- Fonctions réservées aux utilisateurs connectés : pas d'accès anonyme.
revoke execute on function public.can_see_drive(uuid, public.visibility) from public, anon;
revoke execute on function public.propose_vehicle(text, text) from public, anon;
grant execute on function public.can_see_drive(uuid, public.visibility) to authenticated;
grant execute on function public.propose_vehicle(text, text) to authenticated;
