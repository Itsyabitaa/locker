"use strict";

function setStatus(msg, kind) {
  const el = document.getElementById("status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("error", "ok");
  if (kind) el.classList.add(kind);
}

function onPinSaved() {
  document.getElementById("set-form")?.classList.add("hidden");
  document.getElementById("change-form")?.classList.remove("hidden");
  document.getElementById("new-pin-ch")?.focus();
}

async function loadAndBind() {
  const data = await LockerStorage.getSettings();
  const ctx = { setStatus, data, onPinSaved };

  initLockerGeneralSettings(ctx);
  initLockerSiteManager(ctx);
  initLockerSecuritySettings(ctx);
  initLockerAutoLockSettings(ctx);
}

loadAndBind();
