import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { COMMISSION_RATE } from '../lib/constants'
import { money, formatDate } from '../lib/format'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Alert, Avatar, Field, Icon, Modal, Spinner } from './ui'

// Offer a booking to a specific professional for one of the hirer's open roles.
export default function BookModal({ staff, open, onClose, onBooked, presetJobId }) {
  const { session } = useSession()
  const [jobs, setJobs] = useState(null)
  const [jobId, setJobId] = useState(presetJobId || '')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState({ busy: false, error: '', done: false })

  useEffect(() => {
    if (!open || !session) return
    setStatus({ busy: false, error: '', done: false })
    supabase.from('job_posts').select('id,title,category,budget,event_id,event_date,location,workers_required')
      .eq('hirer_id', session.user.id).eq('status', 'open').gte('event_date', new Date().toISOString().slice(0, 10)).order('event_date')
      .then(({ data }) => {
        const sorted = (data || []).sort((a, b) => Number(b.category === staff?.category) - Number(a.category === staff?.category))
        setJobs(sorted)
        const initial = sorted.find((job) => job.id === presetJobId) || sorted[0]
        if (initial) { setJobId(initial.id); setAmount(String(initial.budget || '')) }
      })
  }, [open, session, staff, presetJobId])

  const job = jobs?.find((item) => item.id === jobId)
  const fee = Number(amount || 0) * COMMISSION_RATE

  const submit = async (event) => {
    event.preventDefault()
    if (!job) return
    setStatus({ busy: true, error: '', done: false })
    const { error } = await supabase.from('bookings').insert({
      event_id: job.event_id, job_id: job.id, worker_id: staff.id, hirer_id: session.user.id,
      agreed_amount: Number(amount), notes: notes || null, status: 'pending',
    })
    if (error) {
      const message = error.code === '23505' ? `${staff.name} is already booked for this event.` : error.message
      return setStatus({ busy: false, error: message, done: false })
    }
    setStatus({ busy: false, error: '', done: true })
    onBooked?.()
  }

  return <Modal open={open} onClose={onClose} title={status.done ? 'Booking offer sent' : `Book ${staff?.name || 'professional'}`}>
    {status.done ? <div className="success-panel">
      <span className="success-icon"><Icon name="Send" size={28} /></span>
      <p><strong>{staff.name}</strong> has been notified. You'll get an alert when they confirm.</p>
      <div className="row center"><NavLink to="/hirer/bookings" className="btn btn-primary">View bookings</NavLink><button className="btn btn-ghost" onClick={onClose}>Close</button></div>
    </div>
      : jobs === null ? <Spinner />
      : !jobs.length ? <div className="stack">
        <p>You need an event with an open role before you can book someone.</p>
        <NavLink to={`/hirer/post-event${staff?.category ? `?category=${encodeURIComponent(staff.category)}` : ''}`} className="btn btn-primary">Post an event</NavLink>
      </div>
      : <form className="form" onSubmit={submit}>
        <div className="person-line"><Avatar name={staff.name} size="md" /><div><strong>{staff.name}</strong><span className="muted">{staff.category} · {staff.location}</span></div></div>
        <Field label="Role">
          <select value={jobId} onChange={(event) => { setJobId(event.target.value); setAmount(String(jobs.find((item) => item.id === event.target.value)?.budget || '')) }}>
            {jobs.map((item) => <option key={item.id} value={item.id}>{item.title} · {formatDate(item.event_date, { day: 'numeric', month: 'short' })}{item.category !== staff.category ? ' (different category)' : ''}</option>)}
          </select>
        </Field>
        <Field label="Agreed rate for this event (₦)" hint="Defaults to the role's budget per worker."><input type="number" min="0" step="500" value={amount} onChange={(event) => setAmount(event.target.value)} required /></Field>
        <Field label="Note to the professional"><textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Dress code, arrival time, who to report to…" /></Field>
        <dl className="breakdown small">
          <div><dt>Agreed rate</dt><dd>{money(amount)}</dd></div>
          <div><dt>Service fee ({COMMISSION_RATE * 100}%)</dt><dd>{money(fee)}</dd></div>
          <div className="total"><dt>Total</dt><dd>{money(Number(amount || 0) + fee)}</dd></div>
        </dl>
        <Alert tone="danger">{status.error}</Alert>
        <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={status.busy}>{status.busy ? 'Sending…' : 'Send booking offer'}</button></div>
      </form>}
  </Modal>
}
