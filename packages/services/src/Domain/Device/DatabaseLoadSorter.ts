import { ContentType } from '@standardnotes/domain-core'

import { DatabaseItemMetadata } from './DatabaseItemMetadata'
import { DatabaseLoadOptions } from './DatabaseLoadOptions'

/**
 * Offline build: recency key used to load newer items first.
 * updated_at is the server timestamp and stays at epoch 0 for items that have never
 * been synced (local-only accounts, or notes created offline), which made the newest
 * notes load last. created_at is set by the client when the item is created, so the
 * later of the two ranks both synced and never-synced items by recency.
 */
function recencyOf(payload: DatabaseItemMetadata): number {
  const updated = new Date(payload.updated_at).getTime() || 0
  const created = payload.created_at ? new Date(payload.created_at).getTime() || 0 : 0
  return Math.max(updated, created)
}

/**
 * Sorts payloads according by most recently modified first, according to the priority,
 * whereby the earlier a content_type appears in the priorityList,
 * the earlier it will appear in the resulting sorted array.
 */
function SortPayloadsByRecentAndContentPriority<T extends DatabaseItemMetadata = DatabaseItemMetadata>(
  payloads: T[],
  contentTypePriorityList: string[],
): T[] {
  return payloads.sort((a, b) => {
    const dateResult = recencyOf(b) - recencyOf(a)

    let aPriority = 0
    let bPriority = 0

    aPriority = contentTypePriorityList.indexOf(a.content_type)
    bPriority = contentTypePriorityList.indexOf(b.content_type)

    if (aPriority === -1) {
      aPriority = contentTypePriorityList.length
    }

    if (bPriority === -1) {
      bPriority = contentTypePriorityList.length
    }

    if (aPriority === bPriority) {
      return dateResult
    }

    if (aPriority < bPriority) {
      return -1
    } else {
      return 1
    }
  })
}

/**
 * Sorts payloads according by most recently modified first, according to the priority,
 * whereby the earlier a uuid appears in the priorityList,
 * the earlier it will appear in the resulting sorted array.
 */
function SortPayloadsByRecentAndUuidPriority<T extends DatabaseItemMetadata = DatabaseItemMetadata>(
  payloads: T[],
  uuidPriorityList: string[],
): T[] {
  return payloads.sort((a, b) => {
    const dateResult = recencyOf(b) - recencyOf(a)

    let aPriority = 0
    let bPriority = 0

    aPriority = uuidPriorityList.indexOf(a.uuid)
    bPriority = uuidPriorityList.indexOf(b.uuid)

    if (aPriority === -1) {
      aPriority = uuidPriorityList.length
    }

    if (bPriority === -1) {
      bPriority = uuidPriorityList.length
    }

    if (aPriority === bPriority) {
      return dateResult
    }

    if (aPriority < bPriority) {
      return -1
    } else {
      return 1
    }
  })
}

export function GetSortedPayloadsByPriority<T extends DatabaseItemMetadata = DatabaseItemMetadata>(
  payloads: T[],
  options: DatabaseLoadOptions,
): {
  itemsKeyPayloads: T[]
  keySystemRootKeyPayloads: T[]
  keySystemItemsKeyPayloads: T[]
  contentTypePriorityPayloads: T[]
  remainingPayloads: T[]
} {
  const itemsKeyPayloads: T[] = []
  const keySystemRootKeyPayloads: T[] = []
  const keySystemItemsKeyPayloads: T[] = []
  const contentTypePriorityPayloads: T[] = []
  const remainingPayloads: T[] = []

  for (let index = 0; index < payloads.length; index++) {
    const payload = payloads[index]

    if (payload.content_type === ContentType.TYPES.KeySystemRootKey) {
      keySystemRootKeyPayloads.push(payload)
    } else if (payload.content_type === ContentType.TYPES.KeySystemItemsKey) {
      keySystemItemsKeyPayloads.push(payload)
    } else if (payload.content_type === ContentType.TYPES.ItemsKey) {
      itemsKeyPayloads.push(payload)
    } else if (options.contentTypePriority.includes(payload.content_type)) {
      contentTypePriorityPayloads.push(payload)
    } else {
      remainingPayloads.push(payload)
    }
  }

  return {
    itemsKeyPayloads,
    keySystemRootKeyPayloads,
    keySystemItemsKeyPayloads,
    contentTypePriorityPayloads: SortPayloadsByRecentAndContentPriority(
      contentTypePriorityPayloads,
      options.contentTypePriority,
    ),
    remainingPayloads: SortPayloadsByRecentAndUuidPriority(remainingPayloads, options.uuidPriority),
  }
}
