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

## Project structure

Locker is organized by **separation of concerns**: UI surfaces, pure logic, shared state, and control/orchestration.

| Layer | Folders / files | Responsibility |
|--------|------------------|----------------|
| **UI** | `popup/`, `options/`, `components/`, `content/overlay/` | HTML, CSS, DOM events (overlay does not decide policy; it mounts UI and delegates). |
| **Logic** | `content/engine/lockEngine.js`, `shared/hash.js` | Domain/lock decisions; SHA-256 + timing-safe compare (engine has no DOM/`chrome`). |
| **State** | `shared/constants.js`, `shared/storage.js`, `shared/utils.js` | Keys, limits, storage helpers, PIN/site validation. |
| **Control** | `background/background.js`, `content/content.js` | Shortcuts, storage broadcast, tab orchestration, overlay lifecycle, auto-lock. |

### Directory tree

```
locker/
├── manifest.json                 # MV3: background, action popup, options, content_scripts
│
├── background/
│   └── background.js             # Quick-lock command; storage.onChanged → CHECK_LOCK broadcast
│
├── shared/
│   ├── constants.js              # STORAGE_KEYS, LockerEvents, SESSION_UNLOCK_KEY, limits
│   ├── storage.js                # LockerStorage.getSettings / setSettings
│   ├── utils.js                  # LockerUtils: validatePinPair, sitesFromTextarea
│   └── hash.js                   # lockerSha256Hex, lockerTimingSafeEqualHex, LockerHash
│
├── components/                   # Reusable UI (options; fetch-based PIN modal)
│   ├── components.css            # Shared button/input/modal styles
│   ├── modal.js                  # LockerModal: escape handler, remove
│   ├── button.js                 # LockerButton: primary/secondary classes
│   ├── input.js                  # LockerInput: password read/clear
│   ├── toggle.js                 # LockerToggle: checkbox onChange helper
│   ├── pinModal.html             # PIN modal markup (fetched by pinModal.js)
│   └── pinModal.js               # LockerPinModal.open({ onVerify, … })
│
├── content/
│   ├── content.js                # Orchestrator: storage, engine, session, overlay, guards, auto-lock
│   ├── engine/
│   │   └── lockEngine.js         # lockerNormalizeHostname, lockerShouldLock, lockerNormalizeLockedSitesList
│   ├── session/
│   │   └── sessionManager.js     # LockerSession: tab sessionStorage unlock flags
│   └── overlay/
│       ├── overlay.html          # Lock screen markup (fetched by overlay.js)
│       ├── overlay.css           # Injected via manifest content_scripts.css
│       └── overlay.js            # LockerOverlay.mount / unmount
│
├── options/
│   ├── options.html              # Settings dashboard (loads shared + components + sections)
│   ├── options.css               # Page layout and cards
│   ├── options.js                # Boot: LockerStorage.getSettings, init section modules
│   └── sections/
│       ├── generalSettings.js    # Locking enabled, global lock, PIN modal to disable locking
│       ├── siteManager.js        # Domain list save
│       ├── securitySettings.js   # Set/change PIN
│       └── autoLockSettings.js   # Auto-lock toggle and inactivity minutes
│
└── popup/
    ├── popup.html                # Status, Lock (quick lock), Unlock → settings, open full settings
    ├── popup.css
    └── popup.js                  # locked flag, quickLockAt; storage listener for status
```

### Manifest entry points

| Entry | Path |
|--------|------|
| Service worker | `background/background.js` (`importScripts("../shared/constants.js")`) |
| Toolbar popup | `popup/popup.html` |
| Options page | `options/options.html` |

**Content scripts** (order matters; no bundler):

1. `shared/constants.js`
2. `shared/utils.js`
3. `shared/storage.js`
4. `shared/hash.js`
5. `content/engine/lockEngine.js`
6. `content/session/sessionManager.js`
7. `content/overlay/overlay.js`
8. `content/content.js`

**Content CSS:** `content/overlay/overlay.css`

**Options page scripts** (see `options/options.html`): `shared/*` → `components/*` (`modal`, `button`, `input`, `toggle`, `pinModal`) → `options/sections/*.js` → `options.js`.

**Popup scripts:** `shared/constants.js` → `popup.js`.

## Limitations

- **Disabling or removing the extension** from `chrome://extensions` is controlled by Chrome, not by Locker. PIN gating applies to **Locker’s own settings** (e.g. turning off locking), not to Chrome’s extension toggle.
- **Restricted URLs** (e.g. `chrome://`, Chrome Web Store) do not run normal extension content scripts, so the overlay does not appear there.
- **Incognito** — Enable **Allow in incognito** for Locker on the extensions page if you need it there.
- **Determined users** can use DevTools, other profiles, or other devices; treat this as a **deterrent**, not a vault.

## Version

See `manifest.json` for the current version string.
