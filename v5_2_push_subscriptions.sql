-- PrintBook v5.2 - Web Push device registrations
-- Safe to run more than once.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  device_name text,
  user_agent text,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions add column if not exists device_name text;
alter table public.push_subscriptions add column if not exists user_agent text;
alter table public.push_subscriptions add column if not exists active boolean not null default true;
alter table public.push_subscriptions add column if not exists last_seen_at timestamptz;
alter table public.push_subscriptions add column if not exists created_at timestamptz not null default now();
alter table public.push_subscriptions add column if not exists updated_at timestamptz not null default now();

create unique index if not exists push_subscriptions_user_endpoint_idx
  on public.push_subscriptions(user_id,endpoint);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can read own push devices" on public.push_subscriptions;
create policy "Users can read own push devices" on public.push_subscriptions
  for select using (auth.uid()=user_id);

drop policy if exists "Users can register own push devices" on public.push_subscriptions;
create policy "Users can register own push devices" on public.push_subscriptions
  for insert with check (auth.uid()=user_id);

drop policy if exists "Users can update own push devices" on public.push_subscriptions;
create policy "Users can update own push devices" on public.push_subscriptions
  for update using (auth.uid()=user_id) with check (auth.uid()=user_id);

drop policy if exists "Users can delete own push devices" on public.push_subscriptions;
create policy "Users can delete own push devices" on public.push_subscriptions
  for delete using (auth.uid()=user_id);
