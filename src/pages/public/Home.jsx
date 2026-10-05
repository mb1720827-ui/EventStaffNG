import { useEffect, useMemo, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import PublicLayout from '../../components/PublicLayout'
import { Badge, CategoryIcon, Icon, VerifiedBadge } from '../../components/ui'
import { AUDIENCES, CATEGORIES, COMMISSION_RATE, HIRER_PLANS, LAUNCH_STATES, STATE_AREAS } from '../../lib/constants'
import { EVENT_TYPES, generateStaffingRecommendations } from '../../lib/matching'
import { money } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import { Faq, HIRER_STEPS, WORKER_STEPS } from './content'

function useCategoryCounts() {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    if (!supabase) return
    supabase.from('categories').select('title,available_count').eq('is_active', true)
      .then(({ data }) => data && setCounts(Object.fromEntries(data.map((row) => [row.title, row.available_count]))))
  }, [])
  return counts
}

function HeroVisual() {
  return <div className="hero-visual" aria-hidden="true">
    <div className="hv-card hv-event">
      <div className="hv-row"><span className="hv-chip"><Icon name="CalendarHeart" size={14} />Wedding reception</span><Badge tone="success">Fully booked</Badge></div>
      <h4>Adaeze & Tobi · 450 guests</h4>
      <p><Icon name="MapPin" size={14} />Eko Hotel, Victoria Island · Sat 6pm</p>
      <div className="hv-staff">
        {[['Servers', '18/18'], ['Ushers', '8/8'], ['Security', '6/6'], ['Cleaners', '6/6']].map(([role, n]) => <div key={role}><strong>{n}</strong><span>{role}</span></div>)}
      </div>
    </div>
    <div className="hv-card hv-worker">
      <span className="avatar avatar-md">AB</span>
      <div><strong>Aisha Bello</strong><span>Banquet server · Wuse II</span><VerifiedBadge compact /></div>
      <span className="match-pill match-high"><Icon name="Sparkles" size={13} />96%</span>
    </div>
    <div className="hv-card hv-toast"><Icon name="CircleCheck" size={18} /><span><strong>Musa D.</strong> accepted your booking</span></div>
  </div>
}

function StaffingPlannerDemo() {
  const [type, setType] = useState('Wedding')
  const [guests, setGuests] = useState(300)
  const navigate = useNavigate()
  const plan = useMemo(() => generateStaffingRecommendations({ eventType: type, guestCount: guests, durationHours: 6 }), [type, guests])
  const total = plan.reduce((sum, row) => sum + row.recommended * row.defaultBudget, 0)
  const people = plan.reduce((sum, row) => sum + row.recommended, 0)

  return <div className="planner">
    <div className="planner-controls">
      <label className="field"><span className="field-label">Event type</span>
        <select value={type} onChange={(event) => setType(event.target.value)}>{EVENT_TYPES.filter((item) => item !== 'Other').map((item) => <option key={item}>{item}</option>)}</select>
      </label>
      <label className="field"><span className="field-label">Guests: <strong>{guests}</strong></span>
        <input type="range" min="30" max="1500" step="10" value={guests} onChange={(event) => setGuests(Number(event.target.value))} />
      </label>
      <div className="planner-total">
        <span>Suggested team</span><strong>{people} people</strong>
        <span>Estimated staffing budget</span><strong>{money(total)}</strong>
        <small>6-hour event · editable before you publish</small>
      </div>
      <button className="btn btn-accent btn-block" onClick={() => navigate(`/get-started?role=hirer&type=${encodeURIComponent(type)}&guests=${guests}`)}>Use this plan<Icon name="ArrowRight" size={16} /></button>
    </div>
    <ul className="planner-list">
      {plan.map((row) => <li key={row.category}>
        <CategoryIcon category={row.category} size={18} />
        <div><strong>{row.category}</strong><span>{row.reason}</span></div>
        <b>{row.recommended}</b>
      </li>)}
    </ul>
  </div>
}

export default function Home() {
  const navigate = useNavigate()
  const counts = useCategoryCounts()
  const [journey, setJourney] = useState('hirer')
  const [quick, setQuick] = useState({ category: '', state: LAUNCH_STATES[0], date: '' })
  const totalAvailable = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0)

  const startQuick = (event) => {
    event.preventDefault()
    const params = new URLSearchParams({ role: 'hirer', ...(quick.category && { category: quick.category }), state: quick.state, ...(quick.date && { date: quick.date }) })
    navigate(`/get-started?${params}`)
  }

  return <PublicLayout>
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="pill"><span className="pulse" />Now live in Abuja & Lagos</span>
          <h1>Verified event staff, <em>booked in minutes</em> — not days.</h1>
          <p className="lead">EventStaff NG connects event organisers, corporates, government agencies, families and hospitality businesses with vetted, trained and insured event professionals across Nigeria.</p>
          <form className="quick-book" onSubmit={startQuick}>
            <label><span>I need</span>
              <select value={quick.category} onChange={(event) => setQuick({ ...quick, category: event.target.value })}>
                <option value="">Any event staff</option>
                {CATEGORIES.map((item) => <option key={item.slug}>{item.title}</option>)}
              </select>
            </label>
            <label><span>In</span>
              <select value={quick.state} onChange={(event) => setQuick({ ...quick, state: event.target.value })}>{LAUNCH_STATES.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label><span>On</span><input type="date" value={quick.date} min={new Date().toISOString().slice(0, 10)} onChange={(event) => setQuick({ ...quick, date: event.target.value })} /></label>
            <button className="btn btn-primary btn-lg"><Icon name="Search" size={18} />Find staff</button>
          </form>
          <div className="hero-secondary">
            <span>Looking for event work?</span>
            <NavLink to="/get-started?role=worker">Join as a professional<Icon name="ArrowRight" size={15} /></NavLink>
          </div>
          <ul className="hero-trust">
            <li><Icon name="BadgeCheck" size={18} />ID & credential checks</li>
            <li><Icon name="GraduationCap" size={18} />Trained for events</li>
            <li><Icon name="Umbrella" size={18} />Insured on the job</li>
          </ul>
        </div>
        <HeroVisual />
      </div>
    </section>

    <section className="stats-strip">
      <div className="container stats-grid">
        <div><strong>8</strong><span>Staff categories</span></div>
        <div><strong>{totalAvailable ? `${totalAvailable}+` : '2'}</strong><span>{totalAvailable ? 'Professionals on the platform' : 'Launch cities'}</span></div>
        <div><strong>&lt; 10 min</strong><span>To post a fully staffed event</span></div>
        <div><strong>100%</strong><span>Of listed staff ID-verified</span></div>
      </div>
    </section>

    <section className="section">
      <div className="container split">
        <div>
          <span className="eyebrow">The problem</span>
          <h2>Nigeria's events industry runs on phone contacts and hope.</h2>
          <p className="lead-sm">Finding reliable servers, security or ushers still means calling around, chasing WhatsApp groups and paying deposits to people you've never met. No-shows and unvetted staff put your event — and your reputation — at risk.</p>
        </div>
        <div className="compare">
          <div className="compare-col bad">
            <h4><Icon name="CircleX" size={18} />The old way</h4>
            <ul><li>Days of calls and referrals</li><li>No ID or background checks</li><li>Last-minute no-shows</li><li>Cash deposits with no protection</li><li>No ratings or track record</li></ul>
          </div>
          <div className="compare-col good">
            <h4><Icon name="CircleCheck" size={18} />With EventStaff NG</h4>
            <ul><li>Book a full team in minutes</li><li>Every professional verified</li><li>Confirmed bookings & backups</li><li>Transparent, platform-held pay</li><li>Ratings after every event</li></ul>
          </div>
        </div>
      </div>
    </section>

    <section className="section section-tint" id="categories">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Staff categories</span>
          <h2>Every role your event needs, on one platform</h2>
          <p>From the kitchen to the gate — book specialists who've been checked for the job they do.</p>
        </div>
        <div className="category-grid">
          {CATEGORIES.map((item) => <NavLink to={`/categories#${item.slug}`} className="category-card" key={item.slug}>
            <CategoryIcon category={item.title} size={24} />
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <span className="category-foot">{counts[item.title] ? `${counts[item.title]} available` : 'Browse professionals'}<Icon name="ArrowUpRight" size={16} /></span>
          </NavLink>)}
        </div>
      </div>
    </section>

    <section className="section" id="how">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2>Two simple journeys, one trusted marketplace</h2>
        </div>
        <div className="segmented center">
          <button className={journey === 'hirer' ? 'active' : ''} onClick={() => setJourney('hirer')}><Icon name="Building2" size={16} />I'm hiring</button>
          <button className={journey === 'worker' ? 'active' : ''} onClick={() => setJourney('worker')}><Icon name="UserRound" size={16} />I want to work</button>
        </div>
        <ol className="steps-grid">
          {(journey === 'hirer' ? HIRER_STEPS : WORKER_STEPS).map((step, index) => <li key={step.title}>
            <span className="step-num">{index + 1}</span>
            <Icon name={step.icon} size={22} />
            <h3>{step.title}</h3>
            <p>{step.body}</p>
          </li>)}
        </ol>
        <div className="center-row">
          <NavLink to={`/get-started?role=${journey}`} className="btn btn-primary btn-lg">{journey === 'hirer' ? 'Post your first event' : 'Create your professional profile'}<Icon name="ArrowRight" size={16} /></NavLink>
        </div>
      </div>
    </section>

    <section className="section section-dark">
      <div className="container">
        <div className="section-head light">
          <span className="eyebrow">AI staffing planner</span>
          <h2>Not sure how many people you need? We'll tell you.</h2>
          <p>Our planner sizes your team from your event type, guest count and duration. Try it — then adjust anything before you publish.</p>
        </div>
        <StaffingPlannerDemo />
      </div>
    </section>

    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Who we serve</span>
          <h2>Built for everyone who throws an event in Nigeria</h2>
        </div>
        <div className="audience-grid">
          {AUDIENCES.map((item) => <div className="audience" key={item.title}><Icon name={item.icon} size={24} /><h3>{item.title}</h3><p>{item.body}</p></div>)}
        </div>
      </div>
    </section>

    <section className="section section-tint">
      <div className="container split">
        <div>
          <span className="eyebrow">Trust & safety</span>
          <h2>Verified means verified.</h2>
          <p className="lead-sm">Professionals don't appear in search until our team has checked their documents. Badges are granted by EventStaff NG — never self-declared.</p>
          <NavLink to="/how-it-works#trust" className="btn btn-secondary">How we vet professionals<Icon name="ArrowRight" size={16} /></NavLink>
        </div>
        <div className="trust-grid">
          {[
            ['IdCard', 'Identity checks', 'Government ID (NIN, passport or voter card) reviewed for every professional.'],
            ['FileCheck2', 'Role-specific credentials', "Culinary certificates, security licences, driver's licences and portfolios — matched to the role."],
            ['Umbrella', 'Insured bookings', 'Workers booked through the platform are covered while on the job.'],
            ['Star', 'Two-way ratings', 'Every completed booking is rated, so quality rises to the top.'],
          ].map(([icon, title, body]) => <div className="trust-item" key={title}><span><Icon name={icon} size={20} /></span><div><h4>{title}</h4><p>{body}</p></div></div>)}
        </div>
      </div>
    </section>

    <section className="section">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Launch markets</span>
          <h2>Live in the Federal Capital Territory and Lagos</h2>
          <p>More states are coming. Tell us where you'd like us next.</p>
        </div>
        <div className="city-grid">
          {LAUNCH_STATES.map((state) => <div className="city-card" key={state}>
            <div className="city-head"><Icon name="MapPin" size={20} /><h3>{state === 'Lagos' ? 'Lagos State' : 'Abuja, FCT'}</h3></div>
            <div className="city-areas">{STATE_AREAS[state].map((area) => <span key={area}>{area}</span>)}</div>
          </div>)}
        </div>
      </div>
    </section>

    <section className="section section-tint">
      <div className="container">
        <div className="section-head">
          <span className="eyebrow">Pricing</span>
          <h2>Free to post. Pay only when you book.</h2>
          <p>A {COMMISSION_RATE * 100}% service fee covers verification, insurance and payment protection. Planners and corporates save with a plan.</p>
        </div>
        <div className="plan-grid compact">
          {HIRER_PLANS.map((plan) => <div className={`plan ${plan.featured ? 'featured' : ''}`} key={plan.id}>
            <h3>{plan.name}</h3>
            <div className="plan-price">{plan.price === null ? 'Custom' : plan.price === 0 ? 'Free' : money(plan.price)}<span>{plan.period}</span></div>
            <p>{plan.blurb}</p>
          </div>)}
        </div>
        <div className="center-row"><NavLink to="/pricing" className="btn btn-secondary">Compare plans<Icon name="ArrowRight" size={16} /></NavLink></div>
      </div>
    </section>

    <section className="section">
      <div className="container cta-band">
        <div>
          <span className="eyebrow light">For event professionals</span>
          <h2>Turn your skills into steady, well-paid event work.</h2>
          <p>Get matched to jobs that fit your profession, location and schedule. Get paid through the platform and build a rating that wins you more work.</p>
        </div>
        <div className="cta-actions">
          <NavLink to="/get-started?role=worker" className="btn btn-accent btn-lg">Join as a professional</NavLink>
          <NavLink to="/how-it-works#workers" className="btn btn-ghost-light">How it works</NavLink>
        </div>
      </div>
    </section>

    <section className="section">
      <div className="container narrow">
        <div className="section-head"><span className="eyebrow">FAQ</span><h2>Questions, answered</h2></div>
        <Faq />
      </div>
    </section>
  </PublicLayout>
}
