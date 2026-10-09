import { PreferencesService } from '../Preferences/PreferencesService'
import {
  GenericItem,
  Environment,
  Platform,
  ComponentItem,
  ComponentContent,
  DecryptedPayload,
  PayloadTimestampDefaults,
  PayloadEmitSource,
  UIFeature,
  ComponentInterface,
  DeletedItemInterface,
  MutationType,
  DecryptedItemMutator,
} from '@standardnotes/models'
import { ContentType } from '@standardnotes/domain-core'
import {
  ComponentArea,
  ComponentFeatureDescription,
  FindNativeTheme,
  NativeFeatureIdentifier,
} from '@standardnotes/features'
import {
  InternalEventBusInterface,
  AlertService,
  DeviceInterface,
  MutatorClientInterface,
  ItemManagerInterface,
  SyncServiceInterface,
  PreferenceServiceInterface,
  ApplicationEvent,
  ApplicationStage,
  LocalPrefKey,
  FeatureStatus,
} from '@standardnotes/services'
import { ItemManager } from '@Lib/Services/Items/ItemManager'
import { FeaturesService } from '@Lib/Services/Features/FeaturesService'
import { ComponentManager } from './ComponentManager'
import { SyncService } from '../Sync/SyncService'
import { LoggerInterface } from '@standardnotes/utils'
import { THEME_CSS_CACHE_STORAGE_KEY } from './ThirdPartyThemeCache'
import {
  contentWithOfflinePackage,
  createSingleFileOfflinePackage,
  OfflinePackage,
  offlinePackageMainText,
  readOfflinePackage,
} from './OfflinePackage'

const THEME_UUID = '4f8c2a1e-7b3d-4c6a-9e2f-1a2b3c4d5e6f'
const HOSTED_CSS = 'https://themes.example.org/monokai/dist/dist.css'

const themeComponent = (
  uuid = THEME_UUID,
  version = '1.1.3',
  hosted_url = HOSTED_CSS,
  offlinePackage?: OfflinePackage,
) => {
  const content = {
    hosted_url,
    area: ComponentArea.Themes,
    package_info: {
      identifier: 'org.example.theme-monokai',
      version,
      availableInRoles: [],
    },
  } as unknown as ComponentContent
  return new ComponentItem(
    new DecryptedPayload({
      uuid,
      content_type: ContentType.TYPES.Theme,
      ...PayloadTimestampDefaults(),
      content: offlinePackage ? contentWithOfflinePackage(content, offlinePackage) : content,
    }),
  )
}

const DOWNLOADED_CSS = 'body { color: #f9cc6c; }'

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('featuresService', () => {
  let items: ItemManagerInterface
  let mutator: MutatorClientInterface
  let features: FeaturesService
  let alerts: AlertService
  let sync: SyncServiceInterface
  let prefs: PreferenceServiceInterface
  let eventBus: InternalEventBusInterface
  let device: DeviceInterface
  let logger: LoggerInterface

  const createManager = (environment: Environment, platform: Platform) => {
    const manager = new ComponentManager(
      items,
      mutator,
      sync,
      features,
      prefs,
      alerts,
      environment,
      platform,
      device,
      logger,
      eventBus,
    )

    return manager
  }

  beforeEach(() => {
    global.window = {
      addEventListener: jest.fn(),
      attachEvent: jest.fn(),
    } as unknown as Window & typeof globalThis
    logger = {} as jest.Mocked<LoggerInterface>
    logger.info = jest.fn()

    sync = {} as jest.Mocked<SyncService>
    sync.sync = jest.fn()

    items = {} as jest.Mocked<ItemManager>
    items.getItems = jest.fn().mockReturnValue([])
    items.addObserver = jest.fn()

    mutator = {} as jest.Mocked<MutatorClientInterface>
    mutator.createItem = jest.fn()
    mutator.changeComponent = jest.fn().mockReturnValue({} as jest.Mocked<GenericItem>)
    mutator.setItemsToBeDeleted = jest.fn()
    mutator.changeItem = jest.fn()
    mutator.changeFeatureRepo = jest.fn()

    features = {} as jest.Mocked<FeaturesService>

    prefs = {} as jest.Mocked<PreferencesService>
    prefs.addEventObserver = jest.fn()

    alerts = {} as jest.Mocked<AlertService>
    alerts.confirm = jest.fn()
    alerts.alert = jest.fn()

    eventBus = {} as jest.Mocked<InternalEventBusInterface>
    eventBus.publish = jest.fn()

    device = {} as jest.Mocked<DeviceInterface>
  })

  it('should create manager', () => {
    const manager = createManager(Environment.Web, Platform.MacWeb)

    expect(manager).toBeDefined()
  })

  describe('third-party theme cache (offline build)', () => {
    let storage: Record<string, string>
    let localPrefs: Record<string, unknown>
    let observer: (data: {
      changed: ComponentInterface[]
      inserted: ComponentInterface[]
      removed: DeletedItemInterface[]
      source: PayloadEmitSource
    }) => void
    let fetchMock: jest.Mock

    const emit = (data: Partial<Parameters<typeof observer>[0]> & { source: PayloadEmitSource }) =>
      observer({ changed: [], inserted: [], removed: [], ...data })

    const startManager = async (environment = Environment.Mobile, platform = Platform.Android) => {
      const manager = createManager(environment, platform)
      await manager.handleEvent({
        type: ApplicationEvent.ApplicationStageChanged,
        payload: { stage: ApplicationStage.PreparingForLaunch_0 },
      })
      return manager
    }

    beforeEach(() => {
      ;(global.window as unknown as { location: unknown }).location = {
        href: 'file:///android_asset/Web.bundle/src/index.html',
        origin: 'file://',
      }

      storage = {}
      device = {
        getRawStorageValue: jest.fn((key: string) => Promise.resolve(storage[key])),
        setRawStorageValue: jest.fn((key: string, value: string) => {
          storage[key] = value
          return Promise.resolve()
        }),
      } as unknown as jest.Mocked<DeviceInterface>

      localPrefs = { [LocalPrefKey.ActiveThemes]: [] }
      prefs.getLocalValue = jest.fn((key: string, defaultValue: unknown) => localPrefs[key] ?? defaultValue)
      prefs.setLocalValue = jest.fn((key: string, value: unknown) => {
        localPrefs[key] = value
      })

      items.addObserver = jest.fn((_types, callback) => {
        observer = callback as unknown as typeof observer
        return () => undefined
      })

      fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve(DOWNLOADED_CSS),
      })
      items.findItem = jest.fn().mockReturnValue(undefined)
      global.fetch = fetchMock as unknown as typeof fetch
      jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('downloads an installed theme once and then serves it from the cache', async () => {
      const manager = await startManager()
      const theme = themeComponent()
      const feature = new UIFeature<ComponentFeatureDescription>(theme)

      expect(manager.urlForFeature(feature)).toBe(HOSTED_CSS)

      emit({ inserted: [theme], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0][0]).toBe(HOSTED_CSS)
      expect(manager.urlForFeature(feature)).toMatch(/^data:text\/css;charset=utf-8,/)
      expect(manager.urlsForActiveThemes()).toEqual([])

      emit({ changed: [theme], source: PayloadEmitSource.LocalChanged })
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('uses the stored copy after a restart, without network', async () => {
      await startManager()
      emit({ inserted: [themeComponent()], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()

      fetchMock.mockRejectedValue(new TypeError('[offline-allowlist] blocked'))
      const restarted = await startManager()
      localPrefs[LocalPrefKey.ActiveThemes] = [THEME_UUID]
      features.getFeatureStatus = jest.fn().mockReturnValue(FeatureStatus.Entitled)

      const theme = themeComponent()
      items.findItem = jest.fn().mockReturnValue(theme)
      expect(restarted.urlForFeature(new UIFeature<ComponentFeatureDescription>(theme))).toMatch(/^data:text\/css/)
      expect(restarted.urlsForActiveThemes()[0]).toMatch(/^data:text\/css/)
    })

    it('re-downloads when the theme version changes', async () => {
      await startManager()
      emit({ inserted: [themeComponent()], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()

      emit({ changed: [themeComponent(THEME_UUID, '1.2.0')], source: PayloadEmitSource.RemoteRetrieved })
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])[THEME_UUID].version).toBe('1.2.0')
    })

    it('uninstalling deletes the cached copy and deactivates the theme', async () => {
      const manager = await startManager()
      const theme = themeComponent()
      emit({ inserted: [theme], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()
      localPrefs[LocalPrefKey.ActiveThemes] = [THEME_UUID, 'other']

      emit({
        removed: [{ uuid: THEME_UUID, dirty: true } as DeletedItemInterface],
        source: PayloadEmitSource.LocalChanged,
      })
      await flushPromises()

      expect(localPrefs[LocalPrefKey.ActiveThemes]).toEqual(['other'])
      expect(JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])).toEqual({})
      expect(manager.urlForFeature(new UIFeature<ComponentFeatureDescription>(theme))).toBe(HOSTED_CSS)
    })

    it('a deletion synced from another device also removes the copy', async () => {
      await startManager()
      emit({ inserted: [themeComponent()], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()

      emit({
        removed: [{ uuid: THEME_UUID, dirty: false } as DeletedItemInterface],
        source: PayloadEmitSource.RemoteRetrieved,
      })
      await flushPromises()

      expect(JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])).toEqual({})
    })

    it('keeps the copy when items are only removed from memory (sign-out, discarding local data)', async () => {
      await startManager()
      emit({ inserted: [themeComponent()], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()
      localPrefs[LocalPrefKey.ActiveThemes] = [THEME_UUID]

      emit({
        removed: [{ uuid: THEME_UUID, dirty: false } as DeletedItemInterface],
        source: PayloadEmitSource.LocalChanged,
      })
      await flushPromises()

      expect(localPrefs[LocalPrefKey.ActiveThemes]).toEqual([THEME_UUID])
      expect(JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])[THEME_UUID]).toBeDefined()
    })

    /** The content the manager wrote into the theme item, by running the mutation it passed to changeItem. */
    const writtenContent = (call = 0): ComponentContent => {
      const [item, mutate, mutationType] = (mutator.changeItem as jest.Mock).mock.calls[call]
      expect(mutationType).toBe(MutationType.NoUpdateUserTimestamps)
      let written: ComponentContent | undefined
      mutate({
        getItem: () => item,
        setCustomContent: (content: ComponentContent) => {
          written = content
        },
      } as unknown as DecryptedItemMutator)
      return written as ComponentContent
    }

    it('stores the downloaded stylesheet in the theme item, so backups and sync carry it', async () => {
      await startManager()
      const theme = themeComponent()
      items.findItem = jest.fn().mockReturnValue(theme)

      emit({ inserted: [theme], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()

      expect(mutator.changeItem).toHaveBeenCalledTimes(1)
      const content = writtenContent()
      const stored = readOfflinePackage(content)
      expect(stored).toEqual(createSingleFileOfflinePackage(HOSTED_CSS, '1.1.3', DOWNLOADED_CSS))
      expect(stored?.main).toBe('dist.css')
      expect((content as unknown as { hosted_url: string }).hosted_url).toBe(HOSTED_CSS)
      expect(sync.sync).toHaveBeenCalled()
    })

    it('restores a copy that came with the theme item (backup import) without a download', async () => {
      const manager = await startManager()
      const theme = themeComponent(
        THEME_UUID,
        '1.1.3',
        HOSTED_CSS,
        createSingleFileOfflinePackage(HOSTED_CSS, '1.1.3', 'body { color: red; }'),
      )
      items.findItem = jest.fn().mockReturnValue(theme)

      emit({ inserted: [theme], source: PayloadEmitSource.FileImport })
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])[THEME_UUID].css).toBe('body { color: red; }')
      expect(manager.urlForFeature(new UIFeature<ComponentFeatureDescription>(theme))).toBe(
        'data:text/css;charset=utf-8,' + encodeURIComponent('body { color: red; }'),
      )
      /** The item already holds this copy: not written again. */
      expect(mutator.changeItem).not.toHaveBeenCalled()
    })

    it('an imported theme item without a copy is downloaded at once', async () => {
      await startManager()

      emit({ inserted: [themeComponent()], source: PayloadEmitSource.FileImport })
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('serves the copy in the theme item while the device has none', async () => {
      fetchMock.mockRejectedValue(new TypeError('[offline-allowlist] blocked'))
      const manager = await startManager()
      const theme = themeComponent(
        THEME_UUID,
        '1.1.3',
        HOSTED_CSS,
        createSingleFileOfflinePackage(HOSTED_CSS, '1.1.3', 'body { color: red; }'),
      )

      expect(manager.urlForFeature(new UIFeature<ComponentFeatureDescription>(theme))).toMatch(/^data:text\/css/)
    })

    it('writes a device copy made by an earlier build into the theme item', async () => {
      storage[THEME_CSS_CACHE_STORAGE_KEY] = JSON.stringify({
        [THEME_UUID]: {
          identifier: 'org.example.theme-monokai',
          sourceUrl: HOSTED_CSS,
          version: '1.1.3',
          css: 'body { color: blue; }',
          cachedAt: 1,
        },
      })
      await startManager()
      const theme = themeComponent()
      items.findItem = jest.fn().mockReturnValue(theme)

      emit({ inserted: [theme], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
      const stored = readOfflinePackage(writtenContent())
      expect(stored && offlinePackageMainText(stored)).toBe('body { color: blue; }')
    })

    it('a newer copy synced in with the theme item replaces the device copy, without a download', async () => {
      await startManager()
      emit({ inserted: [themeComponent()], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(1)

      const updated = themeComponent(
        THEME_UUID,
        '1.2.0',
        HOSTED_CSS,
        createSingleFileOfflinePackage(HOSTED_CSS, '1.2.0', 'body { color: green; }'),
      )
      items.findItem = jest.fn().mockReturnValue(updated)
      emit({ changed: [updated], source: PayloadEmitSource.RemoteRetrieved })
      await flushPromises()

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const entry = JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])[THEME_UUID]
      expect(entry.version).toBe('1.2.0')
      expect(entry.css).toBe('body { color: green; }')
    })

    it('an older copy in the theme item does not replace a current device copy', async () => {
      await startManager()
      emit({ inserted: [themeComponent()], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()

      const stale = themeComponent(
        THEME_UUID,
        '1.1.3',
        HOSTED_CSS,
        createSingleFileOfflinePackage(HOSTED_CSS, '1.0.0', 'body { color: gray; }'),
      )
      items.findItem = jest.fn().mockReturnValue(stale)
      emit({ changed: [stale], source: PayloadEmitSource.RemoteRetrieved })
      await flushPromises()

      expect(JSON.parse(storage[THEME_CSS_CACHE_STORAGE_KEY])[THEME_UUID].css).toBe(DOWNLOADED_CSS)
      const stored = readOfflinePackage(writtenContent())
      expect(stored?.version).toBe('1.1.3')
      expect(stored && offlinePackageMainText(stored)).toBe(DOWNLOADED_CSS)
    })

    it('selecting a theme retries a failed download and reports whether a copy is available', async () => {
      fetchMock.mockRejectedValue(new TypeError('[offline-allowlist] blocked'))
      const manager = await startManager()
      const theme = themeComponent()
      const feature = new UIFeature(theme) as unknown as Parameters<typeof manager.storeThemeForOfflineUse>[0]

      emit({ inserted: [theme], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await expect(manager.storeThemeForOfflineUse(feature)).resolves.toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)

      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => 'text/css' },
        text: () => Promise.resolve(DOWNLOADED_CSS),
      })
      await expect(manager.storeThemeForOfflineUse(feature)).resolves.toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('selecting a native theme needs no stored copy', async () => {
      const manager = await startManager()
      const midnight = new UIFeature(FindNativeTheme(NativeFeatureIdentifier.TYPES.MidnightTheme)!)

      await expect(manager.storeThemeForOfflineUse(midnight)).resolves.toBe(true)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('leaves native themes and non-theme components alone', async () => {
      const manager = await startManager()
      const midnight = new UIFeature<ComponentFeatureDescription>(
        FindNativeTheme(NativeFeatureIdentifier.TYPES.MidnightTheme)!,
      )
      const editor = new ComponentItem(
        new DecryptedPayload({
          uuid: 'editor-uuid',
          content_type: ContentType.TYPES.Component,
          ...PayloadTimestampDefaults(),
          content: {
            hosted_url: 'https://example.org/editor/index.html',
            area: ComponentArea.Editor,
            package_info: { identifier: 'org.example.editor', version: '1.0.0', availableInRoles: [] },
          } as unknown as ComponentContent,
        }),
      )

      emit({ inserted: [editor], source: PayloadEmitSource.LocalDatabaseLoaded })
      await flushPromises()

      expect(fetchMock).not.toHaveBeenCalled()
      expect(manager.urlForFeature(midnight)).toBe(
        'file:///android_asset/Web.bundle/src/web-src/components/assets/org.standardnotes.theme-midnight/index.css',
      )
    })
  })
})
