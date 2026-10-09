import {
  areOfflinePackagesEqual,
  contentWithOfflinePackage,
  createSingleFileOfflinePackage,
  isOfflinePackageCurrent,
  mainFileNameForUrl,
  OFFLINE_PACKAGE_DOMAIN,
  OFFLINE_PACKAGE_KEY,
  offlinePackageMainText,
  readOfflinePackage,
} from './OfflinePackage'

const URL_CSS = 'https://themes.example.org/monokai/dist/dist.css'

describe('OfflinePackage (offline build)', () => {
  const baseContent = () => ({
    hosted_url: URL_CSS,
    name: 'Monokai-D',
    appData: { 'org.standardnotes.sn': { pinned: true } },
  })

  it('stores a package under its own appData domain and reads it back', () => {
    const offlinePackage = createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}')
    const content = contentWithOfflinePackage(baseContent(), offlinePackage)

    expect(readOfflinePackage(content)).toEqual(offlinePackage)
    expect(offlinePackageMainText(offlinePackage)).toBe('body {}')
    expect(offlinePackage.main).toBe('dist.css')
    expect(offlinePackage.files['dist.css']).toEqual({ encoding: 'utf-8', data: 'body {}' })
  })

  it("keeps the rest of the content, including Standard Notes' own appData", () => {
    const original = baseContent()
    const content = contentWithOfflinePackage(original, createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}'))

    expect(content.hosted_url).toBe(URL_CSS)
    expect(content.name).toBe('Monokai-D')
    expect(content.appData['org.standardnotes.sn']).toEqual({ pinned: true })
    /** The input is not modified. */
    expect(Object.keys(original.appData)).toEqual(['org.standardnotes.sn'])
  })

  it('removes the package and its empty domain', () => {
    const withPackage = contentWithOfflinePackage(
      baseContent(),
      createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}'),
    )
    const removed = contentWithOfflinePackage(withPackage, undefined)

    expect(readOfflinePackage(removed)).toBeUndefined()
    expect(Object.keys(removed.appData)).toEqual(['org.standardnotes.sn'])
  })

  it('is deterministic, so two devices storing the same download write identical content', () => {
    const a = contentWithOfflinePackage(baseContent(), createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}'))
    const b = contentWithOfflinePackage(baseContent(), createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}'))

    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('rejects missing or malformed packages', () => {
    const withStored = (stored: unknown) => ({
      appData: { [OFFLINE_PACKAGE_DOMAIN]: { [OFFLINE_PACKAGE_KEY]: stored } },
    })
    const valid = createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}')

    expect(readOfflinePackage(undefined)).toBeUndefined()
    expect(readOfflinePackage({})).toBeUndefined()
    expect(readOfflinePackage({ appData: {} })).toBeUndefined()
    expect(readOfflinePackage(withStored('text'))).toBeUndefined()
    expect(readOfflinePackage(withStored({ ...valid, format: 2 }))).toBeUndefined()
    expect(readOfflinePackage(withStored({ ...valid, main: 'other.css' }))).toBeUndefined()
    expect(readOfflinePackage(withStored({ ...valid, sourceUrl: 3 }))).toBeUndefined()
    expect(
      readOfflinePackage(withStored({ ...valid, files: { 'dist.css': { encoding: 'gzip', data: 'x' } } })),
    ).toBeUndefined()
    expect(readOfflinePackage(withStored(valid))).toEqual(valid)
  })

  it('reads a multi-file package (format reserved for editors) and returns no text for a binary main file', () => {
    const stored = {
      format: 1,
      sourceUrl: 'https://example.org/editor/index.html',
      version: '2.0.0',
      main: 'index.html',
      files: {
        'index.html': { encoding: 'utf-8', data: '<html></html>' },
        'fonts/a.woff2': { encoding: 'base64', data: 'AAEC' },
      },
    }
    const offlinePackage = readOfflinePackage({
      appData: { [OFFLINE_PACKAGE_DOMAIN]: { [OFFLINE_PACKAGE_KEY]: stored } },
    })

    expect(offlinePackage?.files['fonts/a.woff2']).toEqual({ encoding: 'base64', data: 'AAEC' })
    expect(offlinePackageMainText({ ...offlinePackage!, main: 'fonts/a.woff2' })).toBeUndefined()
  })

  it('checks whether a package matches an address and version', () => {
    const offlinePackage = createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}')

    expect(isOfflinePackageCurrent(offlinePackage, URL_CSS, '1.1.3')).toBe(true)
    expect(isOfflinePackageCurrent(offlinePackage, URL_CSS, '1.2.0')).toBe(false)
    expect(isOfflinePackageCurrent(offlinePackage, 'https://other.example.org/a.css', '1.1.3')).toBe(false)
    expect(isOfflinePackageCurrent(undefined, URL_CSS, '1.1.3')).toBe(false)
    expect(
      isOfflinePackageCurrent(createSingleFileOfflinePackage(URL_CSS, undefined, 'body {}'), URL_CSS, undefined),
    ).toBe(true)
  })

  it('compares packages by address, version and files', () => {
    const a = createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}')

    expect(areOfflinePackagesEqual(a, createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'body {}'))).toBe(true)
    expect(areOfflinePackagesEqual(a, createSingleFileOfflinePackage(URL_CSS, '1.1.3', 'p {}'))).toBe(false)
    expect(areOfflinePackagesEqual(a, createSingleFileOfflinePackage(URL_CSS, '1.2.0', 'body {}'))).toBe(false)
    expect(areOfflinePackagesEqual(a, undefined)).toBe(false)
    expect(areOfflinePackagesEqual(undefined, undefined)).toBe(true)
  })

  it('names the main file after the last segment of the address', () => {
    expect(mainFileNameForUrl(URL_CSS)).toBe('dist.css')
    expect(mainFileNameForUrl('https://example.org/theme%20one.css?v=2')).toBe('theme one.css')
    expect(mainFileNameForUrl('https://example.org/')).toBe('index.css')
    expect(mainFileNameForUrl('not a url')).toBe('index.css')
  })
})
