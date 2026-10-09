import { ContentType } from '@standardnotes/domain-core'
import { FullyFormedPayloadInterface } from '@standardnotes/models'
import { GetSortedPayloadsByPriority } from './DatabaseLoadSorter'

describe('GetSortedPayloadsByPriority', () => {
  let payloads: FullyFormedPayloadInterface[] = []
  const contentTypePriority = [ContentType.TYPES.ItemsKey, ContentType.TYPES.UserPrefs, ContentType.TYPES.Component, ContentType.TYPES.Theme]
  let launchPriorityUuids: string[] = []

  it('should sort payloads based on content type priority', () => {
    payloads = [
      {
        content_type: ContentType.TYPES.Theme,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.UserPrefs,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Component,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.ItemsKey,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Note,
      } as FullyFormedPayloadInterface,
    ]

    const { itemsKeyPayloads, contentTypePriorityPayloads, remainingPayloads } = GetSortedPayloadsByPriority(payloads, {
      contentTypePriority,
      uuidPriority: launchPriorityUuids,
      batchSize: 1000,
    })

    expect(itemsKeyPayloads.length).toBe(1)
    expect(itemsKeyPayloads[0].content_type).toBe(ContentType.TYPES.ItemsKey)

    expect(contentTypePriorityPayloads.length).toBe(3)
    expect(contentTypePriorityPayloads[0].content_type).toBe(ContentType.TYPES.UserPrefs)
    expect(contentTypePriorityPayloads[1].content_type).toBe(ContentType.TYPES.Component)
    expect(contentTypePriorityPayloads[2].content_type).toBe(ContentType.TYPES.Theme)

    expect(remainingPayloads.length).toBe(1)
    expect(remainingPayloads[0].content_type).toBe(ContentType.TYPES.Note)
  })

  it('should sort payloads based on launch priority uuids', () => {
    const unprioritizedNoteUuid = 'unprioritized-note'
    const unprioritizedTagUuid = 'unprioritized-tag'

    const prioritizedNoteUuid = 'prioritized-note'
    const prioritizedTagUuid = 'prioritized-tag'

    payloads = [
      {
        content_type: ContentType.TYPES.Theme,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.UserPrefs,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Component,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.ItemsKey,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Note,
        uuid: unprioritizedNoteUuid,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Tag,
        uuid: unprioritizedTagUuid,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Note,
        uuid: prioritizedNoteUuid,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Tag,
        uuid: prioritizedTagUuid,
      } as FullyFormedPayloadInterface,
    ]

    launchPriorityUuids = [prioritizedNoteUuid, prioritizedTagUuid]

    const { itemsKeyPayloads, contentTypePriorityPayloads, remainingPayloads } = GetSortedPayloadsByPriority(payloads, {
      contentTypePriority,
      uuidPriority: launchPriorityUuids,
      batchSize: 1000,
    })

    expect(itemsKeyPayloads.length).toBe(1)
    expect(itemsKeyPayloads[0].content_type).toBe(ContentType.TYPES.ItemsKey)

    expect(contentTypePriorityPayloads.length).toBe(3)
    expect(contentTypePriorityPayloads[0].content_type).toBe(ContentType.TYPES.UserPrefs)
    expect(contentTypePriorityPayloads[1].content_type).toBe(ContentType.TYPES.Component)
    expect(contentTypePriorityPayloads[2].content_type).toBe(ContentType.TYPES.Theme)

    expect(remainingPayloads.length).toBe(4)
    expect(remainingPayloads[0].uuid).toBe(prioritizedNoteUuid)
    expect(remainingPayloads[1].uuid).toBe(prioritizedTagUuid)
    expect(remainingPayloads[2].uuid).toBe(unprioritizedNoteUuid)
    expect(remainingPayloads[3].uuid).toBe(unprioritizedTagUuid)
  })

  it('should sort payloads based on server updated date if same content type', () => {
    const unprioritizedNoteUuid = 'unprioritized-note'
    const unprioritizedTagUuid = 'unprioritized-tag'

    const prioritizedNoteUuid = 'prioritized-note'
    const prioritizedTagUuid = 'prioritized-tag'

    payloads = [
      {
        content_type: ContentType.TYPES.Note,
        uuid: unprioritizedNoteUuid,
        updated_at: new Date(1),
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Tag,
        uuid: unprioritizedTagUuid,
        updated_at: new Date(2),
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Note,
        uuid: prioritizedNoteUuid,
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Tag,
        uuid: prioritizedTagUuid,
      } as FullyFormedPayloadInterface,
    ]

    launchPriorityUuids = [prioritizedNoteUuid, prioritizedTagUuid]

    const { remainingPayloads } = GetSortedPayloadsByPriority(payloads, {
      contentTypePriority,
      uuidPriority: launchPriorityUuids,
      batchSize: 1000,
    })

    expect(remainingPayloads.length).toBe(4)
    expect(remainingPayloads[0].uuid).toBe(prioritizedNoteUuid)
    expect(remainingPayloads[1].uuid).toBe(prioritizedTagUuid)
    expect(remainingPayloads[2].uuid).toBe(unprioritizedTagUuid)
    expect(remainingPayloads[3].uuid).toBe(unprioritizedNoteUuid)
  })

  it('should load never-synced items (updated_at of 0) by created_at, newest first', () => {
    payloads = [
      {
        content_type: ContentType.TYPES.Note,
        uuid: 'synced-old',
        updated_at: new Date(1000),
        created_at: new Date(500),
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Note,
        uuid: 'local-new',
        updated_at: new Date(0),
        created_at: new Date(3000),
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Note,
        uuid: 'synced-new',
        updated_at: new Date(2000),
        created_at: new Date(100),
      } as FullyFormedPayloadInterface,
      {
        content_type: ContentType.TYPES.Note,
        uuid: 'local-old',
        updated_at: new Date(0),
        created_at: new Date(200),
      } as FullyFormedPayloadInterface,
    ]

    const { remainingPayloads } = GetSortedPayloadsByPriority(payloads, {
      contentTypePriority,
      uuidPriority: [],
      batchSize: 1000,
    })

    expect(remainingPayloads.map((p) => p.uuid)).toEqual(['local-new', 'synced-new', 'synced-old', 'local-old'])
  })
})
