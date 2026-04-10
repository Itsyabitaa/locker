"use strict";

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (
    !changes.globalLock &&
    !changes.lockedSites &&
    !changes.locked &&
    !changes.pinHash
  ) {
    return;
  }
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { action: "CHECK_LOCK" }).catch(() => {});
    }
  });
});
