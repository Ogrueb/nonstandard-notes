# Nonstandard Notes

An offline-first Android build of [Standard Notes](https://github.com/standardnotes/app).

**This is an unofficial fork. It is not affiliated with, endorsed by or supported by Standard Notes.** Please do not report problems with this fork to Standard Notes. Use this repository's [issues](https://github.com/Ogrueb/nonstandard-notes/issues) instead. Standard Notes' own README is available in the [upstream repository](https://github.com/standardnotes/app).

## What it does

The stock app checks the license with Standard Notes' servers and loads paid features only after the whole local database has loaded. On an offline phone, Super notes stay read-only for a while after every launch. This fork:

- unlocks Super notes at launch from the cached offline entitlement;
- loads the newest notes first, including notes that have never been synced;
- keeps the modified date of imported notes from their source instead of the date of the import;
- makes the back button navigate inside the app again on Android 16 and later (a fix from Standard Notes 3.202.8, backported);
- applies an offline license without contacting Standard Notes;
- keeps plugin themes on the device after they are downloaded once, and stores them in the theme's plugin entry, so backups and sync carry them to other devices without a new download;
- by default lets the app reach only the local network (for example a self-hosted sync server on your LAN). It never contacts Standard Notes' own servers.

It is based on **Standard Notes 3.202.7** (commit `51b198b9e`, the same commit F-Droid builds), Android only.

## Patches

Each patch is one commit on top of `51b198b9e`, on the `nonstandard` branch (this repository's default), in this order. A final commit adds this README. The `main` branch is Standard Notes' own, left unchanged.

This branch is rebased when a patch is added or corrected, or when the base version moves, so its history can be rewritten. If `git pull` fails after such a change, clone the repository again.

| | Commit | Kind | Summary |
|---|---|---|---|
| A | unlock Super at launch | functional | Loads the offline entitlement first and re-checks open editors when it arrives. |
| T | store plugin theme stylesheets | functional | A plugin theme's stylesheet is downloaded once from its author's host and stored on the device and in the theme's plugin entry. After that it loads without network access, and backups and sync carry it. |
| C | load newest notes first | functional | Sorts the local load by the later of server and creation time, so never-synced notes no longer load last. |
| I | keep imported notes' modified dates | functional | Imported notes keep the modified date read from their source (for plain-text files, the file's date) instead of the time of the import, so sorting by date modified shows them in their real order. |
| B | back button on Android 16 | functional | On Android 16 and later, the back button and gesture always sent the app to the background. Backport of Standard Notes' own fix (3.202.8, `067080a`), so back navigates inside the app again. |
| K | security-key sign-in notice | baseline | Explains that security-key sign-in is unavailable (see Limitations). |
| G | remove in-app purchases, Play Services FIDO2 and asset links | baseline | Removes Google/store components that have no function in this build, as F-Droid does. |
| N | name, label, icons and application ID | baseline | "Nonstandard Notes" name, launcher icons and their generator (`branding/`), and the fork's own application ID, so it installs next to the official app. |
| D | offline activation without Standard Notes' servers | isolation | Applies the offline license from bundled roles, with no request. Keeps a device copy so clearing the workspace does not lose it. |
| E | network isolation, with the UI it needs | isolation | Allowlist in JavaScript and in the WebView. A Network Isolation switch. UI that depends on Standard Notes or on the internet is hidden or explained. |

The commits form two useful cut points:

- **After N:** every functional fix plus the baseline patches. The app still uses the internet and Standard Notes' servers as stock does.
- **After E (the tip):** the full offline build.

## Limitations

- **Security-key sign-in does not work on Android.** Hardware keys and passkeys (FIDO2/U2F) cannot be used. The native path needs Google Play Services with the relying party `app.standardnotes.com`, which accepts only Standard Notes' own signed app. The web prompt is a page on `app.standardnotes.com`, which this build blocks. Accounts that sign in from this build should not register a security key. If you want two-factor, authenticator-app (TOTP) two-factor works. Patch K shows a notice pointing to recovery-code sign-in instead of a prompt that never completes. **That notice is untested on a device**, because testing it needs an account with a registered key.
- **The sync server must use HTTPS.** Cleartext stays blocked. The phone must trust the server's certificate: either bundle your own CA in the app (`res/raw/` plus `<trust-anchors>` in `network_security_config.xml`, then rebuild), or use a publicly trusted certificate on a local name.
- **Server addresses while Network Isolation is on:** only private IP addresses or names ending in `.local`, `.lan`, `.home.arpa`, `.internal` or `.localhost`. Public-style names (your own domain, `*.ts.net`) are blocked even if they resolve to a LAN address. Always enter the full `https://address:port`.
- **Standard Notes' services are unavailable in both modes.** `standardnotes.com`, `standardnotes.org`, `listed.to` and their subdomains are always blocked: Standard Notes' sync server, subscription, Listed and the hosted web app.
- **The offline license is not validated.** The activation code must have the official format and features URL, but nothing checks its key, and roles do not follow plan changes. See "Offline license" below.
- **With Network Isolation on**, the following are blocked:
  - remote images in notes and link previews;
  - What's New and the online plugin list;
  - installing plugins from an address.

  A plugin theme needs isolation off once, to download its stylesheet. A device that receives the theme from a backup or by sync needs no download.
- **Plugin themes are not updated automatically.** The stored copy is kept until the theme is uninstalled. Reinstall a theme to get a fresh copy. Clearing the workspace deletes the device's copies; restoring a backup brings them back.
- **Third-party editor plugins are not stored.** Editors installed as plugins from an address still load from their authors' hosts each time, as in the stock app. They do not work offline, and a backup restores only their plugin entries, not their files. An editor consists of several files served to its own frame, which the single-file theme storage does not cover. The editors that come with the app (Super, Plain Text, and bundled ones such as Authenticator and Sheets) are not affected. See "Possible enhancements".
- **Android only.** The shared web code is changed too, but desktop and web builds are neither covered nor tested.

## Requirements

- A **Standard Notes offline-license activation code** (Preferences → General → Offline activation). It is still needed for its format and features URL.
- For themes from the plugin list: network access once per theme (isolation off) on one of your devices. Stylesheets are fetched from their authors' hosts by your device; after that they travel in your backups and through your own sync server. None are redistributed in this repository.
- Optional: a self-hosted [Standard Notes server](https://github.com/standardnotes/server) on your network, behind HTTPS (see Limitations).

## Possible enhancements

Not planned, but in scope for the project's offline-first aim:

- **Store editor plugins too.** The storage format in the plugin entry already holds a map of files, so it can carry a whole editor package. Serving those files to the editor's frame would need native Android code (unpacking and answering the frame's requests from local storage).
- **Install a theme from a file.** Pick a stylesheet on the phone in Preferences → Plugins and store it like a downloaded one, for a device that has never had internet access and has no backup containing the theme.

## Offline license

Standard Notes sells offline licenses for use with self-hosted servers. Stock clients still download the license's roles from `api.standardnotes.com`, and only the role names are kept. The client has no expiry check for them. This fork applies the same roles from a bundled list instead, so a device with an activation never contacts Standard Notes. The source is open, so anyone able to build the app could make the same change. This fork does not change what the license entitles you to, and you still need a code. Use it only with a license you hold.

## Building

Releases are **source only**. This repository publishes no APKs: a ready-made build would unlock paid features for anyone with a code in the right format, since the key is never checked. Build it yourself and sign it with your own key.

Tested toolchain (WSL2 Ubuntu, matching F-Droid's recipe for 3.202.7): Node 22.14.0 (`.nvmrc`), Yarn 3.2.1 (corepack), OpenJDK 17, Android SDK platform 36, build-tools 36.0.0, NDK 27.1.12297006.

```bash
git clone --branch nonstandard https://github.com/Ogrueb/nonstandard-notes.git && cd nonstandard-notes
yarn install --immutable
yarn build:web
cd packages/mobile && yarn bundle:web
cd android
./gradlew assembleDevRelease -PversionName=3.202.7 -PversionCode=1
```

- **Signing:** put your keystore at `packages/mobile/android/app/keystore.keystore` (`*.keystore` is git-ignored) and set `ANDROID_KEYSTORE_ALIAS`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD` in the environment before running Gradle.
- **Flavors:** `dev` (`io.github.ogrueb.nonstandardnotes.dev`, label "NSN Dev", WebView debugging on) installs next to `prod` (`io.github.ogrueb.nonstandardnotes`, "Nonstandard Notes"). Neither replaces a store install of Standard Notes.
- `versionName`/`versionCode` come from Gradle properties (`1` above is an example). Raise `versionCode` for each new build you install over an earlier one; Android refuses to install a lower code over a higher one.
- Do not run `yarn build` in `packages/mobile`: it includes an iOS step.
- The icons are generated by `branding/build_icons.py` (see `branding/README.md`).

## License

This is a modified version of Standard Notes, licensed under the **GNU Affero General Public License v3.0** (see `LICENSE`), like the original. The modifications were made by Ogrueb between September and October 2026. Each change is a separate commit after `51b198b9e` on the `nonstandard` branch. Under the AGPL, anyone who distributes a build of this fork, or runs it as a network service, must offer its source.

Development was assisted by Claude (Anthropic). Commits show this with a `Co-Authored-By` line.

Plugin themes and other third-party plugins keep their authors' licenses. This repository includes none of their files. The copies that the app stores in your plugin entries are private copies in your own backups and sync data.
