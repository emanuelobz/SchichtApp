-- RechnungenApp V5 – Kundenstammdaten, Unternehmensdaten und Rechnungsarchiv
create extension if not exists pgcrypto;

alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists email text;
alter table public.customers add column if not exists price_tier integer;
alter table public.customers add column if not exists travel_minutes integer;
alter table public.customers add column if not exists kilometers numeric(8,2);
alter table public.customers add column if not exists service_location text;
alter table public.customers add column if not exists invoice_description text;
alter table public.customers add column if not exists notes text;

create table if not exists public.company_settings (
  id integer primary key default 1 check (id = 1),
  company_name text,
  owner_name text,
  address text,
  postal_code text,
  city text,
  email text,
  bank_name text,
  iban text,
  bic text,
  tax_number text,
  next_invoice_number integer not null default 303,
  small_business boolean not null default true,
  standard_description text not null default 'Raumreinigung',
  payment_days integer not null default 7,
  updated_at timestamptz not null default now()
);

insert into public.company_settings (
  id, owner_name, address, postal_code, city, email, bank_name, iban, bic,
  tax_number, next_invoice_number, small_business, standard_description, payment_days
) values (
  1, 'Juliet Obazee', 'Schäfflerbachstraße 11', '86153', 'Augsburg',
  'juliet.obazee@icloud.com', 'Stadtsparkasse Augsburg', 'DE9472050000252215082',
  'AUGSDE77XXX', '103/256/00352', 303, true, 'Raumreinigung', 7
) on conflict (id) do update set
  owner_name = excluded.owner_name,
  address = excluded.address,
  postal_code = excluded.postal_code,
  city = excluded.city,
  email = excluded.email,
  bank_name = excluded.bank_name,
  iban = excluded.iban,
  bic = excluded.bic,
  tax_number = excluded.tax_number,
  small_business = excluded.small_business,
  standard_description = excluded.standard_description,
  payment_days = excluded.payment_days;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number integer not null unique,
  invoice_date date not null,
  service_period text not null,
  customer_id uuid references public.customers(id),
  customer_name text not null,
  customer_address text,
  customer_email text,
  description text not null,
  total_hours numeric(10,2) not null,
  hourly_rate numeric(10,2) not null,
  total numeric(12,2) not null,
  status text not null default 'created' check (status in ('created','sent','paid','cancelled')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz
);

alter table public.company_settings enable row level security;
alter table public.invoices enable row level security;

drop policy if exists "admin manages company settings" on public.company_settings;
drop policy if exists "admin manages invoices" on public.invoices;
create policy "admin manages company settings" on public.company_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin manages invoices" on public.invoices for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Kundendaten aus der bisherigen Numbers-Tabelle
update public.customers set address='Matthäus-Lang-Str. 4, 86154 Augsburg', email='appartament365@gmail.com', price_tier=1, travel_minutes=10, kilometers=3.4 where name='Alexander Helmut';
update public.customers set address='Richard-Wagner-Str. 11, 86391 Stadtbergen', email='henrike@paede.de', price_tier=2, travel_minutes=18, kilometers=6.4 where name='Henricke Paede; Franz Hacker';
update public.customers set address='Spiesleweg 24, 86199 Augsburg', email='lena_epp@mailbox.org', price_tier=2, travel_minutes=13, kilometers=5 where name='Raphael Epp';
update public.customers set address='Bachstr. 4, 86343 Königsbrunn', email='carin.hausmann@kbh.net', price_tier=2, travel_minutes=15, kilometers=6.7, service_location='Koloniestr. 1, 86199 Augsburg', invoice_description='Raumreinigung für Koloniestr. 1, 86199 Augsburg' where name='Elmar Baur';
update public.customers set address='Leitershofer Straße 14, 86157 Augsburg', email='wibke.reimer.11@aberdeen.ac.uk', price_tier=2, travel_minutes=14, kilometers=4.4 where name='Wibke Reimer';
update public.customers set address='Bayernstraße 31, 86199 Augsburg', email='lena_epp@mailbox.org', price_tier=2, travel_minutes=14, kilometers=7 where name='Lena Epp';
update public.customers set address='Konrad-Adenauer-Allee 51', email='philipp.breuer@phiola.de', price_tier=2, travel_minutes=8, kilometers=2.4 where name='Philipp Breuer';
update public.customers set address='Prinzstraße 13, 86153 Augsburg', email=null, price_tier=3, travel_minutes=7, kilometers=2.1 where name='Michael Hiermüller';
update public.customers set address='Droste-Hülshoff-Straße 5, 86157 Augsburg', email='m.davis228@yahoo.com', price_tier=3, travel_minutes=14, kilometers=4.6 where name='Manuela Davis';
update public.customers set address='TGW Italia s.r.l.', email='carin.hausmann@kbh.net', price_tier=2, travel_minutes=15, kilometers=6.7 where name='Giuseppe Ballardini';
update public.customers set address='Innsbruckerstraße 27, 86163 Augsburg', email=null, price_tier=2 where name='Christel Berger';
update public.customers set address='Kappbergstraße 1, 86391 Stadtbergen', email='km@km-sportagentur.de', price_tier=4 where name='Katja Mayer';
update public.customers set address='Ablaßweg 15, 86161 Augsburg', email='jessicastoeckl@gmail.com', price_tier=3 where name='Jessica Eweka';
update public.customers set address='Jesuitengasse 24, 86153 Augsburg', email='shbraun@outlook.de', price_tier=2 where name='Solveig Braun';
update public.customers set address='Joseph-Haas-Straße 14, 86161 Augsburg', email='baurmathyl@gmx.de', price_tier=2 where name='Dieter Baur-Mathyl';
