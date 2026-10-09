import { DeviceInterface } from '@standardnotes/services'

/**
 * Offline build: device-level cache of third-party theme stylesheets.
 *
 * A plugin theme normally loads its stylesheet from its hosted_url every time it is activated, so it never applies
 * without network access. This cache downloads the stylesheet once (from the theme author's host, by this device) and
 * serves it afterwards as a data: URL, which needs no network.
 *
 * Stored in raw device storage under a single key, outside any workspace's storage object, removed when all data is
 * cleared from the device. Entries are keyed by the theme item's uuid. This copy is read before items load, so an
 * active theme applies at launch. The copy that travels with backups and sync is stored in the theme item itself
 * (see OfflinePackage.ts); the two are kept in step by ComponentManager.
 */
export const THEME_CSS_CACHE_STORAGE_KEY = 'offline_build_theme_css_cache'

/** Larger responses are not cached (theme stylesheets are typically well under 100 kB). */
export const THEME_CSS_MAX_LENGTH = 2 * 1024 * 1024

const DATA_URL_PREFIX = 'data:text/css;charset=utf-8,'

export function cssToDataUrl(css: string): string {
  return DATA_URL_PREFIX + encodeURIComponent(css)
}

export type CachedThemeCss = {
  identifier: string
  sourceUrl: string
  version?: string
  css: string
  cachedAt: number
}

type CacheContents = Record<string, CachedThemeCss>

export type ThemeCssFetchResponse = {
  ok: boolean
  status: number
  headers?: { get(name: string): string | null }
  text(): Promise<string>
}

export type ThemeCssFetcher = (url: string) => Promise<ThemeCssFetchResponse>

export type ThemeCacheLog = (message: string) => void

const defaultFetcher: ThemeCssFetcher = (url) => fetch(url, { credentials: 'omit' })

/** console.warn, because on mobile console.log does not reach the WebView console. */
const defaultLog: ThemeCacheLog = (message) => console.warn(message)

export function isCacheableThemeSourceUrl(url: string | undefined): url is string {
  if (!url) {
    return false
  }
  try {
    const protocol = new URL(url).protocol
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Makes relative references in a stylesheet absolute against the address it was downloaded from, since a data: URL
 * has no base. Absolute references (images, fonts) still need the network when used.
 */
export function absolutizeCssReferences(css: string, baseUrl: string): string {
  const resolve = (reference: string): string | undefined => {
    const trimmed = reference.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#') || /^data:/i.test(trimmed)) {
      return undefined
    }
    try {
      return new URL(trimmed, baseUrl).href
    } catch {
      return undefined
    }
  }

  return css
    .replace(/url\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (match: string, quote: string, reference: string) => {
      const resolved = resolve(reference)
      return resolved ? `url(${quote}${resolved}${quote})` : match
    })
    .replace(/@import\s+(['"])([^'"]+)\1/gi, (match: string, quote: string, reference: string) => {
      const resolved = resolve(reference)
      return resolved ? `@import ${quote}${resolved}${quote}` : match
    })
}

export class ThirdPartyThemeCache {
  private entries: CacheContents = {}
  private dataUrls = new Map<string, string>()
  private loadPromise: Promise<void> | undefined
  private attempted = new Set<string>()
  private inFlight = new Map<string, Promise<boolean>>()

  constructor(
    private device: DeviceInterface,
    private fetcher: ThemeCssFetcher = defaultFetcher,
    private log: ThemeCacheLog = defaultLog,
  ) {}

  /** Reads the cache from device storage. Safe to call more than once. */
  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.readFromDisk()
    }
    return this.loadPromise
  }

  private async readFromDisk(): Promise<void> {
    try {
      const raw = await this.device.getRawStorageValue(THEME_CSS_CACHE_STORAGE_KEY)
      if (!raw) {
        return
      }
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return
      }
      for (const [uuid, entry] of Object.entries(parsed as CacheContents)) {
        if (entry && typeof entry.css === 'string' && typeof entry.sourceUrl === 'string') {
          this.entries[uuid] = entry
        }
      }
    } catch (error) {
      this.log(`[theme-cache] could not read the theme cache: ${(error as Error)?.message}`)
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.device.setRawStorageValue(THEME_CSS_CACHE_STORAGE_KEY, JSON.stringify(this.entries))
    } catch (error) {
      this.log(`[theme-cache] could not save the theme cache: ${(error as Error)?.message}`)
    }
  }

  has(uuid: string): boolean {
    return this.entries[uuid] !== undefined
  }

  getEntry(uuid: string): CachedThemeCss | undefined {
    return this.entries[uuid]
  }

  /** The cached stylesheet as a data: URL, whether or not it is current. */
  dataUrlFor(uuid: string): string | undefined {
    const entry = this.entries[uuid]
    if (!entry) {
      return undefined
    }
    let url = this.dataUrls.get(uuid)
    if (!url) {
      url = cssToDataUrl(entry.css)
      this.dataUrls.set(uuid, url)
    }
    return url
  }

  /** True when a copy exists for this source address and version (no download needed). */
  isCurrent(uuid: string, sourceUrl: string, version: string | undefined): boolean {
    const entry = this.entries[uuid]
    return entry !== undefined && entry.sourceUrl === sourceUrl && (entry.version ?? '') === (version ?? '')
  }

  /**
   * Downloads the stylesheet and stores it, unless a current copy exists or this exact download already failed in
   * this session (`retry` skips that check, for an explicit user action). On failure an older copy is kept and stays
   * in use. Resolves true if the stored copy changed.
   */
  async cache(
    uuid: string,
    identifier: string,
    sourceUrl: string,
    version: string | undefined,
    retry = false,
  ): Promise<boolean> {
    await this.load()

    if (this.isCurrent(uuid, sourceUrl, version)) {
      return false
    }

    const attemptKey = `${uuid}|${sourceUrl}|${version ?? ''}`
    const pending = this.inFlight.get(attemptKey)
    if (pending) {
      return pending
    }
    if (this.attempted.has(attemptKey) && !retry) {
      return false
    }
    this.attempted.add(attemptKey)

    const download = this.download(uuid, identifier, sourceUrl, version).finally(() => {
      this.inFlight.delete(attemptKey)
    })
    this.inFlight.set(attemptKey, download)
    return download
  }

  private async download(
    uuid: string,
    identifier: string,
    sourceUrl: string,
    version: string | undefined,
  ): Promise<boolean> {
    try {
      const response = await this.fetcher(sourceUrl)
      if (!response.ok) {
        this.log(`[theme-cache] download failed (${response.status}): ${sourceUrl}`)
        return false
      }

      const contentType = response.headers?.get('content-type') ?? ''
      if (contentType.toLowerCase().includes('text/html')) {
        this.log(`[theme-cache] not a stylesheet (${contentType}): ${sourceUrl}`)
        return false
      }

      const text = await response.text()
      if (text.trim().length === 0 || text.length > THEME_CSS_MAX_LENGTH) {
        this.log(`[theme-cache] empty or too large (${text.length} characters): ${sourceUrl}`)
        return false
      }

      this.entries[uuid] = {
        identifier,
        sourceUrl,
        version,
        css: absolutizeCssReferences(text, sourceUrl),
        cachedAt: Date.now(),
      }
      this.dataUrls.delete(uuid)
      await this.persist()
      this.log(`[theme-cache] cached ${identifier} from ${sourceUrl}`)
      return true
    } catch (error) {
      /** Expected while network isolation is on: the request is blocked at once. */
      this.log(`[theme-cache] download failed: ${sourceUrl} (${(error as Error)?.message})`)
      return false
    }
  }

  /**
   * Stores a copy that came with the theme item (from a backup, sync or another device), without a download. The
   * stylesheet is stored as received (it was prepared when it was first downloaded). Resolves true if the stored
   * copy changed.
   */
  async adopt(
    uuid: string,
    identifier: string,
    sourceUrl: string,
    version: string | undefined,
    css: string,
  ): Promise<boolean> {
    await this.load()

    if (css.trim().length === 0 || css.length > THEME_CSS_MAX_LENGTH) {
      return false
    }

    const existing = this.entries[uuid]
    if (
      existing &&
      existing.css === css &&
      existing.sourceUrl === sourceUrl &&
      (existing.version ?? '') === (version ?? '')
    ) {
      return false
    }

    this.entries[uuid] = { identifier, sourceUrl, version, css, cachedAt: Date.now() }
    this.dataUrls.delete(uuid)
    await this.persist()
    this.log(`[theme-cache] restored ${identifier} from the plugin item`)
    return true
  }

  /** Deletes the stored copy. Resolves true if there was one. */
  async remove(uuid: string): Promise<boolean> {
    await this.load()

    if (!this.entries[uuid]) {
      return false
    }

    delete this.entries[uuid]
    this.dataUrls.delete(uuid)
    await this.persist()
    this.log(`[theme-cache] removed ${uuid}`)
    return true
  }
}
