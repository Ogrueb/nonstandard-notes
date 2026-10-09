import { isAllowedRequestUrl, isLocalNetworkHost, isNetworkIsolationOn, isStandardNotesHost } from './OfflineAllowlist'

const MOBILE_BASE = 'file:///android_asset/Web.bundle/src/index.html'

describe('offline allowlist', () => {
  describe('blocked', () => {
    it.each([
      'https://api.standardnotes.com/v1/offline/features',
      'https://files.standardnotes.com/v1/files',
      'wss://sockets.standardnotes.com',
      'https://raw.githubusercontent.com/standardnotes/plugins/main/packages.json',
      'https://example.com/image.png',
      'http://172.32.0.1/',
      'http://11.0.0.1/',
      'http://100.128.0.1/',
      'http://10.0.1.2.evil.com/',
      'http://[2001:db8::1]/',
      'http://',
    ])('%s', (url) => {
      expect(isAllowedRequestUrl(url, MOBILE_BASE)).toBe(false)
    })
  })

  describe('allowed', () => {
    it.each([
      'http://10.0.1.2:3000/v1/login',
      'http://192.168.1.5:3125/v1/files',
      'http://172.16.0.1/',
      'http://172.31.255.255/',
      'http://127.0.0.1:3000/',
      'http://localhost:3000/',
      'http://169.254.1.1/',
      'http://100.100.1.1/',
      'http://nas.local:3000/',
      'https://server.lan/',
      'https://notes.home.arpa/',
      'https://sn.internal/',
      'http://[::1]:3000/',
      'http://[fd12:3456::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:192.168.1.5]/',
      'http://evil.com@10.0.1.2/',
      'file:///android_asset/Web.bundle/src/web-src/components/assets/x/index.css',
      'blob:file:///6f1c2c1e-1111-2222-3333-444444444444',
      'data:text/plain,hello',
      'about:blank',
      './relative/file.json',
      '/absolute-path',
    ])('%s', (url) => {
      expect(isAllowedRequestUrl(url, MOBILE_BASE)).toBe(true)
    })
  })

  it('blocks a public server name even if it is the configured server', () => {
    expect(isAllowedRequestUrl('https://notes.example.org/v1/items/sync', MOBILE_BASE)).toBe(false)
  })

  describe('same origin on web', () => {
    it('allows requests to the origin the web app is served from', () => {
      const base = 'https://notes.example.net/app/'
      expect(isAllowedRequestUrl('/assets/x.json', base)).toBe(true)
      expect(isAllowedRequestUrl('https://notes.example.net/y', base)).toBe(true)
      expect(isAllowedRequestUrl('https://example.com/', base)).toBe(false)
    })
  })

  it('isLocalNetworkHost handles case and trailing dots', () => {
    expect(isLocalNetworkHost('LOCALHOST')).toBe(true)
    expect(isLocalNetworkHost('nas.local.')).toBe(true)
    expect(isLocalNetworkHost('example.com')).toBe(false)
  })

  describe('network isolation off (internet except Standard Notes)', () => {
    const isolated = false

    describe('still blocked', () => {
      it.each([
        'https://api.standardnotes.com/v1/offline/features',
        'https://api.standardnotes.com/v2/subscriptions',
        'https://files.standardnotes.com/v1/files',
        'wss://sockets.standardnotes.com',
        'https://standardnotes.com/',
        'https://APP.StandardNotes.com./',
        'https://extensions.standardnotes.org/x',
        'https://listed.to/@someone',
        'http://',
      ])('%s', (url) => {
        expect(isAllowedRequestUrl(url, MOBILE_BASE, isolated)).toBe(false)
      })
    })

    describe('allowed', () => {
      it.each([
        'https://raw.githubusercontent.com/standardnotes/plugins/main/packages.json',
        'https://raw.githubusercontent.com/standardnotes/app/main/packages/web/dist/CHANGELOG.md.json',
        'https://standardnotes.github.io/plugins/cdn/dist/entries/wtf.laux.theme.monokai-ristretto.json',
        'https://example.com/image.png',
        'https://notes.mydomain.com/v1/items/sync',
        'https://my-server.tail1234.ts.net/',
        'https://notstandardnotes.com/',
        'https://standardnotes.com.example.net/',
        'http://10.0.1.2:3000/v1/login',
        'file:///android_asset/Web.bundle/src/index.html',
      ])('%s', (url) => {
        expect(isAllowedRequestUrl(url, MOBILE_BASE, isolated)).toBe(true)
      })
    })
  })

  it('isStandardNotesHost matches the domains and their subdomains only', () => {
    expect(isStandardNotesHost('standardnotes.com')).toBe(true)
    expect(isStandardNotesHost('api.standardnotes.org')).toBe(true)
    expect(isStandardNotesHost('listed.to.')).toBe(true)
    expect(isStandardNotesHost('notstandardnotes.com')).toBe(false)
    expect(isStandardNotesHost('standardnotes.github.io')).toBe(false)
  })

  it('isNetworkIsolationOn is on unless explicitly set to false', () => {
    expect(isNetworkIsolationOn({})).toBe(true)
    expect(isNetworkIsolationOn({ snOfflineNetworkIsolation: true })).toBe(true)
    expect(isNetworkIsolationOn({ snOfflineNetworkIsolation: 'false' })).toBe(true)
    expect(isNetworkIsolationOn({ snOfflineNetworkIsolation: 0 })).toBe(true)
    expect(isNetworkIsolationOn(undefined)).toBe(true)
    expect(isNetworkIsolationOn({ snOfflineNetworkIsolation: false })).toBe(false)
  })
})
