// InstaAudit followers scan — read-only: lists every account that follows you.
// Paste into the DevTools console on https://www.instagram.com while logged in.
// Output is JSON for InstaAudit: one entry per follower with its username, its
// stable account id (which is what lets InstaAudit spot a changed @handle) and
// its display name. When it finishes, a small box appears on the page with
// "Copy" and "Download" buttons.
// It never follows, unfollows, or posts anything.
(async () => {
  const log = (...args) => console.log("[InstaAudit]", ...args);

/* @@SCAN_CORE@@ */

  if (location.hostname !== "www.instagram.com") {
    console.error("Run this on https://www.instagram.com while logged in.");
    return;
  }
  const userId = cookie("ds_user_id");
  if (!userId) {
    console.error("Couldn't find your user ID cookie (ds_user_id). Are you logged in?");
    return;
  }

  log("Loading followers...");
  const followers = await scanFollowers(userId);
  const json = JSON.stringify(followers);
  const withIds = followers.filter((f) => f.id).length;

  window.igFollowers = followers;
  window.igFollowers.downloadJson = () => downloadFollowers(followers);

  log(`Done. ${followers.length} followers (${withIds} with an account id).`);
  if (withIds < followers.length) {
    console.warn("Some entries have no account id, so InstaAudit can't detect renames for them.");
  }

  // The console can't write to the clipboard while DevTools has focus, so the copy happens
  // from a button on the page instead.
  document.getElementById("instaaudit-box")?.remove();
  const box = document.createElement("div");
  box.id = "instaaudit-box";
  Object.assign(box.style, {
    position: "fixed", top: "16px", right: "16px", zIndex: "2147483647",
    background: "#fff", color: "#111", border: "1px solid #ccc", borderRadius: "10px",
    boxShadow: "0 4px 20px rgba(0,0,0,.25)", padding: "12px 14px",
    font: "14px system-ui, sans-serif", display: "flex", alignItems: "center", gap: "8px",
  });
  const label = document.createElement("span");
  label.textContent = `InstaAudit: ${followers.length} followers`;
  const button = (text, onClick) => {
    const b = document.createElement("button");
    b.textContent = text;
    Object.assign(b.style, {
      font: "inherit", padding: "5px 10px", borderRadius: "6px", border: "1px solid #999",
      background: "#f3f3f3", color: "#111", cursor: "pointer",
    });
    b.addEventListener("click", onClick);
    return b;
  };
  const copyButton = button("Copy", async () => {
    try {
      await navigator.clipboard.writeText(json);
      copyButton.textContent = "Copied";
    } catch {
      copyButton.textContent = "Copy failed — use Download";
    }
  });
  box.append(
    label,
    copyButton,
    button("Download", () => downloadFollowers(followers)),
    button("✕", () => box.remove()),
  );
  document.body.appendChild(box);
  log('Use the "Copy" or "Download" button in the box at the top right of the page.');
})().catch((e) =>
  console.error((e.message || e) + "\nPaste this error back to get the script fixed."),
);
