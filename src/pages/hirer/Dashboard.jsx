import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import ReviewModal from '../../components/ReviewModal'
import Workspace from '../../components/Workspace'
import { Avatar, EmptyState, Icon, Spinner, Stat, StatusBadge } from '../../components/ui'
import { BOOKING_STATUS } from '../../lib/constants'
import { eventPhase, formatDate, isPast, money } from '../../lib/format'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'
import { EventCard } from './Events'

async function load(userId) {
  await supabase.rpc('close_started_events')
  const [events, bookings, saved, org, reviews] = await Promise.all([
    supabase.from('events').select('*, job_posts(id,workers_required,status), bookings(id,status)').eq('hirer_id', userId).neq('status', 'cancelled').order('event_date'),
    supabase.from('bookings').select('*, staff_profiles(id,name,category,rating,review_count), events(id,event_name,event_date,start_time,end_time,status), job_posts(category,role_title)').eq('hirer_id', userId).order('created_at', { ascending: false }),
    supabase.from('saved_workers').select('id', { count: 'exact', head: true }).eq('hirer_id', userId),
    supabase.from('hirer_profiles').select('organization_name,organization_type').eq('user_id', userId).maybeSingle(),
    supabase.from('reviews').select('booking_id').eq('reviewer_id', userId),
  ])
  const eventRows = must(events)
  const jobIds = eventRows.flatMap((e) => (e.job_posts || []).map((j) => j.id))
  const apps = jobIds.length ? must(await supabase.from('job_applications').select('id,job_id,worker_name,applied_at,status,job_posts(title,event_id)').in('job_id', jobIds).eq('status', 'Applied').order('applied_at', { ascending: false })) : []
  return { events: eventRows, bookings: must(bookings), saved: saved.count || 0, org: org.data, apps, reviewed: new Set((reviews.data || []).map((r) => r.booking_id)) }
}

export default function HirerDashboard() {
  const { session, profile } = useSession()
  const { data, loading, reload } = useLoader(() => load(session.user.id), [session])
  const [rating, setRating] = useState(null)
  const firstName = profile?.full_name?.split(' ')[0] || 'there'

  if (loading && !data) return <Workspace role="hirer"><Spinner /></Workspace>
  const { events, bookings, saved, org, apps, reviewed } = data
  const toRate = bookings.filter((b) => b.status === 'completed' && !reviewed.has(b.id))
  const toFinish = events.filter((e) => e.status !== 'completed' && eventPhase(e) === 'ended')
  const upcoming = events.filter((e) => !isPast(e.event_date) && e.status !== 'completed')
  const openRoles = upcoming.flatMap((e) => e.job_posts || []).filter((j) => j.status === 'open').length
  const confirmed = bookings.filter((b) => b.status === 'confirmed')
  const spend = bookings.filter((b) => ['confirmed', 'completed'].includes(b.status)).reduce((sum, b) => sum + Number(b.agreed_amount), 0)

  const checklist = [
    ['Set up your organisation', !!org?.organization_name, '/hirer/settings'],
    ['Post your first event', events.length > 0, '/hirer/post-event'],
    ['Hire your first professional', bookings.length > 0, upcoming[0] ? `/hirer/events/${upcoming[0].id}` : '/hirer/find-staff'],
  ]
  const showChecklist = checklist.some(([, done]) => !done)

  return <Workspace role="hirer">
    <section className="welcome">
      <div>
        <span className="eyebrow">{org?.organization_name || 'Hirer workspace'}</span>
        <h1>Good to see you, {firstName}</h1>
        <p>{upcoming.length ? `You have ${upcoming.length} upcoming event${upcoming.length === 1 ? '' : 's'}${openRoles ? ` with ${openRoles} role${openRoles === 1 ? '' : 's'} still hiring` : ''}.` : 'Post an event and we\'ll build your staffing plan in seconds.'}</p>
      </div>
      <div className="row wrap-gap">
        <NavLink to="/hirer/find-staff" className="btn btn-secondary"><Icon name="Search" size={16} />Find staff</NavLink>
        <NavLink to="/hirer/post-event" className="btn btn-primary"><Icon name="Plus" size={16} />Post an event</NavLink>
      </div>
    </section>

    <div className="stat-grid">
      <Stat icon="CalendarDays" label="Upcoming events" value={upcoming.length} to="/hirer/events" />
      <Stat icon="UserRoundSearch" label="New applicants" value={apps.length} tone="accent" hint={apps.length ? 'Waiting for review' : 'All caught up'} />
      <Stat icon="ClipboardCheck" label="Confirmed staff" value={confirmed.length} tone="success" to="/hirer/bookings" />
      <Stat icon="Wallet" label="Staff spend" value={money(spend)} tone="info" hint={`${saved} saved professional${saved === 1 ? '' : 's'}`} />
    </div>

    {showChecklist && <section className="card card-pad onboarding">
      <div><h2 className="card-title">Get set up</h2><p className="muted">Three quick steps to your first fully-staffed event.</p></div>
      <ol>{checklist.map(([label, done, to]) => <li key={label} className={done ? 'done' : ''}><span className="check">{done ? <Icon name="Check" size={14} /> : null}</span>{done ? label : <NavLink to={to}>{label}</NavLink>}</li>)}</ol>
    </section>}

    <div className="dash-grid">
      <section className="card">
        <header className="card-head"><h2>Upcoming events</h2><NavLink to="/hirer/events" className="link">View all</NavLink></header>
        <div className="card-body stack">
          {upcoming.length ? upcoming.slice(0, 4).map((event) => <EventCard event={event} key={event.id} />)
            : <EmptyState icon="CalendarPlus" title="No upcoming events" action={<NavLink to="/hirer/post-event" className="btn btn-primary btn-sm">Post an event</NavLink>}>Your next celebration starts here.</EmptyState>}
        </div>
      </section>

      <div className="stack">
        {toRate.length > 0 && <section className="card attention">
          <header className="card-head"><h2><Icon name="Star" size={18} />Rate your team</h2><span className="muted small">{toRate.length} waiting</span></header>
          <ul className="feed">{toRate.slice(0, 5).map((b) => <li key={b.id}>
            <Avatar name={b.staff_profiles?.name} size="sm" />
            <div><strong>{b.staff_profiles?.name}</strong><span>{b.events?.event_name}</span></div>
            <button className="btn btn-accent btn-sm" onClick={() => setRating(b)}>Rate</button>
          </li>)}</ul>
        </section>}

        {toFinish.length > 0 && <section className="card attention">
          <header className="card-head"><h2><Icon name="CircleAlert" size={18} />Needs your attention</h2></header>
          <div className="card-body">
            <p className="small">{toFinish.length === 1 ? `${toFinish[0].event_name} has` : `${toFinish.length} events have`} ended. Confirm who worked so payouts are released, then rate your team.</p>
            <NavLink to={`/hirer/events/${toFinish[0].id}`} className="btn btn-accent btn-sm">Complete {toFinish.length === 1 ? 'event' : 'next event'}</NavLink>
          </div>
        </section>}

        <section className="card">
          <header className="card-head"><h2>New applicants</h2></header>
          <ul className="feed">
            {apps.length ? apps.slice(0, 6).map((app) => <li key={app.id}>
              <Avatar name={app.worker_name} size="sm" />
              <div><strong>{app.worker_name}</strong><span>{app.job_posts?.title}</span></div>
              <NavLink to={`/hirer/events/${app.job_posts?.event_id}`} className="btn btn-ghost btn-sm">Review</NavLink>
            </li>) : <li className="muted small">No new applicants right now.</li>}
          </ul>
        </section>

        <section className="card">
          <header className="card-head"><h2>Recent bookings</h2><NavLink to="/hirer/bookings" className="link">All</NavLink></header>
          <ul className="feed">
            {bookings.length ? bookings.slice(0, 5).map((b) => <li key={b.id}>
              <Avatar name={b.staff_profiles?.name} size="sm" />
              <div><strong>{b.staff_profiles?.name}</strong><span>{b.events?.event_name} · {formatDate(b.events?.event_date, { day: 'numeric', month: 'short' })}</span></div>
              <StatusBadge map={BOOKING_STATUS} value={b.status} />
            </li>) : <li className="muted small">Bookings will appear here.</li>}
          </ul>
        </section>
      </div>
    </div>
    <ReviewModal booking={rating} onClose={() => setRating(null)} onDone={() => { setRating(null); reload() }} />
  </Workspace>
}
