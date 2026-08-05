-- SchichtApp V3 – sichere, wiederholbar ausführbare Migration
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null check (role in ('worker','admin')) default 'worker',
  created_at timestamptz not null default now()
);
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  hourly_rate numeric(10,2) not null check (hourly_rate >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.work_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  work_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  billed_rate numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  unique(worker_id, customer_id, work_date)
);


alter table public.work_entries add column if not exists billed_rate numeric(10,2);
update public.work_entries we set billed_rate=c.hourly_rate from public.customers c where we.customer_id=c.id and we.billed_rate is null;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin') $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
 insert into public.profiles(id,display_name,role)
 values(new.id,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)),'worker')
 on conflict(id) do nothing;
 return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
insert into public.profiles(id,display_name,role)
select id,coalesce(raw_user_meta_data->>'display_name',split_part(email,'@',1)),'worker' from auth.users
on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.work_entries enable row level security;

drop policy if exists "profile own read" on public.profiles;
drop policy if exists "admin updates profiles" on public.profiles;
drop policy if exists "customers authenticated read" on public.customers;
drop policy if exists "admin manages customers" on public.customers;
drop policy if exists "worker reads own entries" on public.work_entries;
drop policy if exists "worker inserts own entries" on public.work_entries;
drop policy if exists "worker updates own entries" on public.work_entries;
drop policy if exists "worker deletes own entries" on public.work_entries;
drop policy if exists "admin inserts entries" on public.work_entries;
drop policy if exists "admin updates entries" on public.work_entries;
drop policy if exists "admin manages entries" on public.work_entries;

create policy "profile own read" on public.profiles for select to authenticated using ((select auth.uid())=id or public.is_admin());
create policy "admin updates profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "customers authenticated read" on public.customers for select to authenticated using (true);
create policy "admin manages customers" on public.customers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "worker reads own entries" on public.work_entries for select to authenticated using (worker_id=(select auth.uid()) or public.is_admin());
create policy "worker inserts own entries" on public.work_entries for insert to authenticated with check (worker_id=(select auth.uid()) or public.is_admin());
create policy "worker updates own entries" on public.work_entries for update to authenticated using (worker_id=(select auth.uid()) or public.is_admin()) with check (worker_id=(select auth.uid()) or public.is_admin());
create policy "worker deletes own entries" on public.work_entries for delete to authenticated using (worker_id=(select auth.uid()) or public.is_admin());

insert into public.customers(name,hourly_rate) values
('Alexander Helmut',20.00),('Henricke Paede; Franz Hacker',25.00),('Raphael Epp',25.00),
('Elmar Baur',25.00),('Wibke Reimer',25.00),('Lena Epp',25.00),('Philipp Breuer',25.00),
('Michael Hiermüller',27.50),('Manuela Davis',27.50),('Giuseppe Ballardini',25.00),
('Christel Berger',25.00),('Katja Mayer',30.00),('Jessica Eweka',27.50),
('Solveig Braun',25.00),('Dieter Baur-Mathyl',25.00)
on conflict(name) do update set hourly_rate=excluded.hourly_rate;
