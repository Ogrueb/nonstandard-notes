import {
  OFFLINE_ALLOWLIST_LOG_PREFIX,
  describeBlockedUrl,
  isAllowedRequestUrl,
  isNetworkIsolationOn,
} from './OfflineAllowlist'

/**
 * Offline build: wraps fetch, XMLHttpRequest, WebSocket and sendBeacon so that requests to
 * hosts outside the allowlist fail at once, as a network error, without leaving the device.
 * Imported first by index.ts, before any other app code runs.
 *
 * The network isolation mode is read on every request rather than once at install, because the
 * React Native shell's injected flag may arrive just after this module runs. Until it does, the
 * stricter mode applies.
 *
 * <img>, <link>, <iframe> and CSS url() loads are not JavaScript requests; on Android they are
 * blocked by the WebView client (OfflineAllowlist.java), which also backs up this guard.
 */

const BLOCKED_URL = Symbol('offlineAllowlistBlockedUrl')
const loggedBlockedUrls = new Set<string>()

type GuardedXMLHttpRequest = XMLHttpRequest & { [BLOCKED_URL]?: string }

function baseHref(): string {
  return typeof window !== 'undefined' && window.location ? window.location.href : 'file:///'
}

function isAllowed(url: string): boolean {
  return isAllowedRequestUrl(url, baseHref(), isNetworkIsolationOn(globalThis))
}

function logBlocked(kind: string, url: string): string {
  const described = describeBlockedUrl(url, baseHref())
  if (!loggedBlockedUrls.has(described)) {
    loggedBlockedUrls.add(described)
    // eslint-disable-next-line no-console
    console.warn(OFFLINE_ALLOWLIST_LOG_PREFIX, 'blocked', kind, described)
  }
  return described
}

function urlFromFetchInput(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.href
  }
  return input.url
}

function installFetchGuard(target: typeof globalThis): void {
  const originalFetch = target.fetch
  if (typeof originalFetch !== 'function') {
    return
  }

  target.fetch = function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = urlFromFetchInput(input)
    if (!isAllowed(url)) {
      const described = logBlocked('fetch', url)
      return Promise.reject(new TypeError(`${OFFLINE_ALLOWLIST_LOG_PREFIX} blocked ${described}`))
    }
    return originalFetch.call(target, input, init)
  }
}

/**
 * A blocked XHR is opened normally (open() makes no request), and send() then reports a network
 * error the way a browser does: readyState 4, status 0, then readystatechange, error and loadend.
 */
function failBlockedXhr(xhr: GuardedXMLHttpRequest): void {
  const define = (name: string, value: unknown) =>
    Object.defineProperty(xhr, name, { value, configurable: true, writable: false })

  define('readyState', 4)
  define('status', 0)
  define('statusText', '')
  define('responseText', '')
  define('response', xhr.responseType === '' || xhr.responseType === 'text' ? '' : null)
  define('responseURL', '')
  define('getAllResponseHeaders', () => '')
  define('getResponseHeader', () => null)

  xhr.dispatchEvent(new Event('readystatechange'))
  xhr.dispatchEvent(new ProgressEvent('error'))
  xhr.dispatchEvent(new ProgressEvent('loadend'))
}

function installXhrGuard(target: typeof globalThis): void {
  const XHR = target.XMLHttpRequest
  if (typeof XHR !== 'function') {
    return
  }

  const originalOpen = XHR.prototype.open as (...args: unknown[]) => void
  const originalSend = XHR.prototype.send

  const guardedOpen = function (this: GuardedXMLHttpRequest, ...args: unknown[]): void {
    const url = String(args[1])
    // eslint-disable-next-line no-invalid-this
    this[BLOCKED_URL] = isAllowed(url) ? undefined : url
    // eslint-disable-next-line no-invalid-this
    return originalOpen.apply(this, args)
  }
  XHR.prototype.open = guardedOpen as typeof XHR.prototype.open

  XHR.prototype.send = function guardedSend(
    this: GuardedXMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const blockedUrl = this[BLOCKED_URL]
    if (blockedUrl === undefined) {
      return originalSend.call(this, body)
    }

    logBlocked('xhr', blockedUrl)
    setTimeout(() => failBlockedXhr(this), 0)
  }
}

function installWebSocketGuard(target: typeof globalThis): void {
  const OriginalWebSocket = target.WebSocket
  if (typeof OriginalWebSocket !== 'function') {
    return
  }

  target.WebSocket = new Proxy(OriginalWebSocket, {
    construct(constructor, args: unknown[]) {
      const url = String(args[0])
      if (!isAllowed(url)) {
        const described = logBlocked('websocket', url)
        throw new Error(`${OFFLINE_ALLOWLIST_LOG_PREFIX} blocked ${described}`)
      }
      return Reflect.construct(constructor, args)
    },
  })
}

function installBeaconGuard(target: typeof globalThis): void {
  const nav = target.navigator
  if (!nav || typeof nav.sendBeacon !== 'function') {
    return
  }

  const originalSendBeacon = nav.sendBeacon.bind(nav)
  nav.sendBeacon = (url: string | URL, data?: BodyInit | null): boolean => {
    const urlString = String(url)
    if (!isAllowed(urlString)) {
      logBlocked('beacon', urlString)
      return false
    }
    return originalSendBeacon(url, data)
  }
}

export function installOfflineAllowlist(target: typeof globalThis = globalThis): void {
  installFetchGuard(target)
  installXhrGuard(target)
  installWebSocketGuard(target)
  installBeaconGuard(target)
}

installOfflineAllowlist()
