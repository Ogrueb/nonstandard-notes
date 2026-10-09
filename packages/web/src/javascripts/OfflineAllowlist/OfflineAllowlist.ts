/**
 * Offline build: host allowlist for every request made from JavaScript.
 *
 * Always allowed:
 * - non-network URLs (file:, blob:, data:, about:, ...) and same-origin URLs
 * - localhost and loopback, private IPv4 ranges (10/8, 172.16/12, 192.168/16), link-local,
 *   Tailscale/CGNAT (100.64/10), IPv6 loopback, unique-local (fc00::/7) and link-local (fe80::/10)
 * - local-only names ending in .local, .lan, .home.arpa, .internal or .localhost
 *
 * Network isolation on (the default): everything else is rejected immediately, without a network
 * request. A configured server must therefore use a private address or a local-only name.
 *
 * Network isolation off (Preferences > Security, Android only): other internet hosts are allowed
 * too, but Standard Notes' own domains (standardnotes.com, standardnotes.org, listed.to and their
 * subdomains) stay blocked, so the app still never contacts Standard Notes' servers.
 *
 * The mode is set by the React Native shell, which injects window.snOfflineNetworkIsolation before
 * the page loads. Anything other than an explicit false counts as on (fail closed). The Android
 * WebView applies the same rules natively (OfflineAllowlist.java), reading the same setting.
 */

const NETWORK_PROTOCOLS = ['http:', 'https:', 'ws:', 'wss:']

const LOCAL_NAME_SUFFIXES = ['.localhost', '.local', '.lan', '.home.arpa', '.internal']

/** Standard Notes' own domains: blocked in both modes */
const STANDARD_NOTES_DOMAINS = ['standardnotes.com', 'standardnotes.org', 'listed.to']

export const OFFLINE_ALLOWLIST_LOG_PREFIX = '[offline-allowlist]'

export const NETWORK_ISOLATION_GLOBAL = 'snOfflineNetworkIsolation'

/** True unless the React Native shell injected an explicit false (fail closed) */
export function isNetworkIsolationOn(target: unknown = globalThis): boolean {
  if (!target || typeof target !== 'object') {
    return true
  }
  return (target as Record<string, unknown>)[NETWORK_ISOLATION_GLOBAL] !== false
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '')
}

function parseIPv4(hostname: string): number[] | undefined {
  const parts = hostname.split('.')
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return undefined
  }
  const octets = parts.map(Number)
  return octets.every((octet) => octet <= 255) ? octets : undefined
}

function isPrivateIPv4([a, b]: number[]): boolean {
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

function isPrivateIPv6(bracketedHostname: string): boolean {
  const address = bracketedHostname.slice(1, -1).toLowerCase()

  if (address === '::1') {
    return true
  }

  /** IPv4-mapped, normalised by URL to ::ffff:xxxx:xxxx */
  const mapped = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mapped) {
    const high = parseInt(mapped[1], 16)
    const low = parseInt(mapped[2], 16)
    return isPrivateIPv4([high >> 8, high & 0xff, low >> 8, low & 0xff])
  }

  const firstHextet = parseInt(address.split(':')[0] || '0', 16)
  const isUniqueLocal = (firstHextet & 0xfe00) === 0xfc00
  const isLinkLocal = (firstHextet & 0xffc0) === 0xfe80
  return isUniqueLocal || isLinkLocal
}

export function isLocalNetworkHost(hostname: string): boolean {
  const host = normalizeHost(hostname)

  if (host === 'localhost' || LOCAL_NAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true
  }

  if (host.startsWith('[') && host.endsWith(']')) {
    return isPrivateIPv6(host)
  }

  const ipv4 = parseIPv4(host)
  return ipv4 !== undefined && isPrivateIPv4(ipv4)
}

export function isStandardNotesHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  return STANDARD_NOTES_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`))
}

/**
 * @param url the requested URL, absolute or relative
 * @param baseHref the page URL relative URLs resolve against (window.location.href)
 * @param isolated network isolation on (local network only) or off (internet except Standard Notes)
 */
export function isAllowedRequestUrl(url: string, baseHref: string, isolated = true): boolean {
  let parsed: URL
  try {
    parsed = new URL(url, baseHref)
  } catch {
    return false
  }

  if (!NETWORK_PROTOCOLS.includes(parsed.protocol)) {
    return true
  }

  try {
    const base = new URL(baseHref)
    if (NETWORK_PROTOCOLS.includes(base.protocol) && parsed.origin === base.origin) {
      return true
    }
  } catch {
    /** No usable base; fall through to the host checks */
  }

  if (isLocalNetworkHost(parsed.hostname)) {
    return true
  }

  if (isolated || !parsed.hostname) {
    return false
  }

  return !isStandardNotesHost(parsed.hostname)
}

export function describeBlockedUrl(url: string, baseHref: string): string {
  try {
    const parsed = new URL(url, baseHref)
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`
  } catch {
    return String(url)
  }
}
