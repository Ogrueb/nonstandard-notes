import { DefaultHost } from '@standardnotes/snjs'
import { isNetworkIsolationOn } from '@/OfflineAllowlist/OfflineAllowlist'

/**
 * Offline build: which parts of the UI are hidden because they depend on Standard Notes'
 * services (always) or on the internet (while network isolation is on). Editor code is never
 * changed (project guideline).
 */

/** Preferences panes that need Standard Notes' services, which this build always blocks */
const ALWAYS_HIDDEN_PANES = ['listed', 'get-free-month']

/** Preferences panes that need the internet: hidden while network isolation is on */
const ISOLATION_HIDDEN_PANES = ['whats-new']

export function isPreferencePaneHidden(paneId: string, isolated: boolean = isNetworkIsolationOn()): boolean {
  return ALWAYS_HIDDEN_PANES.includes(paneId) || (isolated && ISOLATION_HIDDEN_PANES.includes(paneId))
}

/** Online plugin list (fetched from GitHub): hidden while network isolation is on */
export function isOnlinePluginListHidden(isolated: boolean = isNetworkIsolationOn()): boolean {
  return isolated
}

export const SYNC_SERVER_PLACEHOLDER = 'https://server-address:port'

/**
 * Sign-in and registration need a sync server entered by the user: this build has no default
 * (Standard Notes' server is blocked). Returns an error message, or undefined if a server is set.
 */
export function missingSyncServerMessage(server: string | undefined): string | undefined {
  const value = (server ?? '').trim()
  if (value === '' || value === DefaultHost.Api) {
    return 'Enter the server address under Advanced options.'
  }
  return undefined
}

/** The server field shows nothing instead of Standard Notes' default address */
export function displayedSyncServer(server: string | undefined): string {
  return !server || server === DefaultHost.Api ? '' : server
}
