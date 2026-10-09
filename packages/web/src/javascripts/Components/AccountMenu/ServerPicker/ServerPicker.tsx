import { useCallback, useEffect, useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { ServerType } from './ServerType'
import DecoratedInput from '@/Components/Input/DecoratedInput'
import Icon from '@/Components/Icon/Icon'
import { useApplication } from '@/Components/ApplicationProvider'
import { isDesktopApplication } from '@/Utils'
import RadioButtonGroup from '@/Components/RadioButtonGroup/RadioButtonGroup'
import { DefaultHost } from '@standardnotes/snjs'
import { c } from 'ttag'
import { SYNC_SERVER_PLACEHOLDER, displayedSyncServer } from '@/OfflineBuild/OfflineBuildUI'

type Props = {
  className?: string
}

const ServerPicker = ({ className }: Props) => {
  const application = useApplication()

  /** Offline build: no 'standard' (Standard Notes) option; custom is the default */
  const [currentType, setCurrentType] = useState<ServerType>('custom')

  const { server, setServer } = application.accountMenuController

  const determineServerType = useCallback(async () => {
    const homeServerUrl = await application.homeServer?.getHomeServerUrl()
    if (homeServerUrl && server === homeServerUrl) {
      setCurrentType('home server')
    } else {
      setCurrentType('custom')
    }
  }, [application.homeServer, server])

  const handleSyncServerChange = useCallback(
    (server: string, websocketUrl?: string) => {
      setServer(server)
      void determineServerType()
      application.setCustomHost(server, websocketUrl).catch(console.error)
    },
    [application, setServer, determineServerType],
  )

  useEffect(() => {
    void determineServerType()
  }, [application, server, determineServerType])

  const selectTab = async (type: ServerType) => {
    setCurrentType(type)
    if (type === 'standard') {
      handleSyncServerChange(DefaultHost.Api, DefaultHost.WebSocket)
    } else if (type === 'home server') {
      if (!application.homeServer) {
        application.alerts
          .alert(
            c('B1.Account.SignIn.Error')
              .t`Home server is not running. Please open the prefences and home server tab to start it.`,
          )
          .catch(console.error)

        return
      }

      const homeServerUrl = await application.homeServer.getHomeServerUrl()
      if (!homeServerUrl) {
        application.alerts
          .alert(
            c('B1.Account.SignIn.Error')
              .t`Home server is not running. Please open the prefences and home server tab to start it.`,
          )
          .catch(console.error)

        return
      }

      handleSyncServerChange(homeServerUrl)
    }
  }

  const options = useMemo(
    () =>
      [
        /** Offline build: Standard Notes' "Default" server option removed */
        { label: c('B1.Account.SignIn.Option').t`Custom`, value: 'custom' },
      ].concat(
        isDesktopApplication() ? [{ label: c('B1.Account.SignIn.Option').t`Home Server`, value: 'home server' }] : [],
      ) as {
        label: string
        value: ServerType
      }[],
    [],
  )

  return (
    <div className={`flex h-full flex-grow flex-col px-3 pb-1.5 ${className}`}>
      <div className="mb-2 flex font-bold">{c('B1.Account.SignIn.Label').t`Sync Server`}</div>
      {options.length > 1 && <RadioButtonGroup value={currentType} items={options} onChange={selectTab} />}
      {currentType === 'custom' && (
        <DecoratedInput
          className={{
            container: 'mt-1',
          }}
          type="text"
          left={[<Icon type="server" className="text-neutral" />]}
          placeholder={SYNC_SERVER_PLACEHOLDER}
          value={displayedSyncServer(server)}
          onChange={handleSyncServerChange}
        />
      )}
    </div>
  )
}

/** Offline build: observer, so typed input shows (it used to re-render only via its parent) */
export default observer(ServerPicker)
