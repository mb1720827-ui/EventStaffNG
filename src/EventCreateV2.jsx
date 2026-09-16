import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'

const initialForm = {
  eventName: '',
  eventType: 'Corporate event',
  eventDate: '',
  startTime: '',
  endTime: '',
  location: '',
  guestCount: '',
  instructions: '',
}

const initialRequirements = [
  { category: 'Servers', workersRequired: 1, budget: '', experience: '', instructions: '' },
]

export default function EventCreateV2({ session, Workspace }) {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [requirements, setRequirements] = useState(initialRequirements)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const updateForm = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  const updateRequirement = (index, field, value) => setRequirements((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item))
  const generateRecommendations = () => {
    const guests = Number(form.guestCount || 0)
    setRequirements([
      { category: 'Servers', workersRequired: Math.max(1, Math.ceil(guests / 40)), budget: '', experience: '1+ years', instructions: 'Arrive one hour early in formal attire.' },
      { category: 'Ushers / Protocol Officers', workersRequired: Math.max(1, Math.ceil(guests / 100)), budget: '', experience: '', instructions: '' },
      { category: 'Cleaners', workersRequired: Math.max(1, Math.ceil(guests / 150)), budget: '', experience: '', instructions: '' },
    ])
  }

  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    const { data: createdEvent, error } = await supabase.from('events').insert({
      hirer_id: session.user.id,
      event_name: form.eventName,
      event_type: form.eventType,
      event_date: form.eventDate,
      start_time: form.startTime,
      end_time: form.endTime,
      location: form.location,
      guest_count: Number(form.guestCount),
      instructions: form.instructions,
      status: 'matching',
    }).select().single()

    if (error) {
      setMessage(error.message)
      setBusy(false)
      return
    }

    const rows = requirements.map((item) => ({
      event_id: createdEvent.id,
      category: item.category,
      workers_required: Number(item.workersRequired),
      experience: item.experience,
      budget: Number(String(item.budget).replace(/[^0-9.]/g, '') || 0),
      special_requirements: item.instructions,
    }))
    const { error: requirementError } = await supabase.from('event_requirements').insert(rows)
    if (requirementError) {
      setMessage(requirementError.message)
      setBusy(false)
      return
    }

    const jobs = requirements.map((item) => ({
      event_id: createdEvent.id,
      hirer_id: session.user.id,
      title: `${form.eventName} - ${item.category}`,
      category: item.category,
      location: form.location,
      event_date: form.eventDate,
      start_time: form.startTime,
      end_time: form.endTime,
      workers_required: Number(item.workersRequired),
      budget: Number(String(item.budget).replace(/[^0-9.]/g, '') || 0),
      description: item.instructions || form.instructions,
      status: 'open',
    }))
    const { error: jobError } = await supabase.from('job_posts').insert(jobs)
    if (jobError) {
      setMessage(jobError.message)
      setBusy(false)
      return
    }

    navigate('/hirer/events')
  }

  return <Workspace role="hirer">
    <section className="page-heading">
      <span className="eyebrow">AI-assisted event setup</span>
      <h2>Create event and staffing plan</h2>
      <p>Generate recommendations, edit each category, then publish jobs to the worker marketplace.</p>
    </section>
    <form className="event-form wide-form" onSubmit={submit}>
      <div className="two-col">
        <label>Event name<input name="eventName" value={form.eventName} onChange={updateForm} required /></label>
        <label>Event type<select name="eventType" value={form.eventType} onChange={updateForm}><option>Wedding</option><option>Birthday</option><option>Corporate event</option><option>Conference</option><option>Private party</option><option>Other</option></select></label>
      </div>
      <div className="two-col">
        <label>Date<input name="eventDate" type="date" value={form.eventDate} onChange={updateForm} required /></label>
        <label>Location<input name="location" value={form.location} onChange={updateForm} required /></label>
      </div>
      <div className="two-col">
        <label>Start time<input name="startTime" type="time" value={form.startTime} onChange={updateForm} required /></label>
        <label>End time<input name="endTime" type="time" value={form.endTime} onChange={updateForm} required /></label>
      </div>
      <label>Expected guests<input name="guestCount" type="number" min="1" value={form.guestCount} onChange={updateForm} required /></label>
      <label>Event instructions<textarea name="instructions" rows="3" value={form.instructions} onChange={updateForm} /></label>
      <div className="requirements-builder">
        <div className="requirement-header"><h3>Editable recommendations</h3><button type="button" className="secondary-btn small" onClick={generateRecommendations}>Generate recommendations</button></div>
        {requirements.map((item, index) => <div className="requirement-item" key={`${item.category}-${index}`}>
          <div className="two-col"><label>Category<input value={item.category} onChange={(event) => updateRequirement(index, 'category', event.target.value)} required /></label><label>Workers required<input type="number" min="1" value={item.workersRequired} onChange={(event) => updateRequirement(index, 'workersRequired', event.target.value)} required /></label></div>
          <div className="two-col"><label>Budget per worker<input value={item.budget} onChange={(event) => updateRequirement(index, 'budget', event.target.value)} placeholder="25000" /></label><label>Experience<input value={item.experience} onChange={(event) => updateRequirement(index, 'experience', event.target.value)} /></label></div>
          <label>Job instructions<textarea rows="2" value={item.instructions} onChange={(event) => updateRequirement(index, 'instructions', event.target.value)} /></label>
          <button type="button" className="secondary-btn small" onClick={() => setRequirements((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remove category</button>
        </div>)}
      </div>
      <button className="primary-btn" disabled={busy}>{busy ? 'Publishing jobs...' : 'Create Event & Publish Jobs'}</button>
      {message && <p className="form-message">{message}</p>}
    </form>
  </Workspace>
}
