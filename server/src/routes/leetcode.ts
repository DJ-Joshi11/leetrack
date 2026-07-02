import { Router } from "express";
import { fetchUserProfile } from "../lib/leetcode.js";
import { syncRecentSubmissions } from "../lib/sync.js";

export const leetcodeRouter = Router();

// GET /api/leetcode/profile?username=xxx
leetcodeRouter.get("/profile", async (req, res) => {
  const username = String(req.query.username ?? "").trim();
  if (!username) return res.status(400).json({ error: "username is required" });

  try {
    const profile = await fetchUserProfile(username);
    res.json({ profile });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// POST /api/leetcode/sync { force? } -> auto-log any new accepted submissions since the last sync
// (throttled to once/5min unless force is set, e.g. from a manual "Sync now" click)
leetcodeRouter.post("/sync", async (req, res) => {
  try {
    const result = await syncRecentSubmissions(!!req.body?.force);
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
