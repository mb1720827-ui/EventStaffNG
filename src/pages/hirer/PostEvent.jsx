import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EventFields, blankEvent, eventToForm, formToEvent } from '../../components/EventForm'
import Workspace from '../../components/Workspace'
import { Alert, CategoryIcon, Field, Icon, PageHeader } from '../../components/ui'
import { CATEGORY_TITLES, COMMISSION_RATE, LAUNCH_STATES } from '../../lib/constants'
import { formatDate, hoursBetween, money, timeRange } from '../../lib/format'
import { CATEGORY_INSTRUCTIONS, DEFAULT_BUDGETS, EVENT_TYPES, generateStaffingRecommendations } from '../../lib/matching'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'

const STEPS = ['Event details', 'Staffing plan', 'Review & publish']
let rowId = 0
const makeRow = (category, count = 1, budget, instructions, reason = '', title = '') => ({
  key: ++rowId, category, title, count, recommended: reason ? count : null, reason,
  budget: budget ?? DEFAULT_BUDGETS[category] ?? 20000,
  instructions: instructions ?? CATEGORY_INSTRUCTIONS[category] ?? '',
})

export default function PostEvent() {
  const { session } = useSession()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [step, setStep] = useState(0)
  const presetState = LAUNCH_STATES.includes(params.get('state')) ? params.get('state') : LAUNCH_STATES[0]
  const [event, setEvent] = useState(() => blankEvent({
    type: EVENT_TYPES.includes(params.get('type')) ? params.get('type') : 'Wedding',
    date: params.get('date') || '', state: presetState, guests: params.get('guests') || '',
  }))
  const presetCategory = CATEGORY_TITLES.includes(params.get('category')) ? params.get('category') : null
  const [rows, setRows] = useState([])
  const [planFor, setPlanFor] = useState('')
  const [status, setStatus] = useState({ busy: false, error: '' })

  const hours = hoursBetween(event.start, event.end)
  const overnight = event.end && event.start && event.end <= event.start
  const fromId = params.get('from')

  // Duplicate an earlier event: copy its details and roles, but not its date.
  useEffect(() => {
    if (!fromId) return
    Promise.all([
      supabase.from('events').select('*').eq('id', fromId).maybeSingle(),
      supabase.from('job_posts').select('category,role_title,workers_required,budget,description').eq('event_id', fromId).neq('status', 'cancelled').order('created_at'),
    ]).then(([ev, jobs]) => {
      if (!ev.data) return
      setEvent({ ...eventToForm(ev.data), name: `${ev.data.event_name} (copy)`, date: '' })
      setRows((jobs.data || []).map((job) => makeRow(job.category, job.workers_required, job.budget, job.description || '', '', job.role_title || '')))
      setPlanFor('copy')
    })
  }, [fromId])
  const activeRows = rows.filter((row) => Number(row.count) > 0)
  const staffCost = activeRows.reduce((sum, row) => sum + Number(row.count) * Number(row.budget || 0), 0)
  const headcount = activeRows.reduce((sum, row) => sum + Number(row.count), 0)
  const signature = `${event.type}|${event.guests}|${hours}`

  const buildPlan = () => {
    const recs = generateStaffingRecommendations({ eventType: event.type, guestCount: event.guests, durationHours: hours })
    const next = recs.map((rec) => makeRow(rec.category, rec.recommended, rec.defaultBudget, rec.instructions, rec.reason))
    if (presetCategory && !next.some((row) => row.category === presetCategory)) next.unshift(makeRow(presetCategory, 1))
    setRows(next)
    setPlanFor(signature)
  }

  const goToPlan = (e) => {
    e.preventDefault()
    if (!rows.length || (planFor !== signature && planFor !== 'copy')) buildPlan()
    setStep(1)
  }

  const updateRow = (key, patch) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const publish = async () => {
    setStatus({ busy: true, error: '' })
    const fields = formToEvent(event)
    const location = fields.location
    const { data: created, error } = await supabase.from('events').insert({ ...fields, hirer_id: session.user.id, status: 'matching' }).select().single()
    if (error) return setStatus({ busy: false, error: error.message })

    const requirements = activeRows.map((row) => ({
      event_id: created.id, category: row.category, workers_required: Number(row.count),
      budget: Number(row.budget || 0), special_requirements: row.instructions || null,
    }))
    const jobs = activeRows.map((row) => ({
      event_id: created.id, hirer_id: session.user.id, title: `${event.name} — ${row.title.trim() || row.category}`, role_title: row.title.trim() || null, category: row.category,
      location, state: event.state, area: event.area || null, event_date: event.date, start_time: event.start, end_time: event.end,
      workers_required: Number(row.count), budget: Number(row.budget || 0),
      description: row.instructions || null, status: 'open',
    }))
    const [reqResult, jobResult] = await Promise.all([
      supabase.from('event_requirements').insert(requirements),
      supabase.from('job_posts').insert(jobs),
    ])
    const failure = reqResult.error || jobResult.error
    if (failure) return setStatus({ busy: false, error: `Your event was saved but some roles failed to publish: ${failure.message}` })
    navigate(`/hirer/events/${created.id}?published=1`)
  }

  return <Workspace role="hirer">
    <PageHeader eyebrow="Post an event" title="Let's staff your event" description="Tell us about the occasion — we'll recommend a team, and your roles go live to matched professionals as soon as you publish." />

    <ol className="wizard-steps">
      {STEPS.map((label, index) => <li key={label} className={index === step ? 'current' : index < step ? 'done' : ''}>
        <span>{index < step ? <Icon name="Check" size={14} /> : index + 1}</span>{label}
      </li>)}
    </ol>

    {step === 0 && <form className="card card-pad form" onSubmit={goToPlan}>
      <h2 className="card-title">Event details</h2>
      <EventFields value={event} onChange={setEvent} />
      <div className="form-actions"><span /><button className="btn btn-primary btn-lg">Continue to staffing plan<Icon name="ArrowRight" size={16} /></button></div>
    </form>}

    {step === 1 && <div className="stack-lg">
      <div className="ai-banner">
        <span className="ai-icon"><Icon name="Sparkles" size={22} /></span>
        <div><strong>Recommended for a {event.guests}-guest {event.type.toLowerCase()}{hours ? `, ${hours} hours` : ''}</strong><p>Adjust headcounts and rates freely — remove anything you've already sorted.</p></div>
        <button className="btn btn-ghost btn-sm" onClick={buildPlan}><Icon name="RefreshCw" size={15} />Reset to recommendation</button>
      </div>

      <div className="plan-rows">
        {rows.map((row) => <div className={`plan-row ${Number(row.count) > 0 ? '' : 'muted-row'}`} key={row.key}>
          <div className="plan-row-head">
            <CategoryIcon category={row.category} size={20} />
            <div><strong>{row.title.trim() || row.category}</strong><span className="muted small">{row.title.trim() ? row.category : row.reason}</span></div>
            <button className="icon-btn ghost" onClick={() => setRows(rows.filter((item) => item.key !== row.key))} aria-label={`Remove ${row.category}`}><Icon name="Trash2" size={17} /></button>
          </div>
          <div className="plan-row-fields">
            <Field label="How many">
              <div className="stepper">
                <button type="button" onClick={() => updateRow(row.key, { count: Math.max(0, Number(row.count) - 1) })} aria-label="Fewer"><Icon name="Minus" size={16} /></button>
                <input type="number" min="0" value={row.count} onChange={(e) => updateRow(row.key, { count: e.target.value })} />
                <button type="button" onClick={() => updateRow(row.key, { count: Number(row.count) + 1 })} aria-label="More"><Icon name="Plus" size={16} /></button>
              </div>
            </Field>
            <Field label="Rate per person (₦)"><input type="number" min="0" step="500" value={row.budget} onChange={(e) => updateRow(row.key, { budget: e.target.value })} /></Field>
            <div className="plan-row-total"><span>Subtotal</span><strong>{money(Number(row.count) * Number(row.budget || 0))}</strong></div>
          </div>
          <Field label="Role title (optional)" hint="Name it to post two roles in one category, e.g. “Head waiter” and “Servers”."><input value={row.title} maxLength={60} onChange={(e) => updateRow(row.key, { title: e.target.value })} placeholder={row.category} /></Field>
          <Field label="Role instructions"><textarea rows="2" value={row.instructions} onChange={(e) => updateRow(row.key, { instructions: e.target.value })} /></Field>
        </div>)}
        {!rows.length && <div className="empty small">No roles yet — add one below.</div>}
      </div>

      <div className="add-role">
        <span className="muted">Add another role:</span>
        {CATEGORY_TITLES.map((title) => <button key={title} className="chip" onClick={() => setRows([...rows, makeRow(title, 1, undefined, undefined, '', rows.some((row) => row.category === title) ? `${title.split(' / ')[0]} (2)` : '')])}><Icon name="Plus" size={14} />{title}</button>)}
      </div>

      <div className="sticky-summary">
        <div><span>{headcount} people · {activeRows.length} roles</span><strong>{money(staffCost)}</strong><small>+ {money(staffCost * COMMISSION_RATE)} service fee when booked</small></div>
        <div className="row">
          <button className="btn btn-ghost" onClick={() => setStep(0)}><Icon name="ArrowLeft" size={16} />Back</button>
          <button className="btn btn-primary" disabled={!activeRows.length} onClick={() => setStep(2)}>Review<Icon name="ArrowRight" size={16} /></button>
        </div>
      </div>
    </div>}

    {step === 2 && <div className="review-grid">
      <section className="card card-pad">
        <h2 className="card-title">{event.name}</h2>
        <dl className="facts">
          <div><dt>Type</dt><dd>{event.type}</dd></div>
          <div><dt>Date</dt><dd>{formatDate(event.date)}</dd></div>
          <div><dt>Time</dt><dd>{timeRange(event.start, event.end)}{overnight ? ' (next day)' : ''}</dd></div>
          <div><dt>Venue</dt><dd>{[event.venue, event.area, event.state].filter(Boolean).join(', ')}</dd></div>
          <div><dt>Guests</dt><dd>{event.guests}</dd></div>
        </dl>
        {event.instructions && <p className="note"><Icon name="StickyNote" size={16} />{event.instructions}</p>}
        <h3 className="sub-title">Roles to publish</h3>
        <ul className="role-summary">
          {activeRows.map((row) => <li key={row.key}><CategoryIcon category={row.category} size={16} /><span>{row.count} × {row.title.trim() || row.category}</span><strong>{money(row.budget)} each</strong></li>)}
        </ul>
        <button className="link-btn" onClick={() => setStep(1)}><Icon name="Pencil" size={14} />Edit staffing plan</button>
      </section>
      <aside className="card card-pad cost-card">
        <h3>Estimated cost</h3>
        <dl className="breakdown">
          <div><dt>Staff pay ({headcount} people)</dt><dd>{money(staffCost)}</dd></div>
          <div><dt>Service fee ({COMMISSION_RATE * 100}%)</dt><dd>{money(staffCost * COMMISSION_RATE)}</dd></div>
          <div className="total"><dt>Total if fully booked</dt><dd>{money(staffCost * (1 + COMMISSION_RATE))}</dd></div>
        </dl>
        <p className="muted small">Nothing is charged now. You only pay for professionals you book.</p>
        <Alert tone="danger">{status.error}</Alert>
        <button className="btn btn-primary btn-lg btn-block" onClick={publish} disabled={status.busy}>{status.busy ? 'Publishing…' : 'Publish to marketplace'}</button>
        <button className="btn btn-ghost btn-block" onClick={() => setStep(1)}>Back</button>
        <ul className="checklist">
          <li><Icon name="Bell" size={15} />Matched professionals are notified instantly</li>
          <li><Icon name="Users" size={15} />Applicants appear on your event page, ranked by fit</li>
        </ul>
      </aside>
    </div>}
  </Workspace>
}
