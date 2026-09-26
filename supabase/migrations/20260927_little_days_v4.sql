-- Little Days v4: recurring annual dates
-- Run once in the Supabase SQL Editor.

alter table public.time_items
  add column if not exists recurrence text not null default 'once'
  check (recurrence in ('once', 'annual'));

create index if not exists time_items_recurrence_idx
  on public.time_items(user_id, recurrence);
