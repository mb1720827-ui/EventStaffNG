import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useSession } from '../lib/session'
import { CATEGORIES } from '../lib/constants'
import { Icon } from './ui'

export function Logo({ to = '/', light = false }) {
  return <NavLink to={to} className={`logo ${light ? 'logo-light' : ''}`} aria-label="EventStaff NG home">
    <span className="logo-mark"><Icon name="CalendarCheck2" size={18} /></span>
    <span className="logo-text">EventStaff<span>NG</span></span>
  </NavLink>
}

const NAV = [['/how-it-works', 'How it works'], ['/categories', 'Staff categories'], ['/pricing', 'Pricing'], ['/about', 'About']]

export default function PublicLayout({ children }) {
  const { session, profile } = useSession()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => { setOpen(false); window.scrollTo(0, 0) }, [location.pathname])

  const dashboard = profile?.role ? (profile.role === 'admin' ? '/admin' : `/${profile.role}/dashboard`) : null

  return <div className="site">
    <header className="site-header">
      <div className="container header-inner">
        <Logo />
        <nav className={`site-nav ${open ? 'open' : ''}`} aria-label="Main">
          {NAV.map(([to, label]) => <NavLink key={to} to={to}>{label}</NavLink>)}
          <div className="site-nav-cta">
            {session && dashboard
              ? <NavLink to={dashboard} className="btn btn-primary">Go to dashboard<Icon name="ArrowRight" size={16} /></NavLink>
              : <>
                <NavLink to="/sign-in" className="btn btn-ghost">Sign in</NavLink>
                <NavLink to="/get-started" className="btn btn-primary">Get started</NavLink>
              </>}
          </div>
        </nav>
        <button className="icon-btn nav-toggle" onClick={() => setOpen(!open)} aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}><Icon name={open ? 'X' : 'Menu'} size={22} /></button>
      </div>
    </header>
    <main className="site-main">{children}</main>
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Logo light />
          <p>Nigeria's verified workforce hub for events, occasions and celebrations. Launching in Abuja and Lagos.</p>
          <div className="footer-contact">
            <span><Icon name="Mail" size={15} />hello@eventstaff.ng</span>
            <span><Icon name="MapPin" size={15} />Abuja · Lagos</span>
          </div>
        </div>
        <div>
          <h4>Hire staff</h4>
          {CATEGORIES.slice(0, 5).map((item) => <NavLink key={item.slug} to={`/categories#${item.slug}`}>{item.title}</NavLink>)}
          <NavLink to="/categories">All categories</NavLink>
        </div>
        <div>
          <h4>Company</h4>
          <NavLink to="/about">About us</NavLink>
          <NavLink to="/how-it-works">How it works</NavLink>
          <NavLink to="/pricing">Pricing</NavLink>
          <NavLink to="/contact">Contact</NavLink>
        </div>
        <div>
          <h4>For professionals</h4>
          <NavLink to="/get-started?role=worker">Join as a worker</NavLink>
          <NavLink to="/how-it-works#workers">How verification works</NavLink>
          <NavLink to="/sign-in">Worker sign in</NavLink>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} EventStaff NG. All rights reserved.</span>
        <span>A HSO venture · Made in Nigeria</span>
      </div>
    </footer>
  </div>
}
