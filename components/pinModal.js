"use strict";

var LockerPinModal = {
  /**
   * @param {{
   *   title: string,
   *   description?: string,
   *   confirmLabel: string,
   *   onVerify: (pin: string) => Promise<boolean | { ok: boolean, message?: string }>,
   * }} opts
   * @returns {Promise<boolean>} true if verified, false if cancelled
   */
  async open(opts) {
    const { title, description = "", confirmLabel, onVerify } = opts;
    const url = chrome.runtime.getURL("components/pinModal.html");
    const res = await fetch(url);
    const html = await res.text();
    const wrap = document.createElement("div");
    wrap.innerHTML = html.trim();
    const root = wrap.firstElementChild;
    if (!root || !(root instanceof HTMLElement)) {
      return false;
    }

    const titleEl = root.querySelector("[data-pin-modal-title]");
    const descEl = root.querySelector("[data-pin-modal-desc]");
    const input = root.querySelector("[data-pin-modal-input]");
    const errEl = root.querySelector("[data-pin-modal-error]");
    const cancelBtn = root.querySelector("[data-pin-modal-cancel]");
    const confirmBtn = root.querySelector("[data-pin-modal-confirm]");
    const backdrop = root.querySelector("[data-pin-modal-backdrop]");

    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = description;
    if (confirmBtn) confirmBtn.textContent = confirmLabel;

    document.body.appendChild(root);

    const inputEl = input instanceof HTMLInputElement ? input : null;

    return new Promise((resolve) => {
      let done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        unbindEscape();
        LockerModal.remove(root);
        resolve(ok);
      }

      function showErr(msg) {
        if (errEl) errEl.textContent = msg || "";
      }

      const unbindEscape = LockerModal.bindEscape(root, () => {
        showErr("");
        finish(false);
      });

      function onCancel() {
        showErr("");
        finish(false);
      }

      cancelBtn?.addEventListener("click", onCancel);
      backdrop?.addEventListener("click", onCancel);

      inputEl?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          confirmBtn?.click();
        }
      });

      confirmBtn?.addEventListener("click", async () => {
        const pin = LockerInput.passwordValue(inputEl);
        showErr("");
        try {
          const raw = await onVerify(pin);
          const ok = typeof raw === "boolean" ? raw : raw.ok;
          const msg = typeof raw === "boolean" ? undefined : raw.message;
          if (ok) {
            finish(true);
          } else {
            showErr(msg || "Incorrect PIN.");
            LockerInput.clear(inputEl);
            inputEl?.focus();
          }
        } catch {
          showErr("Could not verify PIN.");
        }
      });

      requestAnimationFrame(() => inputEl?.focus());
    });
  },
};
