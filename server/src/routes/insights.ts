import { Router } from "express";
import { sql } from "../lib/db.js";
import { generateInsights } from "../lib/llm.js";

export const insightsRouter = Router();

// GET /api/insights/latest
insightsRouter.get("/latest", async (_req, res) => {
  const [report] = await sql`SELECT * FROM insights_reports ORDER BY generated_at DESC LIMIT 1`;
  res.json({ report: report ?? null });
});

// POST /api/insights/generate
insightsRouter.post("/generate", async (_req, res) => {
  const questions = await sql`SELECT * FROM questions`;
  const attempts = await sql`SELECT * FROM attempts`;
  const testItems = await sql`
    SELECT tsq.result, tsq.time_spent_sec, q.number, q.title, q.difficulty, q.topics
    FROM test_session_questions tsq JOIN questions q ON q.id = tsq.question_id
    WHERE tsq.result IS NOT NULL
  `;

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
    const [report] = await sql`
      INSERT INTO insights_reports (summary, stats_snapshot) VALUES (${summary}, ${JSON.stringify(snapshot)})
      RETURNING *
    `;
    res.status(201).json({ report });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
