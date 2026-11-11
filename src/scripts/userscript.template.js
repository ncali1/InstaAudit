// ==UserScript==
// @name         InstaAudit weekly followers export
// @namespace    instaaudit
// @version      1.1.0
// @description  Once every 7 days, when you open instagram.com, saves your followers list as a file for InstaAudit. Read-only: it never follows, unfollows or posts.
// @match        https://www.instagram.com/*
// @run-at       document-idle
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(() => {
  "use strict";

  const SCHEDULE = {
    intervalDays: 7,            // scan again once the last successful scan is this old
    retryAfterMs: 60 * 60000,   // after a failed or interrupted scan, wait this long before retrying
    startDelayMs: [4000, 9000], // let the page settle before starting
  };

  const log = (...args) => console.log("[InstaAudit]", ...args);

/* @@SCAN_CORE@@ */

  // Scan times are kept per Instagram account, in Tampermonkey's own storage, so clearing
  // Instagram's site data doesn't reset the schedule.
  const stateKey = (userId) => `state:${userId}`;
  const readState = (userId) => GM_getValue(stateKey(userId), {});
  const writeState = (userId, patch) =>
    GM_setValue(stateKey(userId), { ...readState(userId), ...patch });

  function toast(text) {
    const box = document.createElement("div");
    Object.assign(box.style, {
      position: "fixed", bottom: "16px", right: "16px", zIndex: "2147483647",
      background: "#16161c", color: "#fff", borderRadius: "10px", padding: "10px 14px",
      font: "13px system-ui, sans-serif", boxShadow: "0 4px 20px rgba(0,0,0,.3)",
    });
    box.textContent = text;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 8000);
  }

  let running = false;

  async function run({ manual }) {
    const userId = cookie("ds_user_id");
    if (!userId) {
      if (manual) toast("InstaAudit: log in to Instagram first.");
      return;
    }
    if (running) return;

    if (!manual) {
      const { lastSuccess = 0, lastAttempt = 0 } = readState(userId);
      const now = Date.now();
      if (now - lastSuccess < SCHEDULE.intervalDays * 86400000) return;
      // Also covers a second Instagram tab opened while the first is still scanning.
      if (now - lastAttempt < SCHEDULE.retryAfterMs) return;
    }

    running = true;
    writeState(userId, { lastAttempt: Date.now() });
    try {
      log("Scanning followers...");
      const followers = await scanFollowers(userId);
      downloadFollowers(followers);
      writeState(userId, { lastSuccess: Date.now() });
      log(`Saved ${followers.length} followers.`);
      toast(`InstaAudit: saved ${followers.length.toLocaleString()} followers to your Downloads.`);
    } catch (err) {
      log("Scan failed:", err?.message || err);
      if (manual) toast(`InstaAudit: scan failed — ${err?.message || err}`);
    } finally {
      running = false;
    }
  }

  GM_registerMenuCommand("Scan followers now", () => run({ manual: true }));
  setTimeout(() => run({ manual: false }), rand(SCHEDULE.startDelayMs));
})();
