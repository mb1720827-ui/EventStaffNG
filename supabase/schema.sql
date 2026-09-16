-- EventStaff NG database schema
-- Run this file in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null default 'hirer' check (role in ('hirer', 'worker', 'admin')),
  state text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.hirer_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_name text,
  organization_type text check (organization_type in ('Individual', 'Family', 'Event Planner', 'Corporate', 'Government', 'Hospitality', 'Other')),
  city text,
  area text,
  address text,
  about text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.worker_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  city text,
  area text,
  bio text,
  minimum_rate numeric(12,2),
  preferred_rate numeric(12,2),
  rate_type text check (rate_type in ('event', 'hour', 'day')),
  languages text[] not null default '{}',
  profile_completion integer not null default 0 check (profile_completion between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.worker_preferences (
  worker_id uuid primary key references public.worker_profiles(user_id) on delete cascade,
  preferred_categories text[] not null default '{}',
  preferred_event_types text[] not null default '{}',
  preferred_states text[] not null default '{}',
  preferred_cities text[] not null default '{}',
  max_travel_km integer check (max_travel_km >= 0),
  minimum_pay numeric(12,2) check (minimum_pay >= 0),
  work_types text[] not null default '{}',
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.worker_skills (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(user_id) on delete cascade,
  skill text not null,
  unique (worker_id, skill)
);

create table if not exists public.worker_availability (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(user_id) on delete cascade,
  available_date date,
  day_of_week smallint check (day_of_week between 0 and 6),
  start_time time,
  end_time time,
  is_available boolean not null default true,
  unique (worker_id, available_date, day_of_week)
);

create table if not exists public.worker_verifications (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.worker_profiles(user_id) on delete cascade,
  verification_type text not null check (verification_type in ('email', 'phone', 'identity', 'professional', 'training', 'background')),
  status text not null default 'not_started' check (status in ('not_started', 'pending', 'verified', 'rejected')),
  document_path text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  unique (worker_id, verification_type)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role, state)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'phone',
    case when new.raw_user_meta_data->>'role' in ('hirer', 'worker') then new.raw_user_meta_data->>'role' else 'hirer' end,
    new.raw_user_meta_data->>'state'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = excluded.phone,
    role = excluded.role,
    state = excluded.state;
  return new;
end;
$$;

create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
as $$
begin
  if old.role = 'admin' or new.role = old.role then
    return new;
  end if;
  if auth.uid() is not null and auth.uid() = old.id then
    new.role = old.role;
  end if;
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation before update on public.profiles for each row execute function public.prevent_role_escalation();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.categories (
  id bigint generated by default as identity primary key,
  title text not null unique,
  icon text not null,
  description text not null,
  available_count integer not null default 0 check (available_count >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  category text not null references public.categories(title) on update cascade,
  location text not null,
  state text,
  bio text,
  summary text,
  rating numeric(2,1) not null default 0 check (rating between 0 and 5),
  review_count integer not null default 0 check (review_count >= 0),
  match_score integer not null default 0 check (match_score between 0 and 100),
  years_experience integer not null default 0 check (years_experience >= 0),
  hourly_rate numeric(12,2),
  is_verified boolean not null default false,
  is_available boolean not null default true,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  hirer_id uuid references public.profiles(id) on delete set null,
  event_name text not null,
  event_type text not null,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  location text not null,
  guest_count integer not null check (guest_count > 0),
  instructions text,
  status text not null default 'pending' check (status in ('draft', 'pending', 'matching', 'booked', 'completed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_time > start_time)
);

create table if not exists public.event_requirements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  category text not null references public.categories(title) on update cascade,
  workers_required integer not null check (workers_required > 0),
  experience text,
  budget numeric(12,2),
  special_requirements text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.job_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete set null,
  hirer_id uuid references public.profiles(id) on delete set null,
  title text not null,
  category text not null references public.categories(title) on update cascade,
  location text not null,
  event_date date not null,
  start_time time not null,
  end_time time not null,
  workers_required integer not null check (workers_required > 0),
  budget numeric(12,2) not null check (budget >= 0),
  description text,
  status text not null default 'open' check (status in ('draft', 'open', 'filled', 'closed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (end_time > start_time)
);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.job_posts(id) on delete cascade,
  worker_id uuid references public.profiles(id) on delete set null,
  worker_name text not null,
  cover_note text,
  status text not null default 'Applied' check (status in ('Applied', 'Shortlisted', 'Accepted', 'Rejected', 'Withdrawn')),
  applied_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (job_id, worker_id)
);

create table if not exists public.saved_workers (
  id uuid primary key default gen_random_uuid(),
  hirer_id uuid references public.profiles(id) on delete cascade,
  worker_id uuid not null references public.staff_profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (hirer_id, worker_id)
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  worker_id uuid not null references public.staff_profiles(id) on delete restrict,
  hirer_id uuid references public.profiles(id) on delete set null,
  agreed_amount numeric(12,2) not null check (agreed_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (event_id, worker_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete restrict,
  payer_id uuid not null references public.profiles(id) on delete restrict,
  payee_id uuid references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  platform_fee numeric(12,2) not null default 0 check (platform_fee >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'refunded', 'failed')),
  provider text,
  provider_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('payment', 'payout', 'refund', 'fee')),
  amount numeric(12,2) not null,
  description text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  reviewee_id uuid not null references public.profiles(id) on delete restrict,
  rating numeric(2,1) not null check (rating between 1 and 5),
  professionalism numeric(2,1) check (professionalism between 1 and 5),
  punctuality numeric(2,1) check (punctuality between 1 and 5),
  communication numeric(2,1) check (communication between 1 and 5),
  quality numeric(2,1) check (quality between 1 and 5),
  body text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (booking_id, reviewer_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid references public.profiles(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  opened_by uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  resolution text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'closed')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.states (
  id bigint generated by default as identity primary key,
  name text not null unique
);

create table if not exists public.cities (
  id bigint generated by default as identity primary key,
  state_id bigint not null references public.states(id) on delete cascade,
  name text not null,
  unique (state_id, name)
);

create table if not exists public.areas (
  id bigint generated by default as identity primary key,
  city_id bigint not null references public.cities(id) on delete cascade,
  name text not null,
  unique (city_id, name)
);

create table if not exists public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists staff_profiles_category_idx on public.staff_profiles(category);
create index if not exists staff_profiles_location_idx on public.staff_profiles(location);
create index if not exists job_posts_status_date_idx on public.job_posts(status, event_date);
create index if not exists job_posts_category_idx on public.job_posts(category);
create index if not exists job_applications_job_idx on public.job_applications(job_id);
create index if not exists events_hirer_idx on public.events(hirer_id);
create index if not exists messages_recipient_idx on public.messages(recipient_id, created_at desc);

 drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
 drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories for each row execute function public.set_updated_at();
 drop trigger if exists staff_profiles_set_updated_at on public.staff_profiles;
create trigger staff_profiles_set_updated_at before update on public.staff_profiles for each row execute function public.set_updated_at();
 drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events for each row execute function public.set_updated_at();
 drop trigger if exists event_requirements_set_updated_at on public.event_requirements;
create trigger event_requirements_set_updated_at before update on public.event_requirements for each row execute function public.set_updated_at();
 drop trigger if exists job_posts_set_updated_at on public.job_posts;
create trigger job_posts_set_updated_at before update on public.job_posts for each row execute function public.set_updated_at();
 drop trigger if exists job_applications_set_updated_at on public.job_applications;
create trigger job_applications_set_updated_at before update on public.job_applications for each row execute function public.set_updated_at();
 drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at before update on public.bookings for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.events enable row level security;
alter table public.event_requirements enable row level security;
alter table public.job_posts enable row level security;
alter table public.job_applications enable row level security;
alter table public.saved_workers enable row level security;
alter table public.bookings enable row level security;
alter table public.messages enable row level security;

-- Public marketplace reads used by the current React app.
drop policy if exists "Public can read active categories" on public.categories;
create policy "Public can read active categories" on public.categories for select using (is_active = true);
drop policy if exists "Public can read available staff" on public.staff_profiles;
create policy "Public can read available staff" on public.staff_profiles for select using (is_available = true and is_verified = true);
drop policy if exists "Public can read open jobs" on public.job_posts;
create policy "Public can read open jobs" on public.job_posts for select using (status = 'open');

drop policy if exists "Public can submit applications" on public.job_applications;

-- Authenticated users can manage their own profile.
drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "Admins can read profiles" on public.profiles;
create policy "Admins can read profiles" on public.profiles for select to authenticated using (public.is_admin());
drop policy if exists "Authenticated users can read verified worker profiles" on public.profiles;
create policy "Authenticated users can read verified worker profiles" on public.profiles for select to authenticated using (role = 'worker');

drop policy if exists "Hirers can manage hirer profile" on public.hirer_profiles;
create policy "Hirers can manage hirer profile" on public.hirer_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Workers can manage worker profile" on public.worker_profiles;
create policy "Workers can manage worker profile" on public.worker_profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Workers can manage preferences" on public.worker_preferences;
create policy "Workers can manage preferences" on public.worker_preferences for all to authenticated using (auth.uid() = worker_id) with check (auth.uid() = worker_id);
drop policy if exists "Workers can manage skills" on public.worker_skills;
create policy "Workers can manage skills" on public.worker_skills for all to authenticated using (auth.uid() = worker_id) with check (auth.uid() = worker_id);
drop policy if exists "Hirers can read verified worker profiles" on public.worker_profiles;
create policy "Hirers can read verified worker profiles" on public.worker_profiles for select to authenticated using (exists (
  select 1 from public.staff_profiles where staff_profiles.user_id = worker_profiles.user_id and staff_profiles.is_verified = true and staff_profiles.is_available = true
));
drop policy if exists "Hirers can read verified worker skills" on public.worker_skills;
create policy "Hirers can read verified worker skills" on public.worker_skills for select to authenticated using (exists (
  select 1 from public.staff_profiles where staff_profiles.user_id = worker_skills.worker_id and staff_profiles.is_verified = true and staff_profiles.is_available = true
));
drop policy if exists "Workers can manage availability" on public.worker_availability;
create policy "Workers can manage availability" on public.worker_availability for all to authenticated using (auth.uid() = worker_id) with check (auth.uid() = worker_id);
drop policy if exists "Workers can read own verifications" on public.worker_verifications;
create policy "Workers can read own verifications" on public.worker_verifications for select to authenticated using (auth.uid() = worker_id);
drop policy if exists "Hirers can read verified certifications" on public.worker_verifications;
create policy "Hirers can read verified certifications" on public.worker_verifications for select to authenticated using (status = 'verified' and exists (
  select 1 from public.staff_profiles where staff_profiles.user_id = worker_verifications.worker_id and staff_profiles.is_verified = true and staff_profiles.is_available = true
));
drop policy if exists "Workers can read own notifications" on public.notifications;
create policy "Workers can read own notifications" on public.notifications for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read own transactions" on public.transactions;
create policy "Users can read own transactions" on public.transactions for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can read own payments" on public.payments;
create policy "Users can read own payments" on public.payments for select to authenticated using (auth.uid() = payer_id or auth.uid() = payee_id);
drop policy if exists "Booking participants can manage reviews" on public.reviews;
create policy "Booking participants can manage reviews" on public.reviews for all to authenticated using (auth.uid() = reviewer_id or auth.uid() = reviewee_id) with check (auth.uid() = reviewer_id);
drop policy if exists "Users can create reports" on public.reports;
create policy "Users can create reports" on public.reports for insert to authenticated with check (auth.uid() = reporter_id);
drop policy if exists "Users can read own reports" on public.reports;
create policy "Users can read own reports" on public.reports for select to authenticated using (auth.uid() = reporter_id or auth.uid() = reported_user_id);
drop policy if exists "Users can create disputes" on public.disputes;
create policy "Users can create disputes" on public.disputes for insert to authenticated with check (auth.uid() = opened_by);
drop policy if exists "Users can read own disputes" on public.disputes;
create policy "Users can read own disputes" on public.disputes for select to authenticated using (auth.uid() = opened_by);

drop policy if exists "Admins can read verifications" on public.worker_verifications;
create policy "Admins can read verifications" on public.worker_verifications for select to authenticated using (public.is_admin());
drop policy if exists "Admins can read jobs" on public.job_posts;
create policy "Admins can read jobs" on public.job_posts for select to authenticated using (public.is_admin() or status = 'open');
drop policy if exists "Admins can read bookings" on public.bookings;
create policy "Admins can read bookings" on public.bookings for select to authenticated using (public.is_admin() or auth.uid() = hirer_id);

drop policy if exists "Hirers can create own events" on public.events;
create policy "Hirers can create own events" on public.events for insert to authenticated with check (auth.uid() = hirer_id);
drop policy if exists "Hirers can read own events" on public.events;
create policy "Hirers can read own events" on public.events for select to authenticated using (auth.uid() = hirer_id);
drop policy if exists "Hirers can update own events" on public.events;
create policy "Hirers can update own events" on public.events for update to authenticated using (auth.uid() = hirer_id) with check (auth.uid() = hirer_id);
drop policy if exists "Hirers can create event requirements" on public.event_requirements;
create policy "Hirers can create event requirements" on public.event_requirements for insert to authenticated with check (
  exists (select 1 from public.events where events.id = event_requirements.event_id and events.hirer_id = auth.uid())
);
drop policy if exists "Workers can submit applications" on public.job_applications;
create policy "Workers can submit applications" on public.job_applications for insert to authenticated with check (auth.uid() = worker_id);
drop policy if exists "Workers can read own applications" on public.job_applications;
create policy "Workers can read own applications" on public.job_applications for select to authenticated using (auth.uid() = worker_id);
drop policy if exists "Hirers can save workers" on public.saved_workers;
create policy "Hirers can save workers" on public.saved_workers for insert to authenticated with check (auth.uid() = hirer_id);
drop policy if exists "Hirers can read saved workers" on public.saved_workers;
create policy "Hirers can read saved workers" on public.saved_workers for select to authenticated using (auth.uid() = hirer_id);
drop policy if exists "Hirers can remove saved workers" on public.saved_workers;
create policy "Hirers can remove saved workers" on public.saved_workers for delete to authenticated using (auth.uid() = hirer_id);
drop policy if exists "Users can read related bookings" on public.bookings;
create policy "Users can read related bookings" on public.bookings for select to authenticated using (auth.uid() = hirer_id or auth.uid() in (
  select user_id from public.staff_profiles where staff_profiles.id = bookings.worker_id
));
drop policy if exists "Hirers can create bookings" on public.bookings;
create policy "Hirers can create bookings" on public.bookings for insert to authenticated with check (auth.uid() = hirer_id);
drop policy if exists "Booking participants can read messages" on public.messages;
create policy "Booking participants can read messages" on public.messages for select to authenticated using (auth.uid() = sender_id or auth.uid() = recipient_id);
drop policy if exists "Users can send messages" on public.messages;
create policy "Users can send messages" on public.messages for insert to authenticated with check (auth.uid() = sender_id);

insert into public.categories (title, icon, description, available_count)
values
  ('Chefs & Cooks', '👨‍🍳', 'Professional catering teams for weddings, birthdays, and corporate events.', 48),
  ('Servers', '🍽️', 'Polished front-of-house and banquet staff for seamless guest service.', 96),
  ('Bodyguards / Security', '🛡️', 'Verified, trained security professionals for high-trust environments.', 31),
  ('Emcees / Hosts', '🎤', 'Confident MCs and event hosts who keep energy high and audiences engaged.', 27),
  ('Cleaners', '🧹', 'Event-ready cleaning teams for setup, breakdown, and premium finish.', 63),
  ('Photographers / Videographers', '📸', 'Visual storytellers for weddings, launches, conferences, and live coverage.', 42),
  ('Chauffeurs', '🚘', 'Professional drivers for VIP transfers, executive logistics, and event transport.', 19),
  ('Ushers / Protocol Officers', '🤝', 'Guest flow experts and protocol specialists for formal and high-profile events.', 55)
on conflict (title) do nothing;

insert into public.staff_profiles (id, name, category, location, state, summary, rating, review_count, match_score, years_experience, is_verified, is_available, verification_status)
values
  ('11111111-1111-4111-8111-111111111111', 'Aisha Bello', 'Servers', 'Abuja', 'FCT', 'Available on your event date. Verified identity. Three years experience.', 4.9, 38, 98, 3, true, true, 'approved'),
  ('22222222-2222-4222-8222-222222222222', 'Musa Danjuma', 'Bodyguards / Security', 'Gwarinpa', 'FCT', 'Background verified. Event escort experience. Fast response.', 4.8, 29, 95, 6, true, true, 'approved'),
  ('33333333-3333-4333-8333-333333333333', 'Kemi Okafor', 'Photographers / Videographers', 'Lagos', 'Lagos', 'Wedding coverage specialist with a premium editing portfolio.', 4.9, 44, 91, 5, true, true, 'approved'),
  ('44444444-4444-4444-8444-444444444444', 'Tunde Akin', 'Emcees / Hosts', 'Lekki', 'Lagos', 'Corporate and wedding MC with great audience engagement.', 4.7, 21, 88, 4, true, true, 'approved')
on conflict (id) do nothing;

insert into public.job_posts (id, title, category, location, event_date, start_time, end_time, workers_required, budget, description, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Wedding Reception', 'Servers', 'Abuja', '2026-10-18', '15:00', '23:00', 10, 25000, 'Polished banquet service for a verified wedding client.', 'open'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Corporate Gala', 'Ushers / Protocol Officers', 'Lagos', '2026-10-22', '18:00', '23:30', 4, 18000, 'Guest welcome and protocol support for a corporate gala.', 'open'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Private Birthday Event', 'Chefs & Cooks', 'Ikoyi', '2026-10-29', '13:00', '19:00', 2, 30000, 'Private dining support for a verified high-profile client.', 'open')
on conflict (id) do nothing;

comment on table public.profiles is 'Application user profile and marketplace role.';
comment on table public.events is 'Event requests submitted by hirers.';
comment on table public.event_requirements is 'Staff category, quantity, budget, and special requirements for an event.';
comment on table public.staff_profiles is 'Worker marketplace profile and verification data.';
comment on table public.job_posts is 'Open staffing opportunities shown in the worker marketplace.';
comment on table public.job_applications is 'Worker applications submitted against job posts.';
comment on table public.bookings is 'Confirmed or pending worker assignments for events.';
comment on table public.messages is 'Private communication between hirers and workers.';
