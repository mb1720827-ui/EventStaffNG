import { useEffect, useState } from 'react'
import { useSession } from '../lib/session'
import { supabase } from '../lib/supabase'
import { Alert, Avatar, Field, Icon, Modal } from './ui'

const LABELS = ['', 'Poor', 'Below expectations', 'Good', 'Great', 'Outstanding']

function StarInput({ value, onChange, label, size = 22 }) {
  const [hover, setHover] = useState(0)
  return <div className="star-input" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
    {[1, 2, 3, 4, 5].map((n) => <button type="button" key={n} role="radio" aria-checked={value === n} className={n <= (hover || value) ? 'on' : ''}
      onMouseEnter={() => setHover(n)} onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? 's' : ''}`}><Icon name="Star" size={size} /></button>)}
  </div>
}

// Rate a professional after a completed booking. `booking` needs id,
// worker_user_id and staff_profiles { name }.
export default function ReviewModal({ booking, onClose, onDone }) {
  const { session } = useSession()
  const [form, setForm] = useState({ rating: 0, punctuality: 5, professionalism: 5, communication: 5, quality: 5, body: '', would_rebook: true })
  const [status, setStatus] = useState({ busy: false, error: '' })
  useEffect(() => {
    if (booking) {
      setForm({ rating: 0, punctuality: 5, professionalism: 5, communication: 5, quality: 5, body: '', would_rebook: true })
      setStatus({ busy: false, error: '' })
    }
  }, [booking])
  if (!booking) return null

  const name = booking.staff_profiles?.name || 'this professional'
  const submit = async (event) => {
    event.preventDefault()
    if (!form.rating) return setStatus({ busy: false, error: 'Choose an overall star rating.' })
    setStatus({ busy: true, error: '' })
    const { error } = await supabase.from('reviews').insert({ booking_id: booking.id, reviewer_id: session.user.id, reviewee_id: booking.worker_user_id, ...form, body: form.body.trim() || null })
    if (error) return setStatus({ busy: false, error: error.code === '23505' ? 'You already reviewed this booking.' : error.message })
    onDone?.(booking)
  }

  return <Modal open title="Rate your experience" onClose={onClose}>
    <form className="form" onSubmit={submit}>
      <div className="person-line"><Avatar name={name} /><div><strong>{name}</strong><span className="muted small">{booking.staff_profiles?.category || booking.job_posts?.category}{booking.events?.event_name ? ` · ${booking.events.event_name}` : ''}</span></div></div>
      <div className="overall-rating">
        <StarInput label="Overall rating" value={form.rating} size={34} onChange={(rating) => setForm({ ...form, rating })} />
        <span className="muted">{form.rating ? LABELS[form.rating] : 'Tap to rate'}</span>
      </div>
      <div className="field-row">
        {[['punctuality', 'Punctuality'], ['professionalism', 'Professionalism'], ['communication', 'Communication'], ['quality', 'Quality of work']].map(([key, label]) => <Field key={key} label={label}><StarInput label={label} value={form[key]} size={20} onChange={(value) => setForm({ ...form, [key]: value })} /></Field>)}
      </div>
      <Field label="Would you hire them again?">
        <div className="segmented">
          <button type="button" className={form.would_rebook ? 'active' : ''} onClick={() => setForm({ ...form, would_rebook: true })}><Icon name="ThumbsUp" size={15} />Yes</button>
          <button type="button" className={!form.would_rebook ? 'active' : ''} onClick={() => setForm({ ...form, would_rebook: false })}><Icon name="ThumbsDown" size={15} />No</button>
        </div>
      </Field>
      <Field label="Written review" hint="Public on their profile, shown with your first name and last initial."><textarea rows="4" maxLength={1000} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder={`How did ${name.split(' ')[0]} do?`} /></Field>
      <Alert tone="danger">{status.error}</Alert>
      <div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Later</button><button className="btn btn-primary" disabled={status.busy}>{status.busy ? 'Submitting…' : 'Submit rating'}</button></div>
    </form>
  </Modal>
}
