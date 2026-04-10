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
  const MAX_PIN_ATTEMPTS = 5;
  const LOCKOUT_MS = 60 * 1000;
  /** After correct PIN, same tab stays "unlocked" across reloads until auto-lock, quick lock, or PIN/settings change. */
  const SESSION_UNLOCK_KEY = "locker_tab_unlocked_v1";

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

  let pinFailCount = 0;
  let lockoutUntil = 0;
  let lockoutUiTimerId = null;

  function clearTabSessionUnlock() {
    try {
      sessionStorage.removeItem(SESSION_UNLOCK_KEY);
    } catch (_) {}
  }

  function setTabSessionUnlock() {
    try {
      sessionStorage.setItem(SESSION_UNLOCK_KEY, "1");
    } catch (_) {}
  }

  function isTabSessionUnlocked() {
    try {
      return sessionStorage.getItem(SESSION_UNLOCK_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  function ensureStyle() {
    if (document.getElementById(LOCK_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = LOCK_STYLE_ID;
    style.textContent = `
      @keyframes lockerBackdropIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes lockerPanelIn {
        from { opacity: 0; transform: translateY(14px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      @media (prefers-reduced-motion: reduce) {
        #${LOCK_ROOT_ID} { animation: none !important; }
        #${LOCK_ROOT_ID} .locker-panel { animation: none !important; }
      }

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
        padding: 20px !important;
        animation: lockerBackdropIn 0.32s ease-out forwards !important;
        background:
          radial-gradient(ellipse 90% 55% at 50% -15%, rgba(120, 140, 255, 0.18), transparent 55%),
          radial-gradient(ellipse 70% 45% at 100% 100%, rgba(80, 200, 255, 0.06), transparent 50%),
          rgba(8, 9, 14, 0.94) !important;
        color: #f0f2f8 !important;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Liberation Sans", sans-serif !important;
        touch-action: none !important;
        -webkit-font-smoothing: antialiased !important;
      }

      #${LOCK_ROOT_ID} * {
        box-sizing: border-box !important;
      }

      #${LOCK_ROOT_ID} .locker-panel {
        width: min(420px, calc(100vw - 40px)) !important;
        padding: 28px 26px 24px !important;
        border-radius: 16px !important;
        animation: lockerPanelIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards !important;
        background: linear-gradient(165deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.04) 100%) !important;
        border: 1px solid rgba(255, 255, 255, 0.12) !important;
        box-shadow:
          0 0 0 1px rgba(255,255,255,0.04) inset,
          0 24px 80px rgba(0, 0, 0, 0.55),
          0 0 40px rgba(100, 140, 255, 0.08) !important;
        backdrop-filter: blur(10px) !important;
      }

      #${LOCK_ROOT_ID} .locker-icon {
        width: 52px !important;
        height: 52px !important;
        margin: 0 auto 14px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 14px !important;
        background: rgba(107, 140, 255, 0.12) !important;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35) !important;
        color: #b8c8ff !important;
      }

      #${LOCK_ROOT_ID} .locker-icon svg {
        width: 28px !important;
        height: 28px !important;
      }

      #${LOCK_ROOT_ID} .title {
        font-size: 1.35rem !important;
        font-weight: 750 !important;
        margin: 0 0 8px 0 !important;
        letter-spacing: -0.02em !important;
        text-align: center !important;
      }

      #${LOCK_ROOT_ID} .subtitle {
        font-size: 0.88rem !important;
        opacity: 0.85 !important;
        margin: 0 0 20px 0 !important;
        line-height: 1.45 !important;
        text-align: center !important;
        color: rgba(240, 242, 248, 0.88) !important;
      }

      #${LOCK_ROOT_ID} .row {
        display: flex !important;
        gap: 10px !important;
        flex-wrap: wrap !important;
      }

      #${LOCK_ROOT_ID} input[type="password"] {
        flex: 1 !important;
        min-width: 0 !important;
        height: 46px !important;
        padding: 10px 14px !important;
        border-radius: 11px !important;
        border: 1px solid rgba(255, 255, 255, 0.16) !important;
        background: rgba(0, 0, 0, 0.35) !important;
        color: #fff !important;
        outline: none !important;
        font-size: 15px !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
      }

      #${LOCK_ROOT_ID} input[type="password"]:focus {
        border-color: rgba(107, 140, 255, 0.55) !important;
        box-shadow: 0 0 0 3px rgba(107, 140, 255, 0.2) !important;
      }

      #${LOCK_ROOT_ID} input[type="password"]::placeholder {
        color: rgba(255, 255, 255, 0.5) !important;
      }

      #${LOCK_ROOT_ID} button {
        height: 46px !important;
        padding: 0 18px !important;
        border-radius: 11px !important;
        border: none !important;
        background: linear-gradient(180deg, rgba(107, 140, 255, 0.95), rgba(75, 105, 210, 0.98)) !important;
        color: #fff !important;
        font-weight: 650 !important;
        cursor: pointer !important;
        pointer-events: auto !important;
        touch-action: manipulation !important;
        box-shadow: 0 8px 24px rgba(75, 105, 210, 0.35) !important;
        transition: filter 0.15s ease, transform 0.1s ease !important;
      }

      #${LOCK_ROOT_ID} button:hover {
        filter: brightness(1.06) !important;
      }

      #${LOCK_ROOT_ID} button:active {
        transform: scale(0.98) !important;
      }

      #${LOCK_ROOT_ID} .error {
        margin-top: 12px !important;
        font-size: 0.82rem !important;
        color: #ffb8b8 !important;
        min-height: 18px !important;
        text-align: center !important;
      }

      #${LOCK_ROOT_ID} input:disabled,
      #${LOCK_ROOT_ID} button:disabled {
        opacity: 0.55 !important;
        cursor: not-allowed !important;
        pointer-events: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function clearLockoutUiTimer() {
    if (lockoutUiTimerId != null) {
      clearInterval(lockoutUiTimerId);
      lockoutUiTimerId = null;
    }
  }

  function removeLock() {
    clearLockoutUiTimer();
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

  function blockContextMenuWhileLocked(e) {
    if (!lastLockDecision) return;
    if (!document.getElementById(LOCK_ROOT_ID)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }

  function onLockdownKeydown(e) {
    const root = document.getElementById(LOCK_ROOT_ID);
    if (!root) return;

    const active = document.activeElement;
    const inOverlay = active instanceof Node && root.contains(active);
    const ctrl = e.ctrlKey || e.metaKey;
    const key = e.key;

    if (key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return;
    }

    if ((key === "w" || key === "W") && ctrl) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return;
    }

    if (
      ctrl &&
      !e.shiftKey &&
      (key === "t" || key === "T" || key === "n" || key === "N" || key === "l" || key === "L")
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return;
    }

    if (key === "F5" || (key === "r" && ctrl && !e.shiftKey) || (key === "R" && ctrl && e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return;
    }

    if (
      key === "F12" ||
      (ctrl && e.shiftKey && (key === "I" || key === "J" || key === "C" || key === "K")) ||
      (ctrl && (key === "u" || key === "U") && !e.shiftKey)
    ) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
      return;
    }

    if (!inOverlay) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    }
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
    window.addEventListener("contextmenu", blockContextMenuWhileLocked, opts);
    window.addEventListener("keydown", onLockdownKeydown, opts);
  }

  function startKeepAlive() {
    if (keepAliveStarted) return;
    keepAliveStarted = true;

    const observer = new MutationObserver(() => {
      if (!lastLockDecision) return;
      if (!document.getElementById(LOCK_ROOT_ID)) {
        if (!isLocked) return;
        renderLock();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    setInterval(() => {
      if (!lastLockDecision) return;
      if (document.getElementById(LOCK_ROOT_ID)) return;
      if (!isLocked) return;
      renderLock();
    }, 400);

    setInterval(() => {
      if (!isLocked) return;
      const root = document.getElementById(LOCK_ROOT_ID);
      if (!root) return;
      const active = document.activeElement;
      if (active && root.contains(active)) return;
      const pw = root.querySelector("#__locker_pw__");
      if (pw && "focus" in pw && !pw.disabled) pw.focus();
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
      const lockIconSvg = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7 11V8a5 5 0 0110 0v3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><rect x="5" y="11" width="14" height="10" rx="2.25" stroke="currentColor" stroke-width="1.75"/></svg>`;
      if (hasPin) {
        root.innerHTML = `
        <div class="locker-panel">
          <div class="locker-icon">${lockIconSvg}</div>
          <h1 class="title">Screen locked</h1>
          <p class="subtitle">Enter your PIN to use this page.</p>
          <div class="row">
            <input id="__locker_pw__" type="password" placeholder="PIN" autocomplete="current-password" maxlength="128" />
            <button id="__locker_unlock__" type="button">Unlock</button>
          </div>
          <div id="__locker_err__" class="error"></div>
        </div>
      `;
      } else {
        root.innerHTML = `
        <div class="locker-panel">
          <div class="locker-icon">${lockIconSvg}</div>
          <h1 class="title">Screen locked</h1>
          <p class="subtitle">Set a PIN in Locker settings: toolbar icon → Open settings. This page updates when you save.</p>
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

      function setLockedOutUi(disabled) {
        if (pw && "disabled" in pw) pw.disabled = Boolean(disabled);
        if (btn && "disabled" in btn) btn.disabled = Boolean(disabled);
      }

      function stopLockoutCountdown() {
        clearLockoutUiTimer();
      }

      function startLockoutCountdown() {
        stopLockoutCountdown();
        setLockedOutUi(true);
        const tick = () => {
          if (!document.getElementById(LOCK_ROOT_ID)) {
            stopLockoutCountdown();
            return;
          }
          const left = Math.ceil((lockoutUntil - Date.now()) / 1000);
          if (left <= 0) {
            stopLockoutCountdown();
            setLockedOutUi(false);
            lockoutUntil = 0;
            showError("");
            if (pw && "focus" in pw && !pw.disabled) pw.focus();
            return;
          }
          showError(`Too many attempts. Try again in ${left}s.`);
        };
        tick();
        lockoutUiTimerId = setInterval(tick, 1000);
      }

      function enterLockout() {
        lockoutUntil = Date.now() + LOCKOUT_MS;
        pinFailCount = 0;
        startLockoutCountdown();
      }

      const tryUnlock = async () => {
        if (!storedPinHash) {
          showError("No PIN saved yet. Open Locker → Settings and set a PIN.");
          return;
        }
        if (Date.now() < lockoutUntil) {
          const left = Math.ceil((lockoutUntil - Date.now()) / 1000);
          showError(`Too many attempts. Try again in ${left}s.`);
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
          pinFailCount = 0;
          lockoutUntil = 0;
          stopLockoutCountdown();
          setLockedOutUi(false);
          setTabSessionUnlock();
          removeLock();
          showError("");
          startOrRestartInactivityTimer();
        } else {
          pinFailCount += 1;
          if (pinFailCount >= MAX_PIN_ATTEMPTS) {
            enterLockout();
          } else {
            showError(`Incorrect PIN. (${pinFailCount}/${MAX_PIN_ATTEMPTS})`);
            if (pw && "focus" in pw) pw.focus();
            if (pw && "select" in pw) pw.select();
          }
        }
      };

      if (Date.now() < lockoutUntil) {
        startLockoutCountdown();
      }

      if (btn) btn.addEventListener("click", () => void tryUnlock());
      if (pw) {
        pw.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void tryUnlock();
          }
        });
        if (!(Date.now() < lockoutUntil)) pw.focus();
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
    clearTabSessionUnlock();
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
      clearTabSessionUnlock();
      return;
    }

    if (isTabSessionUnlocked()) {
      removeLock();
      bindActivityListeners();
      startOrRestartInactivityTimer();
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
      if (changes[STORAGE_KEY_PIN] || changes[STORAGE_KEY_LOCKED]) {
        clearTabSessionUnlock();
      }
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
