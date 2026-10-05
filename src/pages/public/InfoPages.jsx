import { useState } from 'react'
import { NavLink, useSearchParams } from 'react-router-dom'
import PublicLayout from '../../components/PublicLayout'
import { Alert, CategoryIcon, Field, Icon } from '../../components/ui'
import { AUDIENCES, CATEGORIES, COMMISSION_RATE, HIRER_PLANS, WORKER_REGISTRATION_FEE } from '../../lib/constants'
import { money } from '../../lib/format'
import { requiredDocsFor } from '../../lib/matching'
import { supabase } from '../../lib/supabase'
import { Faq, FAQS, HIRER_STEPS, WORKER_STEPS } from './content'

function PageHero({ eyebrow, title, children }) {
  return <section className="page-hero"><div className="container narrow center-text">
    <span className="eyebrow">{eyebrow}</span><h1>{title}</h1>{children && <p className="lead">{children}</p>}
  </div></section>
}

export function HowItWorks() {
  return <PublicLayout>
    <PageHero eyebrow="How it works" title="From event idea to a fully staffed team">Whether you're hiring for a 50-guest naming ceremony or a 2,000-person conference, the flow is the same — and it takes minutes.</PageHero>
    <section className="section"><div className="container">
      <div className="journey">
        <div className="journey-head"><span className="journey-icon"><Icon name="Building2" size={22} /></span><div><span className="eyebrow">For hirers</span><h2>Book verified staff in four steps</h2></div></div>
        <ol className="timeline">{HIRER_STEPS.map((step, i) => <li key={step.title}><span className="timeline-dot">{i + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        <NavLink to="/get-started?role=hirer" className="btn btn-primary">Post an event — it's free<Icon name="ArrowRight" size={16} /></NavLink>
      </div>
      <div className="journey" id="workers">
        <div className="journey-head"><span className="journey-icon accent"><Icon name="UserRound" size={22} /></span><div><span className="eyebrow">For professionals</span><h2>Get matched to work that fits you</h2></div></div>
        <ol className="timeline">{WORKER_STEPS.map((step, i) => <li key={step.title}><span className="timeline-dot">{i + 1}</span><div><h3>{step.title}</h3><p>{step.body}</p></div></li>)}</ol>
        <NavLink to="/get-started?role=worker" className="btn btn-accent">Create your profile<Icon name="ArrowRight" size={16} /></NavLink>
      </div>
    </div></section>
    <section className="section section-tint" id="trust"><div className="container">
      <div className="section-head"><span className="eyebrow">Verification</span><h2>What we check, by role</h2><p>Required documents must be approved by our team before a professional is listed. Optional ones boost ranking.</p></div>
      <div className="vetting-grid">
        {CATEGORIES.map((item) => <div className="vetting-card" key={item.slug}>
          <div className="row"><CategoryIcon category={item.title} size={18} /><h3>{item.title}</h3></div>
          <ul>{requiredDocsFor(item.title).map((doc) => <li key={doc.document_type}><Icon name={doc.required ? 'CircleCheck' : 'CirclePlus'} size={15} />{doc.label}{!doc.required && <em> (optional)</em>}</li>)}</ul>
        </div>)}
      </div>
    </div></section>
    <section className="section"><div className="container">
      <div className="section-head"><span className="eyebrow">Smart matching</span><h2>How we rank professionals for your job</h2></div>
      <div className="weights">
        {[['Profession fit', 30], ['Availability on the date', 20], ['Distance to venue', 15], ['Relevant skills', 15], ['Verification level', 10], ['Rating', 5], ['Rate vs. budget', 5]].map(([label, weight]) => <div className="weight-row" key={label}>
          <span>{label}</span><div className="progress"><div className="progress-bar" style={{ width: `${weight * 3.33}%` }} /></div><strong>{weight}%</strong>
        </div>)}
      </div>
    </div></section>
  </PublicLayout>
}

export function Categories() {
  return <PublicLayout>
    <PageHero eyebrow="Staff categories" title="Eight specialist roles. One verified workforce.">Every category has its own vetting standard, so the person who turns up is qualified for the job they're doing.</PageHero>
    <section className="section"><div className="container category-detail-list">
      {CATEGORIES.map((item) => <article className="category-detail" id={item.slug} key={item.slug}>
        <CategoryIcon category={item.title} size={28} />
        <div className="category-detail-body">
          <h2>{item.title}</h2>
          <p>{item.description}</p>
          <div className="chip-row">{item.roles.map((role) => <span className="chip static" key={role}>{role}</span>)}</div>
          <p className="vetting-note"><Icon name="ShieldCheck" size={16} />{item.vetting}</p>
        </div>
        <div className="category-detail-cta">
          <NavLink to={`/get-started?role=hirer&category=${encodeURIComponent(item.title)}`} className="btn btn-primary">Hire {item.title.split(' / ')[0].toLowerCase()}</NavLink>
          <NavLink to={`/get-started?role=worker&category=${encodeURIComponent(item.title)}`} className="btn btn-ghost">Work as one</NavLink>
        </div>
      </article>)}
    </div></section>
  </PublicLayout>
}

export function Pricing() {
  return <PublicLayout>
    <PageHero eyebrow="Pricing" title="Simple pricing that scales with your events">Post for free. Pay a service fee only when you book — or save with a plan.</PageHero>
    <section className="section"><div className="container">
      <div className="plan-grid">
        {HIRER_PLANS.map((plan) => <div className={`plan ${plan.featured ? 'featured' : ''}`} key={plan.id}>
          {plan.featured && <span className="plan-flag">Most popular</span>}
          <h3>{plan.name}</h3>
          <p>{plan.blurb}</p>
          <div className="plan-price">{plan.price === null ? 'Custom' : plan.price === 0 ? 'Free' : money(plan.price)}<span>{plan.period}</span></div>
          <ul>{plan.features.map((feature) => <li key={feature}><Icon name="Check" size={16} />{feature}</li>)}</ul>
          <NavLink className={`btn btn-block ${plan.featured ? 'btn-primary' : 'btn-secondary'}`} to={plan.id === 'corporate' ? '/contact?topic=Corporate%20retainer' : plan.id === 'pro' ? '/contact?topic=Planner%20Pro' : '/get-started?role=hirer'}>{plan.cta}</NavLink>
        </div>)}
      </div>
      <div className="pricing-example card">
        <div><span className="eyebrow">Example</span><h3>Wedding with 10 servers at ₦20,000 each</h3></div>
        <dl className="breakdown">
          <div><dt>Staff pay (10 × ₦20,000)</dt><dd>{money(200000)}</dd></div>
          <div><dt>Service fee ({COMMISSION_RATE * 100}%)</dt><dd>{money(200000 * COMMISSION_RATE)}</dd></div>
          <div className="total"><dt>You pay</dt><dd>{money(200000 * (1 + COMMISSION_RATE))}</dd></div>
        </dl>
        <p className="muted small">Workers receive their full agreed rate. The service fee funds verification, insurance cover and payment protection.</p>
      </div>
    </div></section>
    <section className="section section-tint"><div className="container split">
      <div>
        <span className="eyebrow">For professionals</span>
        <h2>One-time registration. No commission on your pay.</h2>
        <p className="lead-sm">A {money(WORKER_REGISTRATION_FEE)} registration fee covers document verification and onboarding. After that, you keep 100% of your agreed rate on every booking.</p>
        <NavLink to="/get-started?role=worker" className="btn btn-accent">Join as a professional</NavLink>
      </div>
      <div className="audience-grid tight">
        {AUDIENCES.slice(1, 4).map((item) => <div className="audience" key={item.title}><Icon name={item.icon} size={22} /><h3>{item.title}</h3><p>{item.body}</p></div>)}
      </div>
    </div></section>
    <section className="section"><div className="container narrow"><div className="section-head"><h2>Pricing FAQ</h2></div><Faq items={FAQS.slice(1, 5)} /></div></section>
  </PublicLayout>
}

export function About() {
  return <PublicLayout>
    <PageHero eyebrow="About EventStaff NG" title="Reliable people make unforgettable events.">We're building Nigeria's trusted, centralised hub for event-day workers — so hosts can book with confidence and skilled professionals can earn consistently.</PageHero>
    <section className="section"><div className="container split">
      <div>
        <h2>Why we exist</h2>
        <p className="lead-sm">Nigeria's events industry is booming — weddings, corporate launches, conferences, government functions, and celebrations of every kind. Yet sourcing reliable staff still depends on word of mouth. There's no central place to find people who are verified, trained and accountable.</p>
        <p className="lead-sm">EventStaff NG fixes that with a technology-driven marketplace: a website and mobile experience, AI-powered matching, and an operations team that verifies every professional before they're listed.</p>
      </div>
      <div className="values">
        {[['ShieldCheck', 'Trust first', 'Verification is done by our team, never self-declared.'], ['Zap', 'Speed', 'Book in minutes, not days of phone calls.'], ['HandCoins', 'Fair work', 'Workers keep their full rate and get paid on time.'], ['MapPinned', 'Local', 'Built for Nigerian events, venues and expectations.']].map(([icon, title, body]) => <div className="value" key={title}><Icon name={icon} size={22} /><h3>{title}</h3><p>{body}</p></div>)}
      </div>
    </div></section>
    <section className="section section-tint"><div className="container">
      <div className="section-head"><span className="eyebrow">Business model</span><h2>How EventStaff NG sustains itself</h2></div>
      <div className="audience-grid">
        {[['Percent', 'Service commission', `A ${COMMISSION_RATE * 100}% fee on each booking.`], ['Repeat', 'Subscriptions', 'Planner Pro for frequent hirers.'], ['Handshake', 'Corporate retainers', 'Guaranteed capacity for organisations.'], ['IdCard', 'Registration fees', 'One-time onboarding for professionals.']].map(([icon, title, body]) => <div className="audience" key={title}><Icon name={icon} size={22} /><h3>{title}</h3><p>{body}</p></div>)}
      </div>
    </div></section>
  </PublicLayout>
}

const TOPICS = ['General', 'Corporate retainer', 'Planner Pro', 'Partnership', 'Worker support', 'Hirer support']

export function Contact() {
  const [params] = useSearchParams()
  const initialTopic = TOPICS.includes(params.get('topic')) ? params.get('topic') : 'General'
  const [form, setForm] = useState({ name: '', email: '', phone: '', organization: '', topic: initialTopic, message: '' })
  const [state, setState] = useState({ busy: false, done: false, error: '' })
  const change = (key) => (event) => setForm({ ...form, [key]: event.target.value })

  const submit = async (event) => {
    event.preventDefault()
    if (!supabase) return setState({ busy: false, done: false, error: 'The enquiry inbox is not connected yet. Email hello@eventstaff.ng instead.' })
    setState({ busy: true, done: false, error: '' })
    const { error } = await supabase.from('contact_requests').insert({ ...form, phone: form.phone || null, organization: form.organization || null })
    setState({ busy: false, done: !error, error: error ? `We couldn't send that: ${error.message}` : '' })
  }

  return <PublicLayout>
    <PageHero eyebrow="Contact" title="Talk to the EventStaff NG team">Questions about hiring, corporate retainers or joining as a professional — we reply within one working day.</PageHero>
    <section className="section"><div className="container contact-grid">
      <aside className="contact-aside">
        {[['Mail', 'Email', 'hello@eventstaff.ng'], ['Phone', 'Phone / WhatsApp', '+234 (0) 800 EVENTSTAFF'], ['MapPin', 'Offices', 'Wuse II, Abuja · Victoria Island, Lagos'], ['Clock', 'Hours', 'Mon – Sat, 8am – 8pm']].map(([icon, label, value]) => <div className="contact-item" key={label}><Icon name={icon} size={20} /><div><span>{label}</span><strong>{value}</strong></div></div>)}
      </aside>
      <div className="card card-pad">
        {state.done ? <div className="success-panel"><span className="success-icon"><Icon name="CircleCheck" size={32} /></span><h2>Thanks, {form.name.split(' ')[0]}!</h2><p>Your message is with our team. We'll get back to you at {form.email}.</p></div>
          : <form className="form" onSubmit={submit}>
            <div className="field-row">
              <Field label="Full name" required><input value={form.name} onChange={change('name')} required autoComplete="name" /></Field>
              <Field label="Email" required><input type="email" value={form.email} onChange={change('email')} required autoComplete="email" /></Field>
            </div>
            <div className="field-row">
              <Field label="Phone"><input type="tel" value={form.phone} onChange={change('phone')} autoComplete="tel" placeholder="080..." /></Field>
              <Field label="Organisation"><input value={form.organization} onChange={change('organization')} placeholder="Optional" /></Field>
            </div>
            <Field label="Topic"><select value={form.topic} onChange={change('topic')}>{TOPICS.map((item) => <option key={item}>{item}</option>)}</select></Field>
            <Field label="Message" required><textarea rows="5" value={form.message} onChange={change('message')} required placeholder={form.topic === 'Corporate retainer' ? 'Tell us about your organisation, typical events and staffing volumes…' : 'How can we help?'} /></Field>
            <Alert tone="danger">{state.error}</Alert>
            <button className="btn btn-primary btn-lg" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send message'}</button>
          </form>}
      </div>
    </div></section>
  </PublicLayout>
}

export function NotFound() {
  return <PublicLayout>
    <section className="section"><div className="container narrow center-text">
      <span className="eyebrow">404</span><h1>We couldn't find that page</h1>
      <p className="lead">The link may be broken, or the page may have moved.</p>
      <NavLink to="/" className="btn btn-primary">Back to home</NavLink>
    </div></section>
  </PublicLayout>
}
