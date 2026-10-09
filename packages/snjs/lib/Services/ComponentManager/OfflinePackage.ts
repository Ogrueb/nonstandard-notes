import { Copy } from '@standardnotes/utils'

/**
 * Offline build: a plugin's files stored inside its own plugin item, so they travel with the item in backups and
 * through sync, and a device that receives the item needs no download.
 *
 * Stored in the item's appData under this fork's own domain key. appData is keyed by domain so that different apps
 * can keep their own data on the same item; stock clients ignore unknown domains and keep them when they edit the
 * item (a mutation copies the whole content).
 *
 * The format holds a map of files so that multi-file plugins (editors) could use it later. Only single-file themes
 * use it now: `main` is the stylesheet.
 */
export const OFFLINE_PACKAGE_DOMAIN = 'io.github.ogrueb.nonstandardnotes'
export const OFFLINE_PACKAGE_KEY = 'offlinePackage'
export const OFFLINE_PACKAGE_FORMAT = 1

/** Text files are stored as is. 'base64' is reserved for binary files (not used yet). */
export type OfflinePackageFileEncoding = 'utf-8' | 'base64'

export type OfflinePackageFile = {
  encoding: OfflinePackageFileEncoding
  data: string
}

export type OfflinePackage = {
  format: typeof OFFLINE_PACKAGE_FORMAT
  /** The address the files were downloaded from (the plugin's hosted_url at the time). */
  sourceUrl: string
  /** The plugin's package_info.version at the time of the download. */
  version?: string
  /** Path of the file the plugin is loaded from, a key of `files`. */
  main: string
  /** Paths relative to the package root. */
  files: Record<string, OfflinePackageFile>
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isValidFile = (value: unknown): value is OfflinePackageFile =>
  isRecord(value) && (value.encoding === 'utf-8' || value.encoding === 'base64') && typeof value.data === 'string'

/** The stored package, if the item content holds a valid one. */
export function readOfflinePackage(content: unknown): OfflinePackage | undefined {
  if (!isRecord(content) || !isRecord(content.appData)) {
    return undefined
  }
  const domainData = content.appData[OFFLINE_PACKAGE_DOMAIN]
  if (!isRecord(domainData)) {
    return undefined
  }
  const stored = domainData[OFFLINE_PACKAGE_KEY]
  if (
    !isRecord(stored) ||
    stored.format !== OFFLINE_PACKAGE_FORMAT ||
    typeof stored.sourceUrl !== 'string' ||
    (stored.version !== undefined && typeof stored.version !== 'string') ||
    typeof stored.main !== 'string' ||
    !isRecord(stored.files)
  ) {
    return undefined
  }
  const files: Record<string, OfflinePackageFile> = {}
  for (const [path, file] of Object.entries(stored.files)) {
    if (!isValidFile(file)) {
      return undefined
    }
    files[path] = { encoding: file.encoding, data: file.data }
  }
  if (!files[stored.main]) {
    return undefined
  }
  return {
    format: OFFLINE_PACKAGE_FORMAT,
    sourceUrl: stored.sourceUrl,
    ...(stored.version !== undefined ? { version: stored.version } : {}),
    main: stored.main,
    files,
  }
}

/** The main file's text, if it is a text file. */
export function offlinePackageMainText(offlinePackage: OfflinePackage): string | undefined {
  const file = offlinePackage.files[offlinePackage.main]
  return file && file.encoding === 'utf-8' ? file.data : undefined
}

/** True when the package was downloaded from this address and version. */
export function isOfflinePackageCurrent(
  offlinePackage: OfflinePackage | undefined,
  sourceUrl: string,
  version: string | undefined,
): boolean {
  return (
    offlinePackage !== undefined &&
    offlinePackage.sourceUrl === sourceUrl &&
    (offlinePackage.version ?? '') === (version ?? '')
  )
}

/** File name for a single-file package: the last path segment of the download address. */
export function mainFileNameForUrl(sourceUrl: string): string {
  try {
    const segments = new URL(sourceUrl).pathname.split('/').filter((segment) => segment.length > 0)
    const last = segments[segments.length - 1]
    return last ? decodeURIComponent(last) : 'index.css'
  } catch {
    return 'index.css'
  }
}

/**
 * A single-file text package. Deterministic (no timestamps), so two devices that store the same download produce
 * identical item content and sync does not see a conflict.
 */
export function createSingleFileOfflinePackage(
  sourceUrl: string,
  version: string | undefined,
  text: string,
): OfflinePackage {
  const main = mainFileNameForUrl(sourceUrl)
  return {
    format: OFFLINE_PACKAGE_FORMAT,
    sourceUrl,
    ...(version !== undefined ? { version } : {}),
    main,
    files: { [main]: { encoding: 'utf-8', data: text } },
  }
}

export function areOfflinePackagesEqual(a: OfflinePackage | undefined, b: OfflinePackage | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b
  }
  if (a.sourceUrl !== b.sourceUrl || (a.version ?? '') !== (b.version ?? '') || a.main !== b.main) {
    return false
  }
  const aPaths = Object.keys(a.files)
  if (aPaths.length !== Object.keys(b.files).length) {
    return false
  }
  return aPaths.every((path) => {
    const other = b.files[path]
    return other !== undefined && other.encoding === a.files[path].encoding && other.data === a.files[path].data
  })
}

/**
 * Returns a copy of the item content with the package stored (or removed, for undefined). Other appData domains,
 * including Standard Notes' own, are kept unchanged.
 */
export function contentWithOfflinePackage<C>(content: C, offlinePackage: OfflinePackage | undefined): C {
  /** Same deep copy as the item mutator uses for item content. */
  const copy = Copy<C & { appData?: Record<string, unknown> }>(content)
  const appData: Record<string, unknown> = isRecord(copy.appData) ? copy.appData : {}
  const domainData: Record<string, unknown> = isRecord(appData[OFFLINE_PACKAGE_DOMAIN])
    ? (appData[OFFLINE_PACKAGE_DOMAIN] as Record<string, unknown>)
    : {}

  if (offlinePackage) {
    domainData[OFFLINE_PACKAGE_KEY] = offlinePackage
  } else {
    delete domainData[OFFLINE_PACKAGE_KEY]
  }

  if (Object.keys(domainData).length > 0) {
    appData[OFFLINE_PACKAGE_DOMAIN] = domainData
  } else {
    delete appData[OFFLINE_PACKAGE_DOMAIN]
  }
  copy.appData = appData
  return copy
}
