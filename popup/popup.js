"use strict";

document.getElementById("open-settings")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
