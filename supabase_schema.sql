-- PrintBook v4 Supabase migration
-- Run this whole file in Supabase -> SQL Editor.
-- It is safe to run over the older PrintBook schema.

create extension if not exists pgcrypto;

create table if not exists public.prints (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text,
  price numeric default 0,
  hours numeric,
  extra_cost numeric default 0,
  notes text,
  favorite boolean default false,
  model_source text,
  made_qty integer default 0,
  sold_qty integer default 0,
  preset_id text,
  filament_usage jsonb default '[]'::jsonb,
  variants jsonb default '[]'::jsonb,
  deal_qty integer default 0,
  deal_price numeric default 0,
  out_of_stock_behavior text default 'show',
  photo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.prints add column if not exists extra_cost numeric default 0;
alter table public.prints add column if not exists favorite boolean default false;
alter table public.prints add column if not exists model_source text;
alter table public.prints add column if not exists made_qty integer default 0;
alter table public.prints add column if not exists sold_qty integer default 0;
alter table public.prints add column if not exists preset_id text;
alter table public.prints add column if not exists filament_usage jsonb default '[]'::jsonb;
alter table public.prints add column if not exists variants jsonb default '[]'::jsonb;
alter table public.prints add column if not exists deal_qty integer default 0;
alter table public.prints add column if not exists deal_price numeric default 0;
alter table public.prints add column if not exists out_of_stock_behavior text default 'show';
alter table public.prints add column if not exists updated_at timestamptz default now();

create table if not exists public.filaments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  brand text,
  material text,
  color text,
  visual_color text default '#ffffff',
  spool_size numeric default 1000,
  purchase_price numeric default 0,
  remaining numeric default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.filaments add column if not exists visual_color text default '#ffffff';
alter table public.filaments add column if not exists updated_at timestamptz default now();

create table if not exists public.sales (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  print_id uuid references public.prints(id) on delete set null,
  variant_id text,
  quantity integer default 1,
  unit_price numeric default 0,
  discount_type text default 'none',
  discount_value numeric default 0,
  discount_amount numeric default 0,
  total numeric default 0,
  unit_cost numeric default 0,
  date date default current_date,
  channel text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.sales add column if not exists variant_id text;
alter table public.sales add column if not exists discount_type text default 'none';
alter table public.sales add column if not exists discount_value numeric default 0;
alter table public.sales add column if not exists discount_amount numeric default 0;
alter table public.sales add column if not exists total numeric default 0;
alter table public.sales add column if not exists unit_cost numeric default 0;
alter table public.sales add column if not exists updated_at timestamptz default now();

create table if not exists public.orders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer text,
  status text default 'Requested',
  item text not null,
  quantity integer default 1,
  quoted_price numeric default 0,
  due_date date,
  print_id uuid references public.prints(id) on delete set null,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.orders add column if not exists updated_at timestamptz default now();

create table if not exists public.colorways (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  usage jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.prints enable row level security;
alter table public.filaments enable row level security;
alter table public.sales enable row level security;
alter table public.orders enable row level security;
alter table public.colorways enable row level security;

do $$
declare t text;
begin
  foreach t in array array['prints','filaments','sales','orders','colorways']
  loop
    execute format('drop policy if exists "own_select_%s" on public.%I',t,t);
    execute format('drop policy if exists "own_insert_%s" on public.%I',t,t);
    execute format('drop policy if exists "own_update_%s" on public.%I',t,t);
    execute format('drop policy if exists "own_delete_%s" on public.%I',t,t);
    execute format('create policy "own_select_%s" on public.%I for select using (auth.uid() = user_id)',t,t);
    execute format('create policy "own_insert_%s" on public.%I for insert with check (auth.uid() = user_id)',t,t);
    execute format('create policy "own_update_%s" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)',t,t);
    execute format('create policy "own_delete_%s" on public.%I for delete using (auth.uid() = user_id)',t,t);
  end loop;
end $$;

insert into storage.buckets (id,name,public)
values ('print-images','print-images',true)
on conflict (id) do update set public=true;

drop policy if exists "Users upload own print images" on storage.objects;
create policy "Users upload own print images" on storage.objects for insert to authenticated
with check (bucket_id='print-images' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users update own print images" on storage.objects;
create policy "Users update own print images" on storage.objects for update to authenticated
using (bucket_id='print-images' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists "Users delete own print images" on storage.objects;
create policy "Users delete own print images" on storage.objects for delete to authenticated
using (bucket_id='print-images' and (storage.foldername(name))[1]=auth.uid()::text);
