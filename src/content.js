(() => {
  const LOCK_ROOT_ID = "__locker_root__";
  const LOCK_STYLE_ID = "__locker_style__";
  const LOCKED_CLASS = "__locker_locked__";
  const STORAGE_KEY_PIN = "pinHash";
  const STORAGE_KEY_LOCKED = "locked";
  const STORAGE_KEY_GLOBAL_LOCK = "globalLock";
  const STORAGE_KEY_LOCKED_SITES = "lockedSites";
  const STORAGE_KEY_AUTO_LOCK = "autoLockEnabled";
  const STORAGE_KEY_INACTIVITY_MIN = "inactivityMinutes";
  const STORAGE_KEY_QUICK_LOCK = "quickLockAt";
  const DEFAULT_INACTIVITY_MIN = 2;
  const ACTIVITY_THROTTLE_MS = 500;

  let storedPinHash = null;
  /** Master switch from popup; false = never show overlay. */
  let masterLocked = true;
  /** When true, lock all sites (subject to masterLocked). When false, only lockedSites list. */
  let globalLock = true;
  let lockedSitesNormalized = [];
  /** Last computed: should this URL show the overlay. */
  let lastLockDecision = false;

  let isLocked = false;
  let guardsAdded = false;
  let keepAliveStarted = false;

  let autoLockEnabled = true;
  let inactivityMs = DEFAULT_INACTIVITY_MIN * 60 * 1000;
  let inactivityTimerId = null;
  let activityListenersBound = false;
  let lastActivityThrottleAt = 0;

  function ensureStyle() {
    if (document.getElementById(LOCK_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = LOCK_STYLE_ID;
    style.textContent = `
      html.${LOCKED_CLASS}, body.${LOCKED_CLASS} {
        overflow: hidden !important;
        height: 100% !important;
      }

      #${LOCK_ROOT_ID} {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 2147483647 !important;
        pointer-events: all !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(10, 10, 12, 0.92) !important;
        color: #fff !important;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif !important;
        touch-action: none !important;
      }

      #${LOCK_ROOT_ID} * {
        box-sizing: border-box !important;
      }

      #${LOCK_ROOT_ID} .panel {
        width: min(420px, calc(100vw - 48px)) !important;
        padding: 22px !important;
        border-radius: 14px !important;
        background: rgba(255, 255, 255, 0.08) !important;
        border: 1px solid rgba(255, 255, 255, 0.14) !important;
        backdrop-filter: blur(10px) !important;
        box-shadow: 0 14px 60px rgba(0, 0, 0, 0.5) !important;
      }

      #${LOCK_ROOT_ID} .title {
        font-size: 20px !important;
        font-weight: 700 !important;
        margin: 0 0 14px 0 !important;
        letter-spacing: 0.2px !important;
      }

      #${LOCK_ROOT_ID} .subtitle {
        font-size: 13px !important;
        opacity: 0.85 !important;
        margin: 0 0 16px 0 !important;
        line-height: 1.35 !important;
      }

      #${LOCK_ROOT_ID} .row {
        display: flex !important;
        gap: 10px !important;
      }

      #${LOCK_ROOT_ID} input[type="password"] {
        flex: 1 !important;
        height: 44px !important;
        padding: 10px 12px !important;
        border-radius: 10px !important;
        border: 1px solid rgba(255, 255, 255, 0.22) !important;
        background: rgba(0, 0, 0, 0.28) !important;
        color: #fff !important;
        outline: none !important;
        font-size: 14px !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
      }

      #${LOCK_ROOT_ID} input[type="password"]::placeholder {
        color: rgba(255, 255, 255, 0.65) !important;
      }

      #${LOCK_ROOT_ID} button {
        height: 44px !important;
        padding: 0 14px !important;
        border-radius: 10px !important;
        border: 1px solid rgba(255, 255, 255, 0.22) !important;
        background: rgba(255, 255, 255, 0.14) !important;
        color: #fff !important;
        font-weight: 650 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
      }

      #${LOCK_ROOT_ID} button:hover {
        background: rgba(255, 255, 255, 0.18) !important;
      }

      #${LOCK_ROOT_ID} .error {
        margin-top: 10px !important;
        font-size: 13px !important;
        color: #ffb3b3 !important;
        min-height: 18px !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function removeLock() {
    const root = document.getElementById(LOCK_ROOT_ID);
    if (root) root.remove();
    document.documentElement.classList.remove(LOCKED_CLASS);
    document.body?.classList.remove(LOCKED_CLASS);
    isLocked = false;
  }

  function blockAllEvents(e) {
    if (!isLocked) return;
    const root = document.getElementById(LOCK_ROOT_ID);
    if (!root) return;
    const target = e.target;
    if (target instanceof Node && root.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }

  function addGlobalGuards() {
    if (guardsAdded) return;
    guardsAdded = true;
    const opts = { capture: true, passive: false };
    window.addEventListener("click", blockAllEvents, opts);
    window.addEventListener("mousedown", blockAllEvents, opts);
    window.addEventListener("mouseup", blockAllEvents, opts);
    window.addEventListener("pointerdown", blockAllEvents, opts);
    window.addEventListener("pointerup", blockAllEvents, opts);
    window.addEventListener("touchstart", blockAllEvents, opts);
    window.addEventListener("touchmove", blockAllEvents, opts);
    window.addEventListener("wheel", blockAllEvents, opts);
    window.addEventListener("contextmenu", blockAllEvents, opts);
    window.addEventListener(
      "keydown",
      (e) => {
        const root = document.getElementById(LOCK_ROOT_ID);
        if (!root) return;
        const active = document.activeElement;
        if (active && root.contains(active)) return;
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      },
      opts
    );
  }

  function startKeepAlive() {
    if (keepAliveStarted) return;
    keepAliveStarted = true;

    const observer = new MutationObserver(() => {
      if (!lastLockDecision || !isLocked) return;
      if (!document.getElementById(LOCK_ROOT_ID)) renderLock();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    setInterval(() => {
      if (!isLocked) return;
      const root = document.getElementById(LOCK_ROOT_ID);
      if (!root) return;
      const active = document.activeElement;
      if (active && root.contains(active)) return;
      const pw = root.querySelector("#__locker_pw__");
      if (pw && "focus" in pw) pw.focus();
    }, 500);
  }

  function renderLock() {
    if (!lastLockDecision) return;
    if (document.getElementById(LOCK_ROOT_ID)) return;

    ensureStyle();

    const mount = () => {
      if (document.getElementById(LOCK_ROOT_ID)) return;
      const host = document.body || document.documentElement;
      if (!host) {
        requestAnimationFrame(mount);
        return;
      }

      isLocked = true;
      document.documentElement.classList.add(LOCKED_CLASS);
      document.body?.classList.add(LOCKED_CLASS);

      const root = document.createElement("div");
      root.id = LOCK_ROOT_ID;
      root.setAttribute("role", "dialog");
      root.setAttribute("aria-modal", "true");
      root.tabIndex = -1;

      const hasPin = Boolean(storedPinHash);
      if (hasPin) {
        root.innerHTML = `
        <div class="panel">
          <h1 class="title">Locked</h1>
          <p class="subtitle">Enter your PIN to unlock this tab.</p>
          <div class="row">
            <input id="__locker_pw__" type="password" placeholder="PIN" autocomplete="current-password" maxlength="128" />
            <button id="__locker_unlock__" type="button">Unlock</button>
          </div>
          <div id="__locker_err__" class="error"></div>
        </div>
      `;
      } else {
        root.innerHTML = `
        <div class="panel">
          <h1 class="title">Locked</h1>
          <p class="subtitle">Set a PIN in the Locker extension popup (toolbar icon). This page updates when your PIN is saved.</p>
          <div id="__locker_err__" class="error"></div>
        </div>
      `;
      }

      host.appendChild(root);

      const pw = root.querySelector("#__locker_pw__");
      const btn = root.querySelector("#__locker_unlock__");
      const err = root.querySelector("#__locker_err__");

      const stopLeak = (e) => {
        const t = e.target;
        if (t instanceof Node && root.contains(t)) return;
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      };
      [
        "click",
        "mousedown",
        "mouseup",
        "pointerdown",
        "pointerup",
        "touchstart",
        "touchmove",
        "wheel",
        "contextmenu",
        "keydown"
      ].forEach((t) => root.addEventListener(t, stopLeak, true));

      const showError = (msg) => {
        if (err) err.textContent = msg;
      };

      const tryUnlock = async () => {
        if (!storedPinHash) {
          showError("No PIN saved yet. Open the Locker popup and set a PIN.");
          return;
        }
        const val = pw && "value" in pw ? String(pw.value).trim() : "";
        let hash;
        try {
          hash = await lockerSha256Hex(val);
        } catch {
          showError("Could not verify PIN.");
          return;
        }
        if (lockerTimingSafeEqualHex(hash, storedPinHash)) {
          removeLock();
          showError("");
          startOrRestartInactivityTimer();
        } else {
          showError("Incorrect PIN.");
          if (pw && "focus" in pw) pw.focus();
          if (pw && "select" in pw) pw.select();
        }
      };

      if (btn) btn.addEventListener("click", () => void tryUnlock());
      if (pw) {
        pw.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void tryUnlock();
          }
        });
        pw.focus();
      }

      addGlobalGuards();
    };

    mount();
  }

  function clearInactivityTimer() {
    if (inactivityTimerId != null) {
      clearTimeout(inactivityTimerId);
      inactivityTimerId = null;
    }
  }

  function forceShowLockOverlay() {
    if (!lastLockDecision) return;
    if (document.getElementById(LOCK_ROOT_ID)) {
      startOrRestartInactivityTimer();
      return;
    }
    renderLock();
    startOrRestartInactivityTimer();
  }

  function startOrRestartInactivityTimer() {
    clearInactivityTimer();
    if (!autoLockEnabled || !lastLockDecision) return;
    inactivityTimerId = setTimeout(() => {
      inactivityTimerId = null;
      forceShowLockOverlay();
    }, inactivityMs);
  }

  function onUserActivity() {
    const now = Date.now();
    if (now - lastActivityThrottleAt < ACTIVITY_THROTTLE_MS) return;
    lastActivityThrottleAt = now;
    startOrRestartInactivityTimer();
  }

  function bindActivityListeners() {
    if (activityListenersBound) return;
    activityListenersBound = true;
    const opts = { capture: true, passive: true };
    for (const ev of [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "wheel",
      "pointerdown",
    ]) {
      window.addEventListener(ev, onUserActivity, opts);
    }
  }

  function applyStorageSnapshot(data) {
    storedPinHash =
      typeof data[STORAGE_KEY_PIN] === "string" ? data[STORAGE_KEY_PIN] : null;
    masterLocked = data[STORAGE_KEY_LOCKED] !== false;
    globalLock = data[STORAGE_KEY_GLOBAL_LOCK] !== false;
    let sitesRaw = data[STORAGE_KEY_LOCKED_SITES];
    if (!Array.isArray(sitesRaw)) sitesRaw = [];
    lockedSitesNormalized = lockerNormalizeLockedSitesList(sitesRaw);
    autoLockEnabled = data[STORAGE_KEY_AUTO_LOCK] !== false;
    const minRaw = Number(data[STORAGE_KEY_INACTIVITY_MIN]);
    const min =
      Number.isFinite(minRaw) && minRaw > 0
        ? Math.min(Math.max(minRaw, 1), 24 * 60)
        : DEFAULT_INACTIVITY_MIN;
    inactivityMs = min * 60 * 1000;
  }

  async function checkLockCondition() {
    const data = await chrome.storage.local.get([
      STORAGE_KEY_PIN,
      STORAGE_KEY_LOCKED,
      STORAGE_KEY_GLOBAL_LOCK,
      STORAGE_KEY_LOCKED_SITES,
      STORAGE_KEY_AUTO_LOCK,
      STORAGE_KEY_INACTIVITY_MIN,
    ]);
    applyStorageSnapshot(data);

    const currentHost = lockerNormalizeHostname(window.location.hostname);
    const engineLock = lockerShouldLock({
      globalLock,
      lockedSites: lockedSitesNormalized,
      currentHost,
    });
    lastLockDecision = Boolean(masterLocked && engineLock);

    if (!lastLockDecision) {
      removeLock();
      clearInactivityTimer();
      return;
    }
    if (document.getElementById(LOCK_ROOT_ID)) removeLock();
    renderLock();
    bindActivityListeners();
    startOrRestartInactivityTimer();
  }

  function init() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[STORAGE_KEY_QUICK_LOCK]) {
        forceShowLockOverlay();
      }
      const keys = [
        STORAGE_KEY_PIN,
        STORAGE_KEY_LOCKED,
        STORAGE_KEY_GLOBAL_LOCK,
        STORAGE_KEY_LOCKED_SITES,
        STORAGE_KEY_AUTO_LOCK,
        STORAGE_KEY_INACTIVITY_MIN,
      ];
      if (!keys.some((k) => changes[k])) return;
      void checkLockCondition();
    });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.action === "CHECK_LOCK") {
        checkLockCondition()
          .then(() => sendResponse({ ok: true }))
          .catch(() => sendResponse({ ok: false }));
        return true;
      }
      if (msg && msg.action === "FORCE_LOCK") {
        forceShowLockOverlay();
        sendResponse({ ok: true });
        return false;
      }
      return undefined;
    });

    startKeepAlive();
    void checkLockCondition();
  }

  init();
})();
