import { Router } from "express";
import { db } from "../lib/db.js";
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
testsRouter.post("/", (req, res) => {
  const count = Number(req.body.count ?? 10);
  const difficulties: string[] | undefined = req.body.difficulties;
  const topics: string[] | undefined = req.body.topics;
  const source: "due" | "overdue" | "all" = req.body.source ?? "due";
  const perQuestionSec = req.body.perQuestionSec ?? null;
  const totalSec = req.body.totalSec ?? null;

  const questions = db.prepare("SELECT * FROM questions").all() as any[];
  const attempts = db.prepare("SELECT * FROM attempts ORDER BY date ASC").all() as any[];
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
  const sessionInfo = db.prepare(`INSERT INTO test_sessions (config) VALUES (?)`).run(JSON.stringify(config));
  const sessionId = sessionInfo.lastInsertRowid;

  const insertSQ = db.prepare(
    `INSERT INTO test_session_questions (session_id, question_id, order_index) VALUES (?, ?, ?)`
  );
  selected.forEach((q, idx) => insertSQ.run(sessionId, q.id, idx));

  const sessionQuestions = selected.map((q, idx) => ({
    order_index: idx,
    question: { id: q.id, number: q.number, title: q.title, difficulty: q.difficulty, topics: JSON.parse(q.topics ?? "[]"), leetcode_url: q.leetcode_url },
  }));

  res.status(201).json({ session: { id: sessionId, config, questions: sessionQuestions } });
});

// GET /api/tests -> list past sessions with summary stats
testsRouter.get("/", (_req, res) => {
  const sessions = db.prepare("SELECT * FROM test_sessions ORDER BY started_at DESC").all() as any[];
  const list = sessions.map((s) => {
    const { summary } = buildResults(String(s.id));
    return { ...s, summary };
  });
  res.json({ sessions: list });
});

// PATCH /api/tests/:id/questions/:qid { result, time_spent_sec }
testsRouter.patch("/:id/questions/:qid", (req, res) => {
  const { result, time_spent_sec } = req.body;
  const info = db
    .prepare(
      `UPDATE test_session_questions SET result = ?, time_spent_sec = ?, answered_at = datetime('now')
       WHERE session_id = ? AND question_id = ?`
    )
    .run(result, time_spent_sec ?? null, req.params.id, req.params.qid);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

// POST /api/tests/:id/finish
testsRouter.post("/:id/finish", (req, res) => {
  const session: any = db.prepare("SELECT * FROM test_sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });

  db.prepare("UPDATE test_sessions SET ended_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json(buildResults(req.params.id));
});

// GET /api/tests/:id
testsRouter.get("/:id", (req, res) => {
  const session = db.prepare("SELECT * FROM test_sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "Not found" });
  res.json(buildResults(req.params.id));
});

// DELETE /api/tests/:id
testsRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM test_sessions WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

function buildResults(sessionId: string) {
  const session: any = db.prepare("SELECT * FROM test_sessions WHERE id = ?").get(sessionId);
  const rows = db
    .prepare(
      `SELECT tsq.*, q.number, q.title, q.difficulty, q.topics, q.leetcode_url
       FROM test_session_questions tsq
       JOIN questions q ON q.id = tsq.question_id
       WHERE tsq.session_id = ?
       ORDER BY tsq.order_index ASC`
    )
    .all(sessionId) as any[];

  const items = rows.map((r) => ({ ...r, topics: JSON.parse(r.topics ?? "[]") }));

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
    summary: { score, accuracy, totalQuestions: items.length, answeredCount: answered.length, correctCount: correct.length, avgTimeSec, byTopic, byDifficulty },
  };
}
