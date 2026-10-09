import { installOfflineAllowlist } from './InstallOfflineAllowlist'

describe('installOfflineAllowlist', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('rejects a blocked fetch immediately and passes allowed ones through', async () => {
    const originalFetch = jest.fn().mockResolvedValue('ok')
    const target = { fetch: originalFetch } as unknown as typeof globalThis
    installOfflineAllowlist(target)

    await expect(target.fetch('https://api.standardnotes.com/v1/offline/features')).rejects.toBeInstanceOf(TypeError)
    expect(originalFetch).not.toHaveBeenCalled()

    await expect(target.fetch('http://10.0.1.2:3000/v1/login')).resolves.toBe('ok')
    expect(originalFetch).toHaveBeenCalledTimes(1)
  })

  it('reports a blocked XHR as a network error (readyState 4, status 0) without sending', async () => {
    const xhr = new XMLHttpRequest()
    const events: string[] = []
    xhr.onreadystatechange = () => events.push(`readystatechange:${xhr.readyState}:${xhr.status}`)
    xhr.addEventListener('error', () => events.push('error'))
    xhr.addEventListener('loadend', () => events.push('loadend'))

    xhr.open('GET', 'https://raw.githubusercontent.com/standardnotes/plugins/main/packages.json', true)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.send()

    await new Promise((resolve) => setTimeout(resolve, 10))

    /** readystatechange 1 comes from open(), as in a browser */
    expect(events).toEqual(['readystatechange:1:0', 'readystatechange:4:0', 'error', 'loadend'])
    expect(xhr.getAllResponseHeaders()).toBe('')
    expect(xhr.responseText).toBe('')
  })

  it('refuses to open a WebSocket to a blocked host', () => {
    expect(() => new WebSocket('wss://sockets.standardnotes.com')).toThrow('[offline-allowlist] blocked')
  })

  describe('with network isolation off', () => {
    const flagHost = globalThis as unknown as Record<string, unknown>

    beforeEach(() => {
      flagHost.snOfflineNetworkIsolation = false
    })

    afterEach(() => {
      delete flagHost.snOfflineNetworkIsolation
    })

    it('allows internet hosts but still blocks Standard Notes', async () => {
      const originalFetch = jest.fn().mockResolvedValue('ok')
      const target = { fetch: originalFetch } as unknown as typeof globalThis
      installOfflineAllowlist(target)

      await expect(
        target.fetch('https://raw.githubusercontent.com/standardnotes/plugins/main/packages.json'),
      ).resolves.toBe('ok')
      await expect(target.fetch('https://api.standardnotes.com/v2/subscriptions')).rejects.toBeInstanceOf(TypeError)
      expect(originalFetch).toHaveBeenCalledTimes(1)
    })

    it('reads the flag on every request, so a late flag takes effect', async () => {
      delete flagHost.snOfflineNetworkIsolation
      const originalFetch = jest.fn().mockResolvedValue('ok')
      const target = { fetch: originalFetch } as unknown as typeof globalThis
      installOfflineAllowlist(target)

      await expect(target.fetch('https://example.com/a.png')).rejects.toBeInstanceOf(TypeError)

      flagHost.snOfflineNetworkIsolation = false
      await expect(target.fetch('https://example.com/a.png')).resolves.toBe('ok')
    })
  })
})
