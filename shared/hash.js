"use strict";

async function lockerSha256Hex(plain) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(plain));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function lockerTimingSafeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** @param {string} pin @param {string} storedHashHex */
async function lockerComparePinHash(pin, storedHashHex) {
  const h = await lockerSha256Hex(pin);
  return lockerTimingSafeEqualHex(h, storedHashHex);
}

var LockerHash = {
  sha256Hex: lockerSha256Hex,
  timingSafeEqualHex: lockerTimingSafeEqualHex,
  comparePinHash: lockerComparePinHash,
};
