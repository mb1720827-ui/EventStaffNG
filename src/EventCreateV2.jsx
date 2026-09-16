import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { generateStaffingRecommendations, scoreWorkerForJob, AVAILABLE_CATEGORIES, money } from './lib/matching'

const initialEvent = {
  eventName: '',
  eventType: 'Wedding',
  eventDate: '',
  startTime: '',
  endTime: '',
  location: '',
  guestCount: '',
  instructions: '',
  services: '',
}

// Each staffing requirement is independently editable. The AI suggests the
// category and recommended count, but the hirer has full control.
function blankRequirement(category = '', recommended = 1, budget = 25000, instructions = '') {
  return {
    id: `${category}-${Date.now()}`,
    category,
    recommended,
    workersRequired: '',
    budgetPerWorker: budget,
    instructions,
    specialRequirements: '',
    include: true,
  }
}

export default function EventCreateV2({ session, Workspace }) {
  const navigate = useNavigate()
  const [event, setEvent] = useState(initialEvent)
  const [requirements, setRequirements] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [recommendationsGenerated, setRecommendationsGenerated] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [createdEvent, setCreatedEvent] = useState(null)
  const [createdJobs, setCreatedJobs] = useState([])
  const [recommended, setRecommended] = useState([])
  const [loadingRecommendations, setLoadingRecommendations] = useState(false)

  const updateEvent = (field) => (event) => {
    setEvent((current) => ({ ...current, [field]: event.target.value }))
    setRecommendationsGenerated(false)
  }

  const generateRecommendations = () => {
    if (!event.guestCount) return setMessage('Enter the expected guest count first.')
    const recs = generateStaffingRecommendations(event)
    setRecommendations(recs)
    setRecommendationsGenerated(true)
    setRequirements(recs.map((rec) => blankRequirement(rec.category, rec.recommended, rec.defaultBudget, rec.instructions)))
    setMessage('AI analyzed your event and recommended staffing categories.')
  }

  const totalPerRequirement = (req) => Number(req.budgetPerWorker || 0) * Number(req.workersRequired || 0)
  const totalBudget = useMemo(() => requirements.reduce((sum, req) => sum + totalPerRequirement(req), 0), [requirements])

  const updateRequirement = (id) => (field, value) => {
    setRequirements((current) => current.map((item) => (item.id === id ? { ...item, [field]: value } : item)))
  }
  const addCategory = () => {
    const category = prompt('Enter a staff category')
    if (!category) return
    setRequirements((current) => [...current, blankRequirement(category.trim(), 1, 25000)])
  }
  const removeCategory = (id) => setRequirements((current) => current.filter((item) => item.id !== id))

  const includedRequirements = useMemo(() => requirements.filter((req) => req.include && req.workersRequired && Number(req.workersRequired) > 0), [requirements])

  const submit = async (e) => {
    e.preventDefault()
    if (!session) return
    if (!includedRequirements.length) return setMessage('Add at least one staffing category with a worker count.')
    setBusy(true)
    setMessage('')

    const { data: createdEvent, error } = await supabase.from('events').insert({
      hirer_id: session.user.id,
      event_name: event.eventName,
      event_type: event.eventType,
      event_date: event.eventDate,
      start_time: event.startTime,
      end_time: event.endTime,
      location: event.location,
      guest_count: Number(event.guestCount),
      instructions: event.instructions,
      status: 'matching',
    }).select().single()

    if (error) { setMessage(error.message); setBusy(false); return }

    const parsedBudget = (value) => Number(String(value || '').replace(/[^0-9.]/g, '') || 0)

    const reqRows = includedRequirements.map((item) => ({
      event_id: createdEvent.id, category: item.category,
      workers_required: Number(item.workersRequired),
      experience: '',
      budget: parsedBudget(item.budgetPerWorker),
      special_requirements: item.specialRequirements,
    }))
    const { error: reqError } = await supabase.from('event_requirements').insert(reqRows)
    if (reqError) { setMessage(reqError.message); setBusy(false); return }

    const jobRows = includedRequirements.map((item) => ({
      event_id: createdEvent.id,
      hirer_id: session.user.id,
      title: `${event.eventName} — ${item.category}`,
      category: item.category,
      location: event.location,
      event_date: event.eventDate,
      start_time: event.startTime,
      end_time: event.endTime,
      workers_required: Number(item.workersRequired),
      budget: parsedBudget(item.budgetPerWorker),
      description: item.instructions || event.instructions,
      status: 'open',
    }))
    const { error: jobError } = await supabase.from('job_posts').insert(jobRows).select()
    if (jobError) { setMessage(jobError.message); setBusy(false); return }

    // Notify relevant workers that new jobs matching their preferences exist.
    await notifyMatchingWorkers(createdEvent, includedRequirements)

    setCreatedEvent(createdEvent)
    setCreatedJobs(jobRows)

    // Identify suitable workers for each created job so the hirer can review
    // recommended professionals before the event is staffed.
    await fetchRecommendedWorkers(jobRows, createdEvent)
    setBusy(false)
  }

  const fetchRecommendedWorkers = async (jobRows, createdEvent) => {
    if (!supabase) return
    setLoadingRecommendations(true)
    const { data: workers } = await supabase
      .from('staff_profiles')
      .select('*')
      .eq('is_available', true)
      .order('rating', { ascending: false })
      .limit(200)
    if (!workers) { setLoadingRecommendations(false); return }

    const { data: prefs } = await supabase.from('worker_preferences').select('worker_id, preferred_categories, max_travel_km')
    const { data: skills } = await supabase.from('worker_skills').select('worker_id,skill')
    const { data: docs } = await supabase.from('worker_documents').select('worker_id,document_type,status').eq('status', 'verified')
    const prefMap = new Map(prefs || [])
    const skillMap = new Map()
    ;(skills || []).forEach((s) => { skillMap.set(s.worker_id, [...(skillMap.get(s.worker_id) || []), s.skill]) })
    const docMap = new Map()
    ;(docs || []).forEach((d) => { docMap.set(d.worker_id, [...(docMap.get(d.worker_id) || []), d]) })

    const jobMap = {}
    jobRows.forEach((job) => {
      const scored = (workers || [])
        .filter((w) => w.category === job.category && w.user_id)
        .map((w) => {
          const pref = prefMap.get(w.user_id)
          const workerObj = {
            ...w, is_verified: w.is_verified === true,
            preferences: pref || {}, skills: skillMap.get(w.user_id) || [],
            documents: docMap.get(w.user_id) || [],
          }
          return { ...w, match: scoreWorkerForJob(workerObj, job).score }
        })
        .sort((a, b) => b.match - a.match)
        .slice(0, 5)
      jobMap[job.category] = scored
    })
    setRecommended(Object.entries(jobMap))
    setLoadingRecommendations(false)
  }

  const notifyMatchingWorkers = async (createdEvent, reqs) => {
    if (!supabase) return
    const { data: prefs } = await supabase
      .from('worker_preferences')
      .select('worker_id, preferred_categories, preferred_states, minimum_pay')
      .neq('preferred_categories', '{}')
    if (!prefs) return
    const relevant = prefs
      .filter((p) => reqs.some((r) => (p.preferred_categories || []).includes(r.category)))
      .map((p) => p.worker_id)
    if (!relevant.length) return
    const notifRows = relevant.slice(0, 50).map((workerId) => ({
      user_id: workerId,
      type: 'job_match',
      title: 'New job matching your preferences',
      body: `${createdEvent.event_name} requires ${reqs[0].category} in ${createdEvent.location} on ${createdEvent.event_date}.`,
    }))
    await supabase.from('notifications').insert(notifRows).select()
  }

  const durationHours = useMemo(() => {
    if (!event.startTime || !event.endTime) return ''
    const [sh, sm] = event.startTime.split(':').map(Number)
    const [eh, em] = event.endTime.split(':').map(Number)
    const start = sh * 60 + sm
    const end = eh * 60 + em
    const hours = end >= start ? (end - start) / 60 : (end + 1440 - start) / 60
    return hours
  }, [event.startTime, event.endTime])

  return <Workspace role="hirer">
    <section className="page-heading">
      <span className="eyebrow">AI-assisted event setup</span>
      <h2>Create event and staffing plan</h2>
      <p>Describe your event, let the AI suggest staffing, then edit every category, quantity, and budget. Your requirements become jobs in the worker marketplace.</p>
    </section>

    <form className="event-form wide-form" onSubmit={submit}>
      <div className="builder-grid">
        <div>
          <h3>Event details</h3>
          <div className="two-col"><label>Event name<input value={event.eventName} onChange={updateEvent('eventName')} placeholder="Wedding Reception" required /></label><label>Event type
            <select value={event.eventType} onChange={updateEvent('eventType')}>
              <option>Wedding</option><option>Birthday</option><option>Corporate event</option><option>Conference</option><option>Private party</option><option>Other</option>
            </select>
          </label></div>
          <div className="two-col"><label>Date<input type="date" value={event.eventDate} onChange={updateEvent('eventDate')} required /></label><label>Location<input value={event.location} onChange={updateEvent('location')} placeholder="Abuja, Lagos..." required /></label></div>
          <div className="two-col"><label>Start time<input type="time" value={event.startTime} onChange={updateEvent('startTime')} required /></label><label>End time<input type="time" value={event.endTime} onChange={updateEvent('endTime')} required /></label></div>
          <div className="two-col"><label>Expected guests<input type="number" min="1" value={event.guestCount} onChange={updateEvent('guestCount')} placeholder="500" required /></label><label>Duration{!!durationHours && <span className="mini-label">{durationHours} hours</span>}</label></div>
          <label>Services requested<input value={event.services} onChange={updateEvent('services')} placeholder="Catering, photography, security..." /> </label>
          <label>Event instructions<textarea rows="3" value={event.instructions} onChange={updateEvent('instructions')} placeholder="Arrival times, dress code, venue details..." /></label>
        </div>

        <div>
          <h3>AI staffing recommendations</h3>
          {!recommendationsGenerated ? (
            <button type="button" className="primary-btn" onClick={generateRecommendations} disabled={!event.guestCount || !event.eventType}>Generate recommendations</button>
          ) : (
            <div className="regenerate-row">
              <button type="button" className="secondary-btn small" onClick={generateRecommendations}>Regenerate recommendations</button>
              <span className="mini-label">{recommendations.length} categories suggested</span>
            </div>
          )}
          {recommendations.length ? <ul className="recap-list">{recommendations.map((rec) => <li key={rec.category}><strong>{rec.category}</strong><span>Recommended: {rec.recommended}</span></li>)}</ul> : <p className="form-help">Generate or edit staffing categories below.</p>}
        </div>
      </div>

      <div className="requirements-builder">
        <div className="requirement-header"><h3>Staffing requirements</h3><button type="button" className="secondary-btn small" onClick={addCategory}>+ Add staff category</button></div>
        {requirements.map((req) => {
          const rec = recommendations.find((r) => r.category === req.category)
          return <div className="requirement-item" key={req.id}>
            <div className="two-col">
              <label>Category<select value={req.category} onChange={(event) => updateRequirement(req.id)('category', event.target.value)}>
                {AVAILABLE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
                <option value={req.category}>{req.category}</option>
              </select></label>
              <label>
                <div className="include-row"><input type="checkbox" checked={req.include} onChange={(event) => updateRequirement(req.id)('include', event.target.checked)} /> Include in marketplace</div>
                Recommended: {rec?.recommended ?? req.recommended}
                <input type="number" min="0" value={req.workersRequired} onChange={(event) => updateRequirement(req.id)('workersRequired', event.target.value)} placeholder="Your requirement" required={req.include} />
              </label>
            </div>
            <div className="two-col">
              <label>Budget per worker<input type="number" min="0" value={req.budgetPerWorker} onChange={(event) => updateRequirement(req.id)('budgetPerWorker', event.target.value)} placeholder="25000" /></label>
              <label>Total category budget<output className="total-output">{money(totalPerRequirement(req))}</output></label>
            </div>
            <label>Job instructions<textarea rows="2" value={req.instructions} onChange={(event) => updateRequirement(req.id)('instructions', event.target.value)} placeholder="Workers must arrive 1 hour early..." /></label>
            <label>Special requirements<textarea rows="2" value={req.specialRequirements} onChange={(event) => updateRequirement(req.id)('specialRequirements', event.target.value)} placeholder="Dress code, certifications, equipment..." /></label>
            <button type="button" className="secondary-btn small danger-btn" onClick={() => removeCategory(req.id)}>Remove category</button>
          </div>
        })}
        {!requirements.length && <div className="empty-state">Click "Generate recommendations" or add a category to begin building your staffing plan.</div>}

        <div className="budget-summary">
          <div className="list-row"><span>Selected positions</span><strong>{includedRequirements.reduce((sum, req) => sum + Number(req.workersRequired), 0)}</strong></div>
          <div className="list-row"><span>Total staffing budget</span><strong>{money(totalBudget)}</strong></div>
        </div>

         <button className="primary-btn" type="submit" disabled={busy || !includedRequirements.length || createdEvent}>{busy ? 'Publishing jobs...' : (createdEvent ? 'Jobs published' : 'Create event & publish to marketplace')}</button>
         {message && <p className="form-message">{message}</p>}
       </div>
     </form>

     {createdEvent && (
       <section className="matching-section">
         <div className="section-header"><span className="eyebrow">Marketplace connected</span><h2>Recommended workers</h2></div>
         <p>Your staffing plan is live. The marketplace now ranks workers against each role. {loadingRecommendations && <span className="mini-label">Scoring available professionals...</span>}</p>
         {recommended.length ? recommended.map(([category, workers]) => (
           <div className="dashboard-card" key={category}>
             <div className="dashboard-head"><div><span className="mini-label">Role</span><h3>{category}</h3></div><NavLink to={`/hirer/find-staff`} className="secondary-btn small">View all</NavLink></div>
             {workers.length ? workers.map((worker) => (
               <div className="list-row" key={worker.id}>
                 <span><strong>{worker.name}</strong><small>{worker.location} · {worker.years_experience} years</small></span>
                 <span className="match-score">{worker.match}% Match</span>
               </div>
             )) : <div className="empty-state">No verified professionals found in this category yet.</div>}
           </div>
         )) : <div className="empty-state">No matching verified workers were found for the selected categories.</div>}
         <div className="action-stack"><NavLink to="/hirer/find-staff" className="secondary-btn">Browse all staff in Find Staff</NavLink><NavLink to="/hirer/events" className="primary-btn">View your events</NavLink></div>
       </section>
     )}
   </Workspace>
}
