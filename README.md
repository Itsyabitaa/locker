# Locker — Chrome extension

Manifest V3 extension that shows a fullscreen PIN lock overlay on web pages. It is useful for reducing casual access to the browser; it is **not** OS-level security and can be bypassed (see [Limitations](#limitations)).

## Features

- **PIN unlock** — PIN is hashed with **SHA-256** and stored in `chrome.storage.local` (not plaintext).
- **Settings page** — `options/options.html` (opens in a tab): set or change PIN, auto-lock, inactivity timeout, lock scope.
- **Toolbar popup** — Quick panel: locking status, **Lock** (quick-lock all tabs), **Unlock** (opens Settings), and **Open full settings**.
- **Lock scope**
  - **Lock all websites** — overlay on matching pages when locking is enabled.
  - **Domain list** — when global lock is off, only listed domains match (normalized hostnames, suffix-safe matching so `youtube.com.evil.com` does not match `youtube.com`).
- **Master switch** — **Locking enabled** in settings. Turning it **off** when a PIN exists requires **entering the PIN** in a confirmation dialog.
- **Unlock + reload** — After you enter the **correct PIN**, this **tab** remembers that unlock for that **site** (same origin) via `sessionStorage`, so a normal **page reload (F5)** does **not** ask for the PIN again. A **new tab** still starts locked. The lock returns after **auto-lock** (inactivity), **quick lock** (shortcut), **PIN change**, or **locking** toggled in storage.
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
| **Extension icon → popup** | Status, quick lock, shortcuts to Settings |
| **Extension details → Extension options** | Same settings page |
| **Settings** | PIN, locking on/off, global vs list, domains, auto-lock and minutes |

Settings persist in **`chrome.storage.local`** (survives browser restart; clearing **site data** for extensions is separate from normal cache clearing).

## Project layout (separation of concerns)

- **UI** — `popup/`, `options/`, `content/overlay/`, `components/` (shared modal / buttons; PIN modal template).
- **Logic** — `content/engine/` (lock rules), `shared/hash.js` (crypto helpers).
- **State** — `shared/storage.js` (and `chrome.storage` in options/popup where appropriate).
- **Control** — `background/background.js`, `content/content.js` (orchestration).

```
locker/
├── manifest.json
├── background/
│   └── background.js
├── shared/
│   ├── constants.js
│   ├── storage.js
│   ├── utils.js
│   └── hash.js
├── components/
│   ├── components.css
│   ├── modal.js
│   ├── button.js
│   ├── input.js
│   ├── toggle.js
│   ├── pinModal.html
│   └── pinModal.js
├── content/
│   ├── content.js
│   ├── engine/
│   │   └── lockEngine.js
│   ├── session/
│   │   └── sessionManager.js
│   └── overlay/
│       ├── overlay.html
│       ├── overlay.css
│       └── overlay.js
├── options/
│   ├── options.html
│   ├── options.css
│   ├── options.js          # wires section modules
│   └── sections/
│       ├── generalSettings.js
│       ├── siteManager.js
│       ├── securitySettings.js
│       └── autoLockSettings.js
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
