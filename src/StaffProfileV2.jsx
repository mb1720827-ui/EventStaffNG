import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase, publicUrl } from './lib/supabase'
import { money } from './lib/matching'

const STATUS_LABELS = {
  not_submitted: 'Not Submitted',
  submitted: 'Submitted',
  under_review: 'Under Review',
  verified: 'Verified',
  rejected: 'Rejected',
}

const STATUS_COLORS = {
  verified: 'success',
  under_review: 'warning',
  submitted: 'neutral',
  rejected: 'danger',
  not_submitted: 'neutral',
}

export default function StaffProfileV2({ workerId, Workspace }) {
  const [worker, setWorker] = useState(null)
  const [details, setDetails] = useState({ profile: null, skills: [], verifications: [], documents: [], experience: [], rates: null })
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!workerId) return
    const load = async () => {
      const { data: staffData, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('id', workerId)
        .maybeSingle()
      if (error || !staffData) {
        setMessage(error?.message || 'This staff profile is not available.')
        return
      }
      setWorker(staffData)

      const [profileRes, skillsRes, verifRes, docsRes, expRes, prefsRes, wpRes] = await Promise.all([
        staffData.user_id ? supabase.from('profiles').select('full_name,phone,state,city,avatar_url').eq('id', staffData.user_id).maybeSingle() : Promise.resolve({ data: null }),
        staffData.user_id ? supabase.from('worker_skills').select('skill').eq('worker_id', staffData.user_id) : Promise.resolve({ data: [] }),
        staffData.user_id ? supabase.from('worker_verifications').select('verification_type,status,reviewed_at').eq('worker_id', staffData.user_id) : Promise.resolve({ data: [] }),
        staffData.user_id ? supabase.from('worker_documents').select('document_type,name,status,file_path,reviewed_at,rejection_reason').eq('worker_id', staffData.user_id).order('status', { ascending: false }) : Promise.resolve({ data: [] }),
        staffData.user_id ? supabase.from('worker_experience').select('title,employer,start_date,end_date,is_current,description').eq('worker_id', staffData.user_id).order('start_date', { ascending: false }) : Promise.resolve({ data: [] }),
        staffData.user_id ? supabase.from('worker_preferences').select('preferred_categories,minimum_pay,preferred_pay').eq('worker_id', staffData.user_id).maybeSingle() : Promise.resolve({ data: null }),
        staffData.user_id ? supabase.from('worker_profiles').select('years_experience,hourly_rate,daily_rate,portfolio_url,languages').eq('user_id', staffData.user_id).maybeSingle() : Promise.resolve({ data: null }),
      ])

      setDetails({
        profile: profileRes.data,
        skills: skillsRes.data || [],
        verifications: verifRes.data || [],
        documents: (docsRes.data || []),
        experience: expRes.data || [],
        rates: prefsRes.data,
        worker: wpRes.data,
      })
    }
    load()
  }, [workerId])

  if (message) return <Workspace role="hirer"><div className="empty-state">{message}</div></Workspace>
  if (!worker) return <Workspace role="hirer"><div className="route-loading">Loading staff profile...</div></Workspace>

  const verifiedCount = details.documents.filter((d) => d.status === 'verified').length
  const displayName = details.profile?.full_name || worker.name
  const avatar = details.profile?.avatar_url ? publicUrl('avatars', details.profile.avatar_url.replace('avatars/', '')) : null

  return <Workspace role="hirer">
    <div className="profile-back"><NavLink to="/hirer/find-staff" className="secondary-btn small">Back to Find Staff</NavLink></div>

    <section className="worker-profile-page">
      <div className="worker-profile-hero">
        <div className="profile-avatar">{avatar ? <img src={avatar} alt={displayName} className="avatar-preview" /> : displayName.charAt(0)}</div>
        <div>
          <span className="eyebrow">Verified professional</span>
          <h1>{displayName}</h1>
          <p>{worker.category} · {worker.location}{worker.state ? `, ${worker.state}` : ''}</p>
          {worker.is_verified && <span className="verification-badge">✓ EventStaff NG Verified Professional</span>}
          <span className="mini-label" style={{ marginLeft: 12 }}>{verifiedCount} documents verified</span>
        </div>
      </div>

      <div className="profile-actions">
        {details.profile?.phone ? <a className="primary-btn" href={`tel:${details.profile.phone}`}>Contact worker</a> : <span className="secondary-btn small">Contact available after booking</span>}
        <button className="secondary-btn" onClick={() => setMessage('Booking requests are created from an event staffing plan. Create an event to hire this worker.')}>Request booking</button>
      </div>

      <div className="profile-grid">
        <section className="dashboard-card">
          <h2>Professional information</h2>
          <p>{worker.bio || worker.summary || 'This professional has not added a public biography yet.'}</p>
          <div className="profile-facts">
            <div><strong>Rating</strong><span>{Number(worker.rating || 0).toFixed(1)}★ ({worker.review_count || 0} reviews)</span></div>
            <div><strong>Experience</strong><span>{details.worker?.years_experience || worker.years_experience || 0} years</span></div>
            <div><strong>Location</strong><span>{worker.location}{worker.state ? `, ${worker.state}` : ''}</span></div>
            <div><strong>Starting rate</strong><span>{details.worker?.hourly_rate ? money(details.worker.hourly_rate) + '/hr' : details.worker?.daily_rate ? money(details.worker.daily_rate) + '/day' : worker.hourly_rate ? money(worker.hourly_rate) + '/hr' : 'Contact for rate'}</span></div>
            {details.worker?.languages?.length ? <div><strong>Languages</strong><span>{details.worker.languages.join(', ')}</span></div> : null}
            {details.worker?.portfolio_url ? <div><strong>Portfolio</strong><span><a href={details.worker.portfolio_url} target="_blank" rel="noreferrer">View work samples</a></span></div> : null}
          </div>
        </section>

        <section className="dashboard-card">
          <h2>Skills and validations</h2>
          <div className="tag-row">
            {details.skills.length ? details.skills.map((item) => <span key={item.skill}>{item.skill}</span>) : <span>No public skills listed yet.</span>}
          </div>
          <div className="verification-list profile-verifications">
            {details.verifications.length ? details.verifications.map((item) => (
              <li key={`${item.verification_type}-${item.status}`}>
                <span className={`status ${STATUS_COLORS[item.status] || 'neutral'}`}>{STATUS_LABELS[item.status] || item.status}</span>
                {item.verification_type}
              </li>
            )) : <li>Verification in progress.</li>}
          </div>
          <h3 style={{ marginTop: 22, marginBottom: 12 }}>Certifications & documents</h3>
          {details.documents.length ? details.documents.map((doc) => (
            <div className="list-row" key={`${doc.document_type}-${doc.name}`}>
              <span>
                <strong>{doc.name}</strong>
                <small>{doc.document_type}{doc.reviewed_at ? ` · reviewed ${new Date(doc.reviewed_at).toLocaleDateString()}` : ''}</small>
                {doc.rejection_reason && <span className="form-help">Rejected: {doc.rejection_reason}</span>}
              </span>
              <span className={`status ${STATUS_COLORS[doc.status] || 'neutral'}`}>{STATUS_LABELS[doc.status] || doc.status}</span>
            </div>
          )) : <div className="empty-state">No professional documents on record.</div>}
        </section>

        <section className="dashboard-card">
          <h2>Professional experience</h2>
          {details.experience.length ? details.experience.map((exp, index) => (
            <div className="list-row" key={index}>
              <span>
                <strong>{exp.title}</strong>
                <small>{exp.employer || ''}{exp.start_date ? ` · ${formatDate(exp.start_date)} – ${exp.end_date ? formatDate(exp.end_date) : 'Present'}` : ''}</small>
                {exp.description && <span className="form-help">{exp.description}</span>}
              </span>
              {exp.is_current && <span className="status success">Current</span>}
            </div>
          )) : <div className="empty-state">No professional experience listed.</div>}
        </section>

        <section className="dashboard-card">
          <h2>Job preferences</h2>
          {details.rates ? <div className="profile-facts">
            {details.rates.preferred_categories?.length ? <div><strong>Preferred categories</strong><span>{details.rates.preferred_categories.join(', ')}</span></div> : null}
            {details.rates.minimum_pay ? <div><strong>Minimum pay</strong><span>{money(details.rates.minimum_pay)}</span></div> : null}
            {details.rates.preferred_pay ? <div><strong>Preferred pay</strong><span>{money(details.rates.preferred_pay)}</span></div> : null}
          </div> : <span className="mini-label">Worker preferences are private.</span>}
        </section>
      </div>
    </section>
  </Workspace>
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  return isNaN(d.getTime()) ? value : d.toLocaleDateString()
}
