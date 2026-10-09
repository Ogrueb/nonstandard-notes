import Icon from '@/Components/Icon/Icon'
import { ChangeEventHandler, FunctionComponent, useState } from 'react'
import { c, msgid } from 'ttag'

type Props = {
  checked: boolean
  onChange: ChangeEventHandler<HTMLInputElement>
  disabled?: boolean
  notesAndTagsCount: number
}

const MergeLocalDataCheckbox: FunctionComponent<Props> = ({ checked, onChange, disabled, notesAndTagsCount }) => {
  /** Offline build: warning shown inline on tap (the tooltip only opened on hover or long-press) */
  const [showInfo, setShowInfo] = useState(false)

  return (
    <>
      <label htmlFor="should-merge-local" className="fit-content mb-2 flex items-center text-sm">
        <input
          className="mr-2 accent-danger"
          type="checkbox"
          name="should-merge-local"
          id="should-merge-local"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <span className="text-danger">
          {c('B1.Account.SignIn.Option').ngettext(
            msgid`Merge local data (${notesAndTagsCount} item)`,
            `Merge local data (${notesAndTagsCount} items)`,
            notesAndTagsCount,
          )}
        </span>
        <button
          type="button"
          className="ml-1 rounded-full p-0.5 hover:bg-contrast"
          aria-expanded={showInfo}
          title={c('B1.Account.SignIn.Action').t`Learn more`}
          onClick={(event) => {
            /* Inside the label: do not toggle the checkbox */
            event.preventDefault()
            setShowInfo((current) => !current)
          }}
        >
          <Icon type="info" className="text-danger" size="small" />
        </button>
      </label>
      {showInfo && (
        <div className="-mt-1 mb-2 text-xs text-danger">
          {c('B1.Account.SignIn.Info')
            .t`If unchecked, your local notes and tags will be permanently deleted and replaced with data from your account.`}
        </div>
      )}
    </>
  )
}

export default MergeLocalDataCheckbox
