"use strict";

/**
 * Strip leading www. Hostnames are compared case-insensitively.
 * @param {string} hostname
 * @returns {string}
 */
function lockerNormalizeHostname(hostname) {
  if (!hostname || typeof hostname !== "string") return "";
  return hostname.replace(/^www\./i, "").toLowerCase();
}

/**
 * @param {string} currentHost normalized hostname
 * @param {string[]} lockedSitesNormalized each entry normalized
 * @returns {boolean}
 */
function lockerIsDomainMatch(currentHost, lockedSitesNormalized) {
  if (!currentHost) return false;
  return lockedSitesNormalized.some((site) => {
    if (!site) return false;
    return currentHost === site || currentHost.endsWith("." + site);
  });
}

/**
 * Core decision: global lock wins; else list-based match.
 * @param {{ globalLock: boolean, lockedSites: string[], currentHost: string }} args
 *   currentHost must already be normalized.
 */
function lockerShouldLock({ globalLock, lockedSites, currentHost }) {
  if (globalLock) return true;
  if (!lockedSites || lockedSites.length === 0) return false;
  return lockerIsDomainMatch(currentHost, lockedSites);
}

/**
 * Normalize an array of site strings from storage (each may include www or junk).
 * @param {unknown} raw
 * @returns {string[]}
 */
function lockerNormalizeLockedSitesList(raw) {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((s) => lockerNormalizeHostname(String(s).trim())).filter(Boolean);
}
