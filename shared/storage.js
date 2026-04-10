"use strict";

var LockerStorage = {
  /** @returns {Promise<Record<string, unknown>>} */
  getSettings() {
    const k = LockerConstants.STORAGE_KEYS;
    return chrome.storage.local.get([
      k.PIN,
      k.LOCKED,
      k.GLOBAL_LOCK,
      k.LOCKED_SITES,
      k.AUTO_LOCK,
      k.INACTIVITY_MIN,
    ]);
  },

  /** @param {Record<string, unknown>} patch */
  setSettings(patch) {
    return chrome.storage.local.set(patch);
  },
};
