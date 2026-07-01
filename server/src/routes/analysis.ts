import { Router } from "express";
import { db } from "../lib/db.js";
import { lookupQuestionByNumber } from "../lib/leetcode.js";
import { generateAnalysisPlan } from "../lib/llm.js";

export const analysisRouter = Router();

const DIFFICULTY_WEIGHT: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };

// GET /api/analysis/charts -> live-computed chart data, no AI involved
analysisRouter.get("/charts", (_req, res) => {
  const questions = db.prepare("SELECT * FROM questions").all() as any[];
  const attempts = db.prepare("SELECT * FROM attempts ORDER BY date ASC").all() as any[];

  const topicCounts: Record<string, number> = {};
  const difficultyCounts: Record<string, number> = {};
  for (const q of questions) {
    difficultyCounts[q.difficulty] = (difficultyCounts[q.difficulty] ?? 0) + 1;
    for (const t of JSON.parse(q.topics ?? "[]")) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
  }
  const topicDistribution = Object.entries(topicCounts)
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);
  const difficultyDistribution = Object.entries(difficultyCounts).map(([difficulty, count]) => ({ difficulty, count }));

  const byDate: Record<string, { sum: number; count: number }> = {};
  for (const a of attempts) {
    byDate[a.date] ??= { sum: 0, count: 0 };
    byDate[a.date].sum += a.confidence;
    byDate[a.date].count++;
  }
  const confidenceTrend = Object.entries(byDate)
    .map(([date, v]) => ({ date, avgConfidence: Math.round((v.sum / v.count) * 10) / 10 }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const sessions = db.prepare("SELECT * FROM test_sessions WHERE ended_at IS NOT NULL ORDER BY started_at ASC").all() as any[];
  const scoreTrend = sessions.map((s) => {
    const items = db
      .prepare(
        `SELECT tsq.result, q.difficulty FROM test_session_questions tsq
         JOIN questions q ON q.id = tsq.question_id WHERE tsq.session_id = ?`
      )
      .all(s.id) as any[];
    const answered = items.filter((i) => i.result);
    const correct = items.filter((i) => i.result === "correct");
    const totalWeight = items.reduce((sum, i) => sum + (DIFFICULTY_WEIGHT[i.difficulty] ?? 1), 0);
    const earnedWeight = correct.reduce((sum, i) => sum + (DIFFICULTY_WEIGHT[i.difficulty] ?? 1), 0);
    return {
      date: String(s.started_at).slice(0, 10),
      score: totalWeight ? Math.round((earnedWeight / totalWeight) * 100) : 0,
      accuracy: answered.length ? Math.round((correct.length / answered.length) * 100) : 0,
    };
  });

  const testRows = db
    .prepare(
      `SELECT tsq.result, q.topics FROM test_session_questions tsq
       JOIN questions q ON q.id = tsq.question_id WHERE tsq.result IS NOT NULL`
    )
    .all() as any[];
  const topicAcc: Record<string, { total: number; correct: number }> = {};
  for (const r of testRows) {
    for (const t of JSON.parse(r.topics ?? "[]")) {
      topicAcc[t] ??= { total: 0, correct: 0 };
      topicAcc[t].total++;
      if (r.result === "correct") topicAcc[t].correct++;
    }
  }
  const topicAccuracy = Object.entries(topicAcc)
    .map(([topic, v]) => ({ topic, total: v.total, correct: v.correct, accuracy: Math.round((v.correct / v.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);

  res.json({
    topicDistribution,
    difficultyDistribution,
    confidenceTrend,
    scoreTrend,
    topicAccuracy,
    totalQuestions: questions.length,
    totalAttempts: attempts.length,
    totalTests: sessions.length,
  });
});

// GET /api/analysis/latest
analysisRouter.get("/latest", (_req, res) => {
  const row = db.prepare("SELECT * FROM analysis_reports ORDER BY generated_at DESC LIMIT 1").get() as
    | { id: number; generated_at: string; data: string }
    | undefined;
  res.json({ report: row ? { id: row.id, generated_at: row.generated_at, ...JSON.parse(row.data) } : null });
});

// POST /api/analysis/generate
analysisRouter.post("/generate", async (_req, res) => {
  const questions = db.prepare("SELECT * FROM questions").all() as any[];
  const attempts = db.prepare("SELECT * FROM attempts").all() as any[];
  if (!questions.length) return res.status(400).json({ error: "Log some questions before generating an analysis" });

  const testItems = db
    .prepare(
      `SELECT tsq.result, q.number, q.title, q.difficulty, q.topics FROM test_session_questions tsq
       JOIN questions q ON q.id = tsq.question_id WHERE tsq.result IS NOT NULL`
    )
    .all() as any[];

  const topicCounts: Record<string, number> = {};
  const difficultyCounts: Record<string, number> = {};
  for (const q of questions) {
    difficultyCounts[q.difficulty] = (difficultyCounts[q.difficulty] ?? 0) + 1;
    for (const t of JSON.parse(q.topics ?? "[]")) topicCounts[t] = (topicCounts[t] ?? 0) + 1;
  }
  const loggedNumbers: number[] = questions.map((q) => q.number);

  const snapshot = {
    totalQuestions: questions.length,
    totalAttempts: attempts.length,
    topicCounts,
    difficultyCounts,
    loggedNumbers,
    avgConfidence: attempts.length
      ? Math.round((attempts.reduce((s: number, a: any) => s + a.confidence, 0) / attempts.length) * 10) / 10
      : null,
    testResults: testItems.map((t) => ({
      number: t.number,
      title: t.title,
      difficulty: t.difficulty,
      topics: JSON.parse(t.topics ?? "[]"),
      result: t.result,
    })),
  };

  try {
    const plan = await generateAnalysisPlan(snapshot);
    const loggedSet = new Set(loggedNumbers);

    const suggestedQuestions: Array<{
      number: number;
      title: string;
      difficulty: string;
      url: string;
      alreadyLogged: boolean;
    }> = [];
    for (const num of plan.suggestedQuestionNumbers.slice(0, 8)) {
      try {
        const detail = await lookupQuestionByNumber(num);
        suggestedQuestions.push({
          number: detail.number,
          title: detail.title,
          difficulty: detail.difficulty,
          url: detail.url,
          alreadyLogged: loggedSet.has(num),
        });
      } catch {
        // hallucinated or invalid question number — skip silently
      }
      await new Promise((r) => setTimeout(r, 200));
    }

    const data = {
      strengths: plan.strengths,
      weakTopics: plan.weakTopics,
      suggestedTopics: plan.suggestedTopics,
      plan: plan.plan,
      suggestedQuestions,
    };
    const info = db.prepare("INSERT INTO analysis_reports (data) VALUES (?)").run(JSON.stringify(data));
    const row = db.prepare("SELECT * FROM analysis_reports WHERE id = ?").get(info.lastInsertRowid) as {
      id: number;
      generated_at: string;
      data: string;
    };
    res.status(201).json({ report: { id: row.id, generated_at: row.generated_at, ...JSON.parse(row.data) } });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
