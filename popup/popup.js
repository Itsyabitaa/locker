"use strict";

const k = LockerConstants.STORAGE_KEYS;

function setPopupStatus(lockingEnabled) {
  const textEl = document.getElementById("popup-status-text");
  const dot = document.getElementById("popup-status-dot");
  if (textEl) {
    textEl.textContent = lockingEnabled ? "Locking: enabled" : "Locking: disabled";
  }
  if (dot) {
    dot.classList.toggle("on", lockingEnabled);
    dot.classList.toggle("off", !lockingEnabled);
  }
}

async function refreshStatus() {
  const data = await chrome.storage.local.get(k.LOCKED);
  setPopupStatus(data[k.LOCKED] !== false);
}

document.getElementById("btn-lock-now")?.addEventListener("click", async () => {
  try {
    await chrome.storage.local.set({ [k.QUICK_LOCK]: Date.now() });
  } catch {
    /* ignore */
  }
});

document.getElementById("btn-unlock")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById("open-settings")?.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[k.LOCKED]) refreshStatus();
});

void refreshStatus();
