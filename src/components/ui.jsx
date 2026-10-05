import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Award, BadgeCheck, Banknote, Bell,
  BellOff, BellRing, Briefcase, BriefcaseBusiness, Building2, CalendarCheck, CalendarCheck2, CalendarClock,
  CalendarDays, CalendarHeart, CalendarPlus, CalendarX, Camera, Car, Check, CheckCheck,
  ChefHat, ChevronDown, ChevronRight, Circle, CircleAlert, CircleCheck, CircleCheckBig, CirclePlus,
  CircleX, ClipboardCheck, ClipboardList, Clock, Copy, Download, ExternalLink, Eye,
  FileCheck2, FileText, Flag, GraduationCap, HandCoins, Handshake, Heart, History,
  Home, Hotel, Hourglass, IdCard, Inbox, Info, KeyRound, Landmark,
  Languages, LayoutDashboard, LifeBuoy, Lock, LogOut, Mail, MapPin, MapPinned,
  Menu, MessageSquareReply, Mic, Minus, PartyPopper, Pencil, Percent, Phone,
  PiggyBank, Plus, Radio, RefreshCw, Repeat, Scale, Search, SearchX,
  Send, Settings, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Star, StickyNote,
  Tag, ThumbsDown, ThumbsUp, Timer, Trash2, TrendingUp, TriangleAlert, Umbrella,
  Upload, UserRound, UserRoundPen, UserRoundSearch, UserSearch, UserX, Users, UtensilsCrossed,
  Wallet, X, Zap,
} from 'lucide-react'

// Explicit registry keeps the bundle to the icons we actually use.
const Icons = {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Award, BadgeCheck, Banknote, Bell,
  BellOff, BellRing, Briefcase, BriefcaseBusiness, Building2, CalendarCheck, CalendarCheck2, CalendarClock,
  CalendarDays, CalendarHeart, CalendarPlus, CalendarX, Camera, Car, Check, CheckCheck,
  ChefHat, ChevronDown, ChevronRight, Circle, CircleAlert, CircleCheck, CircleCheckBig, CirclePlus,
  CircleX, ClipboardCheck, ClipboardList, Clock, Copy, Download, ExternalLink, Eye,
  FileCheck2, FileText, Flag, GraduationCap, HandCoins, Handshake, Heart, History,
  Home, Hotel, Hourglass, IdCard, Inbox, Info, KeyRound, Landmark,
  Languages, LayoutDashboard, LifeBuoy, Lock, LogOut, Mail, MapPin, MapPinned,
  Menu, MessageSquareReply, Mic, Minus, PartyPopper, Pencil, Percent, Phone,
  PiggyBank, Plus, Radio, RefreshCw, Repeat, Scale, Search, SearchX,
  Send, Settings, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Star, StickyNote,
  Tag, ThumbsDown, ThumbsUp, Timer, Trash2, TrendingUp, TriangleAlert, Umbrella,
  Upload, UserRound, UserRoundPen, UserRoundSearch, UserSearch, UserX, Users, UtensilsCrossed,
  Wallet, X, Zap,
}
import { categoryMeta } from '../lib/constants'
import { initials } from '../lib/format'
import { publicUrl } from '../lib/supabase'

export function Icon({ name, size = 18, ...props }) {
  const Component = Icons[name] || Icons.Circle
  return <Component size={size} strokeWidth={1.9} aria-hidden="true" {...props} />
}

export function CategoryIcon({ category, size = 22 }) {
  return <span className="category-icon"><Icon name={categoryMeta(category)?.icon || 'Briefcase'} size={size} /></span>
}

export function Badge({ tone = 'neutral', icon, children }) {
  return <span className={`badge badge-${tone}`}>{icon && <Icon name={icon} size={13} />}{children}</span>
}

export function StatusBadge({ map, value }) {
  const entry = map[value] || { label: value || 'Unknown', tone: 'neutral' }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

export function VerifiedBadge({ compact = false }) {
  return <span className="verified-badge" title="Identity and credentials checked by EventStaff NG"><Icon name="BadgeCheck" size={compact ? 14 : 16} />{compact ? 'Verified' : 'Verified professional'}</span>
}

export const avatarSrc = (path) => {
  if (!path) return ''
  if (/^https?:/.test(path)) return path
  return publicUrl('avatars', path.replace(/^avatars\//, ''))
}

export function Avatar({ name, src, size = 'md' }) {
  const url = avatarSrc(src)
  return <span className={`avatar avatar-${size}`}>{url ? <img src={url} alt="" /> : initials(name)}</span>
}

export function Stars({ value = 0, count }) {
  const rating = Number(value || 0)
  return <span className="stars" aria-label={`${rating.toFixed(1)} out of 5`}>
    <Icon name="Star" size={14} className="star-fill" />
    <strong>{rating ? rating.toFixed(1) : 'New'}</strong>
    {count != null && rating > 0 && <span className="muted">({count})</span>}
  </span>
}

export function MatchPill({ score }) {
  const tone = score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low'
  return <span className={`match-pill match-${tone}`}><Icon name="Sparkles" size={13} />{score}% match</span>
}

export function PageHeader({ eyebrow, title, description, actions, back }) {
  return <header className="page-head">
    <div>
      {back && <NavLink to={back.to} className="back-link"><Icon name="ArrowLeft" size={16} />{back.label}</NavLink>}
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      {title && <h1>{title}</h1>}
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
}

export function Stat({ icon, label, value, hint, tone = 'brand', to }) {
  const body = <>
    <span className={`stat-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
    <div><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{hint && <span className="stat-hint">{hint}</span>}</div>
  </>
  return to ? <NavLink to={to} className="stat stat-link">{body}</NavLink> : <div className="stat">{body}</div>
}

export function EmptyState({ icon = 'Inbox', title, children, action }) {
  return <div className="empty">
    <span className="empty-icon"><Icon name={icon} size={26} /></span>
    {title && <h3>{title}</h3>}
    {children && <p>{children}</p>}
    {action}
  </div>
}

export function Spinner({ label = 'Loading…' }) {
  return <div className="loading" role="status"><span className="spinner" />{label}</div>
}

export function Alert({ tone = 'info', children, onClose }) {
  if (!children) return null
  const icon = { success: 'CircleCheck', danger: 'CircleAlert', warning: 'TriangleAlert', info: 'Info' }[tone]
  return <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
    <Icon name={icon} size={18} /><div>{children}</div>
    {onClose && <button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Dismiss"><Icon name="X" size={16} /></button>}
  </div>
}

export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => event.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
    <div className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-head"><h2>{title}</h2><button type="button" className="icon-btn ghost" onClick={onClose} aria-label="Close"><Icon name="X" /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </div>
  </div>
}

export function Field({ label, hint, children, required, className = '' }) {
  return <label className={`field ${className}`}>
    <span className="field-label">{label}{required && <span className="req" aria-hidden="true">*</span>}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </label>
}

export function ChipGroup({ options, value = [], onChange, single = false }) {
  const toggle = (option) => {
    if (single) return onChange(option)
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option])
  }
  return <div className="chip-group">
    {options.map((option) => {
      const active = single ? value === option : value.includes(option)
      return <button type="button" key={option} className={`chip ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => toggle(option)}>
        {active && <Icon name="Check" size={14} />}{option}
      </button>
    })}
  </div>
}

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs" role="tablist">
    {tabs.map(([key, label, count]) => <button key={key} role="tab" aria-selected={value === key} className={`tab ${value === key ? 'active' : ''}`} onClick={() => onChange(key)}>
      {label}{count != null && <span className="tab-count">{count}</span>}
    </button>)}
  </div>
}

export function Progress({ value, label }) {
  return <div className="progress-wrap">
    {label && <div className="progress-label"><span>{label}</span><strong>{value}%</strong></div>}
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemin="0" aria-valuemax="100"><div className="progress-bar" style={{ width: `${value}%` }} /></div>
  </div>
}

export function TagInput({ value = [], onChange, placeholder, suggestions = [] }) {
  const [draft, setDraft] = useState('')
  const add = (raw) => {
    const item = raw.trim()
    if (item && !value.includes(item)) onChange([...value, item])
    setDraft('')
  }
  const unused = suggestions.filter((item) => !value.includes(item))
  return <div className="tag-input">
    <div className="tag-input-box">
      {value.map((item) => <span className="tag" key={item}>{item}<button type="button" onClick={() => onChange(value.filter((v) => v !== item))} aria-label={`Remove ${item}`}><Icon name="X" size={12} /></button></span>)}
      <input value={draft} placeholder={value.length ? '' : placeholder} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(draft) }
          if (event.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1))
        }}
        onBlur={() => draft && add(draft)} />
    </div>
    {unused.length > 0 && <div className="tag-suggestions">{unused.slice(0, 8).map((item) => <button type="button" key={item} onClick={() => add(item)}><Icon name="Plus" size={12} />{item}</button>)}</div>}
  </div>
}

export function NotConfigured() {
  return <EmptyState icon="DatabaseZap" title="Supabase isn't connected">Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code> and restart the dev server.</EmptyState>
}
