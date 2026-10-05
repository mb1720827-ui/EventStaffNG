import { NavLink } from 'react-router-dom'
import { RatingSummary, RatingTag, ReviewList } from '../../components/Ratings'
import Workspace from '../../components/Workspace'
import { Alert, EmptyState, Icon, PageHeader, Spinner } from '../../components/ui'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'

const TIERS = [
  ['Award', 'Top rated', '4.8★ or higher across at least 5 reviews'],
  ['TrendingUp', 'Rising star', '4.5★ or higher on your first reviews'],
  ['ThumbsUp', 'Highly rated', '4.5★ or higher'],
  ['ThumbsUp', 'Well rated', '4.0★ or higher'],
]

export default function Reviews() {
  const { session } = useSession()
  const { data, loading, error, reload } = useLoader(async () => {
    const [staff, reviews] = await Promise.all([
      supabase.from('staff_profiles').select('id,rating,review_count').eq('user_id', session.user.id).maybeSingle(),
      supabase.from('reviews').select('*').eq('reviewee_id', session.user.id).order('created_at', { ascending: false }),
    ])
    return { staff: staff.data, reviews: must(reviews) }
  }, [session])

  const respond = async (review, text) => {
    await supabase.from('reviews').update({ response: text }).eq('id', review.id)
    reload()
  }

  if (loading && !data) return <Workspace role="worker"><Spinner /></Workspace>
  const { staff, reviews } = data || { reviews: [] }
  const rating = staff?.rating || 0
  const count = staff?.review_count || reviews.length

  return <Workspace role="worker">
    <PageHeader eyebrow="Reputation" title="Ratings & reviews" description="Every completed booking can be rated by the client. Your average becomes the tag hirers see on your profile."
      actions={staff && <NavLink to={`/worker/profile`} className="btn btn-secondary"><Icon name="Eye" size={16} />View my profile</NavLink>} />
    <Alert tone="danger">{error?.message}</Alert>

    <div className="profile-layout">
      <div className="stack">
        <section className="card card-pad">
          <RatingSummary reviews={reviews} rating={rating} count={count} />
        </section>
        <section className="card card-pad">
          <h2 className="card-title">Review history</h2>
          {reviews.length ? <ReviewList reviews={reviews} canRespond onRespond={respond} pageSize={8} />
            : <EmptyState icon="Star" title="No reviews yet" action={<NavLink to="/worker/jobs" className="btn btn-primary btn-sm">Find jobs</NavLink>}>Complete your first booking — the client rates you once they confirm the job is done.</EmptyState>}
        </section>
      </div>
      <aside className="stack">
        <section className="card card-pad">
          <h2 className="card-title">Your tag</h2>
          <RatingTag rating={rating} count={count} />
          <p className="muted small">Shown on your profile, in search results and on every application you send.</p>
          <ul className="tier-list">{TIERS.map(([icon, label, rule]) => <li key={label}><Icon name={icon} size={16} /><div><strong>{label}</strong><span>{rule}</span></div></li>)}</ul>
        </section>
        <section className="card card-pad tint">
          <h3><Icon name="MessageSquareReply" size={18} />Reply to reviews</h3>
          <p className="small">A short, polite reply shows hirers you care — especially on a lower rating. Replies are public.</p>
        </section>
      </aside>
    </div>
  </Workspace>
}
