import { observer } from 'mobx-react-lite'
import { useState } from 'react'
import { MobileDeviceInterface } from '@standardnotes/services'
import { ButtonType } from '@standardnotes/snjs'
import { WebApplication } from '@/Application/WebApplication'
import Switch from '@/Components/Switch/Switch'
import { Subtitle, Text, Title } from '@/Components/Preferences/PreferencesComponents/Content'
import PreferencesGroup from '@/Components/Preferences/PreferencesComponents/PreferencesGroup'
import PreferencesSegment from '@/Components/Preferences/PreferencesComponents/PreferencesSegment'
import { isNetworkIsolationOn } from '@/OfflineAllowlist/OfflineAllowlist'

type Props = {
  application: WebApplication
}

/**
 * Offline build (Android): switches network isolation on or off. The setting is stored natively
 * and applied by reloading the web app; the switch shows the mode that is currently active.
 */
const NetworkIsolation = ({ application }: Props) => {
  const [isolated] = useState(() => isNetworkIsolationOn())
  const [isSaving, setIsSaving] = useState(false)

  const toggle = async () => {
    if (isSaving) {
      return
    }

    const enable = !isolated
    const confirmed = await application.alerts.confirm(
      enable
        ? 'The app will only connect to your local network. It reloads to apply this.'
        : "The app will also be able to reach the internet: remote images, What's New, the plugin list and servers with public names. Standard Notes' servers stay blocked. The app reloads to apply this.",
      enable ? 'Turn on network isolation?' : 'Turn off network isolation?',
      enable ? 'Turn on and reload' : 'Turn off and reload',
      enable ? ButtonType.Info : ButtonType.Danger,
    )
    if (!confirmed) {
      return
    }

    setIsSaving(true)
    const saved = await (application.device as MobileDeviceInterface).setNetworkIsolationEnabledAndReload(enable)
    if (!saved) {
      setIsSaving(false)
      void application.alerts.alert('The network isolation setting could not be saved.')
    }
  }

  return (
    <PreferencesGroup>
      <PreferencesSegment>
        <Title>Network Isolation</Title>
        <div className="flex justify-between gap-2 md:items-center">
          <div className="flex flex-col">
            <Subtitle>Local network only</Subtitle>
            <Text>
              {isolated
                ? "On: the app connects only to your local network. Remote images, What's New and the plugin list are unavailable."
                : "Off: the app can also reach the internet. Standard Notes' servers are always blocked."}
            </Text>
          </div>
          <Switch onChange={() => void toggle()} checked={isolated} disabled={isSaving} />
        </div>
      </PreferencesSegment>
    </PreferencesGroup>
  )
}

export default observer(NetworkIsolation)
