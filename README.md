# Locker — Chrome extension

Manifest V3 extension that shows a fullscreen PIN lock overlay on web pages. It is useful for reducing casual access to the browser; it is **not** OS-level security and can be bypassed (see [Limitations](#limitations)).

## Features

- **PIN unlock** — PIN is hashed with **SHA-256** and stored in `chrome.storage.local` (not plaintext).
- **Settings page** — `options/options.html` (opens in a tab): set or change PIN, auto-lock, inactivity timeout, lock scope.
- **Toolbar popup** — Quick entry point; **Open settings** opens the full options page.
- **Lock scope**
  - **Lock all websites** — overlay on matching pages when locking is enabled.
  - **Domain list** — when global lock is off, only listed domains match (normalized hostnames, suffix-safe matching so `youtube.com.evil.com` does not match `youtube.com`).
- **Master switch** — **Locking enabled** in settings. Turning it **off** when a PIN exists requires **entering the PIN** in a confirmation dialog.
- **Auto-lock** — Optional inactivity timer (mouse, keyboard, scroll, touch). After a successful unlock, the timer restarts; when it fires, the overlay returns.
- **Quick lock** — Command **Ctrl+Shift+L** (macOS: **Command+Shift+L**); may need to be set under `chrome://extensions/shortcuts`.
- **Security hardening (best-effort)** — Context menu blocked on the lock screen; common shortcuts (e.g. Escape, refresh, close tab, devtools) are intercepted where the page allows; wrong PIN **5** times triggers a **60s** lockout; overlay is re-injected if the DOM node is removed while the page should stay locked.

## Install (load unpacked)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Choose this project folder (`locker`)

After code changes: on the extensions page, click **Reload** on Locker, then reload any tab where you test.

## Configuration

| Where | What |
|--------|------|
| **Extension icon → popup** | Open full settings |
| **Extension details → Extension options** | Same settings page |
| **Settings** | PIN, locking on/off, global vs list, domains, auto-lock and minutes |

Settings persist in **`chrome.storage.local`** (survives browser restart; clearing **site data** for extensions is separate from normal cache clearing).

## Project layout

```
locker/
├── manifest.json
├── src/
│   ├── background.js      # Storage broadcast, quick-lock command
│   ├── content.js         # Overlay, PIN check, auto-lock, hardening
│   ├── lockEngine.js      # Domain normalize + shouldLock helpers
│   ├── sha256.js          # Web Crypto SHA-256 + timing-safe compare
│   └── settings-common.js # Shared validation (options)
├── options/
│   ├── options.html
│   ├── options.css
│   └── options.js
└── popup/
    ├── popup.html
    ├── popup.css
    └── popup.js
```

## Limitations

- **Disabling or removing the extension** from `chrome://extensions` is controlled by Chrome, not by Locker. PIN gating applies to **Locker’s own settings** (e.g. turning off locking), not to Chrome’s extension toggle.
- **Restricted URLs** (e.g. `chrome://`, Chrome Web Store) do not run normal extension content scripts, so the overlay does not appear there.
- **Incognito** — Enable **Allow in incognito** for Locker on the extensions page if you need it there.
- **Determined users** can use DevTools, other profiles, or other devices; treat this as a **deterrent**, not a vault.

## Version

See `manifest.json` for the current version string.
