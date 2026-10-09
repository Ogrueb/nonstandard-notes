import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { ApplicationEvent } from '@standardnotes/snjs'
import { WebApplication } from '@/Application/WebApplication'
import Button from '@/Components/Button/Button'
import { Subtitle, Text, Title } from '@/Components/Preferences/PreferencesComponents/Content'
import PreferencesGroup from '@/Components/Preferences/PreferencesComponents/PreferencesGroup'
import PreferencesSegment from '@/Components/Preferences/PreferencesComponents/PreferencesSegment'
import HorizontalSeparator from '@/Components/Shared/HorizontalSeparator'
import { AccountMenuPane } from '@/Components/AccountMenu/AccountMenuPane'
import { isNetworkIsolationOn } from '@/OfflineAllowlist/OfflineAllowlist'

type Props = {
  application: WebApplication
}

/**
 * Offline build: replaces the stock "You're not signed in / Create free account" section.
 * Sign-in is only for the user's own sync server; the address rules follow the isolation mode.
 */
export const OfflineSignIn = observer(({ application }: Props) => {
  const isolated = isNetworkIsolationOn()

  const openAccountMenu = (pane: AccountMenuPane) => {
    application.preferencesController.closePreferences()
    application.accountMenuController.setCurrentPane(pane)
    application.accountMenuController.setShow(true)
  }

  return (
    <PreferencesGroup>
      <PreferencesSegment>
        <Title>Not signed in</Title>
        <Text>Notes are stored on this device. Sign in to sync through your own server.</Text>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button primary label="Sign in" onClick={() => openAccountMenu(AccountMenuPane.SignIn)} />
          <Button label="Create account" onClick={() => openAccountMenu(AccountMenuPane.Register)} />
        </div>
        <HorizontalSeparator classes="my-4" />
        <Subtitle>Server address</Subtitle>
        <Text>
          {isolated
            ? 'Local HTTPS servers only (192.168.x.x, 10.x.x.x, .local, .lan), including the port.'
            : "Any HTTPS server except Standard Notes', including the port."}
        </Text>
      </PreferencesSegment>
    </PreferencesGroup>
  )
})

/** Offline build: whether premium features are unlocked by the offline activation */
export const OfflinePremiumStatus = observer(({ application }: Props) => {
  const [isActive, setIsActive] = useState(() => application.features.hasFirstPartyOfflineSubscription())

  useEffect(() => {
    const refresh = () => setIsActive(application.features.hasFirstPartyOfflineSubscription())
    refresh()
    return application.addEventObserver(async (event) => {
      if (
        event === ApplicationEvent.FeaturesAvailabilityChanged ||
        event === ApplicationEvent.UserRolesChanged ||
        event === ApplicationEvent.LocalDataLoaded
      ) {
        refresh()
      }
    })
  }, [application])

  return (
    <PreferencesGroup>
      <PreferencesSegment>
        <Title>Premium features</Title>
        <Subtitle className={isActive ? 'text-success' : 'text-danger'}>{isActive ? 'Active' : 'Not active'}</Subtitle>
        <Text>
          {isActive
            ? 'Unlocked by your offline activation, which is also saved on this device. You can manage it under General > Offline activation.'
            : 'Enter your offline activation code under General > Offline activation to unlock premium features such as Super notes.'}
        </Text>
      </PreferencesSegment>
    </PreferencesGroup>
  )
})
