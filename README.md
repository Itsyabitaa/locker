# Locker (Sprint 1) — Chrome Extension

## What you get
- A **fullscreen lock overlay** injected into **every page**.
- Blocks clicks/scroll/shortcuts under the overlay.
- **Hardcoded auto-lock on every page load** (refresh brings it back).

Default password (Sprint 1): `1234`

## Folder structure
- `manifest.json`
- `src/content.js`

## Load it in Chrome
1. Open Chrome → go to `chrome://extensions`
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**
4. Select this folder: `d:\localserver\Apache24\htdocs\web\HOBBIE PROJECTS\desktop apps\locker`

## Test cases
- Open any website → lock screen should appear.
- Try clicking/scrolling the page → should not interact with the page.
- Refresh → lock should appear again.

## Notes / Known risks (Sprint 1)
- Users can still bypass by disabling/uninstalling the extension or removing DOM via DevTools.
