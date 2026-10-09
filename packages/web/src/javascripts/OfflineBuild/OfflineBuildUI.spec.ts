import { DefaultHost } from '@standardnotes/snjs'
import {
  displayedSyncServer,
  isOnlinePluginListHidden,
  isPreferencePaneHidden,
  missingSyncServerMessage,
} from './OfflineBuildUI'

describe('OfflineBuildUI', () => {
  it('always hides panes that need Standard Notes services', () => {
    expect(isPreferencePaneHidden('listed', false)).toBe(true)
    expect(isPreferencePaneHidden('listed', true)).toBe(true)
    expect(isPreferencePaneHidden('get-free-month', false)).toBe(true)
  })

  it('hides What’s New only while isolation is on', () => {
    expect(isPreferencePaneHidden('whats-new', true)).toBe(true)
    expect(isPreferencePaneHidden('whats-new', false)).toBe(false)
  })

  it('keeps the other panes', () => {
    for (const id of ['account', 'general', 'security', 'backups', 'appearance', 'plugins', 'help-feedback']) {
      expect(isPreferencePaneHidden(id, true)).toBe(false)
    }
  })

  it('hides the online plugin list only while isolation is on', () => {
    expect(isOnlinePluginListHidden(true)).toBe(true)
    expect(isOnlinePluginListHidden(false)).toBe(false)
  })

  it('requires a sync server other than Standard Notes’ default', () => {
    expect(missingSyncServerMessage(undefined)).toBeDefined()
    expect(missingSyncServerMessage('  ')).toBeDefined()
    expect(missingSyncServerMessage(DefaultHost.Api)).toBeDefined()
    expect(missingSyncServerMessage('https://192.168.1.10:3000')).toBeUndefined()
  })

  it('shows an empty server field instead of the default address', () => {
    expect(displayedSyncServer(DefaultHost.Api)).toBe('')
    expect(displayedSyncServer(undefined)).toBe('')
    expect(displayedSyncServer('https://nas.local:3000')).toBe('https://nas.local:3000')
  })
})
