import { useEffect, useState } from 'react'
import { NavLink, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { scoreJobForWorker, money } from './lib/matching'

export default function WorkerJobV2({ session, Workspace }) {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const prefMatch = searchParams.get('match')
  const [job, setJob] = useState(null)
  const [match, setMatch] = useState({ score: Number(prefMatch) || 0, breakdown: [] })
  const [applied, setApplied] = useState(false)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session || !id) return
    const load = async () => {
      setLoading(true)
      const { data: jobData } = await supabase
        .from('job_posts')
        .select('*, events(event_name,event_type,guest_count,instructions)')
        .eq('id', id).eq('status', 'open').maybeSingle()
      setJob(jobData)

      // Compute the live match score for the logged-in worker.
      const [{ data: profile }, { data: prefs }, skillsRes, availRes, docsRes, verifRes] = await Promise.all([
        supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('worker_preferences').select('*').eq('worker_id', session.user.id).maybeSingle(),
        supabase.from('worker_skills').select('skill').eq('worker_id', session.user.id),
        supabase.from('worker_availability').select('*').eq('worker_id', session.user.id),
        supabase.from('worker_documents').select('*').eq('worker_id', session.user.id),
        supabase.from('worker_verifications').select('verification_type,status').eq('worker_id', session.user.id),
      ])
      const isVerified =
        profile?.is_verified === true ||
        (docsRes.data || []).some((d) => d.status === 'verified' && ['identity', 'professional'].includes(d.document_type)) ||
        (verifRes.data || []).some((v) => v.status === 'verified')
      const worker = {
        is_verified: isVerified,
        primary_profession: profile?.primary_profession,
        city: profile?.city,
        hourly_rate: profile?.hourly_rate,
        rating: profile?.rating || 0,
        preferences: prefs || {},
        skills: skillsRes.data || [],
        availability: availRes.data || [],
        documents: docsRes.data || [],
      }
      if (jobData) {
        const result = scoreJobForWorker(jobData, worker)
        setMatch({ score: result.score, breakdown: result.breakdown })
      }

      const { data: existing } = await supabase
        .from('job_applications').select('id').eq('job_id', id).eq('worker_id', session.user.id).maybeSingle()
      setApplied(!!existing)
      setLoading(false)
    }
    load()
  }, [session, id])

  const apply = async () => {
    if (!session) return
    const cover = prompt('Add a short cover note (optional)') || ''
    const { error } = await supabase.from('job_applications').insert({
      job_id: id, worker_id: session.user.id,
      worker_name: session.user.email, cover_note: cover, status: 'Applied',
    })
    if (error) setMessage(error.message)
    else { setApplied(true); setMessage('Application submitted successfully.') }
  }

  if (!session) return null
  if (loading) return <Workspace role="worker"><div className="route-loading">Loading job details...</div></Workspace>

  return <Workspace role="worker">
    <div className="profile-back"><NavLink to="/worker/jobs" className="secondary-btn small">Back to jobs</NavLink></div>

    {job ? <section className="worker-profile-page">
      <div className="worker-profile-hero">
        <div className="profile-actions">
          <span className="match-score big">{match.score}% MATCH</span>
        </div>
        <div>
          <span className="eyebrow">{job.category}</span>
          <h1>{job.title}</h1>
          <p>{job.location} · {job.event_date} · {job.start_time} – {job.end_time}</p>
        </div>
      </div>

      <div className="profile-grid">
        <section className="dashboard-card">
          <h2>Job overview</h2>
          <ul>
            <li><strong>Client event</strong><span>{job.events?.event_name || job.title}</span></li>
            <li><strong>Event type</strong><span>{job.events?.event_type}</span></li>
            <li><strong>Guest count</strong><span>{job.events?.guest_count || '—'}</span></li>
            <li><strong>Positions</strong><span>{job.workers_required} workers required</span></li>
            <li><strong>Location</strong><span>{job.location}</span></li>
            <li><strong>Date & schedule</strong><span>{job.event_date} · {job.start_time} – {job.end_time}</span></li>
            <li><strong>Estimated pay</strong><span>{money(job.budget)}</span></li>
          </ul>
        </section>

        <section className="dashboard-card">
          <h2>Your match</h2>
          <p>Match score reflects how well this job fits your profile, preferences, and availability.</p>
          <div className="match-factors-grid">
            {match.breakdown.map((factor) => (
              <div key={factor.label} className="match-factor-item">
                <span className="match-factor-label">{factor.label}</span>
                <span className="match-factor-value">{Math.round(factor.value * 100)}%</span>
                <div className="match-factor-bar"><div className="match-factor-fill" style={{ width: `${Math.round(factor.value * 100)}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="form-help">This is a recommendation indicator, not a guarantee of suitability.</p>
        </section>
      </div>

      <section className="dashboard-card">
        <h2>Description</h2>
        <p>{job.description || job.events?.instructions || 'A verified client is looking for reliable event professionals.'}</p>
        {job.events?.instructions && <p><strong>Event instructions:</strong> {job.events.instructions}</p>}
        <button className="primary-btn" onClick={apply} disabled={applied}>
          {applied ? 'Applied' : 'Apply for this job'}
        </button>
        {message && <p className="form-message">{message}</p>}
      </section>
    </section> : <div className="empty-state">This job is no longer available.</div>}
  </Workspace>
}
