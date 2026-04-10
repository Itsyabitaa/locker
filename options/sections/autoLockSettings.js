"use strict";

/**
 * @param {{
 *   setStatus: (msg: string, kind?: string) => void,
 *   data: Record<string, unknown>,
 * }} ctx
 */
function initLockerAutoLockSettings(ctx) {
  const k = LockerConstants.STORAGE_KEYS;
  const { setStatus, data } = ctx;

  const autoLockCb = document.getElementById("auto-lock-enabled");
  if (autoLockCb) autoLockCb.checked = data[k.AUTO_LOCK] !== false;

  const inactivityMinEl = document.getElementById("inactivity-min");
  if (inactivityMinEl) {
    const m = Number(data[k.INACTIVITY_MIN]);
    inactivityMinEl.value = String(
      Number.isFinite(m) && m > 0 ? Math.min(m, 24 * 60) : LockerConstants.DEFAULT_INACTIVITY_MIN
    );
  }

  LockerToggle.onChange(autoLockCb, async (on) => {
    try {
      await LockerStorage.setSettings({ [k.AUTO_LOCK]: on });
      setStatus(on ? "Auto-lock enabled." : "Auto-lock disabled.", "ok");
    } catch {
      setStatus("Could not update auto-lock.", "error");
      if (autoLockCb) autoLockCb.checked = !on;
    }
  });

  document.getElementById("save-auto-lock")?.addEventListener("click", async () => {
    const n = Number(inactivityMinEl?.value);
    if (!Number.isFinite(n) || n < 1) {
      setStatus("Enter a valid number of minutes (1 or more).", "error");
      return;
    }
    try {
      await LockerStorage.setSettings({ [k.INACTIVITY_MIN]: Math.min(Math.floor(n), 24 * 60) });
      setStatus("Timeout saved. Applies on all tabs.", "ok");
    } catch {
      setStatus("Could not save timeout.", "error");
    }
  });
}
