import { Router } from "express";
import { sql } from "../lib/db.js";
import { analyzeCode } from "../lib/llm.js";
import { computeQuestionState } from "../lib/review.js";
import { fetchAndEnrich, insertQuestion, todayIso } from "../lib/enrichment.js";

export const questionsRouter = Router();

function rowToQuestion(row: any) {
  return {
    ...row,
    topics: JSON.parse(row.topics ?? "[]"),
  };
}

// POST /api/questions/lookup { number } -> preview only, not saved
questionsRouter.post("/lookup", async (req, res) => {
  const number = Number(req.body.number);
  if (!Number.isInteger(number) || number <= 0) return res.status(400).json({ error: "Invalid question number" });

  try {
    const [existing] = await sql`SELECT * FROM questions WHERE number = ${number}`;
    if (existing) return res.json({ existing: true, question: rowToQuestion(existing) });

    const { detail, ai } = await fetchAndEnrich(number);
    res.json({
      existing: false,
      question: {
        number: detail.number,
        title: detail.title,
        slug: detail.slug,
        difficulty: detail.difficulty,
        topics: detail.topics,
        leetcode_url: detail.url,
        optimal_time_complexity: ai.optimalTimeComplexity,
        optimal_space_complexity: ai.optimalSpaceComplexity,
        ai_pattern_summary: ai.patternSummary,
      },
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// POST /api/questions { number, date?, confidence?, notes?, code? }
// Saves a new question (auto-fetch + AI enrich) or, if already logged, adds a new attempt.
questionsRouter.post("/", async (req, res) => {
  const number = Number(req.body.number);
  const date = req.body.date || todayIso();
  const confidence = Number(req.body.confidence ?? 3);
  const notes = req.body.notes ?? null;
  const code = req.body.code ?? null;

  if (!Number.isInteger(number) || number <= 0) return res.status(400).json({ error: "Invalid question number" });

  try {
    let questionRow: any;
    [questionRow] = await sql`SELECT * FROM questions WHERE number = ${number}`;

    if (!questionRow) {
      const { detail, ai } = await fetchAndEnrich(number);
      questionRow = await insertQuestion(detail, ai);
    }

    let aiCodeAnalysis: string | null = null;
    if (code) {
      try {
        const analysis = await analyzeCode({ title: questionRow.title, difficulty: questionRow.difficulty, code });
        aiCodeAnalysis = JSON.stringify(analysis);
      } catch (err) {
        console.warn(`LLM analyzeCode failed for #${number}:`, (err as Error).message);
      }
    }

    const [attempt] = await sql`
      INSERT INTO attempts (question_id, date, confidence, notes, code, ai_code_analysis)
      VALUES (${questionRow.id}, ${date}, ${confidence}, ${notes}, ${code}, ${aiCodeAnalysis})
      RETURNING *
    `;

    res.status(201).json({
      question: rowToQuestion(questionRow),
      attempt: { ...attempt, ai_code_analysis: attempt.ai_code_analysis ? JSON.parse(attempt.ai_code_analysis) : null },
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// POST /api/questions/bulk { lines: [{ number, date, confidence? }] }
// Skips lines that would create an exact duplicate (same question + same date already logged).
questionsRouter.post("/bulk", async (req, res) => {
  const lines: Array<{ number: number; date: string; confidence?: number }> = req.body.lines ?? [];
  const results: Array<{ number: number; ok: boolean; skipped?: boolean; error?: string }> = [];

  for (const line of lines) {
    try {
      const number = Number(line.number);
      const date = line.date || todayIso();
      const confidence = Number(line.confidence ?? 3);

      let questionRow: any;
      [questionRow] = await sql`SELECT * FROM questions WHERE number = ${number}`;
      if (!questionRow) {
        const { detail, ai } = await fetchAndEnrich(number);
        questionRow = await insertQuestion(detail, ai);
        // be polite to LeetCode's unofficial endpoints during batch imports
        await new Promise((r) => setTimeout(r, 300));
      }

      const [duplicate] = await sql`
        SELECT id FROM attempts WHERE question_id = ${questionRow.id} AND date = ${date}
      `;
      if (duplicate) {
        results.push({ number, ok: true, skipped: true });
        continue;
      }

      await sql`INSERT INTO attempts (question_id, date, confidence) VALUES (${questionRow.id}, ${date}, ${confidence})`;
      results.push({ number, ok: true });
    } catch (err) {
      results.push({ number: line.number, ok: false, error: (err as Error).message });
    }
  }

  res.json({ results });
});

// GET /api/questions -> list with latest attempt summary
questionsRouter.get("/", async (_req, res) => {
  const rows = await sql`
    SELECT q.*, COUNT(a.id)::int as attempt_count, MAX(a.date) as last_attempt_date
    FROM questions q
    LEFT JOIN attempts a ON a.question_id = q.id
    GROUP BY q.id
    ORDER BY q.created_at DESC
  `;
  res.json({ questions: rows.map(rowToQuestion) });
});

// GET /api/questions/:id -> full detail + attempts
questionsRouter.get("/:id", async (req, res) => {
  const [question] = await sql`SELECT * FROM questions WHERE id = ${req.params.id}`;
  if (!question) return res.status(404).json({ error: "Not found" });

  const attemptRows = await sql`SELECT * FROM attempts WHERE question_id = ${req.params.id} ORDER BY date ASC`;
  const attempts = attemptRows.map((a: any) => ({
    ...a,
    ai_code_analysis: a.ai_code_analysis ? JSON.parse(a.ai_code_analysis) : null,
  }));

  const state = attempts.length
    ? computeQuestionState(attempts.map((a: any) => ({ date: a.date, confidence: a.confidence })))
    : null;

  res.json({ question: rowToQuestion(question), attempts, state });
});

// PATCH /api/questions/:id -> update notes-equivalent editable fields
questionsRouter.patch("/:id", async (req, res) => {
  const [existing] = await sql`SELECT * FROM questions WHERE id = ${req.params.id}`;
  if (!existing) return res.status(404).json({ error: "Not found" });

  const patch: Record<string, unknown> = {};
  for (const f of ["title", "difficulty", "leetcode_url"] as const) {
    if (req.body[f] !== undefined) patch[f] = req.body[f];
  }
  if (req.body.topics !== undefined) patch.topics = JSON.stringify(req.body.topics);
  if (!Object.keys(patch).length) return res.status(400).json({ error: "No editable fields provided" });

  const [updated] = await sql`UPDATE questions SET ${sql(patch)} WHERE id = ${req.params.id} RETURNING *`;
  res.json({ question: rowToQuestion(updated) });
});

// DELETE /api/questions -> bulk delete ALL questions (and their attempts)
questionsRouter.delete("/", async (_req, res) => {
  const deleted = await sql`DELETE FROM questions RETURNING id`;
  res.json({ deleted: deleted.length });
});

// DELETE /api/questions/:id
questionsRouter.delete("/:id", async (req, res) => {
  const deleted = await sql`DELETE FROM questions WHERE id = ${req.params.id} RETURNING id`;
  if (deleted.length === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// POST /api/questions/:id/attempts -> log a subsequent review
questionsRouter.post("/:id/attempts", async (req, res) => {
  const [question] = await sql`SELECT * FROM questions WHERE id = ${req.params.id}`;
  if (!question) return res.status(404).json({ error: "Not found" });

  const date = req.body.date || todayIso();
  const confidence = Number(req.body.confidence ?? 3);
  const notes = req.body.notes ?? null;
  const code = req.body.code ?? null;
  const timeTakenSec = req.body.time_taken_sec ?? null;

  let aiCodeAnalysis: string | null = null;
  if (code) {
    try {
      const analysis = await analyzeCode({ title: question.title, difficulty: question.difficulty, code });
      aiCodeAnalysis = JSON.stringify(analysis);
    } catch (err) {
      console.warn(`LLM analyzeCode failed for #${question.number}:`, (err as Error).message);
    }
  }

  const [attempt] = await sql`
    INSERT INTO attempts (question_id, date, confidence, notes, code, ai_code_analysis, time_taken_sec)
    VALUES (${question.id}, ${date}, ${confidence}, ${notes}, ${code}, ${aiCodeAnalysis}, ${timeTakenSec})
    RETURNING *
  `;

  res.status(201).json({
    attempt: { ...attempt, ai_code_analysis: attempt.ai_code_analysis ? JSON.parse(attempt.ai_code_analysis) : null },
  });
});

// POST /api/questions/:id/analyze-code { attemptId, code? } -> (re)run AI analysis on an attempt's code
questionsRouter.post("/:id/analyze-code", async (req, res) => {
  const [question] = await sql`SELECT * FROM questions WHERE id = ${req.params.id}`;
  if (!question) return res.status(404).json({ error: "Not found" });

  const attemptId = req.body.attemptId;
  const [attempt] = await sql`SELECT * FROM attempts WHERE id = ${attemptId} AND question_id = ${question.id}`;
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });

  const code = req.body.code ?? attempt.code;
  if (!code) return res.status(400).json({ error: "No code to analyze" });

  try {
    const analysis = await analyzeCode({ title: question.title, difficulty: question.difficulty, code });
    await sql`UPDATE attempts SET code = ${code}, ai_code_analysis = ${JSON.stringify(analysis)} WHERE id = ${attemptId}`;
    res.json({ ai_code_analysis: analysis });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
