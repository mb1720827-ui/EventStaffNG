import { useState } from 'react'
import { NavLink, useParams } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Alert, CategoryIcon, EmptyState, Field, Icon, MatchPill, Modal, PageHeader, Spinner, StatusBadge } from '../../components/ui'
import { APPLICATION_STATUS } from '../../lib/constants'
import { eventStart, formatDate, hasStarted, hoursBetween, money, timeRange, timeUntil } from '../../lib/format'
import { scoreJobForWorker } from '../../lib/matching'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'
import { loadWorkerContext } from '../../lib/workerContext'

export default function JobDetail() {
  const { id } = useParams()
  const { session, profile } = useSession()
  const [applyOpen, setApplyOpen] = useState(false)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState({ busy: false, tone: '', text: '' })

  const { data, loading, reload } = useLoader(async () => {
    const [job, ctx, app] = await Promise.all([
      supabase.from('job_posts').select('*, events(event_name,event_type,guest_count,instructions,venue)').eq('id', id).maybeSingle(),
      loadWorkerContext(session.user.id),
      supabase.from('job_applications').select('*').eq('job_id', id).eq('worker_id', session.user.id).maybeSingle(),
    ])
    const row = must(job)
    return { job: row, ctx, application: app.data, match: row ? scoreJobForWorker(row, ctx.worker) : null }
  }, [id, session])

  if (loading && !data) return <Workspace role="worker"><Spinner /></Workspace>
  if (!data?.job) return <Workspace role="worker"><EmptyState icon="SearchX" title="This job is no longer available" action={<NavLink to="/worker/jobs" className="btn btn-primary">Browse jobs</NavLink>}>It may have been filled or cancelled.</EmptyState></Workspace>

  const { job, ctx, application, match } = data
  const hours = hoursBetween(job.start_time, job.end_time)
  const started = hasStarted(job)
  const closed = job.status !== 'open' || started
  const canApply = !closed && (!application || application.status === 'Withdrawn')
  const profileMissing = !ctx.profile

  const apply = async (event) => {
    event.preventDefault()
    setStatus({ busy: true, tone: '', text: '' })
    const payload = { job_id: job.id, worker_id: session.user.id, worker_name: profile?.full_name || session.user.email, cover_note: note || null, status: 'Applied' }
    const { error } = application
      ? await supabase.from('job_applications').update({ status: 'Applied', cover_note: note || null }).eq('id', application.id)
      : await supabase.from('job_applications').insert(payload)
    if (error) return setStatus({ busy: false, tone: 'danger', text: error.message })
    setApplyOpen(false)
    setStatus({ busy: false, tone: 'success', text: 'Application sent! The hirer has been notified — we\'ll let you know when they respond.' })
    reload()
  }

  const withdraw = async () => {
    if (!window.confirm('Withdraw your application?')) return
    await supabase.from('job_applications').update({ status: 'Withdrawn' }).eq('id', application.id)
    setStatus({ busy: false, tone: 'info', text: 'Application withdrawn.' })
    reload()
  }

  return <Workspace role="worker">
    <PageHeader back={{ to: '/worker/jobs', label: 'All jobs' }} title="" />
    <Alert tone={status.tone} onClose={() => setStatus({ ...status, text: '' })}>{status.text}</Alert>
    <section className="job-hero card">
      <div className="job-hero-main">
        <div className="row wrap-gap"><CategoryIcon category={job.category} /><span className="muted">{job.category}</span>{job.events?.event_type && <span className="muted">· {job.events.event_type}</span>}</div>
        <h1>{job.events?.event_name || job.title}</h1>
        {job.role_title && <p className="staff-role lg">Role: {job.role_title}</p>}
        <div className="meta lg"><span><Icon name="CalendarDays" size={16} />{formatDate(job.event_date)}</span><span><Icon name="Clock" size={16} />{timeRange(job.start_time, job.end_time)} ({hours}h)</span><span><Icon name="MapPin" size={16} />{job.location}</span></div>
      </div>
      <div className="job-hero-side">
        <div className="rate"><span>Pay per person</span><strong>{money(job.budget)}</strong>{hours > 0 && <span className="muted small">≈ {money(job.budget / hours)}/hour</span>}</div>
        {application && application.status !== 'Withdrawn'
          ? <><StatusBadge map={APPLICATION_STATUS} value={application.status} />{['Applied', 'Shortlisted'].includes(application.status) && <button className="btn btn-ghost btn-sm" onClick={withdraw}>Withdraw</button>}</>
          : canApply ? <><button className="btn btn-primary btn-lg" onClick={() => setApplyOpen(true)}>Apply now</button><span className="muted small center-text">Applications close in {timeUntil(eventStart(job.event_date, job.start_time))}</span></>
          : <div className="closed-note"><Icon name="Lock" size={16} />{started ? 'This event has started — applications are closed.' : job.status === 'filled' ? 'All positions have been filled.' : 'The client has closed applications.'}</div>}
      </div>
    </section>

    <div className="profile-layout">
      <div className="stack">
        <section className="card card-pad">
          <h2 className="card-title">About this job</h2>
          {job.description ? job.description.split('\n\n').map((para, i) => <p key={i}>{para}</p>) : <p className="muted">The client hasn't added role-specific instructions.</p>}
          {job.events?.instructions && <p className="note"><Icon name="StickyNote" size={16} />{job.events.instructions}</p>}
          <dl className="facts">
            <div><dt>Positions</dt><dd>{job.workers_required}</dd></div>
            {job.events?.guest_count && <div><dt>Guests</dt><dd>{job.events.guest_count}</dd></div>}
            <div><dt>Venue</dt><dd>{job.location}</dd></div>
          </dl>
        </section>
        <section className="card card-pad tint">
          <h3><Icon name="ShieldCheck" size={18} />Protected by EventStaff NG</h3>
          <p className="small">Your pay is held by the platform and released after the hirer marks the job complete. You're covered by our on-the-job insurance while working this booking.</p>
        </section>
      </div>
      <aside className="card card-pad">
        <div className="row between"><h2 className="card-title">Your match</h2><MatchPill score={match.score} /></div>
        <ul className="match-breakdown">
          {match.breakdown.map((factor) => <li key={factor.key}>
            <div className="row between"><span>{factor.label}</span><span className="muted small">{factor.weight}%</span></div>
            <div className="progress thin"><div className={`progress-bar ${factor.value >= 0.8 ? '' : factor.value >= 0.5 ? 'mid' : 'low'}`} style={{ width: `${Math.round(factor.value * 100)}%` }} /></div>
          </li>)}
        </ul>
        <p className="muted small">Improve your score by keeping your profile, availability and documents up to date. <NavLink to="/worker/profile/edit">Edit profile</NavLink></p>
      </aside>
    </div>

    <Modal open={applyOpen} onClose={() => setApplyOpen(false)} title="Apply for this job">
      <form className="form" onSubmit={apply}>
        {profileMissing && <Alert tone="warning">Your professional profile isn't set up yet. Hirers will see very little about you — <NavLink to="/worker/profile/edit">complete it first</NavLink> for a better chance.</Alert>}
        <p className="muted">{job.events?.event_name} · {formatDate(job.event_date)} · {money(job.budget)}</p>
        <Field label="Note to the hirer" hint="Mention relevant experience, and confirm you can arrive on time."><textarea rows="4" value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} placeholder="I've worked 30+ weddings as a banquet server and can arrive by 3pm…" /></Field>
        <Alert tone="danger">{status.tone === 'danger' ? status.text : ''}</Alert>
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setApplyOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={status.busy}>{status.busy ? 'Sending…' : 'Send application'}</button></div>
      </form>
    </Modal>
  </Workspace>
}
