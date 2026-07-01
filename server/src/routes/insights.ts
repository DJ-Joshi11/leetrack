import { Router } from "express";
import { db } from "../lib/db.js";
import { generateInsights } from "../lib/llm.js";

export const insightsRouter = Router();

// GET /api/insights/latest
insightsRouter.get("/latest", (_req, res) => {
  const report = db.prepare("SELECT * FROM insights_reports ORDER BY generated_at DESC LIMIT 1").get();
  res.json({ report: report ?? null });
});

// POST /api/insights/generate
insightsRouter.post("/generate", async (_req, res) => {
  const questions = db.prepare("SELECT * FROM questions").all() as any[];
  const attempts = db.prepare("SELECT * FROM attempts").all() as any[];
  const testItems = db
    .prepare(
      `SELECT tsq.result, tsq.time_spent_sec, q.number, q.title, q.difficulty, q.topics
       FROM test_session_questions tsq JOIN questions q ON q.id = tsq.question_id
       WHERE tsq.result IS NOT NULL`
    )
    .all() as any[];

  if (!questions.length) {
    return res.status(400).json({ error: "Log some questions before generating insights" });
  }

  const topicCounts: Record<string, number> = {};
  const difficultyCounts: Record<string, number> = {};
  for (const q of questions) {
    difficultyCounts[q.difficulty] = (difficultyCounts[q.difficulty] ?? 0) + 1;
    for (const t of JSON.parse(q.topics ?? "[]")) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
  }

  const avgConfidence = attempts.length
    ? attempts.reduce((s: number, a: any) => s + a.confidence, 0) / attempts.length
    : null;

  const snapshot = {
    totalQuestions: questions.length,
    totalAttempts: attempts.length,
    avgConfidence,
    topicCounts,
    difficultyCounts,
    recentTestResults: testItems.map((t) => ({
      number: t.number,
      title: t.title,
      difficulty: t.difficulty,
      topics: JSON.parse(t.topics ?? "[]"),
      result: t.result,
      time_spent_sec: t.time_spent_sec,
    })),
  };

  try {
    const summary = await generateInsights(snapshot);
    const info = db
      .prepare("INSERT INTO insights_reports (summary, stats_snapshot) VALUES (?, ?)")
      .run(summary, JSON.stringify(snapshot));
    const report = db.prepare("SELECT * FROM insights_reports WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({ report });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
