import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from './lib/supabase'

const money = (value) => `₦${Number(value || 0).toLocaleString()}`

function scoreJob(job, preferences) {
  if (!preferences) return 50
  let score = 50
  if ((preferences.preferred_categories || []).includes(job.category)) score += 25
  if ((preferences.preferred_states || []).some((state) => job.location?.toLowerCase().includes(state.toLowerCase()))) score += 15
  if (preferences.minimum_pay && Number(job.budget) >= Number(preferences.minimum_pay)) score += 10
  return Math.min(score, 100)
}

export default function WorkerJobsV2({ session, Workspace }) {
  const [jobs, setJobs] = useState([])
  const [preferences, setPreferences] = useState(null)
  const [tab, setTab] = useState('recommended')

  useEffect(() => {
    if (!session) return
    Promise.all([
      supabase.from('job_posts').select('*').eq('status', 'open').order('created_at', { ascending: false }),
      supabase.from('worker_preferences').select('*').eq('worker_id', session.user.id).maybeSingle(),
      supabase.from('worker_profiles').select('*').eq('user_id', session.user.id).maybeSingle(),
    ]).then(([jobResult, preferenceResult, profileResult]) => {
      const profile = profileResult.data
      const preference = preferenceResult.data || (profile ? { preferred_categories: [], preferred_states: [], minimum_pay: null } : null)
      setPreferences(preference)
      setJobs((jobResult.data || []).map((job) => ({ ...job, matchScore: scoreJob(job, preference) })).sort((a, b) => b.matchScore - a.matchScore))
    })
  }, [session])

  const visibleJobs = useMemo(() => tab === 'recommended' ? jobs.filter((job) => job.matchScore >= 70) : jobs, [jobs, tab])

  return <Workspace role="worker">
    <section className="page-heading"><span className="eyebrow">Worker marketplace</span><h2>{tab === 'recommended' ? 'Recommended jobs' : 'All available jobs'}</h2><p>Recommendations use your profession, location, and pay preferences. Jobs outside your preferences remain discoverable.</p></section>
    <div className="auth-toggle marketplace-tabs"><button className={tab === 'recommended' ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setTab('recommended')}>Recommended for you</button><button className={tab === 'all' ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setTab('all')}>All available jobs</button></div>
    <div className="job-grid">{visibleJobs.length ? visibleJobs.map((job) => <article className="job-card" key={job.id}><div className="job-head"><span className="job-category">{job.category}</span><span className="match-score">{job.matchScore}% Match</span></div><h3>{job.title}</h3><ul><li>📍 {job.location}</li><li>📅 {job.event_date}</li><li>⏰ {job.start_time} – {job.end_time}</li><li>{job.workers_required} workers required</li><li>Pay: {money(job.budget)}</li></ul><NavLink to={`/worker/jobs/${job.id}`} className="primary-btn small">View job</NavLink></article>) : <div className="empty-state">{tab === 'recommended' ? 'No strong matches yet. Check All Available Jobs or complete your preferences.' : 'No open jobs are available right now.'}</div>}</div>
  </Workspace>
}
