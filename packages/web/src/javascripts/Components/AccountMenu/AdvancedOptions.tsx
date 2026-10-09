import { observer } from 'mobx-react-lite'
import { FunctionComponent, ReactNode, useCallback, useEffect, useState } from 'react'
import Checkbox from '@/Components/Checkbox/Checkbox'
import DecoratedInput from '@/Components/Input/DecoratedInput'
import Icon from '@/Components/Icon/Icon'
import { useApplication } from '../ApplicationProvider'
import ServerPicker from './ServerPicker/ServerPicker'
import { c } from 'ttag'

type Props = {
  disabled?: boolean
  onPrivateUsernameModeChange?: (isPrivate: boolean, identifier?: string) => void
  onStrictSignInChange?: (isStrictSignIn: boolean) => void
  onRecoveryCodesChange?: (isRecoveryCodes: boolean, recoveryCodes?: string) => void
  children?: ReactNode
}

const AdvancedOptions: FunctionComponent<Props> = ({
  disabled = false,
  onPrivateUsernameModeChange,
  onStrictSignInChange,
  onRecoveryCodesChange,
  children,
}) => {
  const application = useApplication()

  /** Offline build: open by default, since a sync server must be entered (no default server) */
  const [showAdvanced, setShowAdvanced] = useState(true)

  const [isPrivateUsername, setIsPrivateUsername] = useState(false)
  const [privateUsername, setPrivateUsername] = useState('')

  const [isRecoveryCodes, setIsRecoveryCodes] = useState(false)
  const [recoveryCodes, setRecoveryCodes] = useState('')

  const [isStrictSignin, setIsStrictSignin] = useState(false)

  /** Offline build: info text shown inline on tap (tooltips only open on hover or long-press) */
  const [openInfo, setOpenInfo] = useState<'private-username' | 'strict-signin' | undefined>()
  const toggleInfo = useCallback((info: 'private-username' | 'strict-signin') => {
    setOpenInfo((current) => (current === info ? undefined : info))
  }, [])

  useEffect(() => {
    void application.homeServer?.isHomeServerRunning().then((isRunning) => {
      if (isRunning) {
        setShowAdvanced(true)
      }
    })
  }, [application.homeServer])

  useEffect(() => {
    const recomputePrivateUsername = async () => {
      const identifier = await application.computePrivateUsername(privateUsername)

      if (!identifier) {
        if (privateUsername?.length > 0) {
          application.alerts
            .alert(c('B1.Account.SignIn.Error').t`Unable to compute private username.`)
            .catch(console.error)
        }
        return
      }
      onPrivateUsernameModeChange?.(true, identifier)
    }

    if (privateUsername) {
      recomputePrivateUsername().catch(console.error)
    }
  }, [privateUsername, application, onPrivateUsernameModeChange])

  useEffect(() => {
    onPrivateUsernameModeChange?.(isPrivateUsername)
  }, [isPrivateUsername, onPrivateUsernameModeChange])

  const handleIsPrivateUsernameChange = useCallback(() => {
    setIsPrivateUsername(!isPrivateUsername)
  }, [isPrivateUsername])

  const handlePrivateUsernameNameChange = useCallback((name: string) => {
    setPrivateUsername(name)
  }, [])

  const handleIsRecoveryCodesChange = useCallback(() => {
    const newValue = !isRecoveryCodes
    setIsRecoveryCodes(newValue)
    onRecoveryCodesChange?.(newValue)

    if (!isRecoveryCodes) {
      setIsPrivateUsername(false)
      setIsStrictSignin(false)
    }
  }, [isRecoveryCodes, setIsPrivateUsername, setIsStrictSignin, onRecoveryCodesChange])

  const handleRecoveryCodesChange = useCallback(
    (recoveryCodes: string) => {
      setRecoveryCodes(recoveryCodes)
      if (recoveryCodes) {
        onRecoveryCodesChange?.(true, recoveryCodes)
      }
    },
    [onRecoveryCodesChange],
  )

  const handleStrictSigninChange = useCallback(() => {
    const newValue = !isStrictSignin
    setIsStrictSignin(newValue)
    onStrictSignInChange?.(newValue)
  }, [isStrictSignin, onStrictSignInChange])

  const toggleShowAdvanced = useCallback(() => {
    setShowAdvanced(!showAdvanced)
  }, [showAdvanced])

  return (
    <>
      <button
        className="flex w-full cursor-pointer items-center border-0 bg-transparent px-3 py-1.5 text-left text-sm font-bold text-text hover:bg-contrast hover:text-foreground focus:bg-info-backdrop focus:shadow-none"
        onClick={toggleShowAdvanced}
      >
        <div className="flex items-center">
          {c('B1.Account.SignIn.Action').t`Advanced options`}
          <Icon type="chevron-down" className="ml-1 text-passive-1" />
        </div>
      </button>
      {showAdvanced ? (
        <>
          <div className="my-2 px-3">
            {children}

            <div className="mb-1 flex items-center justify-between">
              <Checkbox
                name="private-workspace"
                label={c('B1.Account.SignIn.Option').t`Private username mode`}
                checked={isPrivateUsername}
                disabled={disabled || isRecoveryCodes}
                onChange={handleIsPrivateUsernameChange}
              />
              {/* Offline build: local explanation instead of a standardnotes.com help link */}
              <button
                type="button"
                className="ml-1 rounded-full p-0.5 hover:bg-contrast"
                aria-expanded={openInfo === 'private-username'}
                title={c('B1.Account.SignIn.Action').t`Learn more`}
                onClick={() => toggleInfo('private-username')}
              >
                <Icon type="info" className="text-neutral" />
              </button>
            </div>
            {openInfo === 'private-username' && (
              <div className="mb-2 text-xs text-passive-0">{c('B1.Account.SignIn.Info')
                .t`Login with a hashed username instead of email.`}</div>
            )}

            {isPrivateUsername && (
              <>
                <DecoratedInput
                  className={{ container: 'mb-2' }}
                  left={[<Icon type="account-circle" className="text-neutral" />]}
                  type="text"
                  placeholder={c('B1.Account.SignIn.Label').t`Username`}
                  value={privateUsername}
                  onChange={handlePrivateUsernameNameChange}
                  disabled={disabled || isRecoveryCodes}
                  spellcheck={false}
                  autocomplete={false}
                />
              </>
            )}

            {onStrictSignInChange && (
              <>
                <div className="mb-1 flex items-center justify-between">
                  <Checkbox
                    name="use-strict-signin"
                    label={c('B1.Account.SignIn.Option').t`Use strict sign-in`}
                    checked={isStrictSignin}
                    disabled={disabled || isRecoveryCodes}
                    onChange={handleStrictSigninChange}
                  />
                  {/* Offline build: local explanation instead of a standardnotes.com help link */}
                  <button
                    type="button"
                    className="ml-1 rounded-full p-0.5 hover:bg-contrast"
                    aria-expanded={openInfo === 'strict-signin'}
                    title={c('B1.Account.SignIn.Action').t`Learn more`}
                    onClick={() => toggleInfo('strict-signin')}
                  >
                    <Icon type="info" className="text-neutral" />
                  </button>
                </div>
                {openInfo === 'strict-signin' && (
                  <div className="mb-2 text-xs text-passive-0">{c('B1.Account.SignIn.Info')
                    .t`Requires server to have current encryption version.`}</div>
                )}
              </>
            )}

            {onRecoveryCodesChange && (
              <div className="mb-1 flex items-center justify-between">
                <Checkbox
                  name="recovery-codes"
                  label={c('B1.Account.SignIn.Option').t`Use recovery code`}
                  checked={isRecoveryCodes}
                  disabled={disabled}
                  onChange={handleIsRecoveryCodesChange}
                />
              </div>
            )}

            {isRecoveryCodes && (
              <>
                <DecoratedInput
                  className={{ container: 'mb-2' }}
                  left={[<Icon type="security" className="text-neutral" />]}
                  type="text"
                  placeholder={c('B1.Account.SignIn.Label').t`Recovery code`}
                  value={recoveryCodes}
                  onChange={handleRecoveryCodesChange}
                  disabled={disabled}
                  spellcheck={false}
                  autocomplete={false}
                />
              </>
            )}
          </div>
          <ServerPicker />
        </>
      ) : null}
    </>
  )
}

export default observer(AdvancedOptions)
