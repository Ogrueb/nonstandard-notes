import {
  CreateDecryptedItemFromPayload,
  CreateDecryptedMutatorForItem,
  DecryptedItemInterface,
  DecryptedItemMutator,
  DecryptedPayload,
  FillItemContent,
  ItemContent,
  MutationType,
  PayloadTimestampDefaults,
  SNNote,
} from '@standardnotes/models'
import {
  FeatureStatus,
  FeaturesClientInterface,
  GenerateUuid,
  ItemManagerInterface,
  MutatorClientInterface,
} from '@standardnotes/services'
import { FilesClientInterface, SuperConverterServiceInterface } from '@standardnotes/files'
import { Importer } from './Importer'
import { PlaintextConverter } from './PlaintextConverter/PlaintextConverter'

// Importer loads EvernoteConverter, whose dayjs.extend() throws under ts-jest
// (same mock as EvernoteConverter.spec.ts).
jest.mock('dayjs', () => {
  return {
    __esModule: true,
    default: {
      extend: jest.fn(),
    },
  }
})

describe('Importer', () => {
  let importer: Importer
  let changeItem: jest.Mock

  /** Applies a mutation the way MutatorService does, including its user-timestamp handling. */
  const applyMutation = (
    item: DecryptedItemInterface,
    mutationType: MutationType,
    mutate?: (mutator: DecryptedItemMutator) => void,
  ) => {
    const mutator = CreateDecryptedMutatorForItem(item, mutationType)
    mutate?.(mutator)
    return CreateDecryptedItemFromPayload(mutator.getResult())
  }

  beforeEach(() => {
    const features = {
      getFeatureStatus: jest.fn().mockReturnValue(FeatureStatus.NotInCurrentPlan),
    } as unknown as FeaturesClientInterface

    const items = {
      createTemplateItem: jest.fn((contentType: string, content: ItemContent, override: object) =>
        CreateDecryptedItemFromPayload(
          new DecryptedPayload({
            uuid: 'note-uuid',
            content_type: contentType,
            content: FillItemContent(content),
            ...PayloadTimestampDefaults(),
            ...override,
          }),
        ),
      ),
    } as unknown as ItemManagerInterface

    changeItem = jest.fn(
      async (item: DecryptedItemInterface, mutate: (mutator: DecryptedItemMutator) => void, type: MutationType) =>
        applyMutation(item, type, mutate),
    )

    const mutator = {
      // MutatorService.insertItem stamps userModifiedDate with the current time.
      insertItem: jest.fn(async (item: DecryptedItemInterface) =>
        applyMutation(item, MutationType.UpdateUserTimestamps),
      ),
      changeItem,
    } as unknown as MutatorClientInterface

    importer = new Importer(
      features,
      mutator,
      items,
      {} as SuperConverterServiceInterface,
      { uploadNewFile: jest.fn() },
      { linkItems: jest.fn() },
      {} as GenerateUuid,
      {} as FilesClientInterface,
    )
  })

  const insert = (createdAt: Date, updatedAt: Date) =>
    importer.insertNote({
      createdAt,
      updatedAt,
      title: 'Imported',
      text: 'text',
      useSuperIfPossible: false,
    })

  it('keeps the source modified date instead of the import time', async () => {
    const date = new Date('2019-03-01T08:00:00.000Z')

    const note = await insert(date, date)

    expect(note.userModifiedDate).toEqual(date)
    expect(note.created_at).toEqual(date)
  })

  it('uses the source modified date when it differs from the creation date', async () => {
    const created = new Date('2018-01-01T00:00:00.000Z')
    const modified = new Date('2020-06-15T12:30:00.000Z')

    const note = await insert(created, modified)

    expect(note.userModifiedDate).toEqual(modified)
    expect(note.created_at).toEqual(created)
  })

  it('does not stamp the date again, and leaves the note marked for saving', async () => {
    const date = new Date('2019-03-01T08:00:00.000Z')

    const note = await insert(date, date)

    expect(changeItem).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(Function),
      MutationType.NoUpdateUserTimestamps,
    )
    expect(note.payload.dirty).toBe(true)
  })

  it('gives a plaintext import the file date as its modified date', async () => {
    const lastModified = new Date('2017-05-04T03:02:01.000Z')
    const file = new File(['Plain text'], 'Old note.txt', { type: 'text/plain', lastModified: lastModified.getTime() })

    const result = await new PlaintextConverter().convert(file, {
      insertNote: importer.insertNote,
      convertMarkdownToSuper: (markdown: string) => markdown,
      readFileAsText: (file: File) => file.text(),
    } as unknown as Parameters<PlaintextConverter['convert']>[1])

    const note = result.successful[0] as SNNote
    expect(note.title).toBe('Old note')
    expect(note.userModifiedDate).toEqual(lastModified)
  })
})
