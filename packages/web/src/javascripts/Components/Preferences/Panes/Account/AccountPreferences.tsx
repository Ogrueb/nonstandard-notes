import { observer } from 'mobx-react-lite'

import { WebApplication } from '@/Application/WebApplication'
import Credentials from './Credentials'
import Sync from './Sync'
import SignOutWrapper from './SignOutView'
import FilesSection from './Files'
import PreferencesPane from '../../PreferencesComponents/PreferencesPane'
import Email from './Email/Email'
import DeleteAccount from '@/Components/Preferences/Panes/Account/DeleteAccount'
import { OfflinePremiumStatus, OfflineSignIn } from './OfflineAccount'

type Props = {
  application: WebApplication
}

const AccountPreferences = ({ application }: Props) => {
  const isUsingThirdPartyServer = !application.sessions.isSignedIntoFirstPartyServer()

  return (
    <PreferencesPane>
      {/**
       * Offline build: the stock "create free account" section is replaced by OfflineSignIn (own
       * sync server only). Subscription and Subscription sharing are hidden (Standard Notes only).
       */}
      {!application.hasAccount() ? (
        <OfflineSignIn application={application} />
      ) : (
        <>
          <Credentials application={application} />
          <Sync application={application} />
        </>
      )}
      <OfflinePremiumStatus application={application} />
      {application.hasAccount() && application.featuresController.entitledToFiles && (
        <FilesSection application={application} />
      )}
      {application.hasAccount() && !isUsingThirdPartyServer && <Email application={application} />}
      <SignOutWrapper application={application} />
      <DeleteAccount application={application} />
    </PreferencesPane>
  )
}

export default observer(AccountPreferences)
