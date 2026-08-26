-- PrintBook Supabase setup
-- Run this entire file in Supabase → SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.prints (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  price numeric default 0,
  hours numeric,
  cost numeric,
  grams numeric,
  colors text,
  notes text,
  photo_url text,
  created_at timestamptz default now()
);

alter table public.prints enable row level security;

drop policy if exists "Users can read own prints" on public.prints;
create policy "Users can read own prints"
on public.prints for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own prints" on public.prints;
create policy "Users can insert own prints"
on public.prints for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own prints" on public.prints;
create policy "Users can update own prints"
on public.prints for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own prints" on public.prints;
create policy "Users can delete own prints"
on public.prints for delete
using (auth.uid() = user_id);

-- Storage bucket for print photos.
insert into storage.buckets (id, name, public)
values ('print-images', 'print-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Users upload own print images" on storage.objects;
create policy "Users upload own print images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'print-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update own print images" on storage.objects;
create policy "Users update own print images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'print-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete own print images" on storage.objects;
create policy "Users delete own print images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'print-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
