-- =============================================================================
-- 0015 : is_following n'est plus appelable depuis l'app.
--
-- Elle répondait à « A suit-il B ? » pour n'importe quels A et B, ce qui permettait de
-- reconstituer les listes followers / following que 0013 réserve à la personne concernée.
-- Elle ne sert qu'à l'intérieur de fonctions SECURITY DEFINER (can_see_drive,
-- can_see_details, profile_stats, my_people, follow_user), qui l'exécutent avec les droits
-- de leur propriétaire : retirer le droit EXECUTE aux utilisateurs ne les gêne pas.
-- =============================================================================
revoke execute on function public.is_following(uuid, uuid) from public, anon, authenticated;
