import { Router } from "express";
import { fetchUserProfile } from "../lib/leetcode.js";

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
