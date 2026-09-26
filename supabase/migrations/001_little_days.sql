create table if not exists public.countdowns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  target_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  countdown_id uuid not null references public.countdowns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  check_date date not null,
  completed_at timestamptz not null default now(),
  unique (countdown_id, check_date)
);

alter table public.countdowns enable row level security;
alter table public.check_ins enable row level security;

drop policy if exists "Users can manage their own countdowns" on public.countdowns;
create policy "Users can manage their own countdowns"
on public.countdowns
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage their own check ins" on public.check_ins;
create policy "Users can manage their own check ins"
on public.check_ins
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists countdowns_user_id_idx on public.countdowns(user_id);
create index if not exists check_ins_countdown_date_idx on public.check_ins(countdown_id, check_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists countdowns_updated_at on public.countdowns;
create trigger countdowns_updated_at
before update on public.countdowns
for each row execute procedure public.set_updated_at();