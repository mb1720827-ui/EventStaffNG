import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import Workspace from '../../components/Workspace'
import { Alert, Avatar, Badge, CategoryIcon, EmptyState, Field, Icon, Modal, PageHeader, Spinner, Stat, StatusBadge, Tabs } from '../../components/ui'
import { BOOKING_STATUS, DOCUMENT_STATUS, PAYMENT_STATUS } from '../../lib/constants'
import { formatDate, money, timeAgo } from '../../lib/format'
import { requiredDocsFor } from '../../lib/matching'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'

const count = async (query) => (await query).count || 0

export function AdminOverview() {
  const { data, loading } = useLoader(async () => {
    const head = { count: 'exact', head: true }
    const [workers, hirers, verified, openJobs, active, pendingDocs, enquiries, fees] = await Promise.all([
      count(supabase.from('profiles').select('id', head).eq('role', 'worker')),
      count(supabase.from('profiles').select('id', head).eq('role', 'hirer')),
      count(supabase.from('staff_profiles').select('id', head).eq('is_verified', true)),
      count(supabase.from('job_posts').select('id', head).eq('status', 'open')),
      count(supabase.from('bookings').select('id', head).in('status', ['pending', 'confirmed'])),
      count(supabase.from('worker_documents').select('id', head).in('status', ['submitted', 'under_review'])),
      count(supabase.from('contact_requests').select('id', head).eq('status', 'new')),
      supabase.from('payments').select('platform_fee,amount,status'),
    ])
    const payments = fees.data || []
    return {
      workers, hirers, verified, openJobs, active, pendingDocs, enquiries,
      gmv: payments.reduce((s, p) => s + Number(p.amount), 0),
      revenue: payments.reduce((s, p) => s + Number(p.platform_fee), 0),
      payoutsDue: payments.filter((p) => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0),
    }
  }, [])

  return <Workspace role="admin">
    <PageHeader eyebrow="Operations" title="Platform overview" />
    {loading ? <Spinner /> : <>
      <div className="stat-grid">
        <Stat icon="ShieldCheck" label="Documents to review" value={data.pendingDocs} tone="accent" to="/admin/verifications" />
        <Stat icon="Banknote" label="Payouts due" value={money(data.payoutsDue)} tone="info" to="/admin/bookings" />
        <Stat icon="Inbox" label="New enquiries" value={data.enquiries} to="/admin/enquiries" />
        <Stat icon="BriefcaseBusiness" label="Open jobs" value={data.openJobs} tone="success" />
      </div>
      <div className="stat-grid">
        <Stat icon="UserRound" label="Professionals" value={data.workers} hint={`${data.verified} verified`} to="/admin/users" />
        <Stat icon="Building2" label="Hirers" value={data.hirers} to="/admin/users" />
        <Stat icon="CalendarCheck" label="Active bookings" value={data.active} tone="success" />
        <Stat icon="TrendingUp" label="Commission earned" value={money(data.revenue)} tone="accent" hint={`${money(data.gmv)} booked value`} />
      </div>
    </>}
  </Workspace>
}

function DocumentReview({ doc, onDone }) {
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [busy, setBusy] = useState(false)
  const open = async () => {
    const { data, error } = await supabase.storage.from('documents').createSignedUrl(doc.file_path.replace(/^documents\//, ''), 300)
    if (error) window.alert(`Couldn't open file: ${error.message}. Add a storage policy allowing admins to read the documents bucket.`)
    else window.open(data.signedUrl, '_blank', 'noopener')
  }
  const decide = async (status) => {
    setBusy(true)
    await supabase.from('worker_documents').update({ status, rejection_reason: status === 'rejected' ? reason || 'Document unclear or invalid' : null, reviewed_at: new Date().toISOString() }).eq('id', doc.id)
    setBusy(false)
    setRejecting(false)
    onDone()
  }
  return <li className="doc-review">
    <Icon name="FileText" size={18} />
    <div><strong>{doc.name}</strong><span className="muted small">{doc.document_type} · submitted {timeAgo(doc.submitted_at || doc.created_at)}</span></div>
    <StatusBadge map={DOCUMENT_STATUS} value={doc.status} />
    <div className="row">
      {doc.file_path && <button className="btn btn-ghost btn-sm" onClick={open}><Icon name="Eye" size={15} />View</button>}
      {doc.status !== 'verified' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => decide('verified')}>Approve</button>}
      {doc.status !== 'rejected' && <button className="btn btn-ghost btn-sm danger-text" disabled={busy} onClick={() => setRejecting(true)}>Reject</button>}
    </div>
    <Modal open={rejecting} onClose={() => setRejecting(false)} title={`Reject ${doc.name}`}>
      <div className="form">
        <Field label="Reason (shown to the professional)"><textarea rows="3" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The image is blurry — please upload a clearer photo of the full document." /></Field>
        <div className="modal-actions"><button className="btn btn-ghost" onClick={() => setRejecting(false)}>Cancel</button><button className="btn btn-danger" disabled={busy} onClick={() => decide('rejected')}>Reject document</button></div>
      </div>
    </Modal>
  </li>
}

export function AdminVerifications() {
  const [tab, setTab] = useState('queue')
  const [message, setMessage] = useState('')
  const { data, loading, error, reload } = useLoader(async () => {
    const [docs, staff, people] = await Promise.all([
      supabase.from('worker_documents').select('*').order('submitted_at', { ascending: true }),
      supabase.from('staff_profiles').select('*').not('user_id', 'is', null),
      supabase.from('profiles').select('id,full_name,phone,state,avatar_url,created_at').eq('role', 'worker'),
    ])
    const staffByUser = new Map(must(staff).map((s) => [s.user_id, s]))
    const peopleById = new Map(must(people).map((p) => [p.id, p]))
    const byWorker = new Map()
    must(docs).forEach((doc) => byWorker.set(doc.worker_id, [...(byWorker.get(doc.worker_id) || []), doc]))
    return [...byWorker.entries()].map(([id, workerDocs]) => ({ id, person: peopleById.get(id), staff: staffByUser.get(id), docs: workerDocs }))
  }, [])

  const groups = useMemo(() => {
    const rows = data || []
    return {
      queue: rows.filter((r) => !r.staff?.is_verified && r.docs.some((d) => ['submitted', 'under_review'].includes(d.status))),
      ready: rows.filter((r) => !r.staff?.is_verified && !r.docs.some((d) => ['submitted', 'under_review'].includes(d.status)) && r.docs.some((d) => d.status === 'verified')),
      verified: rows.filter((r) => r.staff?.is_verified),
    }
  }, [data])

  const setVerified = async (row, value) => {
    if (!row.staff) return setMessage('This professional has no marketplace profile yet — they need to choose a profession first.')
    const { error: updateError } = await supabase.from('staff_profiles').update({ is_verified: value, verification_status: value ? 'approved' : 'pending' }).eq('id', row.staff.id)
    setMessage(updateError ? updateError.message : value ? `${row.person?.full_name} is now verified and listed in Find Staff.` : 'Verification revoked.')
    reload()
  }

  const list = groups[tab]
  return <Workspace role="admin">
    <PageHeader eyebrow="Trust & safety" title="Verification queue" description="Review documents, then approve the professional to list them in Find Staff." />
    <Tabs value={tab} onChange={setTab} tabs={[['queue', 'Needs review', groups.queue.length], ['ready', 'Ready to approve', groups.ready.length], ['verified', 'Verified', groups.verified.length]]} />
    <Alert tone="info" onClose={() => setMessage('')}>{message}</Alert>
    <Alert tone="danger">{error?.message}</Alert>
    {loading && !data ? <Spinner /> : list.length ? <div className="stack">
      {list.map((row) => {
        const required = requiredDocsFor(row.staff?.category).filter((r) => r.required)
        const missing = required.filter((r) => !row.docs.some((d) => d.document_type === r.document_type && d.status === 'verified'))
        return <section className="card" key={row.id}>
          <header className="card-head">
            <div className="person-line"><Avatar name={row.person?.full_name} src={row.person?.avatar_url} /><div><strong>{row.person?.full_name || 'Unknown'}</strong><span className="muted small">{row.staff?.category ? <><CategoryIcon category={row.staff.category} size={12} /> {row.staff.category}</> : 'No profession set'} · {row.person?.state} · {row.person?.phone}</span></div></div>
            {row.staff?.is_verified
              ? <button className="btn btn-ghost btn-sm danger-text" onClick={() => setVerified(row, false)}>Revoke</button>
              : <button className="btn btn-primary btn-sm" disabled={missing.length > 0} title={missing.length ? `Still needs: ${missing.map((m) => m.label).join(', ')}` : ''} onClick={() => setVerified(row, true)}><Icon name="BadgeCheck" size={15} />Approve professional</button>}
          </header>
          <ul className="doc-review-list">{row.docs.map((doc) => <DocumentReview key={doc.id} doc={doc} onDone={reload} />)}</ul>
          {!row.staff?.is_verified && missing.length > 0 && <p className="muted small pad-x">Required before approval: {missing.map((m) => m.label).join(', ')}</p>}
        </section>
      })}
    </div> : <EmptyState icon="ShieldCheck" title="Nothing here">{tab === 'queue' ? 'No documents waiting for review.' : 'No professionals in this state.'}</EmptyState>}
  </Workspace>
}

export function AdminUsers() {
  const [role, setRole] = useState('worker')
  const [q, setQ] = useState('')
  const { data, loading } = useLoader(async () => must(await supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(500)), [])
  const rows = (data || []).filter((p) => p.role === role && (!q || `${p.full_name} ${p.phone} ${p.state}`.toLowerCase().includes(q.toLowerCase())))
  const counts = (data || []).reduce((acc, p) => ({ ...acc, [p.role]: (acc[p.role] || 0) + 1 }), {})
  return <Workspace role="admin">
    <PageHeader eyebrow="People" title="Users" />
    <Tabs value={role} onChange={setRole} tabs={[['worker', 'Professionals', counts.worker || 0], ['hirer', 'Hirers', counts.hirer || 0], ['admin', 'Admins', counts.admin || 0]]} />
    <div className="filter-bar card"><div className="search-input"><Icon name="Search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or state…" /></div></div>
    {loading ? <Spinner /> : <div className="card table-card">
      {rows.map((p) => <div className="booking-row" key={p.id}>
        <Avatar name={p.full_name} src={p.avatar_url} />
        <div className="booking-main"><strong>{p.full_name}</strong><div className="meta"><span>{p.phone || 'No phone'}</span><span>{p.state || '—'}</span></div></div>
        <span className="muted small">Joined {formatDate(p.created_at)}</span>
      </div>)}
      {!rows.length && <EmptyState icon="Users" title="No users found" />}
    </div>}
  </Workspace>
}

export function AdminBookings() {
  const [tab, setTab] = useState('payouts')
  const { data, loading, reload } = useLoader(async () => {
    const [payments, bookings, disputes] = await Promise.all([
      supabase.from('payments').select('*, bookings(events(event_name,event_date), staff_profiles(name))').order('created_at', { ascending: false }),
      supabase.from('bookings').select('*, events(event_name,event_date), staff_profiles(name,category)').order('created_at', { ascending: false }).limit(200),
      supabase.from('disputes').select('*, bookings(agreed_amount, events(event_name,event_date), staff_profiles(name))').order('created_at', { ascending: false }),
    ])
    return { payments: must(payments), bookings: must(bookings), disputes: must(disputes) }
  }, [])
  const markPaid = async (payment) => {
    const reference = window.prompt('Transfer reference (optional)') ?? null
    await supabase.from('payments').update({ status: 'paid', paid_at: new Date().toISOString(), provider: 'bank_transfer', provider_reference: reference || null }).eq('id', payment.id)
    reload()
  }
  return <Workspace role="admin">
    <PageHeader eyebrow="Finance" title="Bookings & payouts" />
    <Tabs value={tab} onChange={setTab} tabs={[['payouts', 'Payouts', data?.payments.filter((p) => p.status === 'pending').length], ['bookings', 'All bookings', data?.bookings.length], ['disputes', 'Disputes', data?.disputes.filter((d) => ['open', 'investigating'].includes(d.status)).length]]} />
    {loading ? <Spinner /> : tab === 'disputes' ? <div className="stack">
      {data.disputes.map((d) => <article className="card card-pad" key={d.id}>
        <div className="row between wrap-gap">
          <div><strong>{d.bookings?.staff_profiles?.name}</strong><div className="meta"><span>{d.bookings?.events?.event_name}</span><span>{formatDate(d.bookings?.events?.event_date)}</span><span>{money(d.bookings?.agreed_amount)}</span><span className="muted">{timeAgo(d.created_at)}</span></div></div>
          <select value={d.status} aria-label="Dispute status" onChange={async (e) => { await supabase.from('disputes').update({ status: e.target.value }).eq('id', d.id); reload() }}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select>
        </div>
        <p className="enquiry-body">{d.reason}</p>
      </article>)}
      {!data.disputes.length && <EmptyState icon="LifeBuoy" title="No disputes">Problems reported by professionals or hirers appear here.</EmptyState>}
    </div> : tab === 'payouts' ? <div className="card table-card">
      {data.payments.map((p) => <div className="booking-row" key={p.id}>
        <span className="stat-icon tone-info"><Icon name="Banknote" size={18} /></span>
        <div className="booking-main"><strong>{p.bookings?.staff_profiles?.name}</strong><div className="meta"><span>{p.bookings?.events?.event_name}</span><span>{formatDate(p.bookings?.events?.event_date)}</span></div></div>
        <div className="booking-amount"><strong>{money(p.amount)}</strong><span className="muted small">fee {money(p.platform_fee)}</span></div>
        <div className="booking-actions"><StatusBadge map={PAYMENT_STATUS} value={p.status} />{p.received_at && <Badge tone="success" icon="CircleCheck">Receipt confirmed</Badge>}{p.status === 'pending' && <button className="btn btn-primary btn-sm" onClick={() => markPaid(p)}>Mark paid</button>}</div>
      </div>)}
      {!data.payments.length && <EmptyState icon="Banknote" title="No payouts yet">Payouts are created when hirers mark bookings complete.</EmptyState>}
    </div> : <div className="card table-card">
      {data.bookings.map((b) => <div className="booking-row" key={b.id}>
        <CategoryIcon category={b.staff_profiles?.category} />
        <div className="booking-main"><strong>{b.staff_profiles?.name}</strong><div className="meta"><span>{b.events?.event_name}</span><span>{formatDate(b.events?.event_date)}</span></div></div>
        <div className="booking-amount"><strong>{money(b.agreed_amount)}</strong></div>
        <div className="booking-actions"><StatusBadge map={BOOKING_STATUS} value={b.status} /></div>
      </div>)}
    </div>}
  </Workspace>
}

export function AdminEnquiries() {
  const { data, loading, reload } = useLoader(async () => must(await supabase.from('contact_requests').select('*').order('created_at', { ascending: false })), [])
  const setStatus = async (row, status) => { await supabase.from('contact_requests').update({ status }).eq('id', row.id); reload() }
  return <Workspace role="admin">
    <PageHeader eyebrow="Sales & support" title="Enquiries" description="Messages from the contact form, including corporate retainer and Planner Pro requests." />
    {loading ? <Spinner /> : data.length ? <div className="stack">
      {data.map((row) => <article className="card card-pad" key={row.id}>
        <div className="row between wrap-gap">
          <div><strong>{row.name}</strong>{row.organization && <span className="muted"> · {row.organization}</span>}<div className="meta"><a href={`mailto:${row.email}`}>{row.email}</a>{row.phone && <a href={`tel:${row.phone}`}>{row.phone}</a>}<span className="muted">{timeAgo(row.created_at)}</span></div></div>
          <div className="row"><Badge tone={row.topic.includes('Corporate') || row.topic.includes('Pro') ? 'accent' : 'neutral'}>{row.topic}</Badge>
            <select value={row.status} onChange={(e) => setStatus(row, e.target.value)} aria-label="Status"><option value="new">New</option><option value="in_progress">In progress</option><option value="closed">Closed</option></select>
          </div>
        </div>
        <p className="enquiry-body">{row.message}</p>
      </article>)}
    </div> : <EmptyState icon="Inbox" title="No enquiries yet" />}
    <p className="muted small"><NavLink to="/contact">Open the public contact form</NavLink></p>
  </Workspace>
}
