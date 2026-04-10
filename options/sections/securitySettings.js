"use strict";

/**
 * @param {{
 *   setStatus: (msg: string, kind?: string) => void,
 *   data: Record<string, unknown>,
 *   onPinSaved: () => void,
 * }} ctx
 */
function initLockerSecuritySettings(ctx) {
  const k = LockerConstants.STORAGE_KEYS;
  const { setStatus, data, onPinSaved } = ctx;
  const hasPin = Boolean(data[k.PIN]);

  document.getElementById("set-form")?.classList.toggle("hidden", hasPin);
  document.getElementById("change-form")?.classList.toggle("hidden", !hasPin);

  document.getElementById("save-set")?.addEventListener("click", async () => {
    setStatus("");
    const newPin = document.getElementById("new-pin")?.value?.trim() ?? "";
    const confirm = document.getElementById("confirm-pin")?.value?.trim() ?? "";
    const err = LockerUtils.validatePinPair(newPin, confirm);
    if (err) {
      setStatus(err, "error");
      return;
    }
    try {
      const hash = await lockerSha256Hex(newPin);
      await LockerStorage.setSettings({ [k.PIN]: hash });
      setStatus("PIN saved.", "ok");
      onPinSaved();
    } catch {
      setStatus("Could not save PIN.", "error");
    }
  });

  document.getElementById("save-change")?.addEventListener("click", async () => {
    setStatus("");
    const oldPin = document.getElementById("old-pin")?.value ?? "";
    const newPin = document.getElementById("new-pin-ch")?.value?.trim() ?? "";
    const confirm = document.getElementById("confirm-pin-ch")?.value?.trim() ?? "";

    const stored = (await chrome.storage.local.get(k.PIN))[k.PIN];
    if (typeof stored !== "string") {
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

    const err = LockerUtils.validatePinPair(newPin, confirm);
    if (err) {
      setStatus(err, "error");
      return;
    }

    try {
      const hash = await lockerSha256Hex(newPin);
      await LockerStorage.setSettings({ [k.PIN]: hash });
      setStatus("PIN updated. Unlock with the new PIN everywhere.", "ok");
      const old = document.getElementById("old-pin");
      const nw = document.getElementById("new-pin-ch");
      const cf = document.getElementById("confirm-pin-ch");
      if (old) old.value = "";
      if (nw) nw.value = "";
      if (cf) cf.value = "";
    } catch {
      setStatus("Could not update PIN.", "error");
    }
  });
}
