-- Little Days v2: time tracking + lightweight habits
-- Run once in the Supabase SQL Editor.

create table if not exists public.time_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_date date not null,
  mode text not null default 'until' check (mode in ('until', 'since')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habit_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  frequency text not null default 'daily' check (frequency in ('daily', 'weekdays')),
  icon text not null default '○',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habit_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  completed_at timestamptz not null default now(),
  unique (habit_id, log_date)
);


create table if not exists public.daily_marks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mark_date date not null,
  completed_at timestamptz not null default now(),
  unique (user_id, mark_date)
);

alter table public.daily_marks enable row level security;

drop policy if exists "Users can manage their own daily marks" on public.daily_marks;
create policy "Users can manage their own daily marks"
on public.daily_marks
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists daily_marks_user_date_idx on public.daily_marks(user_id, mark_date);

insert into public.daily_marks (user_id, mark_date, completed_at)
select c.user_id, c.check_date, min(c.completed_at)
from public.check_ins c
group by c.user_id, c.check_date
on conflict (user_id, mark_date) do nothing;

alter table public.time_items enable row level security;
alter table public.habit_items enable row level security;
alter table public.habit_logs enable row level security;

drop policy if exists "Users can manage their own time items" on public.time_items;
create policy "Users can manage their own time items"
on public.time_items
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own habits" on public.habit_items;
create policy "Users can manage their own habits"
on public.habit_items
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own habit logs" on public.habit_logs;
create policy "Users can manage their own habit logs"
on public.habit_logs
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create index if not exists time_items_user_id_idx on public.time_items(user_id);
create index if not exists habit_items_user_id_idx on public.habit_items(user_id);
create index if not exists habit_logs_user_id_idx on public.habit_logs(user_id);
create index if not exists habit_logs_habit_date_idx on public.habit_logs(habit_id, log_date);

create or replace function public.set_little_days_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists time_items_updated_at on public.time_items;
create trigger time_items_updated_at
before update on public.time_items
for each row execute procedure public.set_little_days_updated_at();

drop trigger if exists habit_items_updated_at on public.habit_items;
create trigger habit_items_updated_at
before update on public.habit_items
for each row execute procedure public.set_little_days_updated_at();

-- Preserve the countdowns already created in v1.
insert into public.time_items (user_id, title, target_date, mode, created_at, updated_at)
select c.user_id, c.title, c.target_date, 'until', c.created_at, c.updated_at
from public.countdowns c
where not exists (
  select 1
  from public.time_items t
  where t.user_id = c.user_id
    and t.title = c.title
    and t.target_date = c.target_date
);
