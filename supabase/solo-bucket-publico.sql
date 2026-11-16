-- Solo el lugar donde se guarda la foto de precios. Correr en el proyecto del turnero (jgfqqiepceeyhvsbutal).
-- Archivos públicos del estudio (por ahora, la foto con la lista de precios): bucket
-- PÚBLICO que lee cualquiera y escribe solo el staff. Máximo 8 MB, solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('publico', 'publico', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists publico_bucket_visible on storage.buckets;
create policy publico_bucket_visible on storage.buckets
  for select using (id = 'publico');

drop policy if exists publico_ver on storage.objects;
create policy publico_ver on storage.objects
  for select using (bucket_id = 'publico');

drop policy if exists publico_sube on storage.objects;
create policy publico_sube on storage.objects
  for insert with check (bucket_id = 'publico' and public.es_staff());

drop policy if exists publico_actualiza on storage.objects;
create policy publico_actualiza on storage.objects
  for update using (bucket_id = 'publico' and public.es_staff())
  with check (bucket_id = 'publico' and public.es_staff());

drop policy if exists publico_borra on storage.objects;
create policy publico_borra on storage.objects
  for delete using (bucket_id = 'publico' and public.es_staff());

select id, public from storage.buckets where id = 'publico';
