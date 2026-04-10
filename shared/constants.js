"use strict";

var LockerConstants = {
  LOCK_ROOT_ID: "__locker_root__",
  LOCKED_CLASS: "__locker_locked__",

  STORAGE_KEYS: {
    PIN: "pinHash",
    LOCKED: "locked",
    GLOBAL_LOCK: "globalLock",
    LOCKED_SITES: "lockedSites",
    AUTO_LOCK: "autoLockEnabled",
    INACTIVITY_MIN: "inactivityMinutes",
    QUICK_LOCK: "quickLockAt",
  },

  /** Keys that trigger CHECK_LOCK broadcast from background */
  BROADCAST_KEYS: [
    "globalLock",
    "lockedSites",
    "locked",
    "pinHash",
    "autoLockEnabled",
    "inactivityMinutes",
  ],

  LockerEvents: {
    CHECK_LOCK: "CHECK_LOCK",
    FORCE_LOCK: "FORCE_LOCK",
  },

  SESSION_UNLOCK_KEY: "locker_tab_unlocked_v1",

  PIN_MIN_LEN: 4,
  MAX_PIN_ATTEMPTS: 5,
  LOCKOUT_MS: 60 * 1000,
  ACTIVITY_THROTTLE_MS: 500,
  DEFAULT_INACTIVITY_MIN: 2,
};
