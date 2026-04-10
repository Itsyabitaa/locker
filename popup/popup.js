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

async function init() {
  const { pinHash, locked } = await chrome.storage.local.get(["pinHash", "locked"]);
  const hasPin = Boolean(pinHash);
  const lockingEnabled = locked !== false;

  const lockCb = document.getElementById("lock-enabled");
  if (lockCb) lockCb.checked = lockingEnabled;

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
