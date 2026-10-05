import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import BookModal from '../../components/BookModal'
import Workspace from '../../components/Workspace'
import { EmptyState, PageHeader, Spinner } from '../../components/ui'
import { useSession } from '../../lib/session'
import { supabase } from '../../lib/supabase'
import { must, useLoader } from '../../lib/useLoader'
import { StaffCard, useSaved } from './FindStaff'

export default function Saved() {
  const { session } = useSession()
  const { saved, toggle } = useSaved(session.user.id)
  const [booking, setBooking] = useState(null)
  const ids = [...saved.keys()]
  const { data, loading } = useLoader(async () => ids.length ? must(await supabase.from('staff_profiles').select('*').in('id', ids)) : [], [ids.join(',')])

  return <Workspace role="hirer">
    <PageHeader eyebrow="Saved staff" title="Your shortlist" description="Professionals you've saved — rebook your favourite team in a couple of clicks." />
    {loading ? <Spinner /> : data?.length
      ? <div className="staff-grid">{data.map((staff) => <StaffCard key={staff.id} staff={staff} saved onSave={toggle} onBook={setBooking} />)}</div>
      : <EmptyState icon="Heart" title="No saved professionals yet" action={<NavLink to="/hirer/find-staff" className="btn btn-primary">Browse staff</NavLink>}>Tap the heart on any profile to save it here.</EmptyState>}
    <BookModal open={!!booking} staff={booking} onClose={() => setBooking(null)} />
  </Workspace>
}
