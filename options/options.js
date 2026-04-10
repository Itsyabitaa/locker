"use strict";

function setStatus(msg, kind) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("error", "ok");
  if (kind) el.classList.add(kind);
}

async function loadAndBind() {
  const data = await chrome.storage.local.get([
    "pinHash",
    "locked",
    "globalLock",
    "lockedSites",
    "autoLockEnabled",
    "inactivityMinutes",
  ]);

  const hasPin = Boolean(data.pinHash);

  document.getElementById("set-form")?.classList.toggle("hidden", hasPin);
  document.getElementById("change-form")?.classList.toggle("hidden", !hasPin);

  const lockCb = document.getElementById("lock-enabled");
  if (lockCb) lockCb.checked = data.locked !== false;

  const globalCb = document.getElementById("global-lock");
  if (globalCb) globalCb.checked = data.globalLock !== false;

  const sitesTa = document.getElementById("locked-sites");
  if (sitesTa) {
    sitesTa.value = Array.isArray(data.lockedSites) ? data.lockedSites.join("\n") : "";
  }

  const autoLockCb = document.getElementById("auto-lock-enabled");
  if (autoLockCb) autoLockCb.checked = data.autoLockEnabled !== false;

  const inactivityMinEl = document.getElementById("inactivity-min");
  if (inactivityMinEl) {
    const m = Number(data.inactivityMinutes);
    inactivityMinEl.value = String(
      Number.isFinite(m) && m > 0 ? Math.min(m, 24 * 60) : 2
    );
  }

  const pinGateModal = document.getElementById("pin-gate-modal");
  const pinGateInput = document.getElementById("pin-gate-input");
  const pinGateCancel = document.getElementById("pin-gate-cancel");
  const pinGateConfirm = document.getElementById("pin-gate-confirm");
  const pinGateBackdrop = document.getElementById("pin-gate-backdrop");

  function openPinGateModal() {
    pinGateModal?.classList.remove("hidden");
    if (pinGateInput) {
      pinGateInput.value = "";
      pinGateInput.focus();
    }
  }

  function closePinGateModal() {
    pinGateModal?.classList.add("hidden");
    if (pinGateInput) pinGateInput.value = "";
  }

  pinGateCancel?.addEventListener("click", () => {
    closePinGateModal();
    if (lockCb) lockCb.checked = true;
    setStatus("");
  });

  pinGateBackdrop?.addEventListener("click", () => {
    closePinGateModal();
    if (lockCb) lockCb.checked = true;
  });

  pinGateInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pinGateConfirm?.click();
    }
  });

  pinGateConfirm?.addEventListener("click", async () => {
    const { pinHash: stored } = await chrome.storage.local.get("pinHash");
    if (!stored) {
      setStatus("No PIN on file.", "error");
      closePinGateModal();
      return;
    }
    const raw = pinGateInput?.value ?? "";
    let hash;
    try {
      hash = await lockerSha256Hex(raw);
    } catch {
      setStatus("Could not verify PIN.", "error");
      return;
    }
    if (!lockerTimingSafeEqualHex(hash, stored)) {
      setStatus("Incorrect PIN. Locking stays on.", "error");
      if (pinGateInput) {
        pinGateInput.value = "";
        pinGateInput.focus();
      }
      return;
    }
    try {
      await chrome.storage.local.set({ locked: false });
      if (lockCb) lockCb.checked = false;
      closePinGateModal();
      setStatus("Locking disabled.", "ok");
    } catch {
      setStatus("Could not update locking.", "error");
      if (lockCb) lockCb.checked = true;
      closePinGateModal();
    }
  });

  lockCb?.addEventListener("change", async () => {
    const wantOn = lockCb.checked;
    if (wantOn) {
      try {
        await chrome.storage.local.set({ locked: true });
        setStatus("Locking enabled.", "ok");
      } catch {
        setStatus("Could not update locking.", "error");
        lockCb.checked = false;
      }
      return;
    }
    lockCb.checked = true;
    if (!hasPin) {
      try {
        await chrome.storage.local.set({ locked: false });
        lockCb.checked = false;
        setStatus("Locking disabled.", "ok");
      } catch {
        setStatus("Could not update locking.", "error");
      }
      return;
    }
    setStatus("");
    openPinGateModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pinGateModal && !pinGateModal.classList.contains("hidden")) {
      e.preventDefault();
      closePinGateModal();
      if (lockCb) lockCb.checked = true;
    }
  });

  globalCb?.addEventListener("change", async () => {
    const on = globalCb.checked;
    try {
      await chrome.storage.local.set({ globalLock: on });
      setStatus(on ? "Locking all websites." : "Using domain list only.", "ok");
    } catch {
      setStatus("Could not update global lock.", "error");
      globalCb.checked = !on;
    }
  });

  document.getElementById("save-sites")?.addEventListener("click", async () => {
    const lines = LockerSettingsCommon.sitesFromTextarea(sitesTa?.value);
    try {
      await chrome.storage.local.set({ lockedSites: lines });
      setStatus("Site list saved.", "ok");
    } catch {
      setStatus("Could not save site list.", "error");
    }
  });

  autoLockCb?.addEventListener("change", async () => {
    const on = autoLockCb.checked;
    try {
      await chrome.storage.local.set({ autoLockEnabled: on });
      setStatus(on ? "Auto-lock enabled." : "Auto-lock disabled.", "ok");
    } catch {
      setStatus("Could not update auto-lock.", "error");
      autoLockCb.checked = !on;
    }
  });

  document.getElementById("save-auto-lock")?.addEventListener("click", async () => {
    const n = Number(inactivityMinEl?.value);
    if (!Number.isFinite(n) || n < 1) {
      setStatus("Enter a valid number of minutes (1 or more).", "error");
      return;
    }
    try {
      await chrome.storage.local.set({ inactivityMinutes: Math.min(Math.floor(n), 24 * 60) });
      setStatus("Timeout saved. Applies on all tabs.", "ok");
    } catch {
      setStatus("Could not save timeout.", "error");
    }
  });

  document.getElementById("save-set")?.addEventListener("click", async () => {
    setStatus("");
    const newPin = document.getElementById("new-pin")?.value?.trim() ?? "";
    const confirm = document.getElementById("confirm-pin")?.value?.trim() ?? "";
    const err = LockerSettingsCommon.validatePair(newPin, confirm);
    if (err) {
      setStatus(err, "error");
      return;
    }
    try {
      const hash = await lockerSha256Hex(newPin);
      await chrome.storage.local.set({ pinHash: hash });
      setStatus("PIN saved.", "ok");
      document.getElementById("set-form")?.classList.add("hidden");
      document.getElementById("change-form")?.classList.remove("hidden");
      document.getElementById("new-pin-ch")?.focus();
    } catch {
      setStatus("Could not save PIN.", "error");
    }
  });

  document.getElementById("save-change")?.addEventListener("click", async () => {
    setStatus("");
    const oldPin = document.getElementById("old-pin")?.value ?? "";
    const newPin = document.getElementById("new-pin-ch")?.value?.trim() ?? "";
    const confirm = document.getElementById("confirm-pin-ch")?.value?.trim() ?? "";

    const { pinHash: stored } = await chrome.storage.local.get("pinHash");
    if (!stored) {
      setStatus("No PIN on file. Set a PIN first.", "error");
      return;
    }

    let oldHash;
    try {
      oldHash = await lockerSha256Hex(oldPin);
    } catch {
      setStatus("Could not verify PIN.", "error");
      return;
    }

    if (!lockerTimingSafeEqualHex(oldHash, stored)) {
      setStatus("Current PIN is incorrect.", "error");
      return;
    }

    const err = LockerSettingsCommon.validatePair(newPin, confirm);
    if (err) {
      setStatus(err, "error");
      return;
    }

    try {
      const hash = await lockerSha256Hex(newPin);
      await chrome.storage.local.set({ pinHash: hash });
      setStatus("PIN updated. Unlock with the new PIN everywhere.", "ok");
      document.getElementById("old-pin").value = "";
      document.getElementById("new-pin-ch").value = "";
      document.getElementById("confirm-pin-ch").value = "";
    } catch {
      setStatus("Could not update PIN.", "error");
    }
  });
}

loadAndBind();
