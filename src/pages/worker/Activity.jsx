import { NavLink, useSearchParams } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Alert, CategoryIcon, EmptyState, Icon, PageHeader, Spinner, Stat, StatusBadge, Tabs } from '../../components/ui'
import { APPLICATION_STATUS, BOOKING_STATUS, PAYMENT_STATUS } from '../../lib/constants'
import { formatDate, isPast, money, timeAgo, timeRange } from '../../lib/format'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'
import { BOOKING_SELECT, OfferActions } from './shared'

export function Applications() {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'active'
  const { data, loading, error, reload } = useLoader(async () => must(await supabase.from('job_applications')
    .select('*, job_posts(id,title,category,event_date,start_time,end_time,location,budget,status)')
    .eq('worker_id', session.user.id).order('applied_at', { ascending: false })), [session])

  const apps = data || []
  const active = apps.filter((a) => ['Applied', 'Shortlisted'].includes(a.status))
  const closed = apps.filter((a) => !['Applied', 'Shortlisted'].includes(a.status))
  const list = tab === 'active' ? active : closed

  const withdraw = async (app) => {
    if (!window.confirm('Withdraw this application?')) return
    await supabase.from('job_applications').update({ status: 'Withdrawn' }).eq('id', app.id)
    reload()
  }

  return <Workspace role="worker">
    <PageHeader eyebrow="Applications" title="Your applications" description="Track where you stand with each hirer." actions={<NavLink to="/worker/jobs" className="btn btn-primary"><Icon name="Search" size={16} />Find more jobs</NavLink>} />
    <Tabs value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} tabs={[['active', 'In progress', active.length], ['closed', 'Closed', closed.length]]} />
    <Alert tone="danger">{error?.message}</Alert>
    {loading && !data ? <Spinner /> : list.length ? <div className="card table-card">
      {list.map((app) => {
        const job = app.job_posts
        return <div className="booking-row" key={app.id}>
          <CategoryIcon category={job?.category} />
          <div className="booking-main">
            {job ? <NavLink to={`/worker/jobs/${job.id}`}><strong>{job.title}</strong></NavLink> : <strong>Job no longer listed</strong>}
            {job && <div className="meta"><span>{formatDate(job.event_date)} · {timeRange(job.start_time, job.end_time)}</span><span><Icon name="MapPin" size={13} />{job.location}</span><span className="muted">Applied {timeAgo(app.applied_at)}</span></div>}
          </div>
          {job && <div className="booking-amount"><strong>{money(job.budget)}</strong></div>}
          <div className="booking-actions">
            <StatusBadge map={APPLICATION_STATUS} value={app.status} />
            {['Applied', 'Shortlisted'].includes(app.status) && <button className="btn btn-ghost btn-sm" onClick={() => withdraw(app)}>Withdraw</button>}
            {app.status === 'Accepted' && <NavLink to="/worker/bookings" className="btn btn-secondary btn-sm">View booking</NavLink>}
          </div>
        </div>
      })}
    </div> : <EmptyState icon="Send" title={tab === 'active' ? 'No active applications' : 'Nothing here yet'} action={<NavLink to="/worker/jobs" className="btn btn-primary">Browse matched jobs</NavLink>}>
      {tab === 'active' ? 'Apply to jobs that match your profile and track them here.' : 'Applications that were hired, declined or withdrawn appear here.'}
    </EmptyState>}
  </Workspace>
}

export function WorkerBookings() {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'upcoming'
  const { data, loading, reload } = useLoader(async () => must(await supabase.from('bookings').select(BOOKING_SELECT).eq('worker_user_id', session.user.id).order('created_at', { ascending: false })), [session])

  const bookings = data || []
  const groups = {
    offers: bookings.filter((b) => b.status === 'pending'),
    upcoming: bookings.filter((b) => b.status === 'confirmed').sort((a, b) => (a.events?.event_date || '').localeCompare(b.events?.event_date || '')),
    history: bookings.filter((b) => ['completed', 'cancelled'].includes(b.status)),
  }

  const cancel = async (b) => {
    if (!window.confirm('Cancel a confirmed booking? Late cancellations affect your ranking.')) return
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)
    reload()
  }

  return <Workspace role="worker">
    <PageHeader eyebrow="Bookings" title="Your bookings" description="Accept offers, see your schedule and contact details for confirmed jobs." />
    <Tabs value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} tabs={[['offers', 'New offers', groups.offers.length], ['upcoming', 'Confirmed', groups.upcoming.length], ['history', 'History', groups.history.length]]} />
    {loading && !data ? <Spinner /> : groups[tab].length ? <div className="stack">
      {groups[tab].map((b) => {
        const ev = b.events || {}
        const d = ev.event_date ? new Date(`${ev.event_date}T00:00:00`) : null
        return <article className="card booking-card" key={b.id}>
          {d && <div className="date-tile"><span>{d.toLocaleDateString('en-NG', { month: 'short' })}</span><strong>{d.getDate()}</strong></div>}
          <div className="booking-card-main">
            <div className="row between wrap-gap"><h3>{ev.event_name}</h3><StatusBadge map={BOOKING_STATUS} value={b.status === 'pending' ? 'pending' : b.status} /></div>
            <p className="meta"><span><CategoryIcon category={b.job_posts?.category} size={14} />{b.job_posts?.category}</span><span><Icon name="Clock" size={14} />{timeRange(ev.start_time, ev.end_time)}</span><span><Icon name="MapPin" size={14} />{ev.location}</span></p>
            {(b.notes || ev.instructions) && <p className="note"><Icon name="StickyNote" size={15} />{b.notes || ev.instructions}</p>}
            {b.status === 'confirmed' && b.hirer && <p className="contact-line"><Icon name="UserRound" size={15} />Client: <strong>{b.hirer.full_name}</strong>{b.hirer.phone && <a href={`tel:${b.hirer.phone}`}><Icon name="Phone" size={14} />{b.hirer.phone}</a>}</p>}
          </div>
          <div className="booking-card-side">
            <strong className="pay">{money(b.agreed_amount)}</strong>
            {b.status === 'pending' && <OfferActions booking={b} onDone={reload} />}
            {b.status === 'confirmed' && !isPast(ev.event_date) && <button className="btn btn-ghost btn-sm danger-text" onClick={() => cancel(b)}>Can't make it</button>}
            {b.status === 'confirmed' && isPast(ev.event_date) && <span className="muted small">Waiting for the hirer to mark complete</span>}
          </div>
        </article>
      })}
    </div> : <EmptyState icon="CalendarCheck" title={{ offers: 'No new offers', upcoming: 'No confirmed bookings', history: 'No past bookings' }[tab]} action={<NavLink to="/worker/jobs" className="btn btn-primary">Find jobs</NavLink>}>
      When a hirer books you, the offer appears here for you to accept.
    </EmptyState>}
  </Workspace>
}

export function Earnings() {
  const { session } = useSession()
  const { data, loading } = useLoader(async () => must(await supabase.from('payments').select('*, bookings(events(event_name,event_date))').eq('payee_id', session.user.id).order('created_at', { ascending: false })), [session])
  const payments = data || []
  const sum = (status) => payments.filter((p) => p.status === status).reduce((total, p) => total + Number(p.amount), 0)
  const thisMonth = payments.filter((p) => p.status === 'paid' && p.paid_at && new Date(p.paid_at).getMonth() === new Date().getMonth()).reduce((total, p) => total + Number(p.amount), 0)

  return <Workspace role="worker">
    <PageHeader eyebrow="Earnings" title="Your earnings" description="You keep 100% of your agreed rate. Payouts are released after the hirer marks a job complete." />
    <div className="stat-grid three">
      <Stat icon="Wallet" label="Total paid out" value={money(sum('paid'))} tone="success" />
      <Stat icon="Hourglass" label="Pending payout" value={money(sum('pending'))} tone="accent" />
      <Stat icon="TrendingUp" label="Paid this month" value={money(thisMonth)} tone="info" />
    </div>
    {loading ? <Spinner /> : payments.length ? <div className="card table-card">
      {payments.map((p) => <div className="booking-row" key={p.id}>
        <span className="stat-icon tone-success"><Icon name="Banknote" size={18} /></span>
        <div className="booking-main"><strong>{p.bookings?.events?.event_name || 'Event booking'}</strong><div className="meta"><span>{formatDate(p.bookings?.events?.event_date)}</span>{p.paid_at && <span>Paid {formatDate(p.paid_at)}</span>}</div></div>
        <div className="booking-amount"><strong>{money(p.amount)}</strong></div>
        <div className="booking-actions"><StatusBadge map={PAYMENT_STATUS} value={p.status} /></div>
      </div>)}
    </div> : <EmptyState icon="PiggyBank" title="No earnings yet" action={<NavLink to="/worker/jobs" className="btn btn-primary">Find your first job</NavLink>}>Completed bookings and payouts will be listed here.</EmptyState>}
  </Workspace>
}
