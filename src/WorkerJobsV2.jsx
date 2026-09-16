import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { scoreJobForWorker, money } from './lib/matching'

// Build the worker context object consumed by the matching engine.
function buildWorker(profile, prefs, skills, availability, documents, verifications) {
  const isVerified =
    profile?.is_verified === true ||
    (documents || []).some((d) => d.status === 'verified' && ['identity', 'professional'].includes(d.document_type)) ||
    (verifications || []).some((v) => v.status === 'verified')
  return {
    is_verified: isVerified,
    primary_profession: profile?.primary_profession,
    city: profile?.city,
    hourly_rate: profile?.hourly_rate,
    rating: profile?.rating || 0,
    review_count: profile?.review_count || 0,
    preferences: prefs || {},
    skills: skills || [],
    availability: availability || [],
    documents: documents || [],
  }
}

export default function WorkerJobsV2({ session, Workspace }) {
  const [jobs, setJobs] = useState([])
  const [tab, setTab] = useState('recommended')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    const load = async () => {
      setLoading(true)
      const [{ data: jobData }, { data: profileData }, { data: prefData }, skillsRes, availRes, docsRes, verifRes] = await Promise.all([
        supabase.from('job_posts').select('*, events(event_name)').eq('status', 'open').order('created_at', { ascending: false }),
        supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
        supabase.from('worker_preferences').select('*').eq('worker_id', session.user.id).maybeSingle(),
        supabase.from('worker_skills').select('skill').eq('worker_id', session.user.id),
        supabase.from('worker_availability').select('*').eq('worker_id', session.user.id),
        supabase.from('worker_documents').select('*').eq('worker_id', session.user.id),
        supabase.from('worker_verifications').select('verification_type,status').eq('worker_id', session.user.id),
      ])
      const w = buildWorker(profileData, prefData, skillsRes.data, availRes.data, docsRes.data, verifRes.data)
      const scored = (jobData || []).map((job) => {
        const { score, breakdown } = scoreJobForWorker(job, w)
        return { ...job, matchScore: score, matchBreakdown: breakdown }
      }).sort((a, b) => b.matchScore - a.matchScore)
      setJobs(scored)
      setLoading(false)
    }
    load()
  }, [session])

  const visibleJobs = useMemo(() => {
    if (tab === 'recommended') {
      const threshold = 70
      return jobs.filter((job) => job.matchScore >= threshold)
    }
    return jobs
  }, [jobs, tab])

  if (!session) return null

  return <Workspace role="worker">
    <section className="page-heading">
      <span className="eyebrow">Worker marketplace</span>
      <h2>{tab === 'recommended' ? 'Recommended jobs' : 'All available jobs'}</h2>
      <p>Jobs are ranked by a match score built from your profession, availability, location, skills, verification, rating, and pay preferences. All open jobs remain discoverable.</p>
    </section>

    <div className="auth-toggle marketplace-tabs">
      <button className={tab === 'recommended' ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setTab('recommended')}>Recommended for you</button>
      <button className={tab === 'all' ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setTab('all')}>All available jobs</button>
    </div>

    {loading && <div className="route-loading">Matching jobs to your profile...</div>}

    {visibleJobs.length ? (
      <div className="job-grid">
        {visibleJobs.map((job) => (
          <article className="job-card" key={job.id}>
            <div className="job-head">
              <span className="job-category">{job.category}</span>
              <span className="match-score">{job.matchScore}% Match</span>
            </div>
            <h3>{job.title}</h3>
            <ul>
              <li>📍 {job.location}</li>
              <li>📅 {job.event_date}</li>
              <li>⏰ {job.start_time} – {job.end_time}</li>
              <li>{job.workers_required} positions</li>
              <li>Pay: {money(job.budget)}</li>
            </ul>
            <div className="match-factors">
              {job.matchBreakdown.filter((f) => f.value > 0).map((f) => (
                <span key={f.label} className="factor-chip">{f.label.replace(/^(.{18}).*/, '$1…')}</span>
              ))}
            </div>
            <div className="job-actions">
              <NavLink to={`/worker/jobs/${job.id}`} className="primary-btn small">View job</NavLink>
              <NavLink to={`/worker/jobs/${job.id}?match=${job.matchScore}`} className="secondary-btn small">Match details</NavLink>
            </div>
          </article>
        ))}
      </div>
    ) : (
      <div className="empty-state">
        {tab === 'recommended'
          ? 'No strong matches yet this week. Review your preferences, or browse All Available Jobs.'
          : 'No open jobs are available right now.'}
      </div>
    )}
  </Workspace>
}
