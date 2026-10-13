-- =============================================================================
-- 0003 : photos des drives (Supabase Storage)
--
-- Bucket privé « drive-media ». Chemin d'un fichier : <owner_id>/<drive_id>/<nom>.jpg
-- - Envoi : seulement dans son propre dossier et pour un drive dont on est propriétaire.
-- - Lecture : si on peut voir le drive (même règle que le drive lui-même), via URL signée.
-- - Les photos sont réencodées côté app avant envoi (métadonnées EXIF, dont le GPS, retirées).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('drive-media', 'drive-media', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "drive media upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drive-media'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.drives d
      where d.id::text = (storage.foldername(name))[2] and d.owner_id = auth.uid()
    )
  );

create policy "drive media read" on storage.objects for select to authenticated
  using (
    bucket_id = 'drive-media'
    and exists (
      select 1 from public.drives d
      where d.id::text = (storage.foldername(name))[2]
        and public.can_see_drive(d.owner_id, d.visibility)
    )
  );

create policy "drive media delete" on storage.objects for delete to authenticated
  using (bucket_id = 'drive-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- drive_media : n'autoriser une ligne que pour un drive dont on est propriétaire,
-- et un chemin dans son propre dossier.
drop policy if exists "media write" on public.drive_media;
create policy "media insert" on public.drive_media for insert to authenticated
  with check (
    owner_id = auth.uid()
    and storage_path like auth.uid()::text || '/' || drive_id::text || '/%'
    and exists (select 1 from public.drives d where d.id = drive_id and d.owner_id = auth.uid())
  );
create policy "media delete" on public.drive_media for delete to authenticated
  using (owner_id = auth.uid());

-- 8 photos maximum par drive
create or replace function public.check_media_limit()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if (select count(*) from public.drive_media where drive_id = new.drive_id) >= 8 then
    raise exception 'A drive can have at most 8 photos';
  end if;
  return new;
end;
$$;

create trigger drive_media_limit before insert on public.drive_media
  for each row execute function public.check_media_limit();
