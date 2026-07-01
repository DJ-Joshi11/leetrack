import { Router } from "express";
import { db } from "../lib/db.js";
import { computeQuestionState } from "../lib/review.js";

export const reviewRouter = Router();

function loadQuestionsWithAttempts() {
  const questions = db.prepare("SELECT * FROM questions").all() as any[];
  const attempts = db.prepare("SELECT * FROM attempts ORDER BY date ASC").all() as any[];
  const byQuestion = new Map<number, any[]>();
  for (const a of attempts) {
    if (!byQuestion.has(a.question_id)) byQuestion.set(a.question_id, []);
    byQuestion.get(a.question_id)!.push(a);
  }
  return { questions, byQuestion };
}

// GET /api/review/due -> due questions grouped by bucket, plus overdue count
reviewRouter.get("/due", (_req, res) => {
  const { questions, byQuestion } = loadQuestionsWithAttempts();
  const now = new Date();

  const buckets: Record<string, any[]> = { "7": [], "10": [], "15": [], "30": [], maintenance: [] };
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
      lastAttemptDate: state.lastAttemptDate,
      nextDue: state.nextDue,
      daysOverdue: state.daysOverdue,
    });
  }

  res.json({ buckets, overdueCount, dueTotal: Object.values(buckets).reduce((s, arr) => s + arr.length, 0) });
});
