-- =============================================================================
-- 0009 : les drives simulés (outils de test) peuvent être publics pendant la phase de test.
-- La colonne is_simulated reste : elle permettra de les retrouver et de les supprimer avant
-- l'ouverture au public (delete from drives where is_simulated).
-- =============================================================================

alter table public.drives drop constraint if exists drives_simulated_not_public;
