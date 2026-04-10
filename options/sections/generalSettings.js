"use strict";

/**
 * @param {{
 *   setStatus: (msg: string, kind?: string) => void,
 *   data: Record<string, unknown>,
 * }} ctx
 */
function initLockerGeneralSettings(ctx) {
  const k = LockerConstants.STORAGE_KEYS;
  const { setStatus, data } = ctx;

  const lockCb = document.getElementById("lock-enabled");
  if (lockCb) lockCb.checked = data[k.LOCKED] !== false;

  const globalCb = document.getElementById("global-lock");
  if (globalCb) globalCb.checked = data[k.GLOBAL_LOCK] !== false;

  globalCb?.addEventListener("change", async () => {
    const on = globalCb.checked;
    try {
      await LockerStorage.setSettings({ [k.GLOBAL_LOCK]: on });
      setStatus(on ? "Locking all websites." : "Using domain list only.", "ok");
    } catch {
      setStatus("Could not update global lock.", "error");
      globalCb.checked = !on;
    }
  });

  lockCb?.addEventListener("change", async () => {
    const wantOn = lockCb.checked;
    if (wantOn) {
      try {
        await LockerStorage.setSettings({ [k.LOCKED]: true });
        setStatus("Locking enabled.", "ok");
      } catch {
        setStatus("Could not update locking.", "error");
        lockCb.checked = false;
      }
      return;
    }
    lockCb.checked = true;
    const pinSnap = await chrome.storage.local.get(k.PIN);
    const hasPinNow = typeof pinSnap[k.PIN] === "string" && pinSnap[k.PIN].length > 0;
    if (!hasPinNow) {
      try {
        await LockerStorage.setSettings({ [k.LOCKED]: false });
        lockCb.checked = false;
        setStatus("Locking disabled.", "ok");
      } catch {
        setStatus("Could not update locking.", "error");
      }
      return;
    }
    setStatus("");
    const verified = await LockerPinModal.open({
      title: "Enter PIN to disable locking",
      description: "Locker will stop blocking pages until you enable it again.",
      confirmLabel: "Disable locking",
      onVerify: async (pin) => {
        const stored = (await chrome.storage.local.get(k.PIN))[k.PIN];
        if (typeof stored !== "string") {
          return { ok: false, message: "No PIN on file." };
        }
        let hash;
        try {
          hash = await lockerSha256Hex(pin);
        } catch {
          return { ok: false, message: "Could not verify PIN." };
        }
        if (!lockerTimingSafeEqualHex(hash, stored)) {
          return { ok: false, message: "Incorrect PIN. Locking stays on." };
        }
        return true;
      },
    });
    if (!verified) {
      if (lockCb) lockCb.checked = true;
      return;
    }
    try {
      await LockerStorage.setSettings({ [k.LOCKED]: false });
      if (lockCb) lockCb.checked = false;
      setStatus("Locking disabled.", "ok");
    } catch {
      setStatus("Could not update locking.", "error");
      if (lockCb) lockCb.checked = true;
    }
  });
}
