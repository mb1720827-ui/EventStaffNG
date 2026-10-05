-- EventStaff NG — web app notifications, ratings, and event lifecycle.
-- Run AFTER 20261005_marketplace_loop.sql. Safe to re-run.
--
--   1. Removes demo professionals and demo jobs so signed-in areas show real data only.
--   2. Event lifecycle: applications close automatically when an event starts,
--      unanswered booking offers lapse, events show "in progress", and edits to
--      an event propagate to its roles and notify booked professionals.
--   3. Ratings: reviews carry reviewer/event context, "would hire again", and
--      the professional can post a public reply.
--   4. Payouts: professionals confirm receipt or open a dispute.
--   5. Push notifications: device subscriptions + realtime on notifications.

-- ---------------------------------------------------------------------------
-- 1. Remove demo data
-- ---------------------------------------------------------------------------

-- Demo staff were seeded without an account behind them.
delete from public.saved_workers where worker_id in (select id from public.staff_profiles where user_id is null);
delete from public.staff_profiles s
where s.user_id is null and not exists (select 1 from public.bookings b where b.worker_id = s.id);
-- Demo jobs were seeded without a hirer (cascades to their applications).
delete from public.job_posts where hirer_id is null;

-- ---------------------------------------------------------------------------
-- 2. Event lifecycle
-- ---------------------------------------------------------------------------

alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft', 'pending', 'matching', 'booked', 'in_progress', 'completed', 'cancelled'));

-- Lets a hirer post two roles in the same category, e.g. "Head waiter" and "Servers".
alter table public.job_posts add column if not exists role_title text;

-- Event times are entered in Nigerian local time (WAT).
create or replace function public.event_start(p_date date, p_time time)
returns timestamptz language sql stable as $$
  select (p_date + p_time) at time zone 'Africa/Lagos';
$$;

-- Close applications for events that have started, lapse unanswered offers,
-- and mark the events in progress. Idempotent; called by pg_cron (if enabled)
-- and opportunistically by the app when dashboards load.
create or replace function public.close_started_events()
returns integer language plpgsql security definer set search_path = public as $$
declare
  closed int;
begin
  update job_posts set status = 'closed'
  where status in ('open', 'filled') and public.event_start(event_date, start_time) <= now();
  get diagnostics closed = row_count;

  update bookings b set status = 'cancelled', notes = trim(coalesce(b.notes, '') || ' [Offer lapsed: not accepted before the event started]')
  from events e
  where b.event_id = e.id and b.status = 'pending' and public.event_start(e.event_date, e.start_time) <= now();

  update job_applications a set status = 'Rejected'
  from job_posts j
  where a.job_id = j.id and a.status in ('Applied', 'Shortlisted') and j.status = 'closed'
    and public.event_start(j.event_date, j.start_time) <= now();

  update events set status = 'in_progress'
  where status in ('pending', 'matching', 'booked') and public.event_start(event_date, start_time) <= now();
  return closed;
end;
$$;
grant execute on function public.close_started_events() to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'close-started-events';
    perform cron.schedule('close-started-events', '*/10 * * * *', 'select public.close_started_events()');
  end if;
end $$;

-- Applications: refuse new (or renewed) applications once a role is closed or the event has started.
create or replace function public.guard_application()
returns trigger language plpgsql as $$
declare
  job_open boolean;
begin
  if not public.is_client_request() or public.is_admin() then return new; end if;
  select exists (
    select 1 from job_posts j
    where j.id = coalesce(new.job_id, old.job_id) and j.status = 'open'
      and public.event_start(j.event_date, j.start_time) > now()
  ) into job_open;

  if tg_op = 'INSERT' then
    if not job_open then raise exception 'Applications for this job have closed.'; end if;
    new.status := 'Applied';
    return new;
  end if;
  new.job_id := old.job_id;
  new.worker_id := old.worker_id;
  if auth.uid() = old.worker_id and not public.owns_job(old.job_id) then
    if new.status <> old.status
       and not (new.status = 'Withdrawn' and old.status in ('Applied', 'Shortlisted'))
       and not (new.status = 'Applied' and old.status = 'Withdrawn' and job_open) then
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

-- No new booking offers once the event has started.
create or replace function public.prepare_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select user_id into new.worker_user_id from staff_profiles where id = new.worker_id;
  if new.worker_user_id is not null and new.worker_user_id = new.hirer_id then
    raise exception 'You cannot book yourself.';
  end if;
  if not public.is_admin() then
    if exists (select 1 from events e where e.id = new.event_id and public.event_start(e.event_date, e.start_time) <= now()) then
      raise exception 'This event has already started, so new bookings are closed.';
    end if;
    new.status := 'pending';
    new.completed_at := null;
  end if;
  return new;
end;
$$;

-- Editing an event keeps its roles in sync and tells the people affected.
create or replace function public.on_event_updated()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  details_changed boolean := (new.event_date, new.start_time, new.end_time, new.location)
    is distinct from (old.event_date, old.start_time, old.end_time, old.location)
    or new.state is distinct from old.state or new.area is distinct from old.area;
  summary text;
begin
  if new.event_name is distinct from old.event_name then
    update job_posts set title = new.event_name || ' — ' || coalesce(role_title, category) where event_id = new.id;
  end if;
  if details_changed then
    update job_posts set event_date = new.event_date, start_time = new.start_time, end_time = new.end_time,
      location = new.location, state = new.state, area = new.area
    where event_id = new.id;
    summary := to_char(new.event_date, 'Dy DD Mon') || ', ' || to_char(new.event_date + new.start_time, 'HH12:MI am') || ' at ' || new.location;

    insert into notifications (user_id, type, title, body, link)
    select distinct b.worker_user_id, 'booking', 'Event updated: ' || new.event_name,
      'New details: ' || summary || '. Please confirm you can still make it.', '/worker/bookings'
    from bookings b
    where b.event_id = new.id and b.status in ('pending', 'confirmed') and b.worker_user_id is not null;

    insert into notifications (user_id, type, title, body, link)
    select distinct a.worker_id, 'application', 'Event updated: ' || new.event_name,
      'A job you applied for changed: ' || summary || '.', '/worker/jobs/' || a.job_id
    from job_applications a join job_posts j on j.id = a.job_id
    where j.event_id = new.id and a.status in ('Applied', 'Shortlisted') and a.worker_id is not null;
  elsif new.instructions is distinct from old.instructions and new.status not in ('completed', 'cancelled') then
    insert into notifications (user_id, type, title, body, link)
    select distinct b.worker_user_id, 'booking', 'New instructions for ' || new.event_name,
      coalesce(left(new.instructions, 160), 'Instructions were removed.'), '/worker/bookings'
    from bookings b
    where b.event_id = new.id and b.status in ('pending', 'confirmed') and b.worker_user_id is not null;
  end if;
  return new;
end;
$$;
drop trigger if exists events_after_update on public.events;
create trigger events_after_update after update on public.events for each row execute function public.on_event_updated();

-- ---------------------------------------------------------------------------
-- 3. Ratings & reviews
-- ---------------------------------------------------------------------------

alter table public.reviews
  add column if not exists reviewer_name text,
  add column if not exists event_name text,
  add column if not exists category text,
  add column if not exists would_rebook boolean,
  add column if not exists response text,
  add column if not exists responded_at timestamptz;

-- Snapshot context so other hirers can read a review without access to the
-- reviewer's profile or the private event.
create or replace function public.prepare_review()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  full_name text;
begin
  select p.full_name into full_name from profiles p where p.id = new.reviewer_id;
  new.reviewer_name := trim(split_part(coalesce(full_name, 'Client'), ' ', 1) || ' ' ||
    coalesce(nullif(left(split_part(coalesce(full_name, ''), ' ', 2), 1), '') || '.', ''));
  select e.event_name, coalesce(j.category, s.category) into new.event_name, new.category
  from bookings b
  join events e on e.id = b.event_id
  left join job_posts j on j.id = b.job_id
  left join staff_profiles s on s.id = b.worker_id
  where b.id = new.booking_id;
  new.response := null;
  new.responded_at := null;
  return new;
end;
$$;
drop trigger if exists reviews_prepare on public.reviews;
create trigger reviews_prepare before insert on public.reviews for each row execute function public.prepare_review();

-- Professionals may reply to a review about them, and change nothing else.
drop policy if exists "Reviewees can respond" on public.reviews;
create policy "Reviewees can respond" on public.reviews for update to authenticated
  using (auth.uid() = reviewee_id) with check (auth.uid() = reviewee_id);

create or replace function public.guard_review_update()
returns trigger language plpgsql as $$
declare
  reply text := nullif(trim(new.response), '');
begin
  if public.is_client_request() and not public.is_admin() then
    new := old;  -- start from the stored row …
    new.response := left(reply, 600);  -- … and accept only the reply.
    new.responded_at := case when reply is null then null else timezone('utc', now()) end;
  end if;
  return new;
end;
$$;
drop trigger if exists reviews_guard_update on public.reviews;
create trigger reviews_guard_update before update on public.reviews for each row execute function public.guard_review_update();

-- ---------------------------------------------------------------------------
-- 4. Payout confirmation & disputes
-- ---------------------------------------------------------------------------

alter table public.payments add column if not exists received_at timestamptz;

drop policy if exists "Payees confirm receipt" on public.payments;
create policy "Payees confirm receipt" on public.payments for update to authenticated
  using (auth.uid() = payee_id) with check (auth.uid() = payee_id);

create or replace function public.guard_payment_update()
returns trigger language plpgsql as $$
declare
  confirmed timestamptz := new.received_at;
begin
  if public.is_client_request() and not public.is_admin() then
    new := old;
    if old.status = 'paid' and old.received_at is null and confirmed is not null then
      new.received_at := timezone('utc', now());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists payments_guard_update on public.payments;
create trigger payments_guard_update before update on public.payments for each row execute function public.guard_payment_update();

create or replace function public.on_payment_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    perform public.notify(new.payee_id, 'payment', 'Payout sent: ₦' || to_char(new.amount, 'FM999,999,999'),
      'Your payout has been sent. Please confirm once it reaches your account.', '/worker/earnings');
  end if;
  return new;
end;
$$;
drop trigger if exists payments_notify on public.payments;
create trigger payments_notify after update of status on public.payments for each row execute function public.on_payment_paid();

-- Disputes may only be opened by someone on that booking.
drop policy if exists "Users can create disputes" on public.disputes;
create policy "Users can create disputes" on public.disputes for insert to authenticated with check (
  auth.uid() = opened_by and exists (
    select 1 from public.bookings b where b.id = disputes.booking_id and (b.hirer_id = auth.uid() or b.worker_user_id = auth.uid())
  )
);
drop policy if exists "Admins manage disputes" on public.disputes;
create policy "Admins manage disputes" on public.disputes for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Push notifications
-- ---------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Users manage own push subscriptions" on public.push_subscriptions;
create policy "Users manage own push subscriptions" on public.push_subscriptions for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A browser keeps one endpoint even if a different person signs in on it,
-- so saving reassigns the endpoint to whoever is signed in now.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language sql security definer set search_path = public as $$
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  select auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent where auth.uid() is not null
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent;
$$;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Realtime powers the in-app toasts and the bell badge.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- Phone/desktop push is delivered by the `send-push` Edge Function, triggered
-- by a Database Webhook on notifications INSERT (see README › Push notifications).
