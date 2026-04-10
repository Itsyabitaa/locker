"use strict";

var LockerToggle = {
  /**
   * @param {HTMLInputElement | null} el
   * @param {(checked: boolean) => void} onChange
   */
  onChange(el, onChange) {
    if (!el) return;
    el.addEventListener("change", () => onChange(el.checked));
  },
};
