import { ChangePassword, NotificationSettings } from '../components/AccountSettings'
import Workspace from '../components/Workspace'
import { PageHeader } from '../components/ui'

export default function Account({ role }) {
  return <Workspace role={role}>
    <PageHeader eyebrow="Account" title="Account & security" description="Manage your password and how EventStaff NG notifies you." />
    <div className="settings-grid">
      <ChangePassword />
      <NotificationSettings />
    </div>
  </Workspace>
}
