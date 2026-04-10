"use strict";

var LockerOverlay = {
  _stopLeak: null,

  getRootId() {
    return LockerConstants.LOCK_ROOT_ID;
  },

  /**
   * @param {{ hasPin: boolean, onTryUnlock: () => void | Promise<void> }} options
   * @returns {Promise<{ root: HTMLElement, pw: HTMLInputElement | null, btn: HTMLButtonElement | null, err: HTMLElement | null } | null>}
   */
  async mount(options) {
    const { hasPin, onTryUnlock } = options;
    const LOCK_ROOT_ID = LockerConstants.LOCK_ROOT_ID;
    if (document.getElementById(LOCK_ROOT_ID)) return null;

    const url = chrome.runtime.getURL("content/overlay/overlay.html");
    const res = await fetch(url);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const srcRoot = doc.querySelector("#" + LOCK_ROOT_ID);
    if (!srcRoot || !(srcRoot instanceof HTMLElement)) {
      throw new Error("Locker overlay template missing root");
    }

    const host = document.body || document.documentElement;
    if (!host) {
      await new Promise((r) => requestAnimationFrame(r));
      return this.mount(options);
    }

    const root = document.importNode(srcRoot, true);
    root.id = LOCK_ROOT_ID;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.tabIndex = -1;

    const pinRow = root.querySelector(".locker-pin-row");
    const subPin = root.querySelector(".locker-sub-pin");
    const subNoPin = root.querySelector(".locker-sub-nopin");
    if (hasPin) {
      pinRow?.classList.remove("hidden");
      subPin?.classList.remove("hidden");
      subNoPin?.classList.add("hidden");
    } else {
      pinRow?.classList.add("hidden");
      subPin?.classList.add("hidden");
      subNoPin?.classList.remove("hidden");
    }

    document.documentElement.classList.add(LockerConstants.LOCKED_CLASS);
    document.body?.classList.add(LockerConstants.LOCKED_CLASS);

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
    const evNames = [
      "click",
      "mousedown",
      "mouseup",
      "pointerdown",
      "pointerup",
      "touchstart",
      "touchmove",
      "wheel",
      "contextmenu",
      "keydown",
    ];
    evNames.forEach((t) => root.addEventListener(t, stopLeak, true));
    this._stopLeak = { root, evNames, stopLeak };

    const runUnlock = () => void Promise.resolve(onTryUnlock());

    if (btn && hasPin) btn.addEventListener("click", runUnlock);
    if (pw && hasPin) {
      pw.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          runUnlock();
        }
      });
    }

    return {
      root,
      pw: pw instanceof HTMLInputElement ? pw : null,
      btn: btn instanceof HTMLButtonElement ? btn : null,
      err: err instanceof HTMLElement ? err : null,
    };
  },

  unmount() {
    const LOCK_ROOT_ID = LockerConstants.LOCK_ROOT_ID;
    const root = document.getElementById(LOCK_ROOT_ID);
    if (this._stopLeak && root) {
      const { evNames, stopLeak } = this._stopLeak;
      evNames.forEach((t) => root.removeEventListener(t, stopLeak, true));
    }
    this._stopLeak = null;
    root?.remove();
    document.documentElement.classList.remove(LockerConstants.LOCKED_CLASS);
    document.body?.classList.remove(LockerConstants.LOCKED_CLASS);
  },
};
