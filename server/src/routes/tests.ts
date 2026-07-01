import { Router } from "express";
import { sql, nowText } from "../lib/db.js";
import { computeQuestionState } from "../lib/review.js";

export const testsRouter = Router();

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIFFICULTY_WEIGHT: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };

// POST /api/tests { count, difficulties?, topics?, source, perQuestionSec?, totalSec? }
testsRouter.post("/", async (req, res) => {
  const count = Number(req.body.count ?? 10);
  const difficulties: string[] | undefined = req.body.difficulties;
  const topics: string[] | undefined = req.body.topics;
  const source: "due" | "overdue" | "all" = req.body.source ?? "due";
  const perQuestionSec = req.body.perQuestionSec ?? null;
  const totalSec = req.body.totalSec ?? null;

  const questions = await sql`SELECT * FROM questions`;
  const attempts = await sql`SELECT * FROM attempts ORDER BY date ASC`;
  const byQuestion = new Map<number, any[]>();
  for (const a of attempts) {
    if (!byQuestion.has(a.question_id)) byQuestion.set(a.question_id, []);
    byQuestion.get(a.question_id)!.push(a);
  }

  let pool = questions.filter((q) => {
    const qAttempts = byQuestion.get(q.id) ?? [];
    if (!qAttempts.length) return false;
    if (source === "all") return true;
    const state = computeQuestionState(qAttempts.map((a) => ({ date: a.date, confidence: a.confidence })));
    if (source === "overdue") return state.isDue && state.daysOverdue > 0;
    return state.isDue;
  });

  if (difficulties?.length) pool = pool.filter((q) => difficulties.includes(q.difficulty));
  if (topics?.length) {
    pool = pool.filter((q) => {
      const qTopics: string[] = JSON.parse(q.topics ?? "[]");
      return qTopics.some((t) => topics.includes(t));
    });
  }

  const selected = shuffle(pool).slice(0, count);
  if (!selected.length) return res.status(400).json({ error: "No questions match this test configuration" });

  const config = { count, difficulties, topics, source, perQuestionSec, totalSec };
  const [session] = await sql`INSERT INTO test_sessions (config) VALUES (${JSON.stringify(config)}) RETURNING id`;
  const sessionId = session.id;

  for (let idx = 0; idx < selected.length; idx++) {
    await sql`INSERT INTO test_session_questions (session_id, question_id, order_index) VALUES (${sessionId}, ${selected[idx].id}, ${idx})`;
  }

  const sessionQuestions = selected.map((q, idx) => ({
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

  res.status(201).json({ session: { id: sessionId, config, questions: sessionQuestions } });
});

// GET /api/tests -> list past sessions with summary stats
testsRouter.get("/", async (_req, res) => {
  const sessions = await sql`SELECT * FROM test_sessions ORDER BY started_at DESC`;
  const list = [];
  for (const s of sessions) {
    const { summary } = await buildResults(s.id);
    list.push({ ...s, summary });
  }
  res.json({ sessions: list });
});

// PATCH /api/tests/:id/questions/:qid { result, time_spent_sec }
testsRouter.patch("/:id/questions/:qid", async (req, res) => {
  const { result, time_spent_sec } = req.body;
  const updated = await sql`
    UPDATE test_session_questions SET result = ${result}, time_spent_sec = ${time_spent_sec ?? null}, answered_at = ${nowText()}
    WHERE session_id = ${req.params.id} AND question_id = ${req.params.qid}
    RETURNING id
  `;
  if (updated.length === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// POST /api/tests/:id/finish
testsRouter.post("/:id/finish", async (req, res) => {
  const [session] = await sql`SELECT * FROM test_sessions WHERE id = ${req.params.id}`;
  if (!session) return res.status(404).json({ error: "Not found" });

  await sql`UPDATE test_sessions SET ended_at = ${nowText()} WHERE id = ${req.params.id}`;
  res.json(await buildResults(req.params.id));
});

// GET /api/tests/:id
testsRouter.get("/:id", async (req, res) => {
  const [session] = await sql`SELECT * FROM test_sessions WHERE id = ${req.params.id}`;
  if (!session) return res.status(404).json({ error: "Not found" });
  res.json(await buildResults(req.params.id));
});

// DELETE /api/tests/:id
testsRouter.delete("/:id", async (req, res) => {
  const deleted = await sql`DELETE FROM test_sessions WHERE id = ${req.params.id} RETURNING id`;
  if (deleted.length === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

async function buildResults(sessionId: string | number) {
  const [session] = await sql`SELECT * FROM test_sessions WHERE id = ${sessionId}`;
  const rows = await sql`
    SELECT tsq.*, q.number, q.title, q.difficulty, q.topics, q.leetcode_url
    FROM test_session_questions tsq
    JOIN questions q ON q.id = tsq.question_id
    WHERE tsq.session_id = ${sessionId}
    ORDER BY tsq.order_index ASC
  `;

  const items = (rows as any[]).map((r) => ({ ...r, topics: JSON.parse(r.topics ?? "[]") }));

  const answered = items.filter((i) => i.result);
  const correct = items.filter((i) => i.result === "correct");
  const totalWeight = items.reduce((s, i) => s + (DIFFICULTY_WEIGHT[i.difficulty] ?? 1), 0);
  const earnedWeight = correct.reduce((s, i) => s + (DIFFICULTY_WEIGHT[i.difficulty] ?? 1), 0);
  const accuracy = answered.length ? correct.length / answered.length : 0;
  const score = totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  const byTopic: Record<string, { total: number; correct: number }> = {};
  const byDifficulty: Record<string, { total: number; correct: number }> = {};
  for (const i of items) {
    for (const t of i.topics) {
      byTopic[t] ??= { total: 0, correct: 0 };
      byTopic[t].total++;
      if (i.result === "correct") byTopic[t].correct++;
    }
    byDifficulty[i.difficulty] ??= { total: 0, correct: 0 };
    byDifficulty[i.difficulty].total++;
    if (i.result === "correct") byDifficulty[i.difficulty].correct++;
  }

  const avgTimeSec = answered.length
    ? Math.round(answered.reduce((s, i) => s + (i.time_spent_sec ?? 0), 0) / answered.length)
    : 0;

  return {
    session,
    items,
    summary: {
      score,
      accuracy,
      totalQuestions: items.length,
      answeredCount: answered.length,
      correctCount: correct.length,
      avgTimeSec,
      byTopic,
      byDifficulty,
    },
  };
}
