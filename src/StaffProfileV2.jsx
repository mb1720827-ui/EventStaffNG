import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from './lib/supabase'

export default function StaffProfileV2({ workerId, Workspace }) {
  const [worker, setWorker] = useState(null)
  const [details, setDetails] = useState({ profile: null, skills: [], verifications: [] })
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!workerId) return
    const load = async () => {
      const { data, error } = await supabase
        .from('staff_profiles')
        .select('*')
        .eq('id', workerId)
        .eq('is_available', true)
        .eq('is_verified', true)
        .maybeSingle()
      if (error || !data) {
        setMessage(error?.message || 'This staff profile is not available.')
        return
      }
      setWorker(data)
      const [profileResult, skillsResult, verificationResult] = await Promise.all([
        data.user_id ? supabase.from('profiles').select('full_name,phone,state,avatar_url').eq('id', data.user_id).maybeSingle() : Promise.resolve({ data: null }),
        data.user_id ? supabase.from('worker_skills').select('skill').eq('worker_id', data.user_id) : Promise.resolve({ data: [] }),
        data.user_id ? supabase.from('worker_verifications').select('verification_type,status,reviewed_at').eq('worker_id', data.user_id).eq('status', 'verified') : Promise.resolve({ data: [] }),
      ])
      setDetails({ profile: profileResult.data, skills: skillsResult.data || [], verifications: verificationResult.data || [] })
    }
    load()
  }, [workerId])

  if (message) return <Workspace role="hirer"><div className="empty-state">{message}</div></Workspace>
  if (!worker) return <Workspace role="hirer"><div className="route-loading">Loading staff profile...</div></Workspace>

  return <Workspace role="hirer">
    <div className="profile-back"><NavLink to="/hirer/find-staff" className="secondary-btn small">Back to Find Staff</NavLink></div>
    <section className="worker-profile-page">
      <div className="worker-profile-hero">
        <div className="profile-avatar">{worker.name.charAt(0)}</div>
        <div><span className="eyebrow">Verified professional</span><h1>{worker.name}</h1><p>{worker.category} · {worker.location}{worker.state ? `, ${worker.state}` : ''}</p><span className="verification-badge">✓ EventStaff NG Verified Professional</span></div>
      </div>
      <div className="profile-actions"><a className="primary-btn" href={details.profile?.phone ? `tel:${details.profile.phone}` : undefined}>{details.profile?.phone ? 'Contact worker' : 'Contact available after booking'}</a><button className="secondary-btn" onClick={() => setMessage('Booking requests are available from an event staffing plan.')}>Request booking</button></div>
      <div className="profile-grid">
        <section className="dashboard-card"><h2>Professional information</h2><p>{worker.bio || worker.summary || 'This professional has not added a public biography yet.'}</p><div className="profile-facts"><div><strong>Rating</strong><span>{Number(worker.rating || 0).toFixed(1)}★ ({worker.review_count || 0} reviews)</span></div><div><strong>Experience</strong><span>{worker.years_experience || 0} years</span></div><div><strong>Location</strong><span>{worker.location}</span></div><div><strong>Starting rate</strong><span>{worker.hourly_rate ? `₦${Number(worker.hourly_rate).toLocaleString()}` : 'Contact for rate'}</span></div></div></section>
        <section className="dashboard-card"><h2>Skills and certifications</h2><div className="tag-row">{details.skills.length ? details.skills.map((item) => <span key={item.skill}>{item.skill}</span>) : <span>No public skills listed yet.</span>}</div><div className="verification-list profile-verifications">{details.verifications.length ? details.verifications.map((item) => <li key={item.verification_type}>{item.verification_type} verified</li>) : <li>Identity and professional verification approved</li>}</div></section>
      </div>
    </section>
  </Workspace>
}
