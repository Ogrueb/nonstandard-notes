import { ApplicationEvent, ContentType, ItemInterface, PayloadEmitSource, isDeletedItem } from '@standardnotes/snjs'

/**
 * Offline build (mobile): keeps a copy of the offline activation outside the workspace, so that
 * clearing the workspace (or signing in and discarding local data) does not lose premium
 * features. The only way to lose the copy is for the user to remove the offline key.
 *
 * - When a first-party offline activation is present (code entered, synced in or imported), its
 *   code is saved to the device store (the mobile keychain, outside workspace storage).
 * - When the workspace has no activation but the device store does, the activation is restored by
 *   entering the stored code again (FeaturesService.setOfflineFeaturesCode: no network request).
 *   Signed in to a server, this waits for the first full sync, so a server copy is not duplicated.
 * - When the user removes the offline key (removeActivation, or a deletion synced in from another
 *   device), the stored copy is cleared too. Local mass deletions (for example "sign in and discard
 *   local data") are not removals by the user and leave the copy in place.
 */

export const OFFLINE_FEATURES_URL = 'https://api.standardnotes.com/v1/offline/features'

export interface OfflineActivationStore {
  get(): Promise<string | undefined>
  set(code: string): Promise<boolean>
  clear(): Promise<boolean>
}

/** The parts of an ExtensionRepo item this module reads */
export interface OfflineRepoLike {
  content_type: string
  migratedToOfflineEntitlements?: boolean
  offlineFeaturesUrl?: string
  offlineKey?: string
}

type ItemsChange = {
  changed: unknown[]
  inserted: unknown[]
  removed: unknown[]
  source: PayloadEmitSource
}

export type OfflineActivationBackupDependencies = {
  getRepos: () => OfflineRepoLike[]
  addRepoObserver: (callback: (change: ItemsChange) => void) => () => void
  setOfflineFeaturesCode: (code: string) => Promise<unknown>
  deleteOfflineFeatureRepo: () => Promise<void>
  isSignedIn: () => boolean
  store: OfflineActivationStore
  log?: (message: string) => void
}

export function isFirstPartyOfflineUrl(url: string | undefined): boolean {
  if (!url) {
    return false
  }
  try {
    return url === OFFLINE_FEATURES_URL || new URL(url).hostname === 'localhost'
  } catch {
    return false
  }
}

/** Any offline activation item (what FeaturesService.deleteOfflineFeatureRepo removes) */
function isOfflineRepo(item: unknown): item is OfflineRepoLike {
  const repo = item as OfflineRepoLike
  return !!repo && repo.content_type === ContentType.TYPES.ExtensionRepo && repo.migratedToOfflineEntitlements === true
}

function isFirstPartyOfflineRepo(item: unknown): item is OfflineRepoLike {
  const repo = item as OfflineRepoLike
  return (
    !!repo &&
    repo.content_type === ContentType.TYPES.ExtensionRepo &&
    repo.migratedToOfflineEntitlements === true &&
    isFirstPartyOfflineUrl(repo.offlineFeaturesUrl)
  )
}

/** Rebuilds an activation code (base64 JSON, as parsed by FeaturesService) from a repo item */
export function codeFromRepo(repo: OfflineRepoLike): string | undefined {
  if (!isFirstPartyOfflineRepo(repo)) {
    return undefined
  }
  try {
    return btoa(JSON.stringify({ featuresUrl: repo.offlineFeaturesUrl, extensionKey: repo.offlineKey ?? '' }))
  } catch {
    return undefined
  }
}

export class OfflineActivationBackup {
  private lastSavedCode: string | undefined = undefined
  private isReconciling = false
  private isRemoving = false
  private disposeObserver: (() => void) | undefined

  constructor(private deps: OfflineActivationBackupDependencies) {
    this.disposeObserver = deps.addRepoObserver((change) => void this.onReposChanged(change))
  }

  deinit(): void {
    this.disposeObserver?.()
    this.disposeObserver = undefined
  }

  async handleApplicationEvent(event: ApplicationEvent): Promise<void> {
    if (event === ApplicationEvent.LocalDataLoaded) {
      /** Signed in: wait for the first full sync, which may bring the activation from the server */
      if (!this.deps.isSignedIn()) {
        await this.reconcile()
      }
    } else if (event === ApplicationEvent.CompletedFullSync) {
      await this.reconcile()
    }
  }

  /** Removes the offline key from the workspace and the stored copy from the device */
  async removeActivation(): Promise<void> {
    this.isRemoving = true
    try {
      await this.clearStore()
      /**
       * deleteOfflineFeatureRepo removes one activation item; a restored copy plus an imported
       * backup can leave two, so remove until none is left (bounded).
       */
      for (let attempt = 0; attempt < 10 && this.deps.getRepos().some(isOfflineRepo); attempt++) {
        await this.deps.deleteOfflineFeatureRepo()
      }
    } finally {
      this.isRemoving = false
    }
  }

  private currentRepo(): OfflineRepoLike | undefined {
    return this.deps.getRepos().find(isFirstPartyOfflineRepo)
  }

  private async onReposChanged({ changed, inserted, removed, source }: ItemsChange): Promise<void> {
    if (this.isRemoving) {
      return
    }

    const present = [...changed, ...inserted].find(isFirstPartyOfflineRepo)
    if (present) {
      await this.saveFromRepo(present)
      return
    }

    /** The key was removed on another device: treat it like a removal here */
    const remotelyDeleted =
      source === PayloadEmitSource.RemoteRetrieved &&
      removed.some((item) => !!(item as ItemInterface)?.payload && isDeletedItem(item as ItemInterface))
    if (remotelyDeleted && !this.currentRepo()) {
      await this.clearStore()
      this.deps.log?.('[offline-activation] removed on another device; device copy cleared')
    }
  }

  private async reconcile(): Promise<void> {
    if (this.isReconciling || this.isRemoving) {
      return
    }
    this.isReconciling = true
    try {
      const repo = this.currentRepo()
      if (repo) {
        await this.saveFromRepo(repo)
        return
      }

      const stored = await this.deps.store.get()
      if (!stored) {
        return
      }

      this.lastSavedCode = stored
      const result = await this.deps.setOfflineFeaturesCode(stored)
      if (result && typeof result === 'object' && 'text' in result) {
        this.deps.log?.(`[offline-activation] restore failed: ${(result as { text: string }).text}`)
        return
      }
      this.deps.log?.('[offline-activation] restored from device copy')
    } catch (error) {
      this.deps.log?.(`[offline-activation] reconcile failed: ${(error as Error).message}`)
    } finally {
      this.isReconciling = false
    }
  }

  private async saveFromRepo(repo: OfflineRepoLike): Promise<void> {
    const code = codeFromRepo(repo)
    if (!code || code === this.lastSavedCode) {
      return
    }
    const saved = await this.deps.store.set(code)
    if (saved) {
      this.lastSavedCode = code
    }
  }

  private async clearStore(): Promise<void> {
    this.lastSavedCode = undefined
    await this.deps.store.clear()
  }
}
