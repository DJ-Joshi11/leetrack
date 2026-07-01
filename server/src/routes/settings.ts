import { Router } from "express";
import { sql } from "../lib/db.js";

export const settingsRouter = Router();

// GET /api/settings/:key
settingsRouter.get("/:key", async (req, res) => {
  const [row] = await sql`SELECT value FROM settings WHERE key = ${req.params.key}`;
  res.json({ value: row?.value ?? null });
});

// PUT /api/settings/:key { value }
settingsRouter.put("/:key", async (req, res) => {
  const value = String(req.body.value ?? "");
  await sql`
    INSERT INTO settings (key, value) VALUES (${req.params.key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `;
  res.json({ value });
});
