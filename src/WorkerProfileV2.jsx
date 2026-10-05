import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase, uploadFile, publicUrl } from './lib/supabase'
import {
  AVAILABLE_CATEGORIES,
  EVENT_TYPES,
  WORK_TYPES,
  isWorkerVerified,
} from './lib/matching'

const STEPS = [
  { key: 'personal', label: 'Personal Info' },
  { key: 'profession', label: 'Professional Info' },
  { key: 'experience', label: 'Experience' },
  { key: 'documents', label: 'Verification & Documents' },
  { key: 'preferences', label: 'Job Preferences' },
  { key: 'location', label: 'Location Preferences' },
  { key: 'availability', label: 'Availability' },
  { key: 'pay', label: 'Pay Preferences' },
]

const blankExperience = { title: '', employer: '', startDate: '', endDate: '', isCurrent: false, description: '' }

export default function WorkerProfileV2({ session, profile, Workspace }) {
  const navigate = useNavigate()
  const location = useLocation()
  const isEditMode = new URLSearchParams(location.search).get('edit') === '1'
  const [step, setStep] = useState(() => {
    const saved = localStorage.getItem(`worker_profile_step_${session?.user?.id}`)
    return saved ? Number(saved) : 0
  })
  const [data, setData] = useState({
    fullName: profile?.full_name || '', phone: profile?.phone || '',
    avatar: profile?.avatar_url || '', state: profile?.state || '',
    city: '', area: '', address: '', bio: '',
    primaryProfession: '', additionalSkills: [],
    yearsExperience: '', hourlyRate: '', dailyRate: '', portfolioUrl: '', languages: [],
    experience: [], documents: [],
    preferredCategories: [], preferredEventTypes: [],
    preferredStates: [], preferredCities: [], preferredAreas: [],
    maxTravelKm: '', workTypes: [],
    availableDates: [], availableStartTime: '', availableEndTime: '',
    availabilitySlots: [], hourlyRatePref: '', dailyRatePref: '',
    minimumPay: '', preferredPay: '',
  })
  const [docItems, setDocItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const fileInput = useRef(null)
  const saveTimeout = useRef(null)

  const update = (field) => (event) => {
    const { value, type, checked } = event.target
    setData((current) => ({ ...current, [field]: type === 'checkbox' ? checked : value }))
    queueAutosave()
  }
  const updateList = (field) => (value) => {
    setData((current) => ({ ...current, [field]: value }))
    queueAutosave()
  }
  const listToggle = (field, value) => {
    setData((current) => {
      const list = current[field] || []
      return { ...current, [field]: list.includes(value) ? list.filter((item) => item !== value) : [...list, value] }
    })
    queueAutosave()
  }
  const queueAutosave = () => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => { save(new Event('submit')) }, 1500)
  }

  const firstIncompleteStep = (from) => {
    let idx = from
    while (idx < STEPS.length && computeStepDone(STEPS[idx].key, data, docItems)) idx++
    return Math.min(idx, STEPS.length - 1)
  }

  useEffect(() => {
    if (!session) return
    const load = async () => {
      setLoading(true)
      const [{ data: profileData }, { data: workerData }, { data: prefData }, skillsRes, experienceRes, docsRes, availabilityRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('worker_preferences').select('*').eq('worker_id', session.user.id).maybeSingle(),
        supabase.from('worker_skills').select('skill').eq('worker_id', session.user.id),
        supabase.from('worker_experience').select('*').eq('worker_id', session.user.id).order('start_date', { ascending: false }),
        supabase.from('worker_documents').select('*').eq('worker_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('worker_availability').select('*').eq('worker_id', session.user.id),
      ])
      const worker = workerData || {}
      const prefs = prefData || {}
      const profession = worker.primary_profession
      setData((current) => ({
        ...current,
        fullName: profileData?.full_name || current.fullName,
        phone: profileData?.phone || current.phone,
        avatar: profileData?.avatar_url || current.avatar,
        state: profileData?.state || current.state,
        city: worker.city || '', area: worker.area || '', address: worker.address || '',
        bio: worker.bio || '', primaryProfession: profession || '',
        additionalSkills: skillsRes.data?.map((item) => item.skill) || [],
        yearsExperience: worker.years_experience || '', hourlyRate: worker.hourly_rate || '',
        dailyRate: worker.daily_rate || '', portfolioUrl: worker.portfolio_url || '',
        languages: worker.languages || [],
        experience: experienceRes.data || [], documents: docsRes.data || [],
        preferredCategories: prefs.preferred_categories || [], preferredEventTypes: prefs.preferred_event_types || [],
        preferredStates: prefs.preferred_states || [], preferredCities: prefs.preferred_cities || [],
        preferredAreas: prefs.preferred_areas || [], maxTravelKm: prefs.max_travel_km || '',
        workTypes: prefs.work_types || [],
        availableDates: prefs.available_dates || [], availableStartTime: prefs.available_start_time || '',
        availableEndTime: prefs.available_end_time || '',
        availabilitySlots: availabilityRes.data || [],
        minimumPay: prefs.minimum_pay || worker.minimum_rate || '',
        preferredPay: prefs.preferred_pay || worker.preferred_rate || '',
        hourlyRatePref: prefs.hourly_rate || '', dailyRatePref: prefs.daily_rate || '',
      }))
      setDocItems(mergeDocs(profession, docsRes.data || []))
       setLoading(false)
       setStep((saved) => {
        const target = firstIncompleteStep(saved)
        localStorage.setItem(`worker_profile_step_${session.user.id}`, String(target))
        return target
      })
    }
    load()
  }, [session])

  useEffect(() => {
    if (!session) return
    localStorage.setItem(`worker_profile_step_${session.user.id}`, String(step))
  }, [step, session])

  // Re-merge required documents whenever the profession changes.
  useEffect(() => {
    const { primaryProfession, documents } = data
    setDocItems((prev) => mergeDocs(primaryProfession, documents.length ? documents : prev))
  }, [data.primaryProfession, data.documents.length])

  const upload = async (bucket, file) => {
    if (!supabase || !file) return null
    const path = `${session.user.id}/${Date.now()}_${file.name}`
    const { error } = await uploadFile(bucket, path, file)
    if (error) { setMessage(error.message); return null }
    return `${bucket}/${path}`
  }

  const saveDocuments = async () => {
    const requiredDocs = getRequiredDocs(data.primaryProfession)
    const merged = requiredDocs
      .map((doc) => ({
        ...doc,
        ...docItems.find((d) => d.document_type === doc.document_type),
        required: doc.required,
      }))
      .concat(docItems.filter((d) => !requiredDocs.some((r) => r.document_type === d.document_type)))
    await supabase.from('worker_documents').delete().eq('worker_id', session.user.id)
    for (const doc of merged) {
      if (doc.status === 'not_submitted' && !doc.file_path) continue
      await supabase.from('worker_documents').insert({
        worker_id: session.user.id, category: data.primaryProfession || null,
        document_type: doc.document_type, name: doc.name, file_path: doc.file_path || null,
        status: doc.status, rejection_reason: doc.rejection_reason || null,
        submitted_at: doc.status === 'submitted' ? (doc.submitted_at || new Date().toISOString()) : null,
      })
    }
    setData((current) => ({ ...current, documents: merged }))
  }

  const save = async (event) => {
    if (event) event.preventDefault()
    if (!session || saving) return
    setSaving(true)
    setLoading(true)
    setMessage('Saving professional profile...')

    let avatarUrl = data.avatar
    if (fileInput.current && fileInput.current.files && fileInput.current.files[0]) {
      avatarUrl = await upload('avatars', fileInput.current.files[0])
    }

    await supabase.from('profiles').upsert({
      id: session.user.id, full_name: data.fullName, phone: data.phone,
      state: data.state, avatar_url: avatarUrl || undefined,
    })

    const completion = computeCompletion(data, docItems, isWorkerVerified(workerRef(data, docItems)))
    const workerUpsert = {
      user_id: session.user.id, phone: data.phone, state: data.state, city: data.city,
      area: data.area, address: data.address, bio: data.bio,
      years_experience: Number(data.yearsExperience) || 0,
      hourly_rate: Number(data.hourlyRate) || null, daily_rate: Number(data.dailyRate) || null,
      portfolio_url: data.portfolioUrl || null, languages: data.languages,
      minimum_rate: Number(data.minimumPay) || null, preferred_rate: Number(data.preferredPay) || null,
      profile_completion: completion,
    }
    if (data.primaryProfession && AVAILABLE_CATEGORIES.includes(data.primaryProfession)) {
      workerUpsert.primary_profession = data.primaryProfession
    } else {
      workerUpsert.primary_profession = null
    }
    const { error: workerError } = await supabase.from('worker_profiles').upsert(workerUpsert)

    const { error: skillError } = await supabase.from('worker_skills').delete().eq('worker_id', session.user.id)
    if (!skillError) {
      await supabase.from('worker_skills').insert(
        data.additionalSkills.filter(Boolean).map((skill) => ({ worker_id: session.user.id, skill: skill.trim() }))
      )
    }

    const { error: prefError } = await supabase.from('worker_preferences').upsert({
      worker_id: session.user.id,
      preferred_categories: data.preferredCategories, preferred_event_types: data.preferredEventTypes,
      preferred_states: data.preferredStates, preferred_cities: data.preferredCities,
      preferred_areas: data.preferredAreas, max_travel_km: Number(data.maxTravelKm) || null,
      minimum_pay: Number(data.minimumPay) || null, preferred_pay: Number(data.preferredPay) || null,
      daily_rate: Number(data.dailyRatePref) || null, hourly_rate: Number(data.hourlyRatePref) || null,
      work_types: data.workTypes,
      available_dates: data.availableDates, available_start_time: data.availableStartTime || null,
      available_end_time: data.availableEndTime || null,
    })

    await saveDocuments()

    await supabase.from('worker_experience').delete().eq('worker_id', session.user.id)
    if (data.experience.length) {
      await supabase.from('worker_experience').insert(data.experience.map((item) => ({
        worker_id: session.user.id, title: item.title, employer: item.employer,
        start_date: item.startDate || null, end_date: item.endDate || null,
        is_current: item.isCurrent, description: item.description,
      })))
    }

    await supabase.from('worker_availability').delete().eq('worker_id', session.user.id)
    const slots = data.availabilitySlots.filter((s) => s.is_available !== false)
    if (slots.length) {
      await supabase.from('worker_availability').insert(slots.map((slot) => ({
        worker_id: session.user.id, available_date: slot.available_date || null,
        day_of_week: slot.day_of_week || null, start_time: slot.start_time || null,
        end_time: slot.end_time || null, is_available: slot.is_available !== false,
      })))
    }

    const verified = isWorkerVerified(workerRef(data, docItems))
    const staffFields = {
      user_id: session.user.id, name: data.fullName, category: data.primaryProfession || null,
      location: data.city || data.area || '', state: data.state || null,
      summary: data.bio || '', bio: data.bio || '',
      years_experience: Number(data.yearsExperience) || 0, hourly_rate: Number(data.hourlyRate) || null,
      is_verified: verified, is_available: true, match_score: completion,
      verification_status: verified ? 'approved' : 'pending',
    }
    // upsert by user_id without requiring a unique constraint (seed rows have
    // NULL user_id, so a unique index is not safe to add blindly).
    const { data: existingStaff } = await supabase
      .from('staff_profiles').select('id').eq('user_id', session.user.id).maybeSingle()
    if (existingStaff) await supabase.from('staff_profiles').update(staffFields).eq('id', existingStaff.id)
    else await supabase.from('staff_profiles').insert(staffFields)

    const msg = workerError?.message || prefError?.message || 'Professional profile saved.'
    setMessage(msg)
    setLoading(false)
    setSaving(false)
    if (isEditMode) {
      const allDone = STEPS.every((item) => computeStepDone(item.key, data, docItems))
      if (allDone) {
        navigate('/worker/profile/complete', { replace: true })
      }
    }
  }

  const goNext = async (event) => {
    if (event && event.preventDefault) event.preventDefault()
    if (saving) return
    await save(event)
    setStep((s) => {
      const next = s + 1
      const target = firstIncompleteStep(next)
      localStorage.setItem(`worker_profile_step_${session.user.id}`, String(target))
      return Math.min(target, STEPS.length - 1)
    })
  }
  const goBack = () => setStep((s) => {
    const prev = Math.max(s - 1, 0)
    localStorage.setItem(`worker_profile_step_${session.user.id}`, String(prev))
    return prev
  })
  const jumpToStep = (index) => {
    const target = firstIncompleteStep(index)
    setStep(target)
    localStorage.setItem(`worker_profile_step_${session?.user?.id}`, String(target))
  }
  const current = STEPS[step]
  const verified = isWorkerVerified(workerRef(data, docItems))
  const workerObj = workerRef(data, docItems)
  const completedSteps = STEPS.filter((item) => computeStepDone(item.key, data, docItems))
  const completionPercent = computeCompletion(data, docItems, verified)
  const currentStage = completedSteps.length
  const totalStages = STEPS.length

  useEffect(() => {
    if (session && currentStage === totalStages && !isEditMode) {
      navigate('/worker/profile/complete', { replace: true })
    }
  }, [currentStage, totalStages, navigate, session, isEditMode])

  if (!session) return null

  return <Workspace role="worker">
    <section className="page-heading">
      <span className="eyebrow">Professional profile</span>
      {isEditMode && <NavLink to="/worker/profile/complete" style={{ fontSize: '0.8em', color: '#64748b' }}>← Back to profile summary</NavLink>}
      <h2>{profile?.full_name || 'Your profile'}</h2>
      <p>Build your professional profile to be matched with relevant jobs. Your progress is saved automatically and persists when you leave the page, close your browser, or reload &mdash; so you never have to repeat the registration steps.</p>
      <div className="profile-completion">
        <div className="progress-steps-container">
          <div className="progress-steps-line" style={{ width: `${(currentStage / totalStages) * 100}%` }} />
          <div className="progress-steps-dots">
            {STEPS.map((item, index) => {
              const done = computeStepDone(item.key, data, docItems)
              const isCurrent = index === step
              const filled = currentStage >= index + 1
              return (
                <button
                  type="button"
                  key={item.key}
                  className={`progress-step-dot ${done ? 'done' : ''} ${isCurrent ? 'current' : ''} ${filled ? 'filled' : ''}`}
                  onClick={() => jumpToStep(index)}
                  style={{ left: `${(index / (totalStages - 1)) * 100}%` }}
                  title={item.label}
                >
                  <span className="progress-step-number">{index + 1}</span>
                  <span className="progress-step-label">{item.label}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="progress-summary">
          <span className="mini-label">{currentStage} of {totalStages} stages complete &mdash; {completionPercent}% profile strength</span>
          {verified && <span className="verification-badge">✓ EventStaff NG Verified Professional</span>}
        </div>
      </div>
    </section>

    <div className="stepper">
      {STEPS.map((item, index) => {
        const done = computeStepDone(item.key, data, docItems)
        const active = index === step
        return (
          <button
            type="button"
            key={item.key}
            className={`step-tab ${active ? 'active' : ''} ${done ? 'done' : ''}`}
            onClick={() => jumpToStep(index)}
            disabled={!done && index > 0 && !computeStepDone(STEPS[index - 1].key, data, docItems)}
          >
            {index + 1} {item.label}
            {done && <span className="step-status" style={{ fontSize: '0.7em', marginLeft: 4 }}>&#10003;</span>}
          </button>
        )
      })}
    </div>

    <form className="event-form wide-form" onSubmit={save}>
      {current.key === 'personal' && renderPersonal()}
      {current.key === 'profession' && renderProfession()}
      {current.key === 'experience' && renderExperience()}
      {current.key === 'documents' && renderDocuments(workerObj)}
      {current.key === 'preferences' && renderPreferences()}
      {current.key === 'location' && renderLocation()}
      {current.key === 'availability' && renderAvailability()}
      {current.key === 'pay' && renderPay()}

      {message && <p className={`form-message ${message.includes('error') || message.includes('Could not') ? 'error' : ''}`}>{message}</p>}
      <div className="stepper-nav">
        <button type="button" className="secondary-btn" onClick={goBack} disabled={step === 0}>Back</button>
        {step < STEPS.length - 1 ? <button type="button" className="primary-btn" onClick={goNext} disabled={loading}>Save & Next</button> : <button className="primary-btn" disabled={loading}>{loading ? 'Saving...' : 'Save professional profile'}</button>}
      </div>
    </form>
  </Workspace>

  function renderPersonal() {
    return <>
      <div className="two-col">
        <label>Full name<input value={data.fullName} onChange={update('fullName')} required /></label>
        <label>Phone number<input value={data.phone} onChange={update('phone')} type="tel" /> </label>
      </div>
      <div className="two-col">
        <label>State<input value={data.state} onChange={update('state')} required /></label>
        <label>City<input value={data.city} onChange={update('city')} required /></label>
      </div>
      <div className="two-col">
        <label>Area<input value={data.area} onChange={update('area')} /> </label>
        <label>Email (read-only)<input type="email" value={session?.user?.email || ''} readOnly /></label>
      </div>
      <label>Address<input value={data.address} onChange={update('address')} placeholder="Street, building, landmark" /></label>
      <label>Profile photograph
        <div className="upload-row">
          {data.avatar ? <img src={publicUrl('avatars', data.avatar.replace('avatars/', ''))} alt="avatar" className="avatar-preview" /> : <div className="avatar-placeholder">{data.fullName?.charAt(0) || '?'}</div>}
          <input type="file" ref={fileInput} accept="image/*" onChange={async (event) => { const file = event.target.files[0]; if (!file) return; const url = await upload('avatars', file); if (url) setData((current) => ({ ...current, avatar: url })) }} />
        </div>
      </label>
      <label>Short professional biography<textarea rows="4" value={data.bio} onChange={update('bio')} placeholder="A short summary of your background and strengths..." /></label>
    </>
  }

  function renderProfession() {
    return <>
      <label>Primary profession
        <select value={data.primaryProfession} onChange={update('primaryProfession')} required>
          <option value="">Select a primary category</option>
          {AVAILABLE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      <label>Additional skills / sub-categories<input value={data.additionalSkills.join(', ')} onChange={(event) => updateList('additionalSkills')(event.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="e.g. Pastry, Continental Cuisine, Event Catering" /></label>
      <div className="two-col">
        <label>Years of experience<input type="number" min="0" value={data.yearsExperience} onChange={update('yearsExperience')} /></label>
        <label>Portfolio / work samples URL<input value={data.portfolioUrl} onChange={update('portfolioUrl')} placeholder="https://..." /></label>
      </div>
      <label>Languages spoken<input value={data.languages.join(', ')} onChange={(event) => updateList('languages')(event.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="English, Hausa, Yoruba" /></label>
    </>
  }

  function renderExperience() {
    const addExperience = () => setData((current) => ({ ...current, experience: [...current.experience, { ...blankExperience }] }))
    const updateExp = (index) => (field, value, isCheckbox = false) => {
      setData((current) => ({ ...current, experience: current.experience.map((item, i) => i === index ? { ...item, [field]: isCheckbox ? value : value } : item) }))
    }
    const removeExp = (index) => setData((current) => ({ ...current, experience: current.experience.filter((_, i) => i !== index) }))
    return <>
      <div className="requirement-header"><h3>Professional experience</h3><button type="button" className="secondary-btn small" onClick={addExperience}>Add experience</button></div>
      {data.experience.length ? data.experience.map((item, index) => <div className="requirement-item" key={index}>
        <div className="two-col"><label>Role / title<input value={item.title} onChange={(event) => updateExp(index)('title', event.target.value)} required /></label><label>Employer / client<input value={item.employer} onChange={(event) => updateExp(index)('employer', event.target.value)} /></label></div>
        <div className="two-col"><label>Start date<input type="date" value={item.startDate} onChange={(event) => updateExp(index)('startDate', event.target.value)} /></label><label>End date<input type="date" value={item.endDate} onChange={(event) => updateExp(index)('endDate', event.target.value)} /></label></div>
        <label><input type="checkbox" checked={item.isCurrent} onChange={(event) => updateExp(index)('isCurrent', event.target.checked, true)} /> I currently hold this role</label>
        <label>Description / responsibilities<textarea rows="2" value={item.description} onChange={(event) => updateExp(index)('description', event.target.value)} /></label>
        <button type="button" className="secondary-btn small danger-btn" onClick={() => removeExp(index)}>Remove</button>
      </div>) : <div className="empty-state">No experience added yet.</div>}
    </>
  }

  function renderDocuments(workerObj) {
    const updateDoc = (doc) => (field, value) => setDocItems((current) => current.map((item) => item.id === doc.id ? { ...item, [field]: value } : item))
    const removeDoc = (doc) => setDocItems((current) => current.filter((item) => item.id !== doc.id))
    const handleSubmitDoc = (doc) => async (event) => {
      event.preventDefault()
      const formData = new FormData(event.target)
      const file = formData.get('file')
      if (file) { const url = await upload('documents', file); if (url) updateDoc(doc)('file_path', url) }
      updateDoc(doc)('status', 'submitted')
      updateDoc(doc)('submitted_at', new Date().toISOString())
    }
    return <>
      <p className="form-help">Verification documents follow the workflow: <strong>Not Submitted → Submitted → Under Review → Verified</strong>. Rejected documents can be resubmitted.</p>
      <div className="requirement-header"><h3>Required documents</h3><span className="mini-label">{docItems.filter((d) => d.required).length} required</span></div>
      {docItems.length ? docItems.map((doc) => <div className="requirement-item" key={doc.id}>
        <div className="two-col"><label>Document<input value={doc.name} onChange={(event) => updateDoc(doc)('name', event.target.value)} readOnly={!doc.required && false} /> <span className="mini-label">{doc.required ? 'Required' : 'Optional'}</span></label><label>Status
          <select value={doc.status} onChange={(event) => updateDoc(doc)('status', event.target.value)}>
            <option value="not_submitted">Not Submitted</option>
            <option value="submitted">Submitted</option>
            <option value="under_review">Under Review</option>
            <option value="verified">Verified</option>
            <option value="rejected">Rejected</option>
          </select>
        </label></div>
        <form className="upload-row" onSubmit={handleSubmitDoc(doc)}>
          <input type="file" name="file" accept="application/pdf,image/*" />
          <button type="submit" className="secondary-btn small">Upload</button>
        </form>
        {doc.status === 'rejected' && doc.rejection_reason && <label>Rejection reason<input value={doc.rejection_reason} readOnly onChange={(event) => updateDoc(doc)('rejection_reason', event.target.value)} /></label>}
        {doc.file_path && <span className="mini-label">File: {doc.file_path.split('/').pop()}</span>}
        {!doc.required && <button type="button" className="secondary-btn small danger-btn" onClick={() => removeDoc(doc)}>Remove</button>}
      </div>) : <div className="empty-state">Select a primary profession to see the required documents.</div>}
      {!data.primaryProfession && <button type="button" className="secondary-btn small" onClick={() => setDocItems((current) => [...current, { id: `new-${Date.now()}`, name: 'Other document', document_type: 'other', status: 'not_submitted', required: false }])}>+ Add custom document</button>}
      {docItems.some((d) => d.status === 'verified') && <span className="verification-badge">✓ EventStaff NG Verified Professional</span>}
      {workerObj.is_verified && <span className="mini-label">Marketplace profile marked verified.</span>}
    </>
  }

  function renderPreferences() {
    return <>
      <label>Preferred job categories</label>
      <div className="tag-row">{AVAILABLE_CATEGORIES.map((item) => <button type="button" key={item} className={`filter-chip ${data.preferredCategories.includes(item) ? 'active' : ''}`} onClick={() => listToggle('preferredCategories', item)}>{item}</button>)}</div>
      <label>Preferred event types</label>
      <div className="tag-row">{EVENT_TYPES.map((item) => <button type="button" key={item} className={`filter-chip ${data.preferredEventTypes.includes(item) ? 'active' : ''}`} onClick={() => listToggle('preferredEventTypes', item)}>{item}</button>)}</div>
    </>
  }

  function renderLocation() {
    return <>
      <div className="two-col"><label>Preferred states<input value={data.preferredStates.join(', ')} onChange={(event) => updateList('preferredStates')(event.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Abuja, Lagos" /></label><label>Preferred cities<input value={data.preferredCities.join(', ')} onChange={(event) => updateList('preferredCities')(event.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Abuja, Lagos" /></label></div>
      <div className="two-col"><label>Preferred areas<input value={data.preferredAreas.join(', ')} onChange={(event) => updateList('preferredAreas')(event.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Wuse, Maitama, Garki" /></label><label>Maximum travel distance (km)<input type="number" min="0" value={data.maxTravelKm} onChange={update('maxTravelKm')} placeholder="30" /></label></div>
    </>
  }

  function renderAvailability() {
    return <>
      <div className="two-col"><label>Preferred work types
        <div className="tag-row">{WORK_TYPES.map((item) => <button type="button" key={item} className={`filter-chip ${data.workTypes.includes(item) ? 'active' : ''}`} onClick={() => listToggle('workTypes', item)}>{item}</button>)}</div>
      </label><label>Available dates<input type="date" value={data.availableDates[0] || ''} onChange={(event) => updateList('availableDates')([event.target.value].filter(Boolean))} multiple /> <span className="mini-label">Pick key dates you are free.</span></label></div>
      <div className="two-col"><label>Available start time<input type="time" value={data.availableStartTime} onChange={update('availableStartTime')} /></label><label>Available end time<input type="time" value={data.availableEndTime} onChange={update('availableEndTime')} /></label></div>
      <button type="button" className="secondary-btn small" onClick={() => {
        const next = prompt('Add a recurring availability. Format: YYYY-MM-DD,HH:MM,HH:MM (e.g. 2026-10-18,15:00,23:00)')
        if (!next) return
        const [d, start, end] = next.split(',')
        setData((current) => ({ ...current, availabilitySlots: [...current.availabilitySlots, { available_date: d, day_of_week: toDayOfWeek(d), start_time: start, end_time: end, is_available: true }] }))
      }}>Add availability slot</button>
      {data.availabilitySlots.length ? <div className="list-panel">{data.availabilitySlots.map((slot, index) => <div className="list-row" key={index}><span><strong>{slot.available_date || `Day ${slot.day_of_week}`}</strong><small>{slot.start_time} – {slot.end_time}</small></span><span className="status neutral">{slot.is_available ? 'Available' : 'Unavailable'}</span></div>)}</div> : <span className="mini-label">No availability slots added.</span>}
    </>
  }

  function renderPay() {
    return <>
      <div className="two-col"><label>Minimum acceptable pay<input type="number" min="0" value={data.minimumPay} onChange={update('minimumPay')} placeholder="25000" /></label><label>Preferred pay per event<input type="number" min="0" value={data.preferredPay} onChange={update('preferredPay')} placeholder="40000" /></label></div>
      <div className="two-col"><label>Hourly rate<input type="number" min="0" value={data.hourlyRatePref} onChange={update('hourlyRatePref')} placeholder="500" /></label><label>Daily rate<input type="number" min="0" value={data.dailyRatePref} onChange={update('dailyRatePref')} placeholder="4000" /></label></div>
      <p className="form-help">These affect your job ranking and notifications. Jobs outside your preferences stay visible in All Available Jobs.</p>
    </>
  }
}

function workerRef(data, docItems) {
  return {
    is_verified: isWorkerVerified({ documents: docItems }),
    rating: 0, review_count: 0,
    primary_profession: data.primaryProfession,
    city: data.city, hourly_rate: data.hourlyRate,
    preferences: {
      preferred_categories: data.preferredCategories, preferred_states: data.preferredStates,
      preferred_cities: data.preferredCities, preferred_areas: data.preferredAreas,
      max_travel_km: data.maxTravelKm, minimum_pay: data.minimumPay,
      preferred_pay: data.preferredPay, hourly_rate: data.hourlyRatePref,
      daily_rate: data.dailyRatePref,
    },
    skills: data.additionalSkills, documents: docItems,
    availability: data.availabilitySlots,
  }
}

function getRequiredDocs(category) {
  const templates = {
    'Chefs & Cooks': [{ document_type: 'identity', label: 'Identity documentation', required: true }, { document_type: 'professional', label: 'Culinary certificate', required: true }, { document_type: 'training', label: 'Training certificate', required: false }],
    'Servers': [{ document_type: 'identity', label: 'Identity documentation', required: true }],
    'Bodyguards / Security': [{ document_type: 'identity', label: 'Identity documentation', required: true }, { document_type: 'professional', label: 'Security credentials', required: true }, { document_type: 'training', label: 'Training documentation', required: true }],
    'Emcees / Hosts': [{ document_type: 'identity', label: 'Identity documentation', required: true }, { document_type: 'professional', label: 'MC/host certification', required: false }],
    'Cleaners': [{ document_type: 'identity', label: 'Identity documentation', required: true }],
    'Photographers / Videographers': [{ document_type: 'identity', label: 'Identity documentation', required: true }, { document_type: 'professional', label: 'Portfolio evidence', required: true }, { document_type: 'training', label: 'Professional training', required: false }],
    'Chauffeurs': [{ document_type: 'identity', label: 'Identity documentation', required: true }, { document_type: 'professional', label: 'Driver license', required: true }, { document_type: 'training', label: 'Training certificate', required: false }],
    'Ushers / Protocol Officers': [{ document_type: 'identity', label: 'Identity documentation', required: true }],
  }
  return templates[category] || []
}

function mergeDocs(profession, existing) {
  const required = getRequiredDocs(profession)
  const byType = (existing || []).reduce((map, doc) => { map[doc.document_type] = doc; return map }, {})
  return required
    .map((doc) => ({
      id: `tmpl-${doc.document_type}`,
      name: doc.label, document_type: doc.document_type,
      status: byType[doc.document_type]?.status || 'not_submitted',
      file_path: byType[doc.document_type]?.file_path || '',
      rejection_reason: byType[doc.document_type]?.rejection_reason || '',
      submitted_at: byType[doc.document_type]?.submitted_at || '', required: doc.required,
    }))
    .concat((existing || []).filter((doc) => !required.some((r) => r.document_type === doc.document_type)))
}

function toDayOfWeek(dateString) {
  if (!dateString) return null
  const d = new Date(dateString)
  return isNaN(d.getTime()) ? null : d.getDay()
}

function computeStepDone(key, data, docItems) {
  switch (key) {
    case 'personal': return !!(data.fullName && data.phone && data.state && data.city && data.bio)
    case 'profession': return !!data.primaryProfession && !!data.yearsExperience
    case 'experience': return true
     case 'documents': return !!data.primaryProfession && !!data.documents.length
    case 'preferences': return !!data.preferredCategories.length && !!data.preferredEventTypes.length
    case 'location': return !!data.preferredStates.length
    case 'availability': return !!data.workTypes.length || !!data.availableDates.length
    case 'pay': return !!data.minimumPay
    default: return false
  }
}

function verifyDocRequirement(data, docItems) {
  if (!data.primaryProfession) return false
  const required = getRequiredDocs(data.primaryProfession).filter((d) => d.required)
  return required.every((doc) => docItems.some((d) => d.document_type === doc.document_type && d.status === 'verified'))
}

function computeCompletion(data, docItems, verified) {
  const checks = [
    !!(data.fullName && data.phone && data.state && data.city),
    !!data.primaryProfession,
    !!data.yearsExperience,
    data.additionalSkills.length > 0 || !!data.primaryProfession,
    data.preferredCategories.length > 0,
    data.preferredStates.length > 0,
    data.workTypes.length > 0 || !!data.minimumPay,
    verifyDocRequirement(data, docItems),
    !!data.portfolioUrl || data.languages.length > 0,
    verified,
  ]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}
