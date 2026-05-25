-- ONIT GBS Platform Starter
-- Ejecuta este archivo en Supabase SQL Editor.
-- Crea una base profesional para academias, pagos, reservas, inventario y cartera.

create extension if not exists pgcrypto;

create table if not exists academies (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  app_name text default 'Control Financiero',
  logo_url text,
  primary_color text default '#111827',
  accent_color text default '#D8FF3E',
  currency text default 'COP',
  payment_info text,
  privacy_text text default 'Autorizo el tratamiento de mis datos personales para finalidades administrativas, deportivas, comerciales y de contacto relacionadas con la academia.',
  credit_limit numeric default 50000,
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  name text not null,
  country_code text default '57',
  phone text,
  email text,
  eps text,
  emergency_contact text,
  emergency_phone text,
  weight_kg numeric,
  height_cm numeric,
  injuries text,
  is_minor boolean default false,
  guardian_name text,
  guardian_phone text,
  has_martial_arts_experience boolean default false,
  martial_art text,
  belt text,
  data_processing_accepted boolean default false,
  data_processing_accepted_at timestamptz,
  status text default 'active',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists rubrics (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  name text not null,
  description text,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (academy_id, name)
);

create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  rubric_id uuid references rubrics(id) on delete set null,
  name text not null,
  item_type text not null check (item_type in ('plan','product','service')),
  price numeric default 0,
  cost numeric default 0,
  stock numeric default 0,
  class_credits integer,
  validity_days integer,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (academy_id, name, item_type)
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  rubric_id uuid references rubrics(id) on delete set null,
  item_id uuid references catalog_items(id) on delete set null,
  concept text not null,
  source text default 'manual' check (source in ('membership','product','manual','courtesy')),
  amount numeric not null default 0,
  payment_method text,
  paid_at date not null default current_date,
  due_at date,
  status text default 'paid' check (status in ('paid','pending','cancelled')),
  class_credits_total integer,
  class_credits_used integer default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  rubric_id uuid references rubrics(id) on delete set null,
  expense_type text default 'Operacion',
  description text not null,
  amount numeric not null default 0,
  expense_date date not null default current_date,
  source text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  item_id uuid references catalog_items(id) on delete set null,
  student_id uuid references students(id) on delete set null,
  movement_type text not null check (movement_type in ('in','out','adjustment')),
  quantity numeric not null default 1,
  unit_price numeric default 0,
  unit_cost numeric default 0,
  total numeric default 0,
  payment_status text default 'paid' check (payment_status in ('paid','pending')),
  movement_date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

create table if not exists receivables (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  item_id uuid references catalog_items(id) on delete set null,
  concept text not null,
  source text default 'product' check (source in ('product','membership','manual')),
  amount numeric not null default 0,
  delivered_at date not null default current_date,
  due_date date,
  status text default 'pending' check (status in ('pending','paid','cancelled')),
  paid_at date,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists class_schedules (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  rubric_id uuid references rubrics(id) on delete set null,
  class_name text not null,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time time not null,
  duration_minutes integer default 60,
  capacity integer default 20,
  allow_courtesy boolean default true,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  schedule_id uuid references class_schedules(id) on delete set null,
  class_date date not null,
  status text default 'reserved' check (status in ('reserved','cancelled','attended','no_show')),
  source text default 'student' check (source in ('student','admin','courtesy')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (student_id, schedule_id, class_date)
);

create table if not exists courtesy_requests (
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references academies(id) on delete cascade,
  student_id uuid references students(id) on delete set null,
  schedule_id uuid references class_schedules(id) on delete set null,
  class_date date,
  language text default 'es',
  data_processing_accepted boolean default false,
  status text default 'requested' check (status in ('requested','confirmed','cancelled','attended','no_show')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_students_academy_phone on students(academy_id, phone);
create index if not exists idx_payments_academy_paid_at on payments(academy_id, paid_at);
create index if not exists idx_payments_student_due on payments(student_id, due_at);
create index if not exists idx_expenses_academy_date on expenses(academy_id, expense_date);
create index if not exists idx_receivables_academy_status on receivables(academy_id, status);
create index if not exists idx_reservations_schedule_date on reservations(schedule_id, class_date);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  foreach t in array array['academies','students','rubrics','catalog_items','payments','expenses','receivables','class_schedules','reservations','courtesy_requests']
  loop
    execute format('drop trigger if exists trg_%s_updated_at on %I', t, t);
    execute format('create trigger trg_%s_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

insert into academies (slug, name, app_name, primary_color, accent_color, payment_info)
values ('onit', 'Onit Fighting Studio', 'ONIT Platform', '#111827', '#D8FF3E', 'Configura aquí Nequi, Bancolombia, cuenta bancaria o instrucciones de pago.')
on conflict (slug) do nothing;

-- Datos iniciales opcionales para ONIT.
with academy as (
  select id from academies where slug = 'onit'
), inserted_rubrics as (
  insert into rubrics (academy_id, name)
  select id, 'Onit' from academy
  on conflict do nothing
  returning id, academy_id, name
)
insert into rubrics (academy_id, name)
select a.id, x.name
from academy a
cross join (values ('Onit Kids'), ('Kickboxing/Muaythai'), ('Ketlab'), ('Cafeteria')) as x(name)
on conflict do nothing;
