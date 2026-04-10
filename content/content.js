(() => {
  const k = LockerConstants.STORAGE_KEYS;
  const MAX_PIN_ATTEMPTS = LockerConstants.MAX_PIN_ATTEMPTS;
  const LOCKOUT_MS = LockerConstants.LOCKOUT_MS;
  const ACTIVITY_THROTTLE_MS = LockerConstants.ACTIVITY_THROTTLE_MS;
  const DEFAULT_INACTIVITY_MIN = LockerConstants.DEFAULT_INACTIVITY_MIN;

  let storedPinHash = null;
  let masterLocked = true;
  let globalLock = true;
  let lockedSitesNormalized = [];
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

  function getOverlayEls() {
    const root = document.getElementById(LockerConstants.LOCK_ROOT_ID);
    if (!root) return { root: null, pw: null, btn: null, err: null };
    return {
      root,
      pw: root.querySelector("#__locker_pw__"),
      btn: root.querySelector("#__locker_unlock__"),
      err: root.querySelector("#__locker_err__"),
    };
  }

  function clearLockoutUiTimer() {
    if (lockoutUiTimerId != null) {
      clearInterval(lockoutUiTimerId);
      lockoutUiTimerId = null;
    }
  }

  function removeLock() {
    clearLockoutUiTimer();
    LockerOverlay.unmount();
    isLocked = false;
  }

  function blockAllEvents(e) {
    if (!isLocked) return;
    const root = document.getElementById(LockerConstants.LOCK_ROOT_ID);
    if (!root) return;
    const target = e.target;
    if (target instanceof Node && root.contains(target)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }

  function blockContextMenuWhileLocked(e) {
    if (!lastLockDecision) return;
    if (!document.getElementById(LockerConstants.LOCK_ROOT_ID)) return;
    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }

  function onLockdownKeydown(e) {
    const root = document.getElementById(LockerConstants.LOCK_ROOT_ID);
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
      if (!document.getElementById(LockerConstants.LOCK_ROOT_ID)) {
        if (!isLocked) return;
        void renderLock();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    setInterval(() => {
      if (!lastLockDecision) return;
      if (document.getElementById(LockerConstants.LOCK_ROOT_ID)) return;
      if (!isLocked) return;
      void renderLock();
    }, 400);

    setInterval(() => {
      if (!isLocked) return;
      const root = document.getElementById(LockerConstants.LOCK_ROOT_ID);
      if (!root) return;
      const active = document.activeElement;
      if (active && root.contains(active)) return;
      const pw = root.querySelector("#__locker_pw__");
      if (pw && "focus" in pw && !pw.disabled) pw.focus();
    }, 500);
  }

  async function renderLock() {
    if (!lastLockDecision) return;
    if (document.getElementById(LockerConstants.LOCK_ROOT_ID)) return;

    const hasPin = Boolean(storedPinHash);

    async function tryUnlock() {
      const { pw, err } = getOverlayEls();
      const showError = (msg) => {
        if (err) err.textContent = msg;
      };

      function setLockedOutUi(disabled) {
        if (pw && "disabled" in pw) pw.disabled = Boolean(disabled);
        const btn = getOverlayEls().btn;
        if (btn && "disabled" in btn) btn.disabled = Boolean(disabled);
      }

      function stopLockoutCountdown() {
        clearLockoutUiTimer();
      }

      function startLockoutCountdown() {
        stopLockoutCountdown();
        setLockedOutUi(true);
        const tick = () => {
          if (!document.getElementById(LockerConstants.LOCK_ROOT_ID)) {
            stopLockoutCountdown();
            return;
          }
          const left = Math.ceil((lockoutUntil - Date.now()) / 1000);
          const errEl = getOverlayEls().err;
          if (left <= 0) {
            stopLockoutCountdown();
            setLockedOutUi(false);
            lockoutUntil = 0;
            if (errEl) errEl.textContent = "";
            const p = getOverlayEls().pw;
            if (p && "focus" in p && !p.disabled) p.focus();
            return;
          }
          if (errEl) errEl.textContent = `Too many attempts. Try again in ${left}s.`;
        };
        tick();
        lockoutUiTimerId = setInterval(tick, 1000);
      }

      function enterLockout() {
        lockoutUntil = Date.now() + LOCKOUT_MS;
        pinFailCount = 0;
        startLockoutCountdown();
      }

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
        clearLockoutUiTimer();
        setLockedOutUi(false);
        LockerSession.setTabSessionUnlock();
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
    }

    const mounted = await LockerOverlay.mount({
      hasPin,
      onTryUnlock: tryUnlock,
    });

    if (!mounted) return;

    isLocked = true;

    if (Date.now() < lockoutUntil) {
      const { pw, btn, err } = getOverlayEls();
      const showError = (msg) => {
        if (err) err.textContent = msg;
      };
      const setLockedOutUi = (disabled) => {
        if (pw && "disabled" in pw) pw.disabled = Boolean(disabled);
        if (btn && "disabled" in btn) btn.disabled = Boolean(disabled);
      };
      clearLockoutUiTimer();
      setLockedOutUi(true);
      const tick = () => {
        if (!document.getElementById(LockerConstants.LOCK_ROOT_ID)) {
          clearLockoutUiTimer();
          return;
        }
        const left = Math.ceil((lockoutUntil - Date.now()) / 1000);
        const errEl = getOverlayEls().err;
        if (left <= 0) {
          clearLockoutUiTimer();
          setLockedOutUi(false);
          lockoutUntil = 0;
          if (errEl) errEl.textContent = "";
          const p = getOverlayEls().pw;
          if (p && "focus" in p && !p.disabled) p.focus();
          return;
        }
        if (errEl) errEl.textContent = `Too many attempts. Try again in ${left}s.`;
      };
      tick();
      lockoutUiTimerId = setInterval(tick, 1000);
    } else {
      const pw = mounted.pw;
      if (pw && hasPin) pw.focus();
    }

    addGlobalGuards();
  }

  function clearInactivityTimer() {
    if (inactivityTimerId != null) {
      clearTimeout(inactivityTimerId);
      inactivityTimerId = null;
    }
  }

  function forceShowLockOverlay() {
    if (!lastLockDecision) return;
    LockerSession.clearTabSessionUnlock();
    if (document.getElementById(LockerConstants.LOCK_ROOT_ID)) {
      startOrRestartInactivityTimer();
      return;
    }
    void renderLock();
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
    storedPinHash = typeof data[k.PIN] === "string" ? data[k.PIN] : null;
    masterLocked = data[k.LOCKED] !== false;
    globalLock = data[k.GLOBAL_LOCK] !== false;
    let sitesRaw = data[k.LOCKED_SITES];
    if (!Array.isArray(sitesRaw)) sitesRaw = [];
    lockedSitesNormalized = lockerNormalizeLockedSitesList(sitesRaw);
    autoLockEnabled = data[k.AUTO_LOCK] !== false;
    const minRaw = Number(data[k.INACTIVITY_MIN]);
    const min =
      Number.isFinite(minRaw) && minRaw > 0
        ? Math.min(Math.max(minRaw, 1), 24 * 60)
        : DEFAULT_INACTIVITY_MIN;
    inactivityMs = min * 60 * 1000;
  }

  async function checkLockCondition() {
    const data = await LockerStorage.getSettings();
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
      LockerSession.clearTabSessionUnlock();
      return;
    }

    if (LockerSession.isTabSessionUnlocked()) {
      removeLock();
      bindActivityListeners();
      startOrRestartInactivityTimer();
      return;
    }

    if (document.getElementById(LockerConstants.LOCK_ROOT_ID)) removeLock();
    await renderLock();
    bindActivityListeners();
    startOrRestartInactivityTimer();
  }

  function init() {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[k.PIN] || changes[k.LOCKED]) {
        LockerSession.clearTabSessionUnlock();
      }
      if (changes[k.QUICK_LOCK]) {
        forceShowLockOverlay();
      }
      const keys = [
        k.PIN,
        k.LOCKED,
        k.GLOBAL_LOCK,
        k.LOCKED_SITES,
        k.AUTO_LOCK,
        k.INACTIVITY_MIN,
      ];
      if (!keys.some((key) => changes[key])) return;
      void checkLockCondition();
    });

    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.action === LockerConstants.LockerEvents.CHECK_LOCK) {
        checkLockCondition()
          .then(() => sendResponse({ ok: true }))
          .catch(() => sendResponse({ ok: false }));
        return true;
      }
      if (msg && msg.action === LockerConstants.LockerEvents.FORCE_LOCK) {
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
