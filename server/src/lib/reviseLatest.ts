import { sql } from "./db.js";

const WINDOW_DAYS = 4; // today + the previous 3 days

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Same UTC day boundary as the rest of the app's "what counts as today" logic (see stats.ts) —
// keeps the revision window aligned with LeetCode's own reset.
function utcDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/** The 1-2 most-practiced topics across the last few days of attempts, for a rolling daily revision test. */
export async function latestTopics(): Promise<{ topics: string[]; poolSize: number; windowStart: string }> {
  const windowStart = utcDaysAgo(WINDOW_DAYS - 1);
  const rows = await sql`
    SELECT DISTINCT q.* FROM attempts a
    JOIN questions q ON q.id = a.question_id
    WHERE a.date >= ${windowStart}
  `;

  const topicCounts = new Map<string, number>();
  for (const q of rows) {
    for (const t of JSON.parse(q.topics ?? "[]")) {
      topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
    }
  }

  const topics = [...topicCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t);

  return { topics, poolSize: rows.length, windowStart };
}

/** Builds a short test scoped to the topics practiced most in the last few days — a quick daily
 *  refresher rather than the calendar-scheduled Milestone Exams. */
export async function generateReviseLatestTest() {
  const { topics } = await latestTopics();
  if (topics.length === 0) {
    throw new Error("Not enough recent activity yet — solve a couple of questions first");
  }

  const allQuestions = await sql`SELECT * FROM questions`;
  const pool = allQuestions.filter((q: any) => {
    const qTopics: string[] = JSON.parse(q.topics ?? "[]");
    return qTopics.some((t) => topics.includes(t));
  });
  if (!pool.length) throw new Error("No tracked questions match your recent topics yet");

  const targetSize = Math.min(8, pool.length);
  const selected = shuffle(pool).slice(0, targetSize);

  const config = { count: selected.length, source: "revise-latest", topics };
  const [session] = await sql`INSERT INTO test_sessions (config) VALUES (${JSON.stringify(config)}) RETURNING *`;

  for (let idx = 0; idx < selected.length; idx++) {
    await sql`INSERT INTO test_session_questions (session_id, question_id, order_index) VALUES (${session.id}, ${selected[idx].id}, ${idx})`;
  }

  const sessionQuestions = selected.map((q: any, idx: number) => ({
    order_index: idx,
    question: {
      id: q.id,
      number: q.number,
      title: q.title,
      difficulty: q.difficulty,
      topics: JSON.parse(q.topics ?? "[]"),
      leetcode_url: q.leetcode_url,
    },
  }));

  return { session: { id: session.id, config, questions: sessionQuestions } };
}
