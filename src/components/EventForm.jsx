import { useEffect, useState } from 'react'
import { CATEGORY_TITLES, LAUNCH_STATES, STATE_AREAS } from '../lib/constants'
import { hoursBetween } from '../lib/format'
import { CATEGORY_INSTRUCTIONS, DEFAULT_BUDGETS, EVENT_TYPES } from '../lib/matching'
import { supabase } from '../lib/supabase'
import { Alert, Field, Modal } from './ui'

const today = () => new Date().toISOString().slice(0, 10)

export const blankEvent = (overrides = {}) => ({
  name: '', type: 'Wedding', date: '', start: '16:00', end: '22:00', state: LAUNCH_STATES[0],
  area: '', venue: '', guests: '', instructions: '', ...overrides,
})

export const eventToForm = (event) => blankEvent({
  name: event.event_name, type: event.event_type, date: event.event_date, start: event.start_time?.slice(0, 5), end: event.end_time?.slice(0, 5),
  state: event.state || LAUNCH_STATES[0], area: event.area || '', venue: event.venue || event.location || '', guests: String(event.guest_count || ''), instructions: event.instructions || '',
})

export const formToEvent = (form) => ({
  event_name: form.name, event_type: form.type, event_date: form.date, start_time: form.start, end_time: form.end,
  location: [form.venue, form.area, form.state].filter(Boolean).join(', '), state: form.state, area: form.area || null,
  venue: form.venue, guest_count: Number(form.guests), instructions: form.instructions || null,
})

export function EventFields({ value, onChange, allowPastDate = false }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value })
  const hours = hoursBetween(value.start, value.end)
  const overnight = value.end && value.start && value.end <= value.start
  return <>
    <div className="field-row">
      <Field label="Event name" required><input value={value.name} onChange={set('name')} required placeholder="e.g. Annual staff party" /></Field>
      <Field label="Event type" required><select value={value.type} onChange={set('type')}>{EVENT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></Field>
    </div>
    <div className="field-row three">
      <Field label="Date" required><input type="date" min={allowPastDate ? undefined : today()} value={value.date} onChange={set('date')} required /></Field>
      <Field label="Start time" required><input type="time" value={value.start} onChange={set('start')} required /></Field>
      <Field label="End time" required hint={overnight ? `Ends the next morning · ${hours} hours` : hours ? `${hours} hours` : ''}><input type="time" value={value.end} onChange={set('end')} required /></Field>
    </div>
    <div className="field-row three">
      <Field label="State" required><select value={value.state} onChange={(e) => onChange({ ...value, state: e.target.value, area: '' })}>{LAUNCH_STATES.map((item) => <option key={item}>{item}</option>)}</select></Field>
      <Field label="Area" required>
        <input list="area-options" value={value.area} onChange={set('area')} required placeholder="e.g. Victoria Island" />
        <datalist id="area-options">{(STATE_AREAS[value.state] || []).map((item) => <option key={item} value={item} />)}</datalist>
      </Field>
      <Field label="Expected guests" required><input type="number" min="1" value={value.guests} onChange={set('guests')} required placeholder="300" /></Field>
    </div>
    <Field label="Venue name & address" required><input value={value.venue} onChange={set('venue')} required placeholder="Venue name, street address" /></Field>
    <Field label="Instructions for all staff" hint="Dress code, arrival point, parking, who to report to."><textarea rows="3" value={value.instructions} onChange={set('instructions')} /></Field>
  </>
}

export function EditEventModal({ event, open, onClose, onSaved }) {
  const [form, setForm] = useState(() => eventToForm(event))
  const [status, setStatus] = useState({ busy: false, error: '' })
  useEffect(() => { if (open) { setForm(eventToForm(event)); setStatus({ busy: false, error: '' }) } }, [open, event])

  const save = async (e) => {
    e.preventDefault()
    setStatus({ busy: true, error: '' })
    const patch = formToEvent(form)
    // Moving an event that had started back into the future reopens it for hiring.
    const startsInFuture = new Date(`${form.date}T${form.start}:00+01:00`) > new Date()
    if (event.status === 'in_progress' && startsInFuture) patch.status = 'matching'
    const { error } = await supabase.from('events').update(patch).eq('id', event.id)
    if (error) return setStatus({ busy: false, error: error.message })
    onSaved?.()
  }

  return <Modal open={open} onClose={onClose} title="Edit event" size="lg">
    <form className="form" onSubmit={save}>
      <EventFields value={form} onChange={setForm} allowPastDate />
      <p className="muted small">Booked professionals and active applicants are notified automatically if the date, time or venue changes.</p>
      <Alert tone="danger">{status.error}</Alert>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={status.busy}>{status.busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  </Modal>
}

// Add a role to an existing event, or edit one. `job` is null when adding.
export function RoleModal({ event, job, bookedCount = 0, hasApplicants = false, open, onClose, onSaved }) {
  const [form, setForm] = useState({})
  const [status, setStatus] = useState({ busy: false, error: '' })
  useEffect(() => {
    if (!open) return
    setStatus({ busy: false, error: '' })
    setForm(job
      ? { category: job.category, title: job.role_title || '', count: String(job.workers_required), budget: String(job.budget), instructions: job.description || '' }
      : { category: CATEGORY_TITLES[0], title: '', count: '1', budget: String(DEFAULT_BUDGETS[CATEGORY_TITLES[0]]), instructions: CATEGORY_INSTRUCTIONS[CATEGORY_TITLES[0]] || '' })
  }, [open, job])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const save = async (e) => {
    e.preventDefault()
    if (Number(form.count) < bookedCount) return setStatus({ busy: false, error: `You've already booked ${bookedCount} for this role. Cancel bookings first to go lower.` })
    setStatus({ busy: true, error: '' })
    const roleName = form.title.trim() || form.category
    let result
    if (job) {
      const patch = { role_title: form.title.trim() || null, workers_required: Number(form.count), budget: Number(form.budget), description: form.instructions || null, title: `${event.event_name} — ${roleName}` }
      if (job.status === 'filled' && Number(form.count) > bookedCount) patch.status = 'open'
      if (job.status === 'open' && Number(form.count) <= bookedCount) patch.status = 'filled'
      result = await supabase.from('job_posts').update(patch).eq('id', job.id)
    } else {
      result = await supabase.from('job_posts').insert({
        event_id: event.id, hirer_id: event.hirer_id, title: `${event.event_name} — ${roleName}`, role_title: form.title.trim() || null, category: form.category,
        location: event.location, state: event.state, area: event.area, event_date: event.event_date, start_time: event.start_time, end_time: event.end_time,
        workers_required: Number(form.count), budget: Number(form.budget), description: form.instructions || null, status: 'open',
      })
      if (!result.error) await supabase.from('event_requirements').insert({ event_id: event.id, category: form.category, workers_required: Number(form.count), budget: Number(form.budget), special_requirements: form.instructions || null })
    }
    if (result.error) return setStatus({ busy: false, error: result.error.message })
    onSaved?.()
  }

  return <Modal open={open} onClose={onClose} title={job ? 'Edit role' : 'Add a role'}>
    <form className="form" onSubmit={save}>
      <div className="field-row">
        <Field label="Staff category" hint={job && hasApplicants ? 'Locked — people have already applied.' : null}>
          <select value={form.category || ''} disabled={!!job && hasApplicants} onChange={(e) => setForm({ ...form, category: e.target.value, budget: job ? form.budget : String(DEFAULT_BUDGETS[e.target.value] || 20000), instructions: job ? form.instructions : CATEGORY_INSTRUCTIONS[e.target.value] || '' })}>
            {CATEGORY_TITLES.map((item) => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Role title" hint="Optional, e.g. “Head waiter” or “VIP bartender”."><input value={form.title || ''} onChange={set('title')} maxLength={60} /></Field>
      </div>
      <div className="field-row">
        <Field label="How many people" hint={bookedCount ? `${bookedCount} already booked` : null}><input type="number" min={Math.max(1, bookedCount)} value={form.count || ''} onChange={set('count')} required /></Field>
        <Field label="Rate per person (₦)"><input type="number" min="0" step="500" value={form.budget || ''} onChange={set('budget')} required /></Field>
      </div>
      <Field label="Role instructions"><textarea rows="3" value={form.instructions || ''} onChange={set('instructions')} /></Field>
      {!job && <p className="muted small">Matching professionals are notified as soon as you add the role.</p>}
      <Alert tone="danger">{status.error}</Alert>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={status.busy}>{status.busy ? 'Saving…' : job ? 'Save role' : 'Add role'}</button></div>
    </form>
  </Modal>
}
