import { useState } from 'react'
import { formatDate } from '../lib/format'
import { Icon } from './ui'

const SUB_RATINGS = [['punctuality', 'Punctuality'], ['professionalism', 'Professionalism'], ['communication', 'Communication'], ['quality', 'Quality of work']]

// The average rating becomes a tag on the professional's profile.
export function ratingTier(rating, count) {
  const avg = Number(rating || 0)
  if (!count) return { label: 'New professional', tone: 'neutral', icon: 'Sparkles' }
  if (avg >= 4.8 && count >= 5) return { label: 'Top rated', tone: 'gold', icon: 'Award' }
  if (count < 3 && avg >= 4.5) return { label: 'Rising star', tone: 'success', icon: 'TrendingUp' }
  if (avg >= 4.5) return { label: 'Highly rated', tone: 'success', icon: 'ThumbsUp' }
  if (avg >= 4) return { label: 'Well rated', tone: 'brand', icon: 'ThumbsUp' }
  if (avg >= 3) return { label: 'Mixed reviews', tone: 'warning', icon: 'Scale' }
  return { label: 'Low rating', tone: 'danger', icon: 'TriangleAlert' }
}

export function StarRow({ value, size = 16 }) {
  const rating = Number(value || 0)
  return <span className="star-row" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => {
      const fill = Math.max(0, Math.min(1, rating - (n - 1)))
      return <span className="star-cell" key={n} style={{ width: size, height: size }}>
        <Icon name="Star" size={size} className="star-empty" />
        <span className="star-fill-clip" style={{ width: `${fill * 100}%` }}><Icon name="Star" size={size} className="star-full" /></span>
      </span>
    })}
  </span>
}

export function RatingTag({ rating, count, size = 'md' }) {
  const tier = ratingTier(rating, count)
  return <span className={`rating-tag tier-${tier.tone} rating-tag-${size}`} title={count ? `${Number(rating).toFixed(1)} average from ${count} review${count === 1 ? '' : 's'}` : 'No reviews yet'}>
    {count > 0 && <><Icon name="Star" size={size === 'sm' ? 12 : 14} className="star-full" /><strong>{Number(rating).toFixed(1)}</strong><span className="sep" /></>}
    <Icon name={tier.icon} size={size === 'sm' ? 12 : 14} />{tier.label}
    {count > 0 && <span className="rating-count">({count})</span>}
  </span>
}

export function RatingSummary({ reviews, rating, count }) {
  const total = reviews.length
  const avg = (key) => {
    const values = reviews.map((r) => Number(r[key])).filter(Boolean)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
  }
  const rebookAnswers = reviews.filter((r) => r.would_rebook != null)
  const rebook = rebookAnswers.length ? Math.round((rebookAnswers.filter((r) => r.would_rebook).length / rebookAnswers.length) * 100) : null
  const dist = [5, 4, 3, 2, 1].map((star) => [star, reviews.filter((r) => Math.round(Number(r.rating)) === star).length])

  return <div className="rating-summary">
    <div className="rating-big">
      <strong>{count ? Number(rating).toFixed(1) : '—'}</strong>
      <StarRow value={rating} size={18} />
      <span className="muted small">{count ? `${count} review${count === 1 ? '' : 's'}` : 'No reviews yet'}</span>
      <RatingTag rating={rating} count={count} size="sm" />
    </div>
    <div className="rating-dist">
      {dist.map(([star, n]) => <div className="dist-row" key={star}>
        <span>{star}<Icon name="Star" size={12} className="star-full" /></span>
        <div className="progress thin"><div className="progress-bar gold" style={{ width: total ? `${(n / total) * 100}%` : 0 }} /></div>
        <span className="muted small">{n}</span>
      </div>)}
    </div>
    <div className="rating-subs">
      {SUB_RATINGS.map(([key, label]) => <div className="sub-score" key={key}><span>{label}</span><strong>{avg(key) ? avg(key).toFixed(1) : '—'}</strong></div>)}
      {rebook != null && <div className="sub-score highlight"><span>Would hire again</span><strong>{rebook}%</strong></div>}
    </div>
  </div>
}

function Review({ review, canRespond, onRespond }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(review.response || '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    await onRespond(review, draft)
    setBusy(false)
    setEditing(false)
  }
  return <li className="review">
    <div className="review-head">
      <StarRow value={review.rating} />
      <strong>{Number(review.rating).toFixed(1)}</strong>
      <span className="muted small">{formatDate(review.created_at, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
    </div>
    <div className="review-meta">
      <span><Icon name="UserRound" size={13} />{review.reviewer_name || 'Verified client'}</span>
      {review.event_name && <span><Icon name="CalendarDays" size={13} />{review.event_name}</span>}
      {review.category && <span><Icon name="Briefcase" size={13} />{review.category}</span>}
      {review.would_rebook === true && <span className="rebook"><Icon name="Repeat" size={13} />Would hire again</span>}
    </div>
    {review.body ? <p>{review.body}</p> : <p className="muted small">No written comment.</p>}
    <div className="review-subs">{SUB_RATINGS.filter(([key]) => review[key]).map(([key, label]) => <span key={key}>{label} <strong>{Number(review[key]).toFixed(0)}</strong></span>)}</div>
    {review.response && !editing && <div className="review-response"><strong>Response from the professional</strong><p>{review.response}</p>{canRespond && <button className="link-btn" onClick={() => setEditing(true)}>Edit reply</button>}</div>}
    {canRespond && !review.response && !editing && <button className="link-btn" onClick={() => setEditing(true)}><Icon name="MessageSquareReply" size={14} />Reply publicly</button>}
    {editing && <div className="stack">
      <textarea rows="3" maxLength={600} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Thank the client, or add context. Replies are public." />
      <div className="row"><button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button><button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Post reply'}</button></div>
    </div>}
  </li>
}

export function ReviewList({ reviews, canRespond = false, onRespond, pageSize = 5 }) {
  const [shown, setShown] = useState(pageSize)
  const [sort, setSort] = useState('recent')
  if (!reviews.length) return <p className="muted">No reviews yet.</p>
  const sorted = [...reviews].sort(sort === 'recent' ? (a, b) => b.created_at.localeCompare(a.created_at) : sort === 'high' ? (a, b) => b.rating - a.rating : (a, b) => a.rating - b.rating)
  return <div className="stack">
    <div className="row between"><span className="muted small">Rating history · {reviews.length} review{reviews.length === 1 ? '' : 's'}</span>
      <select className="compact-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort reviews"><option value="recent">Most recent</option><option value="high">Highest first</option><option value="low">Lowest first</option></select>
    </div>
    <ul className="review-list">{sorted.slice(0, shown).map((review) => <Review key={review.id} review={review} canRespond={canRespond} onRespond={onRespond} />)}</ul>
    {shown < reviews.length && <button className="btn btn-secondary btn-sm" onClick={() => setShown(shown + pageSize)}>Show more reviews</button>}
  </div>
}
