-- =============================================================================
-- 0008 : drives simulés (outils de test)
--
-- Un drive simulé (builds de test) n'est jamais public : il resterait sinon dans les fils
-- World / Local de tous les utilisateurs, y compris des testeurs de la version « beta ».
-- =============================================================================

alter table public.drives add column is_simulated boolean not null default false;
alter table public.drives add constraint drives_simulated_not_public
  check (not is_simulated or visibility <> 'public');

grant select (is_simulated) on public.drives to authenticated;
