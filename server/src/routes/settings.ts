import { Router } from "express";
import { db } from "../lib/db.js";

export const settingsRouter = Router();

// GET /api/settings/:key
settingsRouter.get("/:key", (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(req.params.key) as
    | { value: string }
    | undefined;
  res.json({ value: row?.value ?? null });
});

// PUT /api/settings/:key { value }
settingsRouter.put("/:key", (req, res) => {
  const value = String(req.body.value ?? "");
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    req.params.key,
    value
  );
  res.json({ value });
});
