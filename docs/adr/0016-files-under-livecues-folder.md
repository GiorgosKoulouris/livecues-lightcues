# Files go under a LiveCues folder

LightCues keeps its user data in `%APPDATA%\LiveCues\LightCues` and installs to `%LOCALAPPDATA%\Programs\LiveCues\LightCues`, or `Program Files\LiveCues\LightCues` for all users. Other LiveCues apps can sit beside it in the same folders. The app name, app ID, Start menu shortcut and file names stay LightCues.

Main sets `userData` at startup, before anything reads it, unless `--user-data-dir` is passed. The installer gets the folder from `build/installer.nsh`, which redefines electron-builder's `APP_FILENAME`, as `productName` cannot hold a backslash.

## Considered Options

- Rename the product to `LiveCues LightCues`: no custom NSIS, but it changes the app name everywhere.
- Change only the data folder: simpler, but the install folder would not match.

## Consequences

- Nothing moves data from `%APPDATA%\LightCues`. There were no users to migrate.
- `build/installer.nsh` depends on an electron-builder internal. An upgrade of electron-builder must recheck it.
- If `deleteAppDataOnUninstall` is turned on, the uninstaller removes `%APPDATA%\LiveCues\LightCues`, as it uses `APP_FILENAME`.
