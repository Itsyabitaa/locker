(() => {
  const LOCK_ROOT_ID = "__locker_root__";
  const LOCK_STYLE_ID = "__locker_style__";
  const LOCKED_CLASS = "__locker_locked__";
  let isLocked = false;
  let guardsAdded = false;
  let keepAliveStarted = false;

  // Hardcoded Sprint 1 password (change later).
  const PASSWORD = "1234";

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
    // If event is outside overlay, block it.
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
    // Capture-phase guards to prevent page interaction even if something goes weird.
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
        // Allow typing in the password field, but stop page shortcuts.
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

    // Re-add overlay if a SPA replaces the DOM or it gets removed.
    const observer = new MutationObserver(() => {
      if (!isLocked) return;
      if (!document.getElementById(LOCK_ROOT_ID)) renderLock();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // Keep focus inside the lock UI so typing works reliably.
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
    if (document.getElementById(LOCK_ROOT_ID)) return;

    ensureStyle();

    // Ensure we can mount even at document_start.
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

      root.innerHTML = `
        <div class="panel">
          <h1 class="title">Locked</h1>
          <p class="subtitle">Enter your password to unlock this tab.</p>
          <div class="row">
            <input id="__locker_pw__" type="password" placeholder="Password" autocomplete="current-password" />
            <button id="__locker_unlock__" type="button">Unlock</button>
          </div>
          <div id="__locker_err__" class="error"></div>
        </div>
      `;

      host.appendChild(root);

      const pw = root.querySelector("#__locker_pw__");
      const btn = root.querySelector("#__locker_unlock__");
      const err = root.querySelector("#__locker_err__");

      // Keep page scripts from intercepting overlay interactions.
      // (Some sites attach aggressive capture-phase listeners on window/document.)
      const stopLeak = (e) => {
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

      const tryUnlock = () => {
        const val = pw && "value" in pw ? String(pw.value) : "";
        if (val === PASSWORD) {
          removeLock();
          showError("");
        } else {
          showError("Incorrect password.");
          if (pw && "focus" in pw) pw.focus();
          if (pw && "select" in pw) pw.select();
        }
      };

      if (btn) btn.addEventListener("click", tryUnlock);
      if (pw) {
        pw.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            tryUnlock();
          }
        });
        pw.focus();
      }

      addGlobalGuards();
    };

    mount();
  }

  // Sprint 1: hardcode lock on load.
  startKeepAlive();
  renderLock();
})();
