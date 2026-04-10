"use strict";

var LockerModal = {
  /**
   * @param {HTMLElement} root
   * @param {(e: KeyboardEvent) => void} onEscape
   */
  bindEscape(root, onEscape) {
    function handler(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape(e);
      }
    }
    document.addEventListener("keydown", handler, true);
    return function unbind() {
      document.removeEventListener("keydown", handler, true);
    };
  },

  /**
   * @param {HTMLElement} el
   */
  remove(el) {
    el?.remove();
  },
};
