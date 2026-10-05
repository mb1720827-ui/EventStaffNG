import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, uploadFile, publicUrl } from './lib/supabase'
import {
  AVAILABLE_CATEGORIES,
  EVENT_TYPES,
  WORK_TYPES,
} from './lib/matching'

export default function ReviewProfile({ session, profile, Workspace }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeSection, setActiveSection] = useState('personal')
  const fileInput = useRef(null)

  useEffect(() => {
    if (!session) return
    const load = async () => {
      const [workerRes, prefsRes, skillsRes, expRes, docsRes, availRes] = await Promise.all([
        supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('worker_preferences').select('*').eq('worker_id', session.user.id).maybeSingle(),
        supabase.from('worker_skills').select('skill').eq('worker_id', session.user.id),
        supabase.from('worker_experience').select('*').eq('worker_id', session.user.id).order('start_date', { ascending: false }),
        supabase.from('worker_documents').select('*').eq('worker_id', session.user.id).order('created_at', { ascending: false }),
        supabase.from('worker_availability').select('*').eq('worker_id', session.user.id),
      ])
      setData({
        profile: profile || {},
        worker: workerRes.data || {},
        prefs: prefsRes.data || {},
        skills: (skillsRes.data || []).map((s) => s.skill),
        experience: expRes.data || [],
        documents: docsRes.data || [],
        availability: availRes.data || [],
      })
      setLoading(false)
    }
    load()
  }, [session, profile])

  if (!session) return null
  if (loading || !data) {
    return <Workspace role="worker">
      <section className="page-heading">
        <span className="eyebrow">Review profile</span>
        <h2>Editing your profile</h2>
        <p>Loading...</p>
      </section>
    </Workspace>
  }

  const { worker, prefs, skills, experience, documents, availability } = data

  const update = (field, value) => {
    setData((current) => ({
      ...current,
      worker: { ...current.worker, [field]: value },
      profile: { ...current.profile, [field]: value },
    }))
  }

  const updatePrefs = (field, value) => {
    setData((current) => ({
      ...current,
      prefs: { ...current.prefs, [field]: value },
    }))
  }

  const updateSkills = (value) => {
    setData((current) => ({ ...current, skills: value }))
  }

  const addExperience = () => {
    setData((current) => ({
      ...current,
      experience: [...current.experience, { id: `new_${Date.now()}`, title: '', employer: '', startDate: '', endDate: '', isCurrent: false, description: '' }],
    }))
  }

  const updateExperience = (index) => (field, value) => {
    setData((current) => ({
      ...current,
      experience: current.experience.map((item, i) => i === index ? { ...item, [field]: value } : item),
    }))
  }

  const removeExperience = (index) => {
    setData((current) => ({
      ...current,
      experience: current.experience.filter((_, i) => i !== index),
    }))
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const path = `${session.user.id}/${Date.now()}_${file.name}`
    const { error } = await uploadFile('avatars', path, file)
    if (error) {
      setMessage(error.message)
      return
    }
    const url = `${path}`
    setData((current) => ({
      ...current,
      profile: { ...current.profile, avatar_url: url },
    }))
  }

  const save = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setMessage('Saving...')

    let avatarUrl = data.worker.avatar_url || data.profile.avatar_url
    if (fileInput.current && fileInput.current.files && fileInput.current.files[0]) {
      const path = `${session.user.id}/${Date.now()}_${fileInput.current.files[0].name}`
      const { error } = await uploadFile('avatars', path, fileInput.current.files[0])
      if (error) {
        setMessage(error.message)
        setSaving(false)
        return
      }
      avatarUrl = path
      setData((current) => ({ ...current, profile: { ...current.profile, avatar_url: avatarUrl } }))
    }

    const workerUpsert = {
      user_id: session.user.id,
      phone: data.worker.phone,
      state: data.worker.state || data.profile.state,
      city: data.worker.city,
      area: data.worker.area,
      address: data.worker.address,
      bio: data.worker.bio,
      years_experience: Number(data.worker.years_experience) || 0,
      hourly_rate: Number(data.worker.hourly_rate) || null,
      daily_rate: Number(data.worker.daily_rate) || null,
      portfolio_url: data.worker.portfolio_url || null,
      languages: data.worker.languages || [],
      minimum_rate: Number(data.prefs.minimum_pay || data.worker.minimum_rate) || null,
      preferred_rate: Number(data.prefs.preferred_pay || data.worker.preferred_rate) || null,
      profile_completion: data.worker.profile_completion || 0,
    }
    if (data.worker.primary_profession && AVAILABLE_CATEGORIES.includes(data.worker.primary_profession)) {
      workerUpsert.primary_profession = data.worker.primary_profession
    }

    const [{ error: profileError }, { error: workerError }, _, { error: skillsError }, { error: prefsError }, { error: expError }] = await Promise.all([
      supabase.from('profiles').upsert({
        id: session.user.id,
        full_name: data.worker.full_name || data.profile.full_name,
        phone: data.worker.phone,
        state: data.worker.state || data.profile.state,
        avatar_url: avatarUrl || undefined,
      }),
      supabase.from('worker_profiles').upsert(workerUpsert),
      supabase.from('worker_skills').delete().eq('worker_id', session.user.id).then(() =>
        supabase.from('worker_skills').insert(data.skills.filter(Boolean).map((skill) => ({ worker_id: session.user.id, skill: skill.trim() })))
      ),
      supabase.from('worker_preferences').upsert({
        worker_id: session.user.id,
        preferred_categories: data.prefs.preferred_categories || [],
        preferred_event_types: data.prefs.preferred_event_types || [],
        preferred_states: data.prefs.preferred_states || [],
        preferred_cities: data.prefs.preferred_cities || [],
        preferred_areas: data.prefs.preferred_areas || [],
        max_travel_km: Number(data.prefs.max_travel_km) || null,
        minimum_pay: Number(data.prefs.minimum_pay) || null,
        preferred_pay: Number(data.prefs.preferred_pay) || null,
        daily_rate: Number(data.prefs.daily_rate) || null,
        hourly_rate: Number(data.prefs.hourly_rate) || null,
        work_types: data.prefs.work_types || [],
        available_dates: data.prefs.available_dates || [],
        available_start_time: data.prefs.available_start_time || null,
        available_end_time: data.prefs.available_end_time || null,
      }),
      supabase.from('worker_experience').delete().eq('worker_id', session.user.id).then(() =>
        supabase.from('worker_experience').insert(data.experience.map((item) => ({
          worker_id: session.user.id,
          title: item.title,
          employer: item.employer,
          start_date: item.startDate || null,
          end_date: item.endDate || null,
          is_current: item.isCurrent,
          description: item.description,
        })))
      ),
    ])

    const errors = [profileError, workerError, skillsError, prefsError, expError].filter(Boolean)
    setMessage(errors.length ? errors[0].message : 'Profile updated successfully.')
    setSaving(false)
  }

  const sections = {
    personal: 'Personal Info',
    profession: 'Professional Info',
    experience: 'Experience',
    documents: 'Documents & Verification',
    preferences: 'Job Preferences',
    location: 'Location Preferences',
    availability: 'Availability',
    pay: 'Pay Preferences',
  }

  const renderSection = () => {
    switch (activeSection) {
      case 'personal':
        return <>
          <label>Full name<input value={data.worker.full_name || ''} onChange={(e) => update('full_name', e.target.value)} /></label>
          <label>Phone number<input value={data.worker.phone || ''} onChange={(e) => update('phone', e.target.value)} type="tel" /></label>
          <label>State<input value={data.worker.state || data.profile.state || ''} onChange={(e) => update('state', e.target.value)} /></label>
          <label>City<input value={data.worker.city || ''} onChange={(e) => update('city', e.target.value)} /></label>
          <label>Area<input value={data.worker.area || ''} onChange={(e) => update('area', e.target.value)} /></label>
          <label>Address<input value={data.worker.address || ''} onChange={(e) => update('address', e.target.value)} placeholder="Street, building, landmark" /></label>
          <label>Profile photograph
            <div className="upload-row">
              {data.profile.avatar_url ? <img src={publicUrl('avatars', data.profile.avatar_url.replace('avatars/', ''))} alt="avatar" className="avatar-preview" /> : <div className="avatar-placeholder">{(data.worker.full_name || data.profile.full_name || 'U').charAt(0)}</div>}
              <input type="file" ref={fileInput} accept="image/*" onChange={handleFileUpload} />
            </div>
          </label>
          <label>Short professional biography<textarea rows="4" value={data.worker.bio || ''} onChange={(e) => update('bio', e.target.value)} placeholder="A short summary of your background and strengths..." /></label>
        </>
      case 'profession':
        return <>
          <label>Primary profession
            <select value={data.worker.primary_profession || ''} onChange={(e) => update('primary_profession', e.target.value)}>
              <option value="">Select a primary category</option>
              {AVAILABLE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Years of experience<input type="number" min="0" value={data.worker.years_experience || ''} onChange={(e) => update('years_experience', e.target.value)} /></label>
          <label>Portfolio / work samples URL<input value={data.worker.portfolio_url || ''} onChange={(e) => update('portfolio_url', e.target.value)} placeholder="https://..." /></label>
          <label>Languages spoken<input value={(data.worker.languages || []).join(', ')} onChange={(e) => update('languages', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="English, Hausa, Yoruba" /></label>
          <label>Additional skills<input value={skills.join(', ')} onChange={(e) => updateSkills(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="e.g. Pastry, Event Catering" /></label>
        </>
      case 'experience':
        return <>
          {experience.map((item, index) => (
            <div className="experience-editor" key={item.id}>
              <label>Title<input value={item.title || ''} onChange={(e) => updateExperience(index)('title', e.target.value)} /></label>
              <label>Employer<input value={item.employer || ''} onChange={(e) => updateExperience(index)('employer', e.target.value)} /></label>
              <div className="two-col">
                <label>Start date<input type="date" value={item.startDate?.slice(0, 10) || ''} onChange={(e) => updateExperience(index)('startDate', e.target.value)} /></label>
                <label>End date<input type="date" value={item.endDate?.slice(0, 10) || ''} onChange={(e) => updateExperience(index)('endDate', e.target.value)} disabled={item.isCurrent} /></label>
              </div>
              <label>Current position<input type="checkbox" checked={item.isCurrent || false} onChange={(e) => updateExperience(index)('isCurrent', e.target.checked)} /></label>
              <label>Description<textarea rows="3" value={item.description || ''} onChange={(e) => updateExperience(index)('description', e.target.value)} /></label>
              {experience.length > 1 && <button type="button" className="secondary-btn small danger-btn" onClick={() => removeExperience(index)}>Remove</button>}
            </div>
          ))}
          <button type="button" className="secondary-btn small" onClick={addExperience}>Add experience entry</button>
        </>
      case 'documents':
        return documents.map((doc) => (
          <div className="document-item" key={doc.id}>
            <strong>{doc.name || doc.document_type}</strong>
            <span className={`status ${doc.status}`}>{doc.status}</span>
            {doc.file_path && <a href={publicUrl('documents', doc.file_path.replace('documents/', ''))} target="_blank" rel="noopener noreferrer">View document</a>}
            {doc.rejection_reason && <span className="text-muted">Rejected: {doc.rejection_reason}</span>}
          </div>
        ))
      case 'preferences':
        return <>
          <label>Preferred categories<input value={(data.prefs.preferred_categories || []).join(', ')} onChange={(e) => updatePrefs('preferred_categories', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Servers, Chefs & Cooks" /></label>
          <label>Preferred event types<input value={(data.prefs.preferred_event_types || []).join(', ')} onChange={(e) => updatePrefs('preferred_event_types', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder={EVENT_TYPES.join(', ')} /></label>
          <label>Preferred work types<input value={(data.prefs.work_types || []).join(', ')} onChange={(e) => updatePrefs('work_types', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder={WORK_TYPES.join(', ')} /></label>
          <label>Maximum travel distance (km)<input type="number" min="0" value={data.prefs.max_travel_km || ''} onChange={(e) => updatePrefs('max_travel_km', e.target.value)} /></label>
        </>
      case 'location':
        return <>
          <label>Preferred states<input value={(data.prefs.preferred_states || []).join(', ')} onChange={(e) => updatePrefs('preferred_states', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Lagos, Abuja, Rivers" /></label>
          <label>Preferred cities<input value={(data.prefs.preferred_cities || []).join(', ')} onChange={(e) => updatePrefs('preferred_cities', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Lagos, Abuja" /></label>
          <label>Preferred areas<input value={(data.prefs.preferred_areas || []).join(', ')} onChange={(e) => updatePrefs('preferred_areas', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Lekki, Victoria Island" /></label>
        </>
      case 'availability':
        return <>
          <label>Available dates<input type="date" value={data.prefs.available_dates?.[0]?.slice(0, 10) || ''} onChange={(e) => updatePrefs('available_dates', [e.target.value])} /> <small>Leave blank to set weekly slots</small></label>
          <label>Available start time<input type="time" value={data.prefs.available_start_time || ''} onChange={(e) => updatePrefs('available_start_time', e.target.value)} /></label>
          <label>Available end time<input type="time" value={data.prefs.available_end_time || ''} onChange={(e) => updatePrefs('available_end_time', e.target.value)} /></label>
          <div style={{ marginTop: 12 }}><small><strong>Saved weekly slots:</strong> {availability.length} configured</small></div>
        </>
      case 'pay':
        return <>
          <label>Minimum acceptable pay (monthly)<input type="number" min="0" value={data.prefs.minimum_pay || ''} onChange={(e) => updatePrefs('minimum_pay', e.target.value)} /></label>
          <label>Preferred pay (monthly)<input type="number" min="0" value={data.prefs.preferred_pay || ''} onChange={(e) => updatePrefs('preferred_pay', e.target.value)} /></label>
          <label>Hourly rate preference<input type="number" min="0" value={data.prefs.hourly_rate || data.worker.hourly_rate || ''} onChange={(e) => updatePrefs('hourly_rate', e.target.value)} /></label>
          <label>Daily rate preference<input type="number" min="0" value={data.prefs.daily_rate || data.worker.daily_rate || ''} onChange={(e) => updatePrefs('daily_rate', e.target.value)} /></label>
        </>
      default:
        return null
    }
  }

  return <Workspace role="worker">
    <section className="page-heading">
      <span className="eyebrow">Review your profile</span>
      <h2>Edit professional details</h2>
      <p>Review and update any section of your profile. Changes are saved automatically.</p>
    </section>

    <div className="review-layout">
      <nav className="review-sidebar">
        {Object.entries(sections).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={`review-tab ${activeSection === key ? 'active' : ''}`}
            onClick={() => setActiveSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="review-content">
        <form className="event-form wide-form" onSubmit={save}>
          {renderSection()}
          {message && <p className={`form-message ${message.includes('error') || message.includes('Could not') ? 'error' : ''}`}>{message}</p>}
          <div className="stepper-nav">
            <button type="button" className="secondary-btn" onClick={() => navigate('/worker/profile/complete')}>View summary</button>
            <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
          </div>
        </form>
      </main>
    </div>
  </Workspace>
}
