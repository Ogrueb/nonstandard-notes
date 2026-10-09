import { FunctionComponent, useCallback, useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import PreferencesSegment from '../../../PreferencesComponents/PreferencesSegment'
import { useApplication } from '@/Components/ApplicationProvider'
import { PluginsList } from '@standardnotes/ui-services'
import PluginRowView from './PluginRowView'
import HorizontalSeparator from '@/Components/Shared/HorizontalSeparator'
import { ContentType } from '@standardnotes/snjs'
import { Text, Title } from '@/Components/Preferences/PreferencesComponents/Content'
import { PreferencesPremiumOverlay } from '@/Components/Preferences/PremiumOverlay'
import { AppName, SuperName, jtString } from '@standardnotes/features'
import { c } from 'ttag'

const BrowsePlugins: FunctionComponent = () => {
  const application = useApplication()

  const [plugins, setPlugins] = useState<PluginsList | null>(null)
  /** Offline build: the plugin list is fetched from GitHub, which the allowlist blocks */
  const [loadFailed, setLoadFailed] = useState(false)

  const reloadPlugins = useCallback(() => {
    application.pluginsService
      .getInstallablePlugins()
      .then((list) => {
        setPlugins(list)
        setLoadFailed(false)
      })
      .catch((error) => {
        console.error(error)
        setLoadFailed(true)
      })
  }, [application])

  useEffect(() => {
    reloadPlugins()
  }, [reloadPlugins])

  useEffect(() => {
    application.items.streamItems([ContentType.TYPES.Component, ContentType.TYPES.Theme], reloadPlugins)
  }, [application, reloadPlugins])

  const hasSubscription = application.hasValidFirstPartySubscription()

  return (
    <div className="relative">
      <PreferencesSegment>
        <Title>{c('B6.Preferences.Other.Title').t`Browse Plugins`}</Title>
        <Text className="text-neutral">
          {c('B6.Preferences.Plugins.Info')
            .t`Plugins run in a secure sandbox and can only access data you allow it. Note types allow specialized editing experiences, but in most cases, the`}{' '}
          <strong>{jtString(c('B6.Preferences.Other.Label').jt`built-in ${SuperName} note type`)}</strong>{' '}
          {c('B6.Preferences.Plugins.Info').t`can encapsulate any functionality found in plugins.`}
        </Text>

        {!plugins && loadFailed && (
          <div className="mb-3 mt-5 flex h-full w-full items-center">
            <span className="w-full font-bold">
              The plugin list could not be loaded. It needs an internet connection. Plugins can still be installed from
              an address under Install Custom Plugin.
            </span>
          </div>
        )}

        {!plugins && !loadFailed && (
          <div className="mb-3 mt-5 flex h-full w-full items-center">
            <span className="w-full font-bold">{c('B6.Preferences.Other.Info').t`Loading...`}</span>
          </div>
        )}

        <div className="mt-2">
          {plugins?.map((plugin, index) => {
            return (
              <div key={plugin.name}>
                <PluginRowView plugin={plugin} />
                {index < plugins.length - 1 && <HorizontalSeparator />}
              </div>
            )
          })}
        </div>
      </PreferencesSegment>
      <HorizontalSeparator />
      <Text className="mt-4 text-danger">
        {jtString(
          c('B6.Preferences.Other.Error')
            .jt`Plugins may not be actively maintained. ${AppName} cannot attest to the quality or user experience of these plugins, and is not responsible for any data loss that may arise from their use.`,
        )}
      </Text>

      {!hasSubscription && <PreferencesPremiumOverlay />}
    </div>
  )
}

export default observer(BrowsePlugins)
