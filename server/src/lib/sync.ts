import { sql } from "./db.js";
import { fetchUserProfile } from "./leetcode.js";
import { findOrCreateQuestion } from "./enrichment.js";

const THROTTLE_MS = 5 * 60 * 1000;

export type SyncResult = { synced: number; skipped: number; username: string | null; throttled: boolean };

/** Pulls the saved LeetCode user's recent accepted submissions and auto-logs any not already tracked. */
export async function syncRecentSubmissions(force = false): Promise<SyncResult> {
  const [usernameRow] = await sql`SELECT value FROM settings WHERE key = 'leetcode_username'`;
  const username = usernameRow?.value ?? null;
  if (!username) return { synced: 0, skipped: 0, username: null, throttled: false };

  if (!force) {
    const [lastSyncRow] = await sql`SELECT value FROM settings WHERE key = 'leetcode_last_synced_at'`;
    if (lastSyncRow && Date.now() - new Date(lastSyncRow.value).getTime() < THROTTLE_MS) {
      return { synced: 0, skipped: 0, username, throttled: true };
    }
  }

  const profile = await fetchUserProfile(username);
  let synced = 0;
  let skipped = 0;

  for (const sub of profile.recentSubmissions) {
    if (sub.number === null) continue;
    try {
      const question = await findOrCreateQuestion(sub.number);
      const [duplicate] = await sql`SELECT id FROM attempts WHERE question_id = ${question.id} AND date = ${sub.date}`;
      if (duplicate) {
        skipped++;
        continue;
      }
      await sql`INSERT INTO attempts (question_id, date, confidence, source) VALUES (${question.id}, ${sub.date}, 3, 'auto')`;
      synced++;
    } catch (err) {
      console.warn(`Auto-sync failed for #${sub.number}:`, (err as Error).message);
    }
  }

  await sql`
    INSERT INTO settings (key, value) VALUES ('leetcode_last_synced_at', ${new Date().toISOString()})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `;

  return { synced, skipped, username, throttled: false };
}
