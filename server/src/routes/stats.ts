import { Router } from "express";
import { sql } from "../lib/db.js";
import { computeQuestionState } from "../lib/review.js";

export const statsRouter = Router();

// GET /api/stats/overview -> totals, streak, due counts
statsRouter.get("/overview", async (_req, res) => {
  const [{ c: totalQuestions }] = await sql`SELECT COUNT(*)::int as c FROM questions`;
  const [{ c: totalAttempts }] = await sql`SELECT COUNT(*)::int as c FROM attempts`;

  const attemptDateRows = await sql`SELECT DISTINCT date FROM attempts ORDER BY date DESC`;
  const attemptDates = attemptDateRows.map((r) => r.date);
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

  const questions = await sql`SELECT * FROM questions`;
  const attempts = await sql`SELECT * FROM attempts ORDER BY date ASC`;
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
statsRouter.get("/activity", async (_req, res) => {
  const rows = await sql`SELECT date, COUNT(*)::int as count FROM attempts GROUP BY date`;
  const byDate = new Map(rows.map((r) => [r.date as string, r.count as number]));

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

function localTodayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function localYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// GET /api/stats/tracker -> today/this-month submission counts (new vs revised) + checkpoint distribution
statsRouter.get("/tracker", async (_req, res) => {
  const attempts = await sql`SELECT * FROM attempts ORDER BY date ASC`;
  const questions = await sql`SELECT * FROM questions`;

  const byQuestion = new Map<number, any[]>();
  for (const a of attempts) {
    if (!byQuestion.has(a.question_id)) byQuestion.set(a.question_id, []);
    byQuestion.get(a.question_id)!.push(a);
  }

  const firstAttemptDate = new Map<number, string>();
  for (const [qid, list] of byQuestion) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    firstAttemptDate.set(qid, sorted[0].date);
  }

  const today = localTodayIso();
  const yearMonth = localYearMonth();

  let todayTotal = 0;
  let todayNew = 0;
  let monthTotal = 0;
  let monthNew = 0;

  for (const a of attempts) {
    const isFirst = firstAttemptDate.get(a.question_id) === a.date;
    if (a.date === today) {
      todayTotal++;
      if (isFirst) todayNew++;
    }
    if (a.date.startsWith(yearMonth)) {
      monthTotal++;
      if (isFirst) monthNew++;
    }
  }

  const byCheckpoint: Record<string, number> = { "5": 0, "10": 0, "15": 0, "20": 0, "monthly-test": 0 };
  for (const q of questions) {
    const qAttempts = byQuestion.get(q.id) ?? [];
    if (!qAttempts.length) continue;
    const state = computeQuestionState(qAttempts.map((a) => ({ date: a.date, confidence: a.confidence })));
    byCheckpoint[state.bucket] = (byCheckpoint[state.bucket] ?? 0) + 1;
  }

  res.json({
    today: { total: todayTotal, new: todayNew, revised: todayTotal - todayNew },
    thisMonth: { total: monthTotal, new: monthNew, revised: monthTotal - monthNew },
    byCheckpoint,
  });
});

// GET /api/stats/weak-topics -> accuracy aggregated by topic from test history
statsRouter.get("/weak-topics", async (_req, res) => {
  const rows = await sql`
    SELECT tsq.result, q.topics, q.difficulty
    FROM test_session_questions tsq
    JOIN questions q ON q.id = tsq.question_id
    WHERE tsq.result IS NOT NULL
  `;

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
