-- PrintBook v5.1: multicolor request rules
-- Run once in Supabase SQL Editor.

alter table public.prints
  add column if not exists multicolor_max_colors integer not null default 2,
  add column if not exists multicolor_price_mode text not null default 'flat',
  add column if not exists multicolor_surcharge numeric not null default 0;

-- Existing multicolor products default to a maximum of 2 colors.
update public.prints
set multicolor_max_colors = 2
where multicolor_max_colors is null or multicolor_max_colors < 2;
