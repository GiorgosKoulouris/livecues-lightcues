; Included by electron-builder (nsis.include in electron-builder.yml).
; Installs to ...\LiveCues\LightCues instead of ...\LightCues: per user in
; %LOCALAPPDATA%\Programs, for all users in Program Files. A folder chosen on
; the folder page gets LiveCues\LightCues added. See ADR 0016.
; APP_FILENAME is electron-builder's own define, from productName, which cannot
; hold a backslash. Recheck this after an electron-builder upgrade.
!undef APP_FILENAME
!define APP_FILENAME "LiveCues\LightCues"
