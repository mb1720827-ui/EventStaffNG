import { useState } from 'react'
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BookModal from '../../components/BookModal'
import Workspace from '../../components/Workspace'
import { Alert, Avatar, Badge, CategoryIcon, EmptyState, Icon, MatchPill, PageHeader, Spinner, Stars, StatusBadge, VerifiedBadge } from '../../components/ui'
import { APPLICATION_STATUS, BOOKING_STATUS, COMMISSION_RATE, EVENT_STATUS } from '../../lib/constants'
import { formatDate, money, timeAgo, timeRange } from '../../lib/format'
import { scoreWorkerForJob } from '../../lib/matching'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'

async function loadEvent(id, hirerId) {
  const event = must(await supabase.from('events').select('*').eq('id', id).eq('hirer_id', hirerId).maybeSingle())
  if (!event) return null
  const [jobs, bookings] = await Promise.all([
    supabase.from('job_posts').select('*').eq('event_id', id).order('created_at'),
    supabase.from('bookings').select('*, staff_profiles(id,name,category,location,rating,review_count,is_verified,user_id)').eq('event_id', id),
  ])
  const jobRows = must(jobs)
  const jobIds = jobRows.map((job) => job.id)
  const apps = jobIds.length ? must(await supabase.from('job_applications').select('*').in('job_id', jobIds).order('applied_at', { ascending: false })) : []
  const applicantIds = [...new Set(apps.map((app) => app.worker_id).filter(Boolean))]
  const categories = [...new Set(jobRows.map((job) => job.category))]
  const [staffRes, workerRes, recRes] = await Promise.all([
    applicantIds.length ? supabase.from('staff_profiles').select('*').in('user_id', applicantIds) : { data: [] },
    applicantIds.length ? supabase.from('worker_profiles').select('user_id,primary_profession,state,city,area,minimum_rate,years_experience').in('user_id', applicantIds) : { data: [] },
    categories.length ? supabase.from('staff_profiles').select('*').in('category', categories).eq('is_verified', true).eq('is_available', true).order('rating', { ascending: false }).limit(60) : { data: [] },
  ])
  const staffByUser = new Map((staffRes.data || []).map((row) => [row.user_id, row]))
  const workerByUser = new Map((workerRes.data || []).map((row) => [row.user_id, row]))
  return { event, jobs: jobRows, bookings: must(bookings), apps, staffByUser, workerByUser, recommended: recRes.data || [] }
}

function toWorker(staff, worker) {
  return {
    ...staff, primary_profession: worker?.primary_profession || staff?.category, state: worker?.state || staff?.state,
    city: worker?.city || staff?.location, minimum_rate: worker?.minimum_rate, is_verified: staff?.is_verified === true,
    rating: staff?.rating, preferences: {}, skills: [], availability: [], documents: [],
  }
}

function Applicant({ app, job, staff, worker, booking, onAction, busy }) {
  const match = scoreWorkerForJob(toWorker(staff, worker), job).score
  const name = staff?.name || app.worker_name
  const closed = ['Rejected', 'Withdrawn'].includes(app.status)
  return <div className={`applicant ${closed ? 'is-closed' : ''}`}>
    <Avatar name={name} size="md" />
    <div className="applicant-main">
      <div className="row wrap-gap"><strong>{name}</strong>{staff?.is_verified ? <VerifiedBadge compact /> : <Badge tone="warning" icon="Clock">Verification pending</Badge>}</div>
      <div className="meta"><Stars value={staff?.rating} count={staff?.review_count} />{worker?.years_experience ? <span>{worker.years_experience} yrs exp.</span> : null}{staff?.location && <span><Icon name="MapPin" size={13} />{staff.location}</span>}<span className="muted">Applied {timeAgo(app.applied_at)}</span></div>
      {app.cover_note && <p className="quote">“{app.cover_note}”</p>}
    </div>
    <div className="applicant-side">
      <MatchPill score={match} />
      {booking ? <StatusBadge map={BOOKING_STATUS} value={booking.status} /> : <StatusBadge map={APPLICATION_STATUS} value={app.status} />}
      {!booking && !closed && <div className="row">
        {staff && <NavLink to={`/hirer/staff/${staff.id}`} className="btn btn-ghost btn-sm">Profile</NavLink>}
        {app.status === 'Applied' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('shortlist', app)}>Shortlist</button>}
        <button className="btn btn-ghost btn-sm danger-text" disabled={busy} onClick={() => onAction('reject', app)}>Decline</button>
        <button className="btn btn-primary btn-sm" disabled={busy || !staff} title={staff ? '' : 'This professional has not finished their marketplace profile yet'} onClick={() => onAction('hire', app, staff)}>Hire</button>
      </div>}
    </div>
  </div>
}

export default function EventDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useSession()
  const { data, loading, error, reload } = useLoader(() => loadEvent(id, session.user.id), [id, session])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(params.get('published') ? 'success:Your event is live! Matching professionals have been notified — applicants will appear below.' : '')
  const [booking, setBooking] = useState(null)

  if (loading && !data) return <Workspace role="hirer"><Spinner /></Workspace>
  if (error || !data) return <Workspace role="hirer"><EmptyState icon="CalendarX" title="Event not found" action={<NavLink to="/hirer/events" className="btn btn-primary">Back to events</NavLink>}>{error?.message || 'It may have been removed.'}</EmptyState></Workspace>

  const { event, jobs, bookings, apps, staffByUser, workerByUser, recommended } = data
  const [tone, text] = message.includes(':') ? message.split(/:(.*)/s) : ['info', message]
  const activeBookings = bookings.filter((b) => b.status !== 'cancelled')
  const needed = jobs.reduce((sum, job) => sum + job.workers_required, 0)
  const totalCost = activeBookings.reduce((sum, b) => sum + Number(b.agreed_amount), 0)
  const cancelled = event.status === 'cancelled'

  const act = async (kind, app, staff) => {
    setBusy(true)
    let result
    if (kind === 'shortlist') result = await supabase.from('job_applications').update({ status: 'Shortlisted' }).eq('id', app.id)
    if (kind === 'reject') result = await supabase.from('job_applications').update({ status: 'Rejected' }).eq('id', app.id)
    if (kind === 'hire') {
      const job = jobs.find((item) => item.id === app.job_id)
      result = await supabase.from('bookings').insert({ event_id: event.id, job_id: job.id, application_id: app.id, worker_id: staff.id, hirer_id: session.user.id, agreed_amount: job.budget, status: 'pending' })
      if (!result.error) setMessage(`success:Booking offer sent to ${staff.name}. They'll confirm shortly.`)
    }
    if (result?.error) setMessage(`danger:${result.error.code === '23505' ? 'That professional is already booked for this event.' : result.error.message}`)
    setBusy(false)
    reload()
  }

  const cancelEvent = async () => {
    if (!window.confirm('Cancel this event? Open roles will close and booked professionals will be notified.')) return
    setBusy(true)
    await supabase.from('job_posts').update({ status: 'cancelled' }).eq('event_id', event.id).in('status', ['open', 'filled'])
    await Promise.all(activeBookings.filter((b) => b.status !== 'completed').map((b) => supabase.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)))
    const { error: cancelError } = await supabase.from('events').update({ status: 'cancelled' }).eq('id', event.id)
    setBusy(false)
    if (cancelError) setMessage(`danger:${cancelError.message}`)
    else navigate('/hirer/events')
  }

  return <Workspace role="hirer">
    <PageHeader back={{ to: '/hirer/events', label: 'All events' }} eyebrow={event.event_type} title={event.event_name}
      actions={!cancelled && <><button className="btn btn-ghost danger-text" onClick={cancelEvent} disabled={busy}>Cancel event</button><NavLink to="/hirer/find-staff" className="btn btn-secondary"><Icon name="Search" size={16} />Find staff</NavLink></>} />
    <Alert tone={tone} onClose={() => setMessage('')}>{text}</Alert>

    <div className="event-summary card">
      <div><Icon name="CalendarDays" size={18} /><span>Date</span><strong>{formatDate(event.event_date)}</strong></div>
      <div><Icon name="Clock" size={18} /><span>Time</span><strong>{timeRange(event.start_time, event.end_time)}</strong></div>
      <div><Icon name="MapPin" size={18} /><span>Venue</span><strong>{event.location}</strong></div>
      <div><Icon name="Users" size={18} /><span>Staffed</span><strong>{activeBookings.length} / {needed}</strong></div>
      <div><Icon name="Wallet" size={18} /><span>Committed</span><strong>{money(totalCost * (1 + COMMISSION_RATE))}</strong></div>
      <div><Icon name="Activity" size={18} /><span>Status</span><StatusBadge map={EVENT_STATUS} value={event.status} /></div>
    </div>

    {jobs.map((job) => {
      const jobApps = apps.filter((app) => app.job_id === job.id)
        .map((app) => ({ app, staff: staffByUser.get(app.worker_id), worker: workerByUser.get(app.worker_id) }))
        .map((row) => ({ ...row, match: scoreWorkerForJob(toWorker(row.staff, row.worker), job).score }))
        .sort((a, b) => b.match - a.match)
      const jobBookings = bookings.filter((b) => b.job_id === job.id && b.status !== 'cancelled')
      const bookedStaffIds = new Set(bookings.filter((b) => b.status !== 'cancelled').map((b) => b.worker_id))
      const appliedUsers = new Set(jobApps.map((row) => row.app.worker_id))
      const recs = recommended.filter((s) => s.category === job.category && !bookedStaffIds.has(s.id) && !appliedUsers.has(s.user_id)).slice(0, 4)
      const directBookings = jobBookings.filter((b) => !b.application_id)

      return <section className="card role-card-block" key={job.id}>
        <header className="role-block-head">
          <CategoryIcon category={job.category} />
          <div><h2>{job.category}</h2><span className="muted">{money(job.budget)} per person · {jobApps.length} applicant{jobApps.length === 1 ? '' : 's'}</span></div>
          <div className="fill compact"><div className="progress"><div className="progress-bar" style={{ width: `${Math.min(100, (jobBookings.length / job.workers_required) * 100)}%` }} /></div><span>{jobBookings.length}/{job.workers_required} booked</span></div>
          <Badge tone={job.status === 'filled' ? 'success' : job.status === 'open' ? 'info' : 'neutral'}>{job.status === 'filled' ? 'Filled' : job.status === 'open' ? 'Hiring' : job.status}</Badge>
        </header>

        {jobApps.length > 0 && <div className="applicant-list">
          {jobApps.map(({ app, staff, worker }) => <Applicant key={app.id} app={app} job={job} staff={staff} worker={worker}
            booking={bookings.find((b) => b.application_id === app.id || (staff && b.worker_id === staff.id && b.job_id === job.id))} onAction={act} busy={busy} />)}
        </div>}

        {directBookings.length > 0 && <div className="applicant-list">
          {directBookings.map((b) => <div className="applicant" key={b.id}>
            <Avatar name={b.staff_profiles?.name} size="md" />
            <div className="applicant-main"><strong>{b.staff_profiles?.name}</strong><div className="meta"><Stars value={b.staff_profiles?.rating} /><span>Booked directly · {money(b.agreed_amount)}</span></div></div>
            <div className="applicant-side"><StatusBadge map={BOOKING_STATUS} value={b.status} /></div>
          </div>)}
        </div>}

        {!jobApps.length && !directBookings.length && job.status === 'open' && <p className="muted pad-x">No applicants yet — matched professionals have been notified. You can also book a recommended professional directly.</p>}

        {job.status === 'open' && !cancelled && recs.length > 0 && <div className="recs">
          <h3><Icon name="Sparkles" size={16} />Recommended {job.category.toLowerCase()}</h3>
          <div className="rec-grid">
            {recs.map((staff) => <div className="rec" key={staff.id}>
              <Avatar name={staff.name} size="sm" />
              <div><NavLink to={`/hirer/staff/${staff.id}`}><strong>{staff.name}</strong></NavLink><span className="muted small">{staff.location} · <Stars value={staff.rating} /></span></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setBooking({ staff, jobId: job.id })}>Book</button>
            </div>)}
          </div>
        </div>}
      </section>
    })}

    {!jobs.length && <EmptyState icon="ClipboardList" title="No roles on this event">This event was created before roles were attached.</EmptyState>}

    <BookModal open={!!booking} staff={booking?.staff} presetJobId={booking?.jobId} onClose={() => setBooking(null)} onBooked={reload} />
  </Workspace>
}
