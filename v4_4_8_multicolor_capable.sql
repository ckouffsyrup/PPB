-- PrintBook v4.4.8
-- Lets the owner explicitly decide which products accept custom multicolor requests.

alter table public.prints
  add column if not exists multicolor_capable boolean not null default false;
