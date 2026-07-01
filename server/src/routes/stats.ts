import { Router } from "express";
import { db } from "../lib/db.js";
import { computeQuestionState } from "../lib/review.js";

export const statsRouter = Router();

// GET /api/stats/overview -> totals, streak, due counts
statsRouter.get("/overview", (_req, res) => {
  const totalQuestions = (db.prepare("SELECT COUNT(*) as c FROM questions").get() as any).c;
  const totalAttempts = (db.prepare("SELECT COUNT(*) as c FROM attempts").get() as any).c;

  const attemptDates = (db.prepare("SELECT DISTINCT date FROM attempts ORDER BY date DESC").all() as any[]).map(
    (r) => r.date
  );
  let streak = 0;
  let cursor = new Date();
  for (const dateStr of attemptDates) {
    const d = new Date(dateStr);
    const diff = Math.floor((cursor.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff <= 1) {
      streak++;
      cursor = d;
    } else {
      break;
    }
  }

  const questions = db.prepare("SELECT * FROM questions").all() as any[];
  const attempts = db.prepare("SELECT * FROM attempts ORDER BY date ASC").all() as any[];
  const byQuestion = new Map<number, any[]>();
  for (const a of attempts) {
    if (!byQuestion.has(a.question_id)) byQuestion.set(a.question_id, []);
    byQuestion.get(a.question_id)!.push(a);
  }
  let dueCount = 0;
  for (const q of questions) {
    const qAttempts = byQuestion.get(q.id) ?? [];
    if (!qAttempts.length) continue;
    const state = computeQuestionState(qAttempts.map((a) => ({ date: a.date, confidence: a.confidence })));
    if (state.isDue) dueCount++;
  }

  res.json({ totalQuestions, totalAttempts, streak, dueCount });
});

// GET /api/stats/activity -> trailing-365-day attempt counts by date (heatmap fallback when no LeetCode username is set)
statsRouter.get("/activity", (_req, res) => {
  const rows = db.prepare("SELECT date, COUNT(*) as count FROM attempts GROUP BY date").all() as Array<{
    date: string;
    count: number;
  }>;
  const byDate = new Map(rows.map((r) => [r.date, r.count]));

  const now = new Date();
  const calendar: Array<{ date: string; count: number }> = [];
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    calendar.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }

  res.json({ calendar });
});

// GET /api/stats/weak-topics -> accuracy aggregated by topic from test history
statsRouter.get("/weak-topics", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT tsq.result, q.topics, q.difficulty
       FROM test_session_questions tsq
       JOIN questions q ON q.id = tsq.question_id
       WHERE tsq.result IS NOT NULL`
    )
    .all() as any[];

  const byTopic: Record<string, { total: number; correct: number }> = {};
  for (const r of rows) {
    const topics: string[] = JSON.parse(r.topics ?? "[]");
    for (const t of topics) {
      byTopic[t] ??= { total: 0, correct: 0 };
      byTopic[t].total++;
      if (r.result === "correct") byTopic[t].correct++;
    }
  }

  const ranked = Object.entries(byTopic)
    .map(([topic, v]) => ({ topic, total: v.total, correct: v.correct, accuracy: v.correct / v.total }))
    .sort((a, b) => a.accuracy - b.accuracy);

  res.json({ topics: ranked });
});
