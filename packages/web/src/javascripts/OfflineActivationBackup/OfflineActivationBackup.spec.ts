import { ApplicationEvent, ContentType, PayloadEmitSource } from '@standardnotes/snjs'
import {
  OFFLINE_FEATURES_URL,
  OfflineActivationBackup,
  OfflineActivationBackupDependencies,
  OfflineRepoLike,
  codeFromRepo,
} from './OfflineActivationBackup'

const repo = (overrides: Partial<OfflineRepoLike> = {}): OfflineRepoLike => ({
  content_type: ContentType.TYPES.ExtensionRepo,
  migratedToOfflineEntitlements: true,
  offlineFeaturesUrl: OFFLINE_FEATURES_URL,
  offlineKey: 'key-123',
  ...overrides,
})

const deletedItem = {
  content_type: ContentType.TYPES.ExtensionRepo,
  uuid: 'x',
  payload: { uuid: 'x', content_type: ContentType.TYPES.ExtensionRepo, deleted: true, content: undefined },
}

type Change = Parameters<Parameters<OfflineActivationBackupDependencies['addRepoObserver']>[0]>[0]

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function setup(options: { repos?: OfflineRepoLike[]; stored?: string; signedIn?: boolean } = {}) {
  let repos = options.repos ?? []
  let stored = options.stored
  let observer: ((change: Change) => void) | undefined

  const deps = {
    getRepos: jest.fn(() => repos),
    addRepoObserver: jest.fn((callback: (change: Change) => void) => {
      observer = callback
      return () => (observer = undefined)
    }),
    setOfflineFeaturesCode: jest.fn(async (_code: string) => {
      repos = [repo()]
      return undefined
    }),
    deleteOfflineFeatureRepo: jest.fn(async () => {
      repos = repos.slice(1)
      observer?.({ changed: [], inserted: [], removed: [deletedItem], source: PayloadEmitSource.LocalChanged })
    }),
    isSignedIn: jest.fn(() => options.signedIn ?? false),
    store: {
      get: jest.fn(async () => stored),
      set: jest.fn(async (code: string) => {
        stored = code
        return true
      }),
      clear: jest.fn(async () => {
        stored = undefined
        return true
      }),
    },
  }

  const backup = new OfflineActivationBackup(deps)
  const emit = (change: Change) => observer?.(change)
  const setRepos = (value: OfflineRepoLike[]) => (repos = value)

  return { backup, deps, emit, setRepos, getStored: () => stored }
}

describe('OfflineActivationBackup', () => {
  it('builds a code that decodes to the repo URL and key', () => {
    const code = codeFromRepo(repo()) as string
    expect(JSON.parse(atob(code))).toEqual({ featuresUrl: OFFLINE_FEATURES_URL, extensionKey: 'key-123' })
    expect(codeFromRepo(repo({ offlineFeaturesUrl: 'https://example.com/features' }))).toBeUndefined()
    expect(codeFromRepo(repo({ migratedToOfflineEntitlements: false }))).toBeUndefined()
  })

  it('saves a copy when the workspace has an activation at load', async () => {
    const { backup, getStored } = setup({ repos: [repo()] })
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)
    expect(getStored()).toBe(codeFromRepo(repo()))
  })

  it('saves a copy when an activation is entered, synced in or imported', async () => {
    const { emit, getStored } = setup()
    emit({ changed: [], inserted: [repo()], removed: [], source: PayloadEmitSource.FileImport })
    await flush()
    expect(getStored()).toBe(codeFromRepo(repo()))
  })

  it('restores the activation into a cleared workspace without entering the code', async () => {
    const stored = codeFromRepo(repo()) as string
    const { backup, deps } = setup({ stored })
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)
    expect(deps.setOfflineFeaturesCode).toHaveBeenCalledWith(stored)
  })

  it('does nothing when there is neither an activation nor a copy', async () => {
    const { backup, deps } = setup()
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)
    expect(deps.setOfflineFeaturesCode).not.toHaveBeenCalled()
    expect(deps.store.set).not.toHaveBeenCalled()
  })

  it('when signed in, waits for the first full sync before restoring', async () => {
    const stored = codeFromRepo(repo()) as string
    const { backup, deps } = setup({ stored, signedIn: true })
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)
    expect(deps.setOfflineFeaturesCode).not.toHaveBeenCalled()
    await backup.handleApplicationEvent(ApplicationEvent.CompletedFullSync)
    expect(deps.setOfflineFeaturesCode).toHaveBeenCalledWith(stored)
  })

  it('does not restore when the sync brought the activation from the server', async () => {
    const stored = codeFromRepo(repo()) as string
    const { backup, deps, setRepos } = setup({ stored, signedIn: true })
    setRepos([repo()])
    await backup.handleApplicationEvent(ApplicationEvent.CompletedFullSync)
    expect(deps.setOfflineFeaturesCode).not.toHaveBeenCalled()
  })

  it('removing the offline key clears the device copy and deletes the repo', async () => {
    const { backup, deps, getStored } = setup({ repos: [repo()] })
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)
    expect(getStored()).toBeDefined()

    await backup.removeActivation()
    await flush()

    expect(deps.deleteOfflineFeatureRepo).toHaveBeenCalled()
    expect(getStored()).toBeUndefined()

    /** A later launch or sync must not bring it back */
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)
    await backup.handleApplicationEvent(ApplicationEvent.CompletedFullSync)
    expect(deps.setOfflineFeaturesCode).not.toHaveBeenCalled()
  })

  it('a removal synced in from another device clears the device copy', async () => {
    const { backup, emit, setRepos, getStored } = setup({ repos: [repo()] })
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)

    setRepos([])
    emit({ changed: [], inserted: [], removed: [deletedItem], source: PayloadEmitSource.RemoteRetrieved })
    await flush()

    expect(getStored()).toBeUndefined()
  })

  it('local mass deletion (clear or sign in and discard local data) keeps the device copy', async () => {
    const { backup, emit, setRepos, getStored } = setup({ repos: [repo()] })
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)

    setRepos([])
    emit({ changed: [], inserted: [], removed: [deletedItem], source: PayloadEmitSource.LocalChanged })
    await flush()

    expect(getStored()).toBe(codeFromRepo(repo()))
  })

  it('a synced deletion of some other repo keeps the copy while an activation remains', async () => {
    const { backup, emit, getStored } = setup({ repos: [repo()] })
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)

    emit({ changed: [], inserted: [], removed: [deletedItem], source: PayloadEmitSource.RemoteRetrieved })
    await flush()

    expect(getStored()).toBe(codeFromRepo(repo()))
  })

  it('removing the offline key removes every activation item (restored copy plus imported backup)', async () => {
    const { backup, deps, getStored } = setup({ repos: [repo(), repo()] })
    await backup.handleApplicationEvent(ApplicationEvent.LocalDataLoaded)

    await backup.removeActivation()

    expect(deps.deleteOfflineFeatureRepo).toHaveBeenCalledTimes(2)
    expect(deps.getRepos()).toEqual([])
    expect(getStored()).toBeUndefined()
  })
})
