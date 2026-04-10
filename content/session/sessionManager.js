"use strict";

var LockerSession = {
  clearTabSessionUnlock() {
    try {
      sessionStorage.removeItem(LockerConstants.SESSION_UNLOCK_KEY);
    } catch (_) {}
  },

  setTabSessionUnlock() {
    try {
      sessionStorage.setItem(LockerConstants.SESSION_UNLOCK_KEY, "1");
    } catch (_) {}
  },

  isTabSessionUnlocked() {
    try {
      return sessionStorage.getItem(LockerConstants.SESSION_UNLOCK_KEY) === "1";
    } catch (_) {
      return false;
    }
  },
};
