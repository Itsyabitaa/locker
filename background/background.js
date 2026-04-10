"use strict";

importScripts("../shared/constants.js");

function broadcastCheckLock() {
  const ev = LockerConstants.LockerEvents.CHECK_LOCK;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { action: ev }).catch(() => {});
    }
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!LockerConstants.BROADCAST_KEYS.some((k) => changes[k])) return;
  broadcastCheckLock();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "quick-lock") return;
  const ts = Date.now();
  const qk = LockerConstants.STORAGE_KEYS.QUICK_LOCK;
  chrome.storage.local.set({ [qk]: ts });
  const ev = LockerConstants.LockerEvents.FORCE_LOCK;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { action: ev, ts }).catch(() => {});
    }
  });
});
