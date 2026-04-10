"use strict";

var LockerUtils = {
  validatePinPair(newPin, confirm) {
    const min = LockerConstants.PIN_MIN_LEN;
    if (newPin.length < min) {
      return `PIN must be at least ${min} characters.`;
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
