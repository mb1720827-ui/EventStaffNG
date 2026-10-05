import { useState } from 'react'
import { NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BookModal from '../../components/BookModal'
import { EditEventModal, RoleModal } from '../../components/EventForm'
import { RatingTag, StarRow } from '../../components/Ratings'
import ReviewModal from '../../components/ReviewModal'
import Workspace from '../../components/Workspace'
import { Alert, Avatar, Badge, CategoryIcon, EmptyState, Icon, MatchPill, Modal, PageHeader, Spinner, StatusBadge, VerifiedBadge } from '../../components/ui'
import { APPLICATION_STATUS, BOOKING_STATUS, COMMISSION_RATE, EVENT_STATUS } from '../../lib/constants'
import { eventEnd, eventPhase, eventStart, formatDate, money, timeAgo, timeRange, timeUntil } from '../../lib/format'
import { scoreWorkerForJob } from '../../lib/matching'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'

async function loadEvent(id, hirerId) {
  await supabase.rpc('close_started_events') // keep status honest even without pg_cron
  const event = must(await supabase.from('events').select('*').eq('id', id).eq('hirer_id', hirerId).maybeSingle())
  if (!event) return null
  const [jobs, bookings, reviews] = await Promise.all([
    supabase.from('job_posts').select('*').eq('event_id', id).order('created_at'),
    supabase.from('bookings').select('*, staff_profiles(id,name,category,location,rating,review_count,is_verified,user_id), job_posts(category,role_title)').eq('event_id', id),
    supabase.from('reviews').select('booking_id,rating').eq('reviewer_id', hirerId),
  ])
  const jobRows = must(jobs)
  const jobIds = jobRows.map((job) => job.id)
  const apps = jobIds.length ? must(await supabase.from('job_applications').select('*').in('job_id', jobIds).order('applied_at', { ascending: false })) : []
  const applicantIds = [...new Set(apps.map((app) => app.worker_id).filter(Boolean))]
  const categories = [...new Set(jobRows.map((job) => job.category))]
  const [staffRes, workerRes, recRes] = await Promise.all([
    applicantIds.length ? supabase.from('staff_profiles').select('*').in('user_id', applicantIds) : { data: [] },
    applicantIds.length ? supabase.from('worker_profiles').select('user_id,primary_profession,state,city,area,minimum_rate,years_experience').in('user_id', applicantIds) : { data: [] },
    categories.length ? supabase.from('staff_profiles').select('*').in('category', categories).eq('is_verified', true).not('user_id', 'is', null).eq('is_available', true).order('rating', { ascending: false }).limit(60) : { data: [] },
  ])
  return {
    event, jobs: jobRows, bookings: must(bookings), apps,
    reviewed: new Map((reviews.data || []).map((r) => [r.booking_id, r.rating])),
    staffByUser: new Map((staffRes.data || []).map((row) => [row.user_id, row])),
    workerByUser: new Map((workerRes.data || []).map((row) => [row.user_id, row])),
    recommended: recRes.data || [],
  }
}

function toWorker(staff, worker) {
  return {
    ...staff, primary_profession: worker?.primary_profession || staff?.category, state: worker?.state || staff?.state,
    city: worker?.city || staff?.location, minimum_rate: worker?.minimum_rate, is_verified: staff?.is_verified === true,
    rating: staff?.rating, preferences: {}, skills: [], availability: [], documents: [],
  }
}

const roleName = (job) => job.role_title || job.category

function Applicant({ app, job, staff, worker, booking, onAction, busy, canHire }) {
  const match = scoreWorkerForJob(toWorker(staff, worker), job).score
  const name = staff?.name || app.worker_name
  const closed = ['Rejected', 'Withdrawn'].includes(app.status)
  return <div className={`applicant ${closed ? 'is-closed' : ''}`}>
    <Avatar name={name} size="md" />
    <div className="applicant-main">
      <div className="row wrap-gap"><strong>{name}</strong>{staff?.is_verified ? <VerifiedBadge compact /> : <Badge tone="warning" icon="Clock">Verification pending</Badge>}</div>
      <div className="meta"><RatingTag rating={staff?.rating} count={staff?.review_count} size="sm" />{worker?.years_experience ? <span>{worker.years_experience} yrs exp.</span> : null}{staff?.location && <span><Icon name="MapPin" size={13} />{staff.location}</span>}<span className="muted">Applied {timeAgo(app.applied_at)}</span></div>
      {app.cover_note && <p className="quote">“{app.cover_note}”</p>}
    </div>
    <div className="applicant-side">
      <MatchPill score={match} />
      {booking ? <StatusBadge map={BOOKING_STATUS} value={booking.status} /> : <StatusBadge map={APPLICATION_STATUS} value={app.status} />}
      {!booking && !closed && canHire && <div className="row">
        {staff && <NavLink to={`/hirer/staff/${staff.id}`} className="btn btn-ghost btn-sm">Profile</NavLink>}
        {app.status === 'Applied' && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => onAction('shortlist', app)}>Shortlist</button>}
        <button className="btn btn-ghost btn-sm danger-text" disabled={busy} onClick={() => onAction('reject', app)}>Decline</button>
        <button className="btn btn-primary btn-sm" disabled={busy || !staff} title={staff ? '' : 'This professional has not finished their marketplace profile yet'} onClick={() => onAction('hire', app, staff)}>Hire</button>
      </div>}
    </div>
  </div>
}

// After the event: confirm who actually worked, which releases their payout.
function CompleteModal({ open, bookings, onClose, onDone }) {
  const confirmed = bookings.filter((b) => b.status === 'confirmed')
  const [attended, setAttended] = useState({})
  const [busy, setBusy] = useState(false)
  const worked = (b) => attended[b.id] !== false
  const submit = async () => {
    setBusy(true)
    await Promise.all(confirmed.map((b) => supabase.from('bookings').update(
      worked(b) ? { status: 'completed' } : { status: 'cancelled', notes: [b.notes, 'Reported as a no-show by the client.'].filter(Boolean).join(' ') },
    ).eq('id', b.id)))
    setBusy(false)
    onDone()
  }
  return <Modal open={open} onClose={onClose} title="Complete event">
    <div className="form">
      <p>Confirm who worked your event. Their payouts are released and you can rate each of them next.</p>
      {confirmed.length ? <ul className="attend-list">{confirmed.map((b) => <li key={b.id}>
        <Avatar name={b.staff_profiles?.name} size="sm" />
        <div><strong>{b.staff_profiles?.name}</strong><span className="muted small">{b.job_posts?.role_title || b.job_posts?.category} · {money(b.agreed_amount)}</span></div>
        <div className="segmented sm">
          <button className={worked(b) ? 'active' : ''} onClick={() => setAttended({ ...attended, [b.id]: true })}>Worked</button>
          <button className={!worked(b) ? 'active danger' : ''} onClick={() => setAttended({ ...attended, [b.id]: false })}>No-show</button>
        </div>
      </li>)}</ul> : <p className="muted">No confirmed bookings — the event will simply be marked complete.</p>}
      <div className="modal-actions"><button className="btn btn-ghost" onClick={onClose}>Not yet</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : 'Confirm & complete'}</button></div>
    </div>
  </Modal>
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
  const [editing, setEditing] = useState(false)
  const [roleModal, setRoleModal] = useState(null) // { job } | { job: null }
  const [completing, setCompleting] = useState(false)
  const [rating, setRating] = useState(null)

  if (loading && !data) return <Workspace role="hirer"><Spinner /></Workspace>
  if (error || !data) return <Workspace role="hirer"><EmptyState icon="CalendarX" title="Event not found" action={<NavLink to="/hirer/events" className="btn btn-primary">Back to events</NavLink>}>{error?.message || 'It may have been removed.'}</EmptyState></Workspace>

  const { event, jobs, bookings, apps, reviewed, staffByUser, workerByUser, recommended } = data
  const [tone, text] = message.includes(':') ? message.split(/:(.*)/s) : ['info', message]
  const activeBookings = bookings.filter((b) => b.status !== 'cancelled')
  const needed = jobs.filter((j) => j.status !== 'cancelled').reduce((sum, job) => sum + job.workers_required, 0)
  const totalCost = activeBookings.reduce((sum, b) => sum + Number(b.agreed_amount), 0)
  const cancelled = event.status === 'cancelled'
  const completed = event.status === 'completed'
  const phase = eventPhase(event)
  const editable = !cancelled && !completed
  const canHire = editable && phase === 'upcoming'
  const toRate = bookings.filter((b) => b.status === 'completed')
  const unrated = toRate.filter((b) => !reviewed.has(b.id))

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

  const setRoleStatus = async (job, status) => {
    const booked = bookings.filter((b) => b.job_id === job.id && b.status !== 'cancelled').length
    const next = status === 'open' && booked >= job.workers_required ? 'filled' : status
    const { error: roleError } = await supabase.from('job_posts').update({ status: next }).eq('id', job.id)
    setMessage(roleError ? `danger:${roleError.message}` : status === 'closed' ? `info:Applications closed for ${roleName(job)}.` : `success:Applications reopened for ${roleName(job)}.`)
    reload()
  }

  const closeAll = async () => {
    await supabase.from('job_posts').update({ status: 'closed' }).eq('event_id', event.id).eq('status', 'open')
    setMessage('info:Applications are closed for every role.')
    reload()
  }

  const cancelEvent = async () => {
    if (!window.confirm('Cancel this event? Open roles will close and booked professionals will be notified.')) return
    setBusy(true)
    await supabase.from('job_posts').update({ status: 'cancelled' }).eq('event_id', event.id).in('status', ['open', 'filled', 'closed'])
    await Promise.all(activeBookings.filter((b) => b.status !== 'completed').map((b) => supabase.from('bookings').update({ status: 'cancelled' }).eq('id', b.id)))
    const { error: cancelError } = await supabase.from('events').update({ status: 'cancelled' }).eq('id', event.id)
    setBusy(false)
    if (cancelError) setMessage(`danger:${cancelError.message}`)
    else navigate('/hirer/events')
  }

  const finishEvent = async () => {
    await supabase.from('job_posts').update({ status: 'closed' }).eq('event_id', event.id).in('status', ['open', 'filled'])
    await supabase.from('events').update({ status: 'completed' }).eq('id', event.id)
    setCompleting(false)
    setMessage('success:Event completed and payouts queued. Now rate your team — it helps other clients and rewards great work.')
    reload()
  }

  const start = eventStart(event.event_date, event.start_time)
  const end = eventEnd(event.event_date, event.start_time, event.end_time)

  return <Workspace role="hirer">
    <PageHeader back={{ to: '/hirer/events', label: 'All events' }} eyebrow={event.event_type} title={event.event_name}
      actions={<>
        {editable && <button className="btn btn-ghost" onClick={() => setEditing(true)}><Icon name="Pencil" size={16} />Edit event</button>}
        <NavLink to={`/hirer/post-event?from=${event.id}`} className="btn btn-ghost"><Icon name="Copy" size={16} />Duplicate</NavLink>
        {editable && phase === 'upcoming' && <button className="btn btn-ghost danger-text" onClick={cancelEvent} disabled={busy}>Cancel event</button>}
      </>} />
    <Alert tone={tone} onClose={() => setMessage('')}>{text}</Alert>

    {!cancelled && <div className={`lifecycle lifecycle-${completed ? 'done' : phase}`}>
      <Icon name={completed ? 'CircleCheckBig' : phase === 'upcoming' ? 'Timer' : phase === 'live' ? 'Radio' : 'Flag'} size={22} />
      <div>
        <strong>{completed ? 'Event completed' : phase === 'upcoming' ? `Starts in ${timeUntil(start)}` : phase === 'live' ? 'Event in progress' : 'This event has ended'}</strong>
        <p>{completed ? (unrated.length ? `${unrated.length} professional${unrated.length === 1 ? '' : 's'} still to rate.` : 'Thanks for rating your team.')
          : phase === 'upcoming' ? 'Applications close automatically when the event starts. Unaccepted offers lapse at that time.'
          : phase === 'live' ? `Applications are closed. Ends in ${timeUntil(end)}.`
          : 'Confirm who worked so their payouts are released, then rate your team.'}</p>
      </div>
      {!completed && phase === 'upcoming' && jobs.some((j) => j.status === 'open') && <button className="btn btn-secondary btn-sm" onClick={closeAll}>Close all applications</button>}
      {!completed && phase !== 'upcoming' && <button className="btn btn-primary" onClick={() => setCompleting(true)}><Icon name="CircleCheck" size={16} />Complete event</button>}
      {completed && unrated.length > 0 && <button className="btn btn-accent" onClick={() => setRating(unrated[0])}><Icon name="Star" size={16} />Rate your team</button>}
    </div>}

    <div className="event-summary card">
      <div><Icon name="CalendarDays" size={18} /><span>Date</span><strong>{formatDate(event.event_date)}</strong></div>
      <div><Icon name="Clock" size={18} /><span>Time</span><strong>{timeRange(event.start_time, event.end_time)}</strong></div>
      <div><Icon name="MapPin" size={18} /><span>Venue</span><strong>{event.location}</strong></div>
      <div><Icon name="Users" size={18} /><span>Staffed</span><strong>{activeBookings.length} / {needed}</strong></div>
      <div><Icon name="Wallet" size={18} /><span>Committed</span><strong>{money(totalCost * (1 + COMMISSION_RATE))}</strong></div>
      <div><Icon name="Activity" size={18} /><span>Status</span><StatusBadge map={EVENT_STATUS} value={event.status} /></div>
    </div>

    {toRate.length > 0 && <section className="card team-card">
      <header className="card-head"><h2><Icon name="Star" size={18} />Your team’s ratings</h2><span className="muted small">{toRate.length - unrated.length}/{toRate.length} rated</span></header>
      <ul className="team-list">{toRate.map((b) => <li key={b.id}>
        <Avatar name={b.staff_profiles?.name} size="sm" />
        <div><NavLink to={`/hirer/staff/${b.staff_profiles?.id}`}><strong>{b.staff_profiles?.name}</strong></NavLink><span className="muted small">{b.job_posts?.role_title || b.job_posts?.category}</span></div>
        {reviewed.has(b.id) ? <span className="row"><StarRow value={reviewed.get(b.id)} size={14} /><span className="muted small">Rated</span></span>
          : <button className="btn btn-accent btn-sm" onClick={() => setRating(b)}><Icon name="Star" size={14} />Rate</button>}
      </li>)}</ul>
    </section>}

    {jobs.filter((job) => job.status !== 'cancelled' || cancelled).map((job) => {
      const jobApps = apps.filter((app) => app.job_id === job.id)
        .map((app) => ({ app, staff: staffByUser.get(app.worker_id), worker: workerByUser.get(app.worker_id) }))
        .map((row) => ({ ...row, match: scoreWorkerForJob(toWorker(row.staff, row.worker), job).score }))
        .sort((a, b) => b.match - a.match)
      const jobBookings = bookings.filter((b) => b.job_id === job.id && b.status !== 'cancelled')
      const bookedStaffIds = new Set(activeBookings.map((b) => b.worker_id))
      const appliedUsers = new Set(jobApps.map((row) => row.app.worker_id))
      const recs = recommended.filter((s) => s.category === job.category && !bookedStaffIds.has(s.id) && !appliedUsers.has(s.user_id)).slice(0, 4)
      const directBookings = jobBookings.filter((b) => !b.application_id)
      const roleBadge = { filled: ['success', 'Filled'], open: ['info', 'Hiring'], closed: ['neutral', 'Applications closed'], cancelled: ['danger', 'Cancelled'] }[job.status] || ['neutral', job.status]

      return <section className="card role-card-block" key={job.id}>
        <header className="role-block-head">
          <CategoryIcon category={job.category} />
          <div><h2>{roleName(job)}</h2><span className="muted">{job.role_title ? `${job.category} · ` : ''}{money(job.budget)} per person · {jobApps.length} applicant{jobApps.length === 1 ? '' : 's'}</span></div>
          <div className="fill compact"><div className="progress"><div className="progress-bar" style={{ width: `${Math.min(100, (jobBookings.length / job.workers_required) * 100)}%` }} /></div><span>{jobBookings.length}/{job.workers_required} booked</span></div>
          <Badge tone={roleBadge[0]}>{roleBadge[1]}</Badge>
          {editable && <div className="row">
            {canHire && job.status === 'open' && <button className="btn btn-ghost btn-sm" onClick={() => setRoleStatus(job, 'closed')}>Close applications</button>}
            {canHire && job.status === 'closed' && <button className="btn btn-ghost btn-sm" onClick={() => setRoleStatus(job, 'open')}>Reopen</button>}
            <button className="icon-btn ghost" onClick={() => setRoleModal({ job })} aria-label={`Edit ${roleName(job)}`}><Icon name="Pencil" size={16} /></button>
          </div>}
        </header>

        {jobApps.length > 0 && <div className="applicant-list">
          {jobApps.map(({ app, staff, worker }) => <Applicant key={app.id} app={app} job={job} staff={staff} worker={worker} canHire={canHire}
            booking={bookings.find((b) => b.application_id === app.id || (staff && b.worker_id === staff.id && b.job_id === job.id))} onAction={act} busy={busy} />)}
        </div>}

        {directBookings.length > 0 && <div className="applicant-list">
          {directBookings.map((b) => <div className="applicant" key={b.id}>
            <Avatar name={b.staff_profiles?.name} size="md" />
            <div className="applicant-main"><strong>{b.staff_profiles?.name}</strong><div className="meta"><RatingTag rating={b.staff_profiles?.rating} count={b.staff_profiles?.review_count} size="sm" /><span>Booked directly · {money(b.agreed_amount)}</span></div></div>
            <div className="applicant-side"><StatusBadge map={BOOKING_STATUS} value={b.status} /></div>
          </div>)}
        </div>}

        {!jobApps.length && !directBookings.length && job.status === 'open' && <p className="muted pad-x">No applicants yet — matched professionals have been notified. You can also book a recommended professional directly.</p>}

        {job.status === 'open' && canHire && recs.length > 0 && <div className="recs">
          <h3><Icon name="Sparkles" size={16} />Recommended {job.category.toLowerCase()}</h3>
          <div className="rec-grid">
            {recs.map((staff) => <div className="rec" key={staff.id}>
              <Avatar name={staff.name} size="sm" />
              <div><NavLink to={`/hirer/staff/${staff.id}`}><strong>{staff.name}</strong></NavLink><span className="muted small">{staff.location}</span><RatingTag rating={staff.rating} count={staff.review_count} size="sm" /></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setBooking({ staff, jobId: job.id })}>Book</button>
            </div>)}
          </div>
        </div>}
      </section>
    })}

    {editable && <button className="add-role-btn" onClick={() => setRoleModal({ job: null })}><Icon name="Plus" size={18} />Add another role to this event</button>}
    {!jobs.length && !editable && <EmptyState icon="ClipboardList" title="No roles on this event" />}

    <div className="center-row"><NavLink to="/hirer/post-event" className="btn btn-secondary"><Icon name="CalendarPlus" size={16} />Post another event</NavLink></div>

    <BookModal open={!!booking} staff={booking?.staff} presetJobId={booking?.jobId} onClose={() => setBooking(null)} onBooked={reload} />
    <EditEventModal open={editing} event={event} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setMessage('success:Event updated. Anyone affected has been notified.'); reload() }} />
    <RoleModal open={!!roleModal} event={event} job={roleModal?.job || null}
      bookedCount={roleModal?.job ? bookings.filter((b) => b.job_id === roleModal.job.id && b.status !== 'cancelled').length : 0}
      hasApplicants={roleModal?.job ? apps.some((a) => a.job_id === roleModal.job.id) : false}
      onClose={() => setRoleModal(null)} onSaved={() => { setRoleModal(null); setMessage('success:Role saved.'); reload() }} />
    <CompleteModal open={completing} bookings={bookings} onClose={() => setCompleting(false)} onDone={finishEvent} />
    <ReviewModal booking={rating} onClose={() => setRating(null)} onDone={(done) => {
      const next = unrated.find((b) => b.id !== done.id)
      setRating(next || null)
      setMessage(next ? `success:Thanks! Next: ${next.staff_profiles?.name}.` : 'success:Thanks — your ratings are now on their profiles.')
      reload()
    }} />
  </Workspace>
}
