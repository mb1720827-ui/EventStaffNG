import { useMemo, useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Alert, CategoryIcon, EmptyState, Icon, PageHeader, Spinner, Tabs } from '../../components/ui'
import { CATEGORY_TITLES, LAUNCH_STATES } from '../../lib/constants'
import { MIN_MATCH_THRESHOLD, scoreJobForWorker } from '../../lib/matching'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'
import { loadWorkerContext } from '../../lib/workerContext'
import { JobCard } from './shared'

export default function Jobs() {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'recommended'
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [state, setState] = useState('')
  const [sort, setSort] = useState('match')

  const { data, loading, error } = useLoader(async () => {
    const [ctx, jobs, apps] = await Promise.all([
      loadWorkerContext(session.user.id),
      supabase.from('job_posts').select('*, events(event_name,event_type)').eq('status', 'open').gte('event_date', new Date().toISOString().slice(0, 10)).order('event_date'),
      supabase.from('job_applications').select('job_id').eq('worker_id', session.user.id),
    ])
    return {
      worker: ctx.worker,
      applied: new Set(must(apps).map((a) => a.job_id)),
      jobs: must(jobs).filter((job) => job.hirer_id !== session.user.id).map((job) => ({ ...job, matchScore: scoreJobForWorker(job, ctx.worker).score })),
    }
  }, [session])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const stateKey = state.toLowerCase().includes('abuja') ? 'abuja' : state.toLowerCase()
    const rows = (data?.jobs || []).filter((job) =>
      (tab === 'all' || job.matchScore >= MIN_MATCH_THRESHOLD)
      && (!category || job.category === category)
      && (!state || job.state === state || job.location.toLowerCase().includes(stateKey))
      && (!q || `${job.title} ${job.location} ${job.description || ''}`.toLowerCase().includes(q)))
    const sorters = { match: (a, b) => b.matchScore - a.matchScore, date: (a, b) => a.event_date.localeCompare(b.event_date), pay: (a, b) => b.budget - a.budget }
    return rows.sort(sorters[sort])
  }, [data, tab, query, category, state, sort])

  const recommendedCount = (data?.jobs || []).filter((job) => job.matchScore >= MIN_MATCH_THRESHOLD).length

  return <Workspace role="worker">
    <PageHeader eyebrow="Job marketplace" title="Find event work" description="Jobs are ranked by how well they fit your profession, location, availability, skills and pay expectations." />
    <Tabs value={tab} onChange={(next) => setParams({ tab: next }, { replace: true })} tabs={[['recommended', 'Recommended', recommendedCount], ['all', 'All open jobs', data?.jobs.length]]} />
    <div className="filter-bar card">
      <div className="search-input"><Icon name="Search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search events, venues, areas…" aria-label="Search jobs" /></div>
      <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Category"><option value="">All categories</option>{CATEGORY_TITLES.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={state} onChange={(event) => setState(event.target.value)} aria-label="Location"><option value="">All locations</option>{LAUNCH_STATES.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort"><option value="match">Best match</option><option value="date">Soonest</option><option value="pay">Highest pay</option></select>
    </div>
    <Alert tone="danger">{error?.message}</Alert>
    {loading ? <Spinner label="Matching jobs to your profile…" /> : list.length
      ? <div className="job-grid">{list.map((job) => <JobCard key={job.id} job={job} applied={data.applied.has(job.id)} />)}</div>
      : <EmptyState icon="BriefcaseBusiness" title={tab === 'recommended' ? 'No strong matches yet' : 'No open jobs match those filters'}
        action={tab === 'recommended' ? <div className="row center"><NavLink to="/worker/profile/edit" className="btn btn-secondary btn-sm">Update preferences</NavLink><button className="btn btn-primary btn-sm" onClick={() => setParams({ tab: 'all' })}>Browse all jobs</button></div> : null}>
        {tab === 'recommended' ? 'Add more categories, areas and availability to your profile to widen your matches.' : 'Try clearing a filter.'}
      </EmptyState>}
    {!loading && category === '' && tab === 'all' && list.length > 0 && <div className="chip-row muted-chips">{CATEGORY_TITLES.map((item) => <button key={item} className="chip" onClick={() => setCategory(item)}><CategoryIcon category={item} size={14} />{item}</button>)}</div>}
  </Workspace>
}
