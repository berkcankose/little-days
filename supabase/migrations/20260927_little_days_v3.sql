-- Little Days v3: memories attached to Little Days + private photo storage
-- Run once in the Supabase SQL Editor.

create table if not exists public.item_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  time_item_id uuid not null references public.time_items(id) on delete cascade,
  memory_date date not null default current_date,
  caption text not null default '',
  photo_path text,
  created_at timestamptz not null default now()
);

alter table public.item_memories enable row level security;

drop policy if exists "Users can manage their own item memories" on public.item_memories;
create policy "Users can manage their own item memories"
on public.item_memories
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists item_memories_item_idx
on public.item_memories(time_item_id, memory_date);

-- Private bucket: photos are only retrievable through authenticated signed URLs.
insert into storage.buckets (id, name, public)
values ('little-days', 'little-days', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can upload Little Days photos" on storage.objects;
create policy "Users can upload Little Days photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'little-days'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can read Little Days photos" on storage.objects;
create policy "Users can read Little Days photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'little-days'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Users can delete Little Days photos" on storage.objects;
create policy "Users can delete Little Days photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'little-days'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
