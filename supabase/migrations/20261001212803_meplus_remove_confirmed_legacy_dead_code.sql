drop function if exists private.guard_provider_review_fields();

drop policy if exists avatars_read on storage.objects;
drop policy if exists avatars_owner_insert on storage.objects;
drop policy if exists avatars_owner_update on storage.objects;
drop policy if exists avatars_owner_delete on storage.objects;

drop policy if exists cake_references_owner_select on storage.objects;
drop policy if exists cake_references_owner_insert on storage.objects;
drop policy if exists cake_references_owner_update on storage.objects;
drop policy if exists cake_references_owner_delete on storage.objects;

drop policy if exists portfolio_owner_insert on storage.objects;
drop policy if exists portfolio_owner_update on storage.objects;
drop policy if exists portfolio_owner_delete on storage.objects;
