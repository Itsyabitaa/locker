"use strict";

var LockerButton = {
  /** @param {HTMLElement | null} el */
  primary(el) {
    if (!el) return;
    el.classList.add("locker-btn", "locker-btn-primary");
  },

  /** @param {HTMLElement | null} el */
  secondary(el) {
    if (!el) return;
    el.classList.add("locker-btn", "locker-btn-secondary");
  },
};
