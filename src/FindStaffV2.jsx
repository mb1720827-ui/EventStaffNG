import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from './lib/supabase'
import StaffProfileV2 from './StaffProfileV2'

// Relevance score for a worker given the hirer's active search/category.
function scoreWorker(worker, query, category) {
  let score = 50
  const text = `${worker.name || ''} ${worker.category || ''} ${worker.location || ''} ${worker.state || ''} ${worker.summary || ''}`.toLowerCase()
  const q = (query || '').toLowerCase()
  if (q && text.includes(q)) score += 20
  if (category && category !== 'All' && worker.category === category) score += 25
  if (worker.is_verified) score += 15
  if (worker.is_available) score += 10
  if (Number(worker.rating) >= 4.5) score += 5
  return Math.min(score, 100)
}

export default function FindStaffV2({ session, Workspace }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workerId = searchParams.get('worker')
  const [workers, setWorkers] = useState([])
  const [savedIds, setSavedIds] = useState(new Set())
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [tab, setTab] = useState('recommended')
  const [message, setMessage] = useState('')

  const categories = useMemo(() => ['All', ...new Set(workers.map((worker) => worker.category))], [workers])

  useEffect(() => {
    if (!session) return
    Promise.all([
      supabase.from('staff_profiles').select('*').eq('is_available', true).eq('is_verified', true).order('rating', { ascending: false }),
      supabase.from('saved_workers').select('worker_id').eq('hirer_id', session.user.id),
    ])   .then(([workerResult, savedResult]) => {
      if (workerResult.error) setMessage(workerResult.error.message)
      else setWorkers(workerResult.data || [])
      if (!savedResult.error) setSavedIds(new Set((savedResult.data || []).map((item) => item.worker_id)))
    })
  }, [session])

  const visibleWorkers = useMemo(() => {
    const filtered = workers
      .filter((worker) => {
        if (savedIds.has(worker.id)) return false
        const text = `${worker.name} ${worker.category} ${worker.location} ${worker.state || ''}`.toLowerCase()
        const matchesQuery = (query || '').toLowerCase() ? text.includes(query.toLowerCase()) : true
        const matchesCategory = category === 'All' || worker.category === category
        return matchesQuery && matchesCategory
      })
      .map((worker) => ({ ...worker, matchScore: scoreWorker(worker, query, category) }))
    if (tab === 'recommended') {
      return filtered.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
    }
    return filtered
  }, [workers, query, category, savedIds, tab])

  const save = async (worker) => {
    const { error } = await supabase.from('saved_workers').insert({ hirer_id: session.user.id, worker_id: worker.id })
    if (error && error.code !== '23505') setMessage(error.message)
    else { setSavedIds((current) => new Set([...current, worker.id])); setMessage(`${worker.name} saved to your shortlist.`) }
  }

  const viewProfile = (worker) => navigate(`/hirer/find-staff?worker=${worker.id}`)

  if (workerId) return <StaffProfileV2 workerId={workerId} Workspace={Workspace} />

  return <Workspace role="hirer">
    <section className="page-heading">
      <span className="eyebrow">Hirer marketplace</span>
      <h2>Find verified staff</h2>
      <p>Search by name, profession, location, or category. Saved workers stay in your shortlist for the event you are staffing.</p>
    </section>

    <div className="staff-search">
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chefs, servers, Abuja, Lagos..." aria-label="Search staff" />
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter staff category">
        {categories.map((item) => <option key={item}>{item}</option>)}
      </select>
    </div>

    <div className="auth-toggle marketplace-tabs">
      <button className={tab === 'recommended' ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setTab('recommended')}>Recommended workers</button>
      <button className={tab === 'all' ? 'toggle-btn active' : 'toggle-btn'} onClick={() => setTab('all')}>All verified staff</button>
    </div>

    {message && <p className="form-message">{message}</p>}
    <div className="match-grid">
      {visibleWorkers.length ? visibleWorkers.map((worker) => (
        <article className="match-card" key={worker.id}>
          <button className="profile-link" onClick={() => viewProfile(worker)}>
            <div className="match-head">
              <div className="avatar blue">{worker.name?.charAt(0) || 'W'}</div>
              <div>
                <h3>{worker.name}</h3>
                <span>{worker.category} · {worker.location}</span>
              </div>
            </div>
            <span className="match-score small">{worker.matchScore}% Match</span>
          </button>
          <p className="match-note">{worker.summary || worker.bio || 'Verified EventStaff NG professional.'}</p>
          <div className="match-footer">
            <span>{worker.years_experience || 0} years</span>
            <span>{Number(worker.rating || 0).toFixed(1)}★</span>
            {worker.is_verified && <span className="verification-badge small">✓ Verified</span>}
          </div>
          <div className="match-actions">
            <button className="secondary-btn small" onClick={() => save(worker)}>Save worker</button>
            <button className="primary-btn small" onClick={() => viewProfile(worker)}>View profile</button>
          </div>
        </article>
      )) : (
        <div className="empty-state">No staff match your search, or all matching staff are already saved.</div>
      )}
    </div>
  </Workspace>
}
