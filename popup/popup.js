"use strict";

const MIN_LEN = 4;

function setStatus(msg, kind) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("error", "ok");
  if (kind) el.classList.add(kind);
}

function validatePair(newPin, confirm) {
  if (newPin.length < MIN_LEN) return `PIN must be at least ${MIN_LEN} characters.`;
  if (newPin !== confirm) return "PINs do not match.";
  return null;
}

function sitesArrayFromTextarea(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function init() {
  const { pinHash, locked, globalLock, lockedSites, autoLockEnabled, inactivityMinutes } =
    await chrome.storage.local.get([
      "pinHash",
      "locked",
      "globalLock",
      "lockedSites",
      "autoLockEnabled",
      "inactivityMinutes",
    ]);
  const hasPin = Boolean(pinHash);
  const lockingEnabled = locked !== false;
  const globalOn = globalLock !== false;

  const lockCb = document.getElementById("lock-enabled");
  if (lockCb) lockCb.checked = lockingEnabled;

  const globalCb = document.getElementById("global-lock");
  if (globalCb) globalCb.checked = globalOn;

  const sitesTa = document.getElementById("locked-sites");
  if (sitesTa) {
    sitesTa.value = Array.isArray(lockedSites) ? lockedSites.join("\n") : "";
  }

  const autoLockCb = document.getElementById("auto-lock-enabled");
  if (autoLockCb) autoLockCb.checked = autoLockEnabled !== false;

  const inactivityMinEl = document.getElementById("inactivity-min");
  if (inactivityMinEl) {
    const m = Number(inactivityMinutes);
    inactivityMinEl.value = String(
      Number.isFinite(m) && m > 0 ? Math.min(m, 24 * 60) : 2
    );
  }

  lockCb?.addEventListener("change", async () => {
    const on = lockCb.checked;
    try {
      await chrome.storage.local.set({ locked: on });
      setStatus(on ? "Locking on." : "Locking off.", "ok");
    } catch {
      setStatus("Could not update locking.", "error");
      lockCb.checked = !on;
    }
  });

  globalCb?.addEventListener("change", async () => {
    const on = globalCb.checked;
    try {
      await chrome.storage.local.set({ globalLock: on });
      setStatus(on ? "Locking all sites." : "List-only mode.", "ok");
    } catch {
      setStatus("Could not update global lock.", "error");
      globalCb.checked = !on;
    }
  });

  document.getElementById("save-sites")?.addEventListener("click", async () => {
    const lines = sitesArrayFromTextarea(sitesTa?.value);
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
      setStatus(on ? "Auto-lock on." : "Auto-lock off.", "ok");
    } catch {
      setStatus("Could not update auto-lock.", "error");
      autoLockCb.checked = !on;
    }
  });

  document.getElementById("save-auto-lock")?.addEventListener("click", async () => {
    const n = Number(inactivityMinEl?.value);
    if (!Number.isFinite(n) || n < 1) {
      setStatus("Enter a valid number of minutes (1+).", "error");
      return;
    }
    try {
      await chrome.storage.local.set({ inactivityMinutes: Math.min(Math.floor(n), 24 * 60) });
      setStatus("Inactivity time saved.", "ok");
    } catch {
      setStatus("Could not save inactivity time.", "error");
    }
  });

  document.getElementById("set-form")?.classList.toggle("hidden", hasPin);
  document.getElementById("change-form")?.classList.toggle("hidden", !hasPin);

  document.getElementById("save-set")?.addEventListener("click", async () => {
    setStatus("");
    const newPin = document.getElementById("new-pin")?.value?.trim() ?? "";
    const confirm = document.getElementById("confirm-pin")?.value?.trim() ?? "";
    const err = validatePair(newPin, confirm);
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
    } catch (e) {
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
      setStatus("No PIN on file. Save a new PIN first.", "error");
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

    const err = validatePair(newPin, confirm);
    if (err) {
      setStatus(err, "error");
      return;
    }

    try {
      const hash = await lockerSha256Hex(newPin);
      await chrome.storage.local.set({ pinHash: hash });
      setStatus("PIN updated.", "ok");
      document.getElementById("old-pin").value = "";
      document.getElementById("new-pin-ch").value = "";
      document.getElementById("confirm-pin-ch").value = "";
    } catch {
      setStatus("Could not update PIN.", "error");
    }
  });
}

init();
