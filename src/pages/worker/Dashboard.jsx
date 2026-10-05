import { NavLink } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Alert, EmptyState, Icon, Progress, Spinner, Stat, VerifiedBadge } from '../../components/ui'
import { formatDate, isPast, money, timeRange } from '../../lib/format'
import { MIN_MATCH_THRESHOLD, scoreJobForWorker } from '../../lib/matching'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'
import { loadWorkerContext } from '../../lib/workerContext'
import { BOOKING_SELECT, JobCard, OfferActions } from './shared'

async function load(userId) {
  const [ctx, jobs, apps, bookings, payments] = await Promise.all([
    loadWorkerContext(userId),
    supabase.from('job_posts').select('*, events(event_name)').eq('status', 'open').gte('event_date', new Date().toISOString().slice(0, 10)).order('event_date').limit(200),
    supabase.from('job_applications').select('id,job_id,status').eq('worker_id', userId),
    supabase.from('bookings').select(BOOKING_SELECT).eq('worker_user_id', userId).order('created_at', { ascending: false }),
    supabase.from('payments').select('amount,status').eq('payee_id', userId),
  ])
  const appliedIds = new Set(must(apps).map((a) => a.job_id))
  const scored = must(jobs).filter((job) => job.hirer_id !== userId)
    .map((job) => ({ ...job, matchScore: scoreJobForWorker(job, ctx.worker).score }))
    .sort((a, b) => b.matchScore - a.matchScore)
  return { ...ctx, jobs: scored, apps: must(apps), appliedIds, bookings: must(bookings), payments: must(payments) }
}

export default function WorkerDashboard() {
  const { session, profile } = useSession()
  const { data, loading, reload } = useLoader(() => load(session.user.id), [session])
  if (loading && !data) return <Workspace role="worker"><Spinner /></Workspace>

  const { worker, profile: wp, staff, jobs, apps, appliedIds, bookings, payments } = data
  const completion = wp?.profile_completion || 0
  const recommended = jobs.filter((job) => job.matchScore >= MIN_MATCH_THRESHOLD && !appliedIds.has(job.id))
  const offers = bookings.filter((b) => b.status === 'pending')
  const upcoming = bookings.filter((b) => b.status === 'confirmed' && !isPast(b.events?.event_date)).sort((a, b) => a.events.event_date.localeCompare(b.events.event_date))
  const earned = payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + Number(p.amount), 0)
  const pending = payments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + Number(p.amount), 0)
  const activeApps = apps.filter((a) => ['Applied', 'Shortlisted'].includes(a.status)).length
  const firstName = profile?.full_name?.split(' ')[0] || 'there'

  return <Workspace role="worker">
    <section className="welcome">
      <div>
        <span className="eyebrow">{wp?.primary_profession || 'Professional workspace'}</span>
        <h1>Welcome back, {firstName}</h1>
        <p>{recommended.length ? `${recommended.length} open job${recommended.length === 1 ? '' : 's'} match your profile right now.` : 'Complete your profile to unlock better job matches.'}</p>
      </div>
      {worker.is_verified ? <VerifiedBadge /> : null}
    </section>

    {!staff?.is_verified && <div className={`verify-banner ${completion >= 100 ? 'review' : ''}`}>
      <span className="verify-icon"><Icon name={completion >= 100 ? 'Hourglass' : 'ShieldAlert'} size={22} /></span>
      <div>
        <strong>{completion >= 100 ? 'Your documents are with our verification team' : 'Finish your profile to get verified'}</strong>
        <p>{completion >= 100 ? 'Reviews usually take up to 48 hours. You can apply for jobs in the meantime — verified professionals rank higher and appear in hirer search.' : 'Hirers only see verified professionals in search. Complete your profile and upload your documents to get listed.'}</p>
        {completion < 100 && <Progress value={completion} label="Profile strength" />}
      </div>
      {completion < 100 && <NavLink to="/worker/profile/edit" className="btn btn-primary">Continue profile</NavLink>}
    </div>}

    <div className="stat-grid">
      <Stat icon="Sparkles" label="Matched jobs" value={recommended.length} to="/worker/jobs" />
      <Stat icon="Send" label="Active applications" value={activeApps} tone="info" to="/worker/applications" />
      <Stat icon="CalendarCheck" label="Upcoming bookings" value={upcoming.length} tone="success" to="/worker/bookings" />
      <Stat icon="Wallet" label="Total earned" value={money(earned)} tone="accent" hint={pending ? `${money(pending)} pending` : null} to="/worker/earnings" />
    </div>

    {offers.length > 0 && <section className="card attention">
      <header className="card-head"><h2><Icon name="PartyPopper" size={18} />You've been hired — confirm your booking{offers.length > 1 ? 's' : ''}</h2></header>
      <ul className="offer-list">
        {offers.map((b) => <li key={b.id}>
          <div><strong>{b.events?.event_name}</strong><span className="muted small">{b.job_posts?.category} · {formatDate(b.events?.event_date)} · {timeRange(b.events?.start_time, b.events?.end_time)} · {b.events?.location}</span>{b.notes && <p className="quote small">“{b.notes}”</p>}</div>
          <strong className="pay">{money(b.agreed_amount)}</strong>
          <OfferActions booking={b} onDone={reload} />
        </li>)}
      </ul>
    </section>}

    <div className="dash-grid">
      <section className="card">
        <header className="card-head"><h2>Recommended for you</h2><NavLink to="/worker/jobs" className="link">See all jobs</NavLink></header>
        <div className="card-body">
          {recommended.length ? <div className="job-grid two">{recommended.slice(0, 4).map((job) => <JobCard job={job} key={job.id} />)}</div>
            : <EmptyState icon="SearchX" title="No strong matches right now" action={<NavLink to="/worker/jobs?tab=all" className="btn btn-secondary btn-sm">Browse all jobs</NavLink>}>Broaden your categories and locations in your profile to see more.</EmptyState>}
        </div>
      </section>
      <section className="card">
        <header className="card-head"><h2>Your schedule</h2><NavLink to="/worker/bookings" className="link">All bookings</NavLink></header>
        <ul className="schedule">
          {upcoming.length ? upcoming.slice(0, 5).map((b) => {
            const d = new Date(`${b.events.event_date}T00:00:00`)
            return <li key={b.id}>
              <div className="date-tile sm"><span>{d.toLocaleDateString('en-NG', { month: 'short' })}</span><strong>{d.getDate()}</strong></div>
              <div><strong>{b.events.event_name}</strong><span className="muted small">{timeRange(b.events.start_time, b.events.end_time)} · {b.events.location}</span></div>
            </li>
          }) : <li className="muted small pad">No confirmed bookings yet.</li>}
        </ul>
      </section>
    </div>
    <Alert tone="info">{!wp ? 'Tip: your profile hasn\'t been started yet — hirers can\'t book you until it is.' : ''}</Alert>
  </Workspace>
}
