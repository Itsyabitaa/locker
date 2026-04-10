"use strict";

/**
 * @param {{
 *   setStatus: (msg: string, kind?: string) => void,
 *   data: Record<string, unknown>,
 * }} ctx
 */
function initLockerSiteManager(ctx) {
  const k = LockerConstants.STORAGE_KEYS;
  const { setStatus, data } = ctx;

  const sitesTa = document.getElementById("locked-sites");
  if (sitesTa) {
    sitesTa.value = Array.isArray(data[k.LOCKED_SITES]) ? data[k.LOCKED_SITES].join("\n") : "";
  }

  document.getElementById("save-sites")?.addEventListener("click", async () => {
    const lines = LockerUtils.sitesFromTextarea(sitesTa?.value);
    try {
      await LockerStorage.setSettings({ [k.LOCKED_SITES]: lines });
      setStatus("Site list saved.", "ok");
    } catch {
      setStatus("Could not save site list.", "error");
    }
  });
}
