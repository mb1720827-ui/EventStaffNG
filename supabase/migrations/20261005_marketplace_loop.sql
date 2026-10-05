-- EventStaff NG — marketplace loop, trust & safety, and RLS hardening.
-- Run AFTER supabase/schema.sql. Safe to re-run.
--
-- What this adds:
--   1. Enables RLS on every table that had policies but RLS switched off.
--   2. Hirer ↔ worker loop: hirers see applicants, shortlist/hire them, which
--      creates a booking; workers accept/decline; hirers mark complete; a payout
--      record (with platform commission) is created; hirers leave reviews and the
--      worker's rating updates.
--   3. Verification is admin-only: workers can submit documents but cannot mark
--      them verified or flip their own `is_verified` badge.
--   4. Server-side notifications (new matching job, new applicant, hired,
--      booking accepted, document reviewed …) via triggers.
--   5. Venue state/area on events & jobs for location matching, overnight events,
--      hirer plans, and a contact/enquiry inbox for the sales team.

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists state text,
  add column if not exists area text,
  add column if not exists venue text;

alter table public.job_posts
  add column if not exists state text,
  add column if not exists area text;

-- Overnight events (e.g. 6pm – 2am) are common; drop the end > start checks.
alter table public.events drop constraint if exists events_check;
alter table public.job_posts drop constraint if exists job_posts_check;

alter table public.bookings
  add column if not exists job_id uuid references public.job_posts(id) on delete set null,
  add column if not exists application_id uuid references public.job_applications(id) on delete set null,
  add column if not exists worker_user_id uuid references public.profiles(id) on delete set null,
  add column if not exists completed_at timestamptz;

update public.bookings b set worker_user_id = s.user_id
from public.staff_profiles s
where s.id = b.worker_id and b.worker_user_id is null;

create index if not exists bookings_worker_user_idx on public.bookings(worker_user_id);
create index if not exists bookings_job_idx on public.bookings(job_id);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists job_posts_hirer_idx on public.job_posts(hirer_id);

alter table public.notifications add column if not exists link text;

alter table public.hirer_profiles add column if not exists plan text not null default 'payg';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'hirer_profiles_plan_check') then
    alter table public.hirer_profiles add constraint hirer_profiles_plan_check check (plan in ('payg', 'pro', 'corporate'));
  end if;
end $$;

create table if not exists public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  organization text,
  topic text not null default 'General',
  message text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  created_at timestamptz not null default timezone('utc', now())
);

insert into public.platform_settings (key, value) values
  ('billing.commission_rate', '0.10'),
  ('billing.pro_commission_rate', '0.06'),
  ('billing.worker_registration_fee', '5000')
on conflict (key) do nothing;

update public.platform_settings set value = '60' where key = 'matching.min_match_threshold' and value = '70';

-- Avatars are shown publicly on staff cards. If this statement errors on your
-- project, toggle the bucket to "Public" in Dashboard › Storage instead.
update storage.buckets set public = true where id = 'avatars';

-- ---------------------------------------------------------------------------
-- 2. Helper functions (SECURITY DEFINER so policies can look across tables
--    without triggering RLS recursion).
-- ---------------------------------------------------------------------------

-- True when the statement comes straight from a client (PostgREST), as opposed
-- to a SECURITY DEFINER trigger/function running as the table owner.
create or replace function public.is_client_request()
returns boolean language sql stable as $$
  select current_user in ('authenticated', 'anon');
$$;

create or replace function public.owns_job(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from job_posts where id = p_job and hirer_id = auth.uid());
$$;

create or replace function public.applied_to_my_jobs(p_worker uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from job_applications a join job_posts j on j.id = a.job_id
    where a.worker_id = p_worker and j.hirer_id = auth.uid()
  );
$$;

create or replace function public.has_applied(p_job uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from job_applications where job_id = p_job and worker_id = auth.uid())
      or exists (select 1 from bookings where job_id = p_job and worker_user_id = auth.uid());
$$;

create or replace function public.booked_my_staff(p_staff uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from bookings where worker_id = p_staff and hirer_id = auth.uid());
$$;

create or replace function public.event_visible_to_worker(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from job_posts where event_id = p_event and status in ('open', 'filled'))
      or exists (select 1 from bookings where event_id = p_event and worker_user_id = auth.uid());
$$;

create or replace function public.shares_booking_with(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bookings
    where (hirer_id = auth.uid() and worker_user_id = p_user)
       or (worker_user_id = auth.uid() and hirer_id = p_user)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS everywhere
-- ---------------------------------------------------------------------------

alter table public.hirer_profiles enable row level security;
alter table public.worker_profiles enable row level security;
alter table public.worker_preferences enable row level security;
alter table public.worker_skills enable row level security;
alter table public.worker_availability enable row level security;
alter table public.worker_verifications enable row level security;
alter table public.notifications enable row level security;
alter table public.payments enable row level security;
alter table public.transactions enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.disputes enable row level security;
alter table public.states enable row level security;
alter table public.cities enable row level security;
alter table public.areas enable row level security;
alter table public.platform_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.contact_requests enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Policies
-- ---------------------------------------------------------------------------

-- Reference data
drop policy if exists "Public can read settings" on public.platform_settings;
create policy "Public can read settings" on public.platform_settings for select using (true);
drop policy if exists "Admins manage settings" on public.platform_settings;
create policy "Admins manage settings" on public.platform_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Public can read states" on public.states;
create policy "Public can read states" on public.states for select using (true);
drop policy if exists "Public can read cities" on public.cities;
create policy "Public can read cities" on public.cities for select using (true);
drop policy if exists "Public can read areas" on public.areas;
create policy "Public can read areas" on public.areas for select using (true);
drop policy if exists "Admins read admin users" on public.admin_users;
create policy "Admins read admin users" on public.admin_users for select to authenticated using (public.is_admin());

-- Profiles: booking counterparts can see each other's name/phone.
drop policy if exists "Booking parties can read each other" on public.profiles;
create policy "Booking parties can read each other" on public.profiles for select to authenticated using (public.shares_booking_with(id));
drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles" on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage hirer profiles" on public.hirer_profiles;
create policy "Admins manage hirer profiles" on public.hirer_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Staff profiles: hirers can view anyone who applied to, or was booked for, their jobs.
drop policy if exists "Hirers can read applicant staff profiles" on public.staff_profiles;
create policy "Hirers can read applicant staff profiles" on public.staff_profiles for select to authenticated
  using (public.applied_to_my_jobs(user_id) or public.booked_my_staff(id));
drop policy if exists "Admins manage staff profiles" on public.staff_profiles;
create policy "Admins manage staff profiles" on public.staff_profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read worker profiles" on public.worker_profiles;
create policy "Admins read worker profiles" on public.worker_profiles for select to authenticated using (public.is_admin());
drop policy if exists "Hirers read applicant worker profiles" on public.worker_profiles;
create policy "Hirers read applicant worker profiles" on public.worker_profiles for select to authenticated using (public.applied_to_my_jobs(user_id));

-- Events
drop policy if exists "Workers can read events with jobs" on public.events;
create policy "Workers can read events with jobs" on public.events for select to authenticated using (public.event_visible_to_worker(id));
drop policy if exists "Admins read events" on public.events;
create policy "Admins read events" on public.events for select to authenticated using (public.is_admin());

drop policy if exists "Hirers can read own event requirements" on public.event_requirements;
create policy "Hirers can read own event requirements" on public.event_requirements for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_requirements.event_id and e.hirer_id = auth.uid()));

-- Job posts (previously had no insert policy at all, so publishing failed).
drop policy if exists "Hirers manage own job posts" on public.job_posts;
create policy "Hirers manage own job posts" on public.job_posts for all to authenticated using (auth.uid() = hirer_id) with check (auth.uid() = hirer_id);
drop policy if exists "Workers read jobs they applied to" on public.job_posts;
create policy "Workers read jobs they applied to" on public.job_posts for select to authenticated using (public.has_applied(id));
drop policy if exists "Admins manage job posts" on public.job_posts;
create policy "Admins manage job posts" on public.job_posts for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Applications
drop policy if exists "Hirers read applications to own jobs" on public.job_applications;
create policy "Hirers read applications to own jobs" on public.job_applications for select to authenticated using (public.owns_job(job_id));
drop policy if exists "Hirers update applications to own jobs" on public.job_applications;
create policy "Hirers update applications to own jobs" on public.job_applications for update to authenticated using (public.owns_job(job_id)) with check (public.owns_job(job_id));
drop policy if exists "Workers update own applications" on public.job_applications;
create policy "Workers update own applications" on public.job_applications for update to authenticated using (auth.uid() = worker_id) with check (auth.uid() = worker_id);
drop policy if exists "Admins read applications" on public.job_applications;
create policy "Admins read applications" on public.job_applications for select to authenticated using (public.is_admin());

-- Bookings (rewritten to use worker_user_id, which also avoids a policy cycle with staff_profiles)
drop policy if exists "Users can read related bookings" on public.bookings;
create policy "Users can read related bookings" on public.bookings for select to authenticated using (auth.uid() = hirer_id or auth.uid() = worker_user_id);
drop policy if exists "Booking parties can update bookings" on public.bookings;
create policy "Booking parties can update bookings" on public.bookings for update to authenticated
  using (auth.uid() = hirer_id or auth.uid() = worker_user_id) with check (auth.uid() = hirer_id or auth.uid() = worker_user_id);
drop policy if exists "Admins manage bookings" on public.bookings;
create policy "Admins manage bookings" on public.bookings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Documents & verifications
drop policy if exists "Admins update documents" on public.worker_documents;
create policy "Admins update documents" on public.worker_documents for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Workers insert own verifications" on public.worker_verifications;
create policy "Workers insert own verifications" on public.worker_verifications for insert to authenticated with check (auth.uid() = worker_id);
drop policy if exists "Admins manage verifications" on public.worker_verifications;
create policy "Admins manage verifications" on public.worker_verifications for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Notifications
drop policy if exists "Users can update own notifications" on public.notifications;
create policy "Users can update own notifications" on public.notifications for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own notifications" on public.notifications;
create policy "Users can delete own notifications" on public.notifications for delete to authenticated using (auth.uid() = user_id);

-- Payments
drop policy if exists "Admins manage payments" on public.payments;
create policy "Admins manage payments" on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Reviews: anyone signed in can read; only a participant of a completed booking can write.
drop policy if exists "Booking participants can manage reviews" on public.reviews;
drop policy if exists "Authenticated can read reviews" on public.reviews;
create policy "Authenticated can read reviews" on public.reviews for select to authenticated using (true);
drop policy if exists "Participants review completed bookings" on public.reviews;
create policy "Participants review completed bookings" on public.reviews for insert to authenticated with check (
  auth.uid() = reviewer_id and exists (
    select 1 from public.bookings b
    where b.id = reviews.booking_id and b.status = 'completed'
      and ((b.hirer_id = auth.uid() and b.worker_user_id = reviews.reviewee_id)
        or (b.worker_user_id = auth.uid() and b.hirer_id = reviews.reviewee_id))
  )
);

-- Contact / sales enquiries
drop policy if exists "Anyone can send an enquiry" on public.contact_requests;
create policy "Anyone can send an enquiry" on public.contact_requests for insert to anon, authenticated with check (status = 'new');
drop policy if exists "Admins manage enquiries" on public.contact_requests;
create policy "Admins manage enquiries" on public.contact_requests for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Trust & safety guards (clients can't grant themselves verification,
--    ratings, plans, or hire themselves).
-- ---------------------------------------------------------------------------

create or replace function public.guard_staff_profile()
returns trigger language plpgsql as $$
begin
  if public.is_client_request() and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.is_verified := false;
      new.verification_status := 'pending';
      new.rating := 0;
      new.review_count := 0;
    else
      new.is_verified := old.is_verified;
      new.verification_status := old.verification_status;
      new.rating := old.rating;
      new.review_count := old.review_count;
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists staff_profiles_guard on public.staff_profiles;
create trigger staff_profiles_guard before insert or update on public.staff_profiles for each row execute function public.guard_staff_profile();

create or replace function public.guard_worker_document()
returns trigger language plpgsql as $$
begin
  if public.is_client_request() and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.status := case when new.file_path is null then 'not_submitted' else 'submitted' end;
      new.reviewed_at := null;
      new.rejection_reason := null;
      if new.status = 'submitted' then new.submitted_at := coalesce(new.submitted_at, timezone('utc', now())); end if;
    else
      new.reviewed_at := old.reviewed_at;
      if new.file_path is distinct from old.file_path and new.file_path is not null then
        -- A fresh upload always goes back into the review queue.
        new.status := 'submitted';
        new.rejection_reason := null;
        new.submitted_at := timezone('utc', now());
      else
        new.status := old.status;
        new.rejection_reason := old.rejection_reason;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists worker_documents_guard on public.worker_documents;
create trigger worker_documents_guard before insert or update on public.worker_documents for each row execute function public.guard_worker_document();

create or replace function public.guard_worker_verification()
returns trigger language plpgsql as $$
begin
  if public.is_client_request() and not public.is_admin() then
    if new.status not in ('not_started', 'pending') then
      new.status := case when tg_op = 'UPDATE' then old.status else 'pending' end;
    end if;
    if tg_op = 'UPDATE' then new.reviewed_at := old.reviewed_at; else new.reviewed_at := null; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists worker_verifications_guard on public.worker_verifications;
create trigger worker_verifications_guard before insert or update on public.worker_verifications for each row execute function public.guard_worker_verification();

create or replace function public.guard_hirer_profile()
returns trigger language plpgsql as $$
begin
  if public.is_client_request() and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.plan := 'payg';
      new.verification_status := 'pending';
    else
      new.plan := old.plan;
      new.verification_status := old.verification_status;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists hirer_profiles_guard on public.hirer_profiles;
create trigger hirer_profiles_guard before insert or update on public.hirer_profiles for each row execute function public.guard_hirer_profile();

create or replace function public.guard_application()
returns trigger language plpgsql as $$
begin
  if not public.is_client_request() or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' then
    new.status := 'Applied';
    return new;
  end if;
  new.job_id := old.job_id;
  new.worker_id := old.worker_id;
  if auth.uid() = old.worker_id and not public.owns_job(old.job_id) then
    -- Workers can withdraw, or re-apply after withdrawing — nothing else.
    if new.status <> old.status
       and not (new.status = 'Withdrawn' and old.status in ('Applied', 'Shortlisted'))
       and not (new.status = 'Applied' and old.status = 'Withdrawn') then
      new.status := old.status;
    end if;
  else
    new.cover_note := old.cover_note;
    new.worker_name := old.worker_name;
    if old.status = 'Withdrawn' then new.status := old.status; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists job_applications_guard on public.job_applications;
create trigger job_applications_guard before insert or update on public.job_applications for each row execute function public.guard_application();

create or replace function public.prepare_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select user_id into new.worker_user_id from staff_profiles where id = new.worker_id;
  if new.worker_user_id is not null and new.worker_user_id = new.hirer_id then
    raise exception 'You cannot book yourself.';
  end if;
  -- Every new booking starts as an offer the worker must accept.
  if not public.is_admin() then
    new.status := 'pending';
    new.completed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_prepare on public.bookings;
create trigger bookings_prepare before insert on public.bookings for each row execute function public.prepare_booking();

create or replace function public.guard_booking_update()
returns trigger language plpgsql as $$
begin
  if not public.is_client_request() or public.is_admin() then return new; end if;
  new.event_id := old.event_id;
  new.worker_id := old.worker_id;
  new.worker_user_id := old.worker_user_id;
  new.hirer_id := old.hirer_id;
  new.job_id := old.job_id;
  new.application_id := old.application_id;
  if new.status = old.status then
    if auth.uid() = old.worker_user_id then new.agreed_amount := old.agreed_amount; end if;
    return new;
  end if;
  if auth.uid() = old.worker_user_id then
    new.agreed_amount := old.agreed_amount;
    if not ((old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
         or (old.status = 'confirmed' and new.status = 'cancelled')) then
      new.status := old.status;
    end if;
  elsif auth.uid() = old.hirer_id then
    if old.status <> 'pending' then new.agreed_amount := old.agreed_amount; end if;
    if not ((old.status in ('pending', 'confirmed') and new.status = 'cancelled')
         or (old.status = 'confirmed' and new.status = 'completed')) then
      new.status := old.status;
    end if;
  end if;
  if new.status = 'completed' and old.status <> 'completed' then new.completed_at := timezone('utc', now()); end if;
  return new;
end;
$$;
drop trigger if exists bookings_guard_update on public.bookings;
create trigger bookings_guard_update before update on public.bookings for each row execute function public.guard_booking_update();

-- ---------------------------------------------------------------------------
-- 6. Marketplace automation
-- ---------------------------------------------------------------------------

create or replace function public.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, body, link)
  select p_user, p_type, p_title, p_body, p_link where p_user is not null;
$$;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- New open job → notify workers in that profession (or who prefer that category).
create or replace function public.on_job_post_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'open' then return new; end if;
  insert into notifications (user_id, type, title, body, link)
  select distinct wp.user_id, 'job_match',
    'New ' || new.category || ' job near you',
    new.title || ' · ' || new.location || ' · ' || to_char(new.event_date, 'Dy DD Mon') || ' · ₦' || to_char(new.budget, 'FM999,999,999'),
    '/worker/jobs/' || new.id
  from worker_profiles wp
  left join worker_preferences pr on pr.worker_id = wp.user_id
  where wp.user_id is distinct from new.hirer_id
    and (wp.primary_profession = new.category or new.category = any(coalesce(pr.preferred_categories, '{}')))
    and (new.state is null or wp.state is null or wp.state = new.state
         or new.state = any(coalesce(pr.preferred_states, '{}')))
  limit 500;
  return new;
end;
$$;
drop trigger if exists job_posts_notify on public.job_posts;
create trigger job_posts_notify after insert on public.job_posts for each row execute function public.on_job_post_created();

create or replace function public.on_application_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  job record;
begin
  select id, title, hirer_id, event_id into job from job_posts where id = new.job_id;
  if tg_op = 'INSERT' then
    perform public.notify(job.hirer_id, 'application', 'New applicant for ' || job.title,
      new.worker_name || ' applied. Review their profile and shortlist or hire.', '/hirer/events/' || job.event_id);
  elsif new.status is distinct from old.status then
    if new.status = 'Shortlisted' then
      perform public.notify(new.worker_id, 'application', 'You were shortlisted', 'The client shortlisted you for ' || job.title || '.', '/worker/applications');
    elsif new.status = 'Rejected' then
      perform public.notify(new.worker_id, 'application', 'Application update', 'The client went with other professionals for ' || job.title || '. Keep applying — new jobs are posted daily.', '/worker/jobs');
    elsif new.status = 'Withdrawn' then
      perform public.notify(job.hirer_id, 'application', 'Applicant withdrew', new.worker_name || ' withdrew from ' || job.title || '.', '/hirer/events/' || job.event_id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists job_applications_notify on public.job_applications;
create trigger job_applications_notify after insert or update of status on public.job_applications for each row execute function public.on_application_change();

-- Keep job/event status in sync with how many people are booked.
create or replace function public.sync_job_fill(p_job uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  needed int; booked int; ev uuid; open_jobs int;
begin
  if p_job is null then return; end if;
  select workers_required, event_id into needed, ev from job_posts where id = p_job;
  select count(*) into booked from bookings where job_id = p_job and status in ('pending', 'confirmed', 'completed');
  update job_posts set status = case when booked >= needed then 'filled' else 'open' end
  where id = p_job and status in ('open', 'filled');
  if ev is not null then
    select count(*) into open_jobs from job_posts where event_id = ev and status = 'open';
    update events set status = case when open_jobs = 0 then 'booked' else 'matching' end
    where id = ev and status in ('pending', 'matching', 'booked');
  end if;
end;
$$;

create or replace function public.on_booking_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev record; rate numeric; hirer_plan text;
begin
  select event_name, event_date into ev from events where id = new.event_id;
  perform public.sync_job_fill(new.job_id);

  if tg_op = 'INSERT' then
    if new.application_id is not null then
      update job_applications set status = 'Accepted' where id = new.application_id and status <> 'Accepted';
    end if;
    perform public.notify(new.worker_user_id, 'booking', 'You''ve been hired! Confirm your booking',
      'You were booked for ' || ev.event_name || ' on ' || to_char(ev.event_date, 'Dy DD Mon') || ' at ₦' || to_char(new.agreed_amount, 'FM999,999,999') || '. Accept or decline.', '/worker/bookings');
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify(new.hirer_id, 'booking', 'Booking confirmed', 'A professional confirmed they will work ' || ev.event_name || '.', '/hirer/bookings');
    elsif new.status = 'cancelled' then
      perform public.notify(case when auth.uid() = new.hirer_id then new.worker_user_id else new.hirer_id end,
        'booking', 'Booking cancelled', 'A booking for ' || ev.event_name || ' was cancelled.',
        case when auth.uid() = new.hirer_id then '/worker/bookings' else '/hirer/bookings' end);
    elsif new.status = 'completed' then
      select plan into hirer_plan from hirer_profiles where user_id = new.hirer_id;
      select value::numeric into rate from platform_settings
        where key = case when hirer_plan = 'pro' then 'billing.pro_commission_rate' else 'billing.commission_rate' end;
      insert into payments (booking_id, payer_id, payee_id, amount, platform_fee, status)
      select new.id, new.hirer_id, new.worker_user_id, new.agreed_amount, round(new.agreed_amount * coalesce(rate, 0.10), 2), 'pending'
      where new.hirer_id is not null and not exists (select 1 from payments where booking_id = new.id);
      perform public.notify(new.worker_user_id, 'payment', 'Job completed — payout pending',
        ev.event_name || ' was marked complete. ₦' || to_char(new.agreed_amount, 'FM999,999,999') || ' is queued for payout.', '/worker/earnings');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists bookings_after_change on public.bookings;
create trigger bookings_after_change after insert or update of status on public.bookings for each row execute function public.on_booking_change();

-- Reviews roll up into the public rating.
create or replace function public.on_review_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update staff_profiles s set
    rating = coalesce((select round(avg(rating), 1) from reviews where reviewee_id = new.reviewee_id), 0),
    review_count = (select count(*) from reviews where reviewee_id = new.reviewee_id)
  where s.user_id = new.reviewee_id;
  perform public.notify(new.reviewee_id, 'review', 'You received a ' || new.rating || '★ review', coalesce(left(new.body, 140), 'A client rated your work.'), null);
  return new;
end;
$$;
drop trigger if exists reviews_after_insert on public.reviews;
create trigger reviews_after_insert after insert on public.reviews for each row execute function public.on_review_created();

-- Tell workers when admins review their documents or approve their badge.
create or replace function public.on_document_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('verified', 'rejected') then
    perform public.notify(new.worker_id, 'verification',
      case when new.status = 'verified' then new.name || ' verified' else new.name || ' needs attention' end,
      case when new.status = 'verified' then 'Your document passed review.' else coalesce('Reason: ' || new.rejection_reason, 'Please upload a clearer copy.') end,
      '/worker/profile/edit');
  end if;
  return new;
end;
$$;
drop trigger if exists worker_documents_notify on public.worker_documents;
create trigger worker_documents_notify after update of status on public.worker_documents for each row execute function public.on_document_reviewed();

create or replace function public.on_staff_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_verified and not coalesce(old.is_verified, false) then
    perform public.notify(new.user_id, 'verification', 'You are now an EventStaff NG Verified Professional',
      'Your profile is live in Find Staff. Hirers can now discover and book you.', '/worker/dashboard');
  end if;
  return new;
end;
$$;
drop trigger if exists staff_profiles_notify on public.staff_profiles;
create trigger staff_profiles_notify after update of is_verified on public.staff_profiles for each row execute function public.on_staff_verified();
