import { DeviceInterface } from '@standardnotes/services'
import {
  absolutizeCssReferences,
  isCacheableThemeSourceUrl,
  ThemeCssFetcher,
  ThemeCssFetchResponse,
  THEME_CSS_CACHE_STORAGE_KEY,
  THEME_CSS_MAX_LENGTH,
  ThirdPartyThemeCache,
} from './ThirdPartyThemeCache'

const SOURCE = 'https://themes.example.org/monokai/dist/dist.css'

function response(text: string, options: { ok?: boolean; status?: number; contentType?: string } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: { get: (name: string) => (name === 'content-type' ? options.contentType ?? 'text/css' : null) },
    text: () => Promise.resolve(text),
  } as ThemeCssFetchResponse
}

describe('ThirdPartyThemeCache', () => {
  let storage: Record<string, string>
  let device: DeviceInterface
  let fetcher: jest.MockedFunction<ThemeCssFetcher>
  let log: jest.Mock

  const createCache = () => new ThirdPartyThemeCache(device, fetcher, log)

  beforeEach(() => {
    storage = {}
    device = {
      getRawStorageValue: jest.fn((key: string) => Promise.resolve(storage[key])),
      setRawStorageValue: jest.fn((key: string, value: string) => {
        storage[key] = value
        return Promise.resolve()
      }),
    } as unknown as DeviceInterface
    fetcher = jest.fn().mockResolvedValue(response('body { color: red; }'))
    log = jest.fn()
  })

  it('downloads, stores and serves a stylesheet as a data URL', async () => {
    const cache = createCache()
    await cache.load()

    expect(cache.dataUrlFor('uuid-1')).toBeUndefined()
    expect(await cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')).toBe(true)

    expect(fetcher).toHaveBeenCalledWith(SOURCE)
    const url = cache.dataUrlFor('uuid-1') as string
    expect(url.startsWith('data:text/css;charset=utf-8,')).toBe(true)
    expect(decodeURIComponent(url.slice('data:text/css;charset=utf-8,'.length))).toBe('body { color: red; }')
    expect(cache.isCurrent('uuid-1', SOURCE, '1.0.0')).toBe(true)
  })

  it('survives a restart (reads the stored copy without downloading)', async () => {
    const first = createCache()
    await first.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')
    expect(storage[THEME_CSS_CACHE_STORAGE_KEY]).toBeDefined()

    fetcher.mockClear()
    const second = createCache()
    await second.load()

    expect(second.dataUrlFor('uuid-1')).toBeDefined()
    expect(await second.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')).toBe(false)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('re-downloads when the version or address changes, and keeps the old copy if that fails', async () => {
    const cache = createCache()
    await cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')
    const oldUrl = cache.dataUrlFor('uuid-1')

    expect(cache.isCurrent('uuid-1', SOURCE, '1.1.0')).toBe(false)
    fetcher.mockRejectedValueOnce(new TypeError('[offline-allowlist] blocked'))
    expect(await cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.1.0')).toBe(false)
    expect(cache.dataUrlFor('uuid-1')).toBe(oldUrl)

    fetcher.mockResolvedValueOnce(response('body { color: blue; }'))
    const otherSource = 'https://themes.example.org/monokai/v2/dist.css'
    expect(await cache.cache('uuid-1', 'org.example.theme', otherSource, '1.1.0')).toBe(true)
    expect(cache.dataUrlFor('uuid-1')).not.toBe(oldUrl)
    expect(cache.getEntry('uuid-1')?.sourceUrl).toBe(otherSource)
  })

  it('does not retry the same failed download within a session', async () => {
    const cache = createCache()
    fetcher.mockRejectedValue(new TypeError('blocked'))

    expect(await cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')).toBe(false)
    expect(await cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')).toBe(false)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(cache.has('uuid-1')).toBe(false)
    expect(storage[THEME_CSS_CACHE_STORAGE_KEY]).toBeUndefined()
  })

  it('retries a failed download when asked to (explicit user action)', async () => {
    fetcher.mockRejectedValueOnce(new TypeError('blocked'))
    const cache = createCache()

    await expect(cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')).resolves.toBe(false)
    await expect(cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')).resolves.toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)

    await expect(cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0', true)).resolves.toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('adopts a copy without downloading, and only when it differs', async () => {
    const cache = createCache()

    await expect(cache.adopt('uuid-1', 'org.example.theme', SOURCE, '1.0.0', 'body { color: blue; }')).resolves.toBe(
      true,
    )
    expect(fetcher).not.toHaveBeenCalled()
    expect(cache.isCurrent('uuid-1', SOURCE, '1.0.0')).toBe(true)
    expect(cache.dataUrlFor('uuid-1')).toBe(
      'data:text/css;charset=utf-8,' + encodeURIComponent('body { color: blue; }'),
    )
    expect(JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])['uuid-1'].css).toBe('body { color: blue; }')

    await expect(cache.adopt('uuid-1', 'org.example.theme', SOURCE, '1.0.0', 'body { color: blue; }')).resolves.toBe(
      false,
    )
    await expect(cache.adopt('uuid-1', 'org.example.theme', SOURCE, '1.0.0', '   ')).resolves.toBe(false)
    await expect(
      cache.adopt('uuid-1', 'org.example.theme', SOURCE, '1.0.0', 'a'.repeat(THEME_CSS_MAX_LENGTH + 1)),
    ).resolves.toBe(false)
    expect(cache.getEntry('uuid-1')?.css).toBe('body { color: blue; }')
  })

  it('shares one download between concurrent requests', async () => {
    const cache = createCache()
    const results = await Promise.all([
      cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0'),
      cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0'),
    ])

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(results).toEqual([true, true])
  })

  it('rejects error responses, HTML pages, empty and oversized bodies', async () => {
    const cache = createCache()

    fetcher.mockResolvedValueOnce(response('not found', { ok: false, status: 404 }))
    expect(await cache.cache('a', 'id', SOURCE, '1')).toBe(false)

    fetcher.mockResolvedValueOnce(response('<html></html>', { contentType: 'text/html; charset=utf-8' }))
    expect(await cache.cache('b', 'id', SOURCE, '1')).toBe(false)

    fetcher.mockResolvedValueOnce(response('   '))
    expect(await cache.cache('c', 'id', SOURCE, '1')).toBe(false)

    fetcher.mockResolvedValueOnce(response('a'.repeat(THEME_CSS_MAX_LENGTH + 1)))
    expect(await cache.cache('d', 'id', SOURCE, '1')).toBe(false)

    expect(['a', 'b', 'c', 'd'].some((uuid) => cache.has(uuid))).toBe(false)
  })

  it('removes a stored copy', async () => {
    const cache = createCache()
    await cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')

    expect(await cache.remove('uuid-1')).toBe(true)
    expect(cache.dataUrlFor('uuid-1')).toBeUndefined()
    expect(JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])).toEqual({})
    expect(await cache.remove('uuid-1')).toBe(false)

    const restarted = createCache()
    await restarted.load()
    expect(restarted.has('uuid-1')).toBe(false)
  })

  it('ignores unreadable stored data', async () => {
    storage[THEME_CSS_CACHE_STORAGE_KEY] = '{not json'
    const cache = createCache()
    await cache.load()

    expect(cache.has('uuid-1')).toBe(false)
    expect(await cache.cache('uuid-1', 'org.example.theme', SOURCE, '1.0.0')).toBe(true)
  })

  it('makes relative references absolute against the download address', () => {
    const css = [
      "@import 'base.css';",
      '.a { background: url(img/a.png); }',
      '.b { background: url("../b.png"); }',
      ".c { background: url('https://cdn.example.org/c.png'); }",
      '.d { background: url(data:image/png;base64,AAAA); }',
      '.e { fill: url(#gradient); }',
    ].join('\n')

    expect(absolutizeCssReferences(css, SOURCE).split('\n')).toEqual([
      "@import 'https://themes.example.org/monokai/dist/base.css';",
      '.a { background: url(https://themes.example.org/monokai/dist/img/a.png); }',
      '.b { background: url("https://themes.example.org/monokai/b.png"); }',
      ".c { background: url('https://cdn.example.org/c.png'); }",
      '.d { background: url(data:image/png;base64,AAAA); }',
      '.e { fill: url(#gradient); }',
    ])
  })

  it('caches only http(s) sources', () => {
    expect(isCacheableThemeSourceUrl(SOURCE)).toBe(true)
    expect(isCacheableThemeSourceUrl('http://10.0.2.2/theme.css')).toBe(true)
    expect(isCacheableThemeSourceUrl('file:///android_asset/theme.css')).toBe(false)
    expect(isCacheableThemeSourceUrl('sn://theme.css')).toBe(false)
    expect(isCacheableThemeSourceUrl('not a url')).toBe(false)
    expect(isCacheableThemeSourceUrl(undefined)).toBe(false)
  })
})
