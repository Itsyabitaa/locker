"use strict";

var LockerInput = {
  /** @param {HTMLInputElement | null} el */
  passwordValue(el) {
    return String(el?.value ?? "");
  },

  /** @param {HTMLInputElement | null} el */
  clear(el) {
    if (el) el.value = "";
  },
};
