import { RawKeychainValue } from '@standardnotes/snjs'
import * as RCTKeychain from 'react-native-keychain'

const OFFLINE_ACTIVATION_SERVICE = 'org.standardnotes.offline-activation'

export default class Keychain {
  static async setKeys(keys: object) {
    const iOSOptions = {
      accessible: RCTKeychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }
    return RCTKeychain.setGenericPassword('sn', JSON.stringify(keys), iOSOptions)
  }

  static async getKeys(): Promise<RawKeychainValue | undefined | null> {
    return RCTKeychain.getGenericPassword()
      .then(function (credentials) {
        if (!credentials || !credentials.password) {
          return null
        } else {
          /**
           * Android 14 returns the bel character (/u0007) for some reason appended several times at the end of the string.
           * This value is oddly not present when the keys are stringified in setKeys above.
           */
          // eslint-disable-next-line no-control-regex
          const cleanedString = credentials.password.replace(/\x07/g, '')

          const keys = JSON.parse(cleanedString)

          return keys
        }
      })
      .catch(function (error) {
        console.error("Keychain couldn't be accessed! Maybe no value set?", error)
        return undefined
      })
  }

  static async clearKeys() {
    return RCTKeychain.resetGenericPassword()
  }

  /**
   * Offline build: device copy of the offline activation code, under its own keychain service so
   * that clearKeys() (used when clearing the workspace) does not remove it. Encrypted with the
   * Android Keystore / iOS Keychain, so an Android auto-backup of app data cannot recover it.
   */
  static async setOfflineActivation(code: string): Promise<boolean> {
    const result = await RCTKeychain.setGenericPassword('offline-activation', code, {
      service: OFFLINE_ACTIVATION_SERVICE,
      accessible: RCTKeychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    })
    return result !== false
  }

  static async getOfflineActivation(): Promise<string | undefined> {
    const credentials = await RCTKeychain.getGenericPassword({ service: OFFLINE_ACTIVATION_SERVICE })
    if (!credentials || !credentials.password) {
      return undefined
    }
    /** See getKeys: Android 14 can append bel characters */
    // eslint-disable-next-line no-control-regex
    return credentials.password.replace(/\x07/g, '')
  }

  static async clearOfflineActivation(): Promise<boolean> {
    return RCTKeychain.resetGenericPassword({ service: OFFLINE_ACTIVATION_SERVICE })
  }
}
