import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Gate, RoleRedirect } from './components/Workspace'
import { Spinner } from './components/ui'
import { SessionProvider } from './lib/session'
import Home from './pages/public/Home'
import { About, Categories, Contact, HowItWorks, NotFound, Pricing } from './pages/public/InfoPages'
import { GetStarted, ResetPassword, SignIn, SignUp } from './pages/public/Auth'
import './App.css'

// Signed-in areas load on demand so the marketing site stays light.
const HirerDashboard = lazy(() => import('./pages/hirer/Dashboard'))
const PostEvent = lazy(() => import('./pages/hirer/PostEvent'))
const Events = lazy(() => import('./pages/hirer/Events'))
const EventDetail = lazy(() => import('./pages/hirer/EventDetail'))
const FindStaff = lazy(() => import('./pages/hirer/FindStaff'))
const StaffProfile = lazy(() => import('./pages/hirer/StaffProfile'))
const Bookings = lazy(() => import('./pages/hirer/Bookings'))
const Saved = lazy(() => import('./pages/hirer/Saved'))
const Settings = lazy(() => import('./pages/hirer/Settings'))
const WorkerDashboard = lazy(() => import('./pages/worker/Dashboard'))
const Jobs = lazy(() => import('./pages/worker/Jobs'))
const JobDetail = lazy(() => import('./pages/worker/JobDetail'))
const ProfileOverview = lazy(() => import('./pages/worker/ProfileOverview'))
const ProfileBuilder = lazy(() => import('./pages/worker/ProfileBuilder'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Account = lazy(() => import('./pages/Account'))
const Reviews = lazy(() => import('./pages/worker/Reviews'))
const named = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })))
const activity = () => import('./pages/worker/Activity')
const adminPages = () => import('./pages/admin/Admin')
const Applications = named(activity, 'Applications')
const Earnings = named(activity, 'Earnings')
const WorkerBookings = named(activity, 'WorkerBookings')
const AdminOverview = named(adminPages, 'AdminOverview')
const AdminVerifications = named(adminPages, 'AdminVerifications')
const AdminUsers = named(adminPages, 'AdminUsers')
const AdminBookings = named(adminPages, 'AdminBookings')
const AdminEnquiries = named(adminPages, 'AdminEnquiries')

const hirer = (element) => <Gate role="hirer">{element}</Gate>
const worker = (element) => <Gate role="worker">{element}</Gate>
const admin = (element) => <Gate role="admin">{element}</Gate>

export default function App() {
  return <SessionProvider>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense fallback={<div className="screen-center"><Spinner /></div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/how-it-works" element={<HowItWorks />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/get-started" element={<GetStarted />} />
        <Route path="/select-role" element={<Navigate to="/get-started" replace />} />
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="/sign-up" element={<SignUp />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/notifications" element={<RoleRedirect path="notifications" />} />
        <Route path="/dashboard" element={<RoleRedirect path="dashboard" />} />

        <Route path="/hirer/dashboard" element={hirer(<HirerDashboard />)} />
        <Route path="/hirer/post-event" element={hirer(<PostEvent />)} />
        <Route path="/hirer/events" element={hirer(<Events />)} />
        <Route path="/hirer/events/create" element={<Navigate to="/hirer/post-event" replace />} />
        <Route path="/hirer/events/:id" element={hirer(<EventDetail />)} />
        <Route path="/hirer/find-staff" element={hirer(<FindStaff />)} />
        <Route path="/hirer/staff/:id" element={hirer(<StaffProfile />)} />
        <Route path="/hirer/bookings" element={hirer(<Bookings />)} />
        <Route path="/hirer/saved" element={hirer(<Saved />)} />
        <Route path="/hirer/saved-workers" element={<Navigate to="/hirer/saved" replace />} />
        <Route path="/hirer/settings" element={hirer(<Settings />)} />
        <Route path="/hirer/notifications" element={hirer(<Notifications role="hirer" />)} />
        <Route path="/hirer/*" element={<Navigate to="/hirer/dashboard" replace />} />

        <Route path="/worker/dashboard" element={worker(<WorkerDashboard />)} />
        <Route path="/worker/jobs" element={worker(<Jobs />)} />
        <Route path="/worker/jobs/:id" element={worker(<JobDetail />)} />
        <Route path="/worker/applications" element={worker(<Applications />)} />
        <Route path="/worker/bookings" element={worker(<WorkerBookings />)} />
        <Route path="/worker/upcoming-jobs" element={<Navigate to="/worker/bookings" replace />} />
        <Route path="/worker/earnings" element={worker(<Earnings />)} />
        <Route path="/worker/notifications" element={worker(<Notifications role="worker" />)} />
        <Route path="/worker/reviews" element={worker(<Reviews />)} />
        <Route path="/worker/account" element={worker(<Account role="worker" />)} />
        <Route path="/worker/profile" element={worker(<ProfileOverview />)} />
        <Route path="/worker/profile/edit" element={worker(<ProfileBuilder />)} />
        <Route path="/worker/profile/complete" element={<Navigate to="/worker/profile" replace />} />
        <Route path="/worker/*" element={<Navigate to="/worker/dashboard" replace />} />

        <Route path="/admin" element={admin(<AdminOverview />)} />
        <Route path="/admin/verifications" element={admin(<AdminVerifications />)} />
        <Route path="/admin/users" element={admin(<AdminUsers />)} />
        <Route path="/admin/bookings" element={admin(<AdminBookings />)} />
        <Route path="/admin/enquiries" element={admin(<AdminEnquiries />)} />
        <Route path="/admin/*" element={<Navigate to="/admin" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  </SessionProvider>
}
