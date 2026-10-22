-- =============================================================================
-- 0012 : nouvelle visibilité « friends » (abonnement réciproque).
-- Seule dans sa migration : une valeur d'enum ajoutée ne peut pas servir dans la même
-- transaction. Les règles qui l'utilisent sont dans 0013.
-- Ordre d'affichage : private < friends < followers < public.
-- =============================================================================
alter type public.visibility add value if not exists 'friends' before 'followers';
