import { useEffect, useState } from 'react'
import { useLocation, NavLink } from 'react-router-dom'
import { supabase, publicUrl } from './lib/supabase'
import { AVAILABLE_CATEGORIES } from './lib/matching'

const InfoRow = ({ label, children, mono }) => (
  <div className="info-row">
    <span className="info-label">{label}</span>
    <span className={mono ? 'info-value mono' : 'info-value'}>{children || '—'}</span>
  </div>
)

export default function ProfileComplete({ session, profile, Workspace }) {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

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
        skills: skillsRes.data || [],
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
        <span className="eyebrow">Professional profile</span>
        <h2>Your profile is ready</h2>
        <p>Loading your professional details...</p>
      </section>
    </Workspace>
  }

  const { profile: prof, worker, prefs, skills, experience, documents, availability } = data
  const primaryProfession = AVAILABLE_CATEGORIES.find((c) => c === worker.primary_profession) || worker.primary_profession || 'Not set'

  return <Workspace role="worker">
    <section className="profile-complete-section">
      <div className="completion-hero">
        <div className="completion-avatar">
          {prof.avatar_url ? <img src={publicUrl('avatars', prof.avatar_url.replace('avatars/', ''))} alt="avatar" /> : <span>{(prof.full_name || 'U').charAt(0)}</span>}
        </div>
        <div className="completion-badge">
          <span className="badge-check">✓</span>
          <span>Profile Complete</span>
        </div>
        <h1>Welcome, {prof.full_name || 'there'}!</h1>
        <p className="completion-subtitle">Your professional profile is ready. Verified professionals get matched with higher-quality jobs and better pay.</p>
      </div>

      <div className="completion-actions">
        <NavLink to="/worker/profile?edit=1" className="primary-btn">Edit Your Profile</NavLink>
        <NavLink to="/worker/profile/edit" className="secondary-btn">Detailed Review</NavLink>
        <NavLink to="/worker/jobs" className="secondary-btn">Find Matching Jobs</NavLink>
      </div>

      <div className="profile-card-grid">
        <section className="profile-card">
          <div className="profile-card-head">
            <span className="profile-card-icon">👤</span>
            <h2>Personal Information</h2>
          </div>
          <div className="profile-card-body">
            <InfoRow label="Full name">{prof.full_name}</InfoRow>
            <InfoRow label="Email">{prof.email || session?.user?.email}</InfoRow>
            <InfoRow label="Phone">{worker.phone || prof.phone}</InfoRow>
            <InfoRow label="Location">{worker.city}{worker.area ? `, ${worker.area}` : ''}, {worker.state || prof.state}</InfoRow>
            <InfoRow label="Address">{worker.address}</InfoRow>
            <InfoRow label="Verified">{worker.is_verified || worker.is_available ? 'Yes' : 'No'}</InfoRow>
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-card-head">
            <span className="profile-card-icon">💼</span>
            <h2>Professional Details</h2>
          </div>
          <div className="profile-card-body">
            <InfoRow label="Primary profession">{primaryProfession}</InfoRow>
            <InfoRow label="Years of experience">{worker.years_experience}</InfoRow>
            <InfoRow label="Languages spoken">{worker.languages?.join(', ') || '—'}</InfoRow>
            <InfoRow label="Portfolio / work samples">
              {worker.portfolio_url ? <a href={worker.portfolio_url} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>{worker.portfolio_url}</a> : '—'}
            </InfoRow>
            <InfoRow label="Additional skills">{skills.map((s) => s.skill).join(', ') || '—'}</InfoRow>
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-card-head">
            <span className="profile-card-icon">📋</span>
            <h2>Experience</h2>
          </div>
          <div className="profile-card-body">
            {experience.length > 0 ? experience.map((item) => (
              <div className="experience-item" key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.employer} · {item.start_date?.slice(0, 10) || '—'} {item.is_current ? '(Current)' : item.end_date ? `– ${item.end_date.slice(0, 10)}` : ''}</span>
                {item.description && <small>{item.description}</small>}
              </div>
            )) : <span className="text-muted">No experience listed</span>}
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-card-head">
            <span className="profile-card-icon">💰</span>
            <h2>Rate Preferences</h2>
          </div>
          <div className="profile-card-body">
            <InfoRow label="Hourly rate">₦{worker.hourly_rate?.toLocaleString() || '—'}</InfoRow>
            <InfoRow label="Daily rate">₦{worker.daily_rate?.toLocaleString() || '—'}</InfoRow>
            <InfoRow label="Minimum acceptable pay">₦{prefs.minimum_pay?.toLocaleString() || worker.minimum_rate?.toLocaleString() || '—'}</InfoRow>
            <InfoRow label="Preferred pay">₦{prefs.preferred_pay?.toLocaleString() || worker.preferred_rate?.toLocaleString() || '—'}</InfoRow>
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-card-head">
            <span className="profile-card-icon">🎯</span>
            <h2>Preferences</h2>
          </div>
          <div className="profile-card-body">
            <InfoRow label="Preferred categories">{prefs.preferred_categories?.join(', ') || '—'}</InfoRow>
            <InfoRow label="Preferred event types">{prefs.preferred_event_types?.join(', ') || '—'}</InfoRow>
            <InfoRow label="Preferred states">{prefs.preferred_states?.join(', ') || '—'}</InfoRow>
            <InfoRow label="Preferred cities">{prefs.preferred_cities?.join(', ') || '—'}</InfoRow>
            <InfoRow label="Preferred areas">{prefs.preferred_areas?.join(', ') || '—'}</InfoRow>
            <InfoRow label="Work types">{prefs.work_types?.join(', ') || '—'}</InfoRow>
            <InfoRow label="Max travel distance">{prefs.max_travel_km} km</InfoRow>
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-card-head">
            <span className="profile-card-icon">📅</span>
            <h2>Availability</h2>
          </div>
          <div className="profile-card-body">
            {availability.length > 0 ? availability.map((slot) => (
              <div className="availability-item" key={slot.id}>
                {slot.available_date && <strong>{new Date(slot.available_date).toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })}</strong>}
                {slot.day_of_week && <strong>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][slot.day_of_week]}</strong>}
                <span>{slot.start_time} – {slot.end_time}</span>
                {slot.is_available === false && <span className="text-muted">Unavailable</span>}
              </div>
            )) : <span className="text-muted">No availability set</span>}
          </div>
        </section>

        <section className="profile-card">
          <div className="profile-card-head">
            <span className="profile-card-icon">📄</span>
            <h2>Documents & Verification</h2>
          </div>
          <div className="profile-card-body">
            {documents.length > 0 ? documents.map((doc) => (
              <div className="document-item" key={doc.id}>
                <strong>{doc.name || doc.document_type}</strong>
                <span className={`status ${doc.status}`}>{doc.status}</span>
                {doc.file_path && <a href={publicUrl('documents', doc.file_path.replace('documents/', ''))} target="_blank" rel="noopener noreferrer">View document</a>}
                {doc.rejection_reason && <span className="text-muted">Rejected: {doc.rejection_reason}</span>}
              </div>
            )) : <span className="text-muted">No documents submitted</span>}
          </div>
        </section>
      </div>

      <div className="completion-footer">
        <button className="secondary-btn" onClick={() => navigate('/worker/profile')}>Back to editor</button>
      </div>
    </section>
  </Workspace>
}
