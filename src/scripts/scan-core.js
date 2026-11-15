  // ---- scan core -------------------------------------------------------------------------
  // Shared by the console script and the userscript: the build pastes this file into both
  // (see the insta-scripts plugin in vite.config.ts). It expects a `log` function to exist.
  // If a scan breaks after an Instagram change, the parts most likely to need updating are
  // in SCAN (endpoint URL and the two header IDs).
  const SCAN = {
    appId: "936619743392459",   // x-ig-app-id the web app sends
    asbdId: "129477",           // x-asbd-id the web app sends
    pageSize: 50,               // users requested per page (Instagram may send fewer)
    delayMs: [1000, 1800],      // random pause between pages
    longPauseEvery: 15,         // take a longer break every N requests
    longPauseMs: 10000,
    maxPages: 2000,             // safety cap
    url: (userId, maxId) =>
      `https://www.instagram.com/api/v1/friendships/${userId}/followers/?count=${SCAN.pageSize}` +
      (maxId ? `&max_id=${encodeURIComponent(maxId)}` : ""),
  };

  const cookie = (name) => {
    const prefix = name + "=";
    const pair = document.cookie.split("; ").find((c) => c.startsWith(prefix));
    return pair ? decodeURIComponent(pair.slice(prefix.length)) : null;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = ([a, b]) => a + Math.random() * (b - a);

  async function fetchPage(userId, maxId) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await fetch(SCAN.url(userId, maxId), {
        credentials: "same-origin",
        headers: {
          "X-IG-App-ID": SCAN.appId,
          "X-ASBD-ID": SCAN.asbdId,
          "X-CSRFToken": cookie("csrftoken") || "",
          "X-Requested-With": "XMLHttpRequest",
          Accept: "*/*",
        },
      });
      const data = await res.json().catch(() => null);
      const throttled =
        res.status === 429 || /please wait|rate limit|feedback_required/i.test(data?.message || "");
      if (res.ok && data && Array.isArray(data.users)) return data;
      if (throttled && attempt < 4) {
        const wait = 30000 * attempt;
        log(`Instagram asked to slow down. Waiting ${wait / 1000}s (attempt ${attempt}/3)...`);
        await sleep(wait);
        continue;
      }
      throw new Error(
        `followers request failed: HTTP ${res.status}` + (data?.message ? ` — ${data.message}` : ""),
      );
    }
  }

  /** Returns every follower as { username, id, full_name }, sorted by username, or throws.
   *  A partial list is never returned: a short list would make InstaAudit report everyone it
   *  missed as gone. */
  async function scanFollowers(userId) {
    const byUsername = new Map();
    let maxId;
    for (let page = 0; page < SCAN.maxPages; page++) {
      const data = await fetchPage(userId, maxId);
      for (const u of data.users) {
        if (!u.username || byUsername.has(u.username)) continue;
        const entry = { username: u.username };
        // pk_id is the id as a string; pk can be a number, so prefer the string form.
        const id = u.pk_id ?? u.pk ?? u.id;
        if (id !== undefined && id !== null && String(id) !== "") entry.id = String(id);
        if (u.full_name) entry.full_name = u.full_name;
        byUsername.set(u.username, entry);
      }
      log(`${byUsername.size} loaded`);
      if (!data.next_max_id || data.has_more === false || data.users.length === 0) {
        return [...byUsername.values()].sort((a, b) => a.username.localeCompare(b.username));
      }
      maxId = data.next_max_id;
      await sleep(rand(SCAN.delayMs));
      if ((page + 1) % SCAN.longPauseEvery === 0) {
        log(`pausing ${SCAN.longPauseMs / 1000}s to stay under rate limits...`);
        await sleep(SCAN.longPauseMs);
      }
    }
    throw new Error(`stopped at the ${SCAN.maxPages}-page safety cap before reaching the end`);
  }

  function downloadFollowers(followers) {
    const blob = new Blob([JSON.stringify(followers)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `instagram-followers-${new Date().toLocaleDateString("en-CA")}.json`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // ---- end of scan core ------------------------------------------------------------------
