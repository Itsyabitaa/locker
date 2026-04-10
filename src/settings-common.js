"use strict";

const LockerSettingsCommon = {
  MIN_LEN: 4,

  validatePair(newPin, confirm) {
    if (newPin.length < LockerSettingsCommon.MIN_LEN) {
      return `PIN must be at least ${LockerSettingsCommon.MIN_LEN} characters.`;
    }
    if (newPin !== confirm) return "PINs do not match.";
    return null;
  },

  sitesFromTextarea(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  },
};
