import { Router } from "express";
import { sql } from "../lib/db.js";
import { computeQuestionState, toLocalDateString } from "../lib/review.js";

export const reviewRouter = Router();

async function loadQuestionsWithAttempts() {
  const questions = await sql`SELECT * FROM questions`;
  const attempts = await sql`SELECT * FROM attempts ORDER BY date ASC`;
  const byQuestion = new Map<number, any[]>();
  for (const a of attempts) {
    if (!byQuestion.has(a.question_id)) byQuestion.set(a.question_id, []);
    byQuestion.get(a.question_id)!.push(a);
  }
  return { questions, byQuestion };
}

// GET /api/review/due -> due questions grouped by bucket, plus overdue count
reviewRouter.get("/due", async (_req, res) => {
  const { questions, byQuestion } = await loadQuestionsWithAttempts();
  const now = new Date();

  const buckets: Record<string, any[]> = { "5": [], "10": [], "15": [], "20": [], "monthly-test": [] };
  let overdueCount = 0;

  for (const q of questions) {
    const attempts = byQuestion.get(q.id) ?? [];
    if (!attempts.length) continue;
    const state = computeQuestionState(
      attempts.map((a) => ({ date: a.date, confidence: a.confidence })),
      now
    );
    if (!state.isDue) continue;

    if (state.daysOverdue > 0) overdueCount++;
    buckets[state.bucket].push({
      id: q.id,
      number: q.number,
      title: q.title,
      difficulty: q.difficulty,
      topics: JSON.parse(q.topics ?? "[]"),
      stage: state.stage,
      lastAttemptDate: toLocalDateString(state.lastAttemptDate),
      nextDue: toLocalDateString(state.nextDue),
      daysOverdue: state.daysOverdue,
    });
  }

  res.json({ buckets, overdueCount, dueTotal: Object.values(buckets).reduce((s, arr) => s + arr.length, 0) });
});

// GET /api/review/schedule -> every tracked question's current checkpoint + next due date (for the monthly timeline)
reviewRouter.get("/schedule", async (_req, res) => {
  const { questions, byQuestion } = await loadQuestionsWithAttempts();
  const now = new Date();

  const items = [];
  for (const q of questions) {
    const attempts = byQuestion.get(q.id) ?? [];
    if (!attempts.length) continue;
    const state = computeQuestionState(
      attempts.map((a) => ({ date: a.date, confidence: a.confidence })),
      now
    );
    items.push({
      id: q.id,
      number: q.number,
      title: q.title,
      difficulty: q.difficulty,
      topics: JSON.parse(q.topics ?? "[]"),
      stage: state.stage,
      bucket: state.bucket,
      lastAttemptDate: toLocalDateString(state.lastAttemptDate),
      nextDue: toLocalDateString(state.nextDue),
      isDue: state.isDue,
      daysOverdue: state.daysOverdue,
    });
  }

  res.json({ items });
});
