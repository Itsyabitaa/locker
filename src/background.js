"use strict";

const BROADCAST_KEYS = [
  "globalLock",
  "lockedSites",
  "locked",
  "pinHash",
  "autoLockEnabled",
  "inactivityMinutes",
];

function broadcastCheckLock() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { action: "CHECK_LOCK" }).catch(() => {});
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!BROADCAST_KEYS.some((k) => changes[k])) return;
  broadcastCheckLock();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "quick-lock") return;
  const ts = Date.now();
  chrome.storage.local.set({ quickLockAt: ts });
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { action: "FORCE_LOCK", ts }).catch(() => {});
    }
  });
});
