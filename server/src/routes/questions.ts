import { Router } from "express";
import { db } from "../lib/db.js";
import { lookupQuestionByNumber } from "../lib/leetcode.js";
import { analyzeProblem, analyzeCode } from "../lib/llm.js";
import { computeQuestionState } from "../lib/review.js";

export const questionsRouter = Router();

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function fetchAndEnrich(number: number) {
  const detail = await lookupQuestionByNumber(number);
  let ai = { optimalTimeComplexity: "Unknown", optimalSpaceComplexity: "Unknown", patternSummary: "" };
  try {
    ai = await analyzeProblem(detail);
  } catch (err) {
    console.warn(`LLM analyzeProblem failed for #${number}:`, (err as Error).message);
  }
  return { detail, ai };
}

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
    const existing = db.prepare("SELECT * FROM questions WHERE number = ?").get(number);
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
    let questionRow: any = db.prepare("SELECT * FROM questions WHERE number = ?").get(number);

    if (!questionRow) {
      const { detail, ai } = await fetchAndEnrich(number);
      const info = db
        .prepare(
          `INSERT INTO questions
            (number, title, slug, difficulty, topics, leetcode_url, optimal_time_complexity, optimal_space_complexity, ai_pattern_summary, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        )
        .run(
          detail.number,
          detail.title,
          detail.slug,
          detail.difficulty,
          JSON.stringify(detail.topics),
          detail.url,
          ai.optimalTimeComplexity,
          ai.optimalSpaceComplexity,
          ai.patternSummary
        );
      questionRow = db.prepare("SELECT * FROM questions WHERE id = ?").get(info.lastInsertRowid);
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

    const attemptInfo = db
      .prepare(
        `INSERT INTO attempts (question_id, date, confidence, notes, code, ai_code_analysis)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(questionRow.id, date, confidence, notes, code, aiCodeAnalysis);

    const attempt = db.prepare("SELECT * FROM attempts WHERE id = ?").get(attemptInfo.lastInsertRowid) as any;

    res.status(201).json({
      question: rowToQuestion(questionRow),
      attempt: { ...attempt, ai_code_analysis: attempt.ai_code_analysis ? JSON.parse(attempt.ai_code_analysis) : null },
    });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

// POST /api/questions/bulk { lines: [{ number, date, confidence? }] }
questionsRouter.post("/bulk", async (req, res) => {
  const lines: Array<{ number: number; date: string; confidence?: number }> = req.body.lines ?? [];
  const results: Array<{ number: number; ok: boolean; error?: string }> = [];

  for (const line of lines) {
    try {
      const number = Number(line.number);
      const date = line.date || todayIso();
      const confidence = Number(line.confidence ?? 3);

      let questionRow: any = db.prepare("SELECT * FROM questions WHERE number = ?").get(number);
      if (!questionRow) {
        const { detail, ai } = await fetchAndEnrich(number);
        const info = db
          .prepare(
            `INSERT INTO questions
              (number, title, slug, difficulty, topics, leetcode_url, optimal_time_complexity, optimal_space_complexity, ai_pattern_summary, fetched_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
          )
          .run(
            detail.number,
            detail.title,
            detail.slug,
            detail.difficulty,
            JSON.stringify(detail.topics),
            detail.url,
            ai.optimalTimeComplexity,
            ai.optimalSpaceComplexity,
            ai.patternSummary
          );
        questionRow = db.prepare("SELECT * FROM questions WHERE id = ?").get(info.lastInsertRowid);
        // be polite to LeetCode's unofficial endpoints during batch imports
        await new Promise((r) => setTimeout(r, 300));
      }

      db.prepare(`INSERT INTO attempts (question_id, date, confidence) VALUES (?, ?, ?)`).run(
        questionRow.id,
        date,
        confidence
      );
      results.push({ number, ok: true });
    } catch (err) {
      results.push({ number: line.number, ok: false, error: (err as Error).message });
    }
  }

  res.json({ results });
});

// GET /api/questions -> list with latest attempt summary
questionsRouter.get("/", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT q.*, COUNT(a.id) as attempt_count, MAX(a.date) as last_attempt_date
       FROM questions q
       LEFT JOIN attempts a ON a.question_id = q.id
       GROUP BY q.id
       ORDER BY q.created_at DESC`
    )
    .all();
  res.json({ questions: rows.map(rowToQuestion) });
});

// GET /api/questions/:id -> full detail + attempts
questionsRouter.get("/:id", (req, res) => {
  const question = db.prepare("SELECT * FROM questions WHERE id = ?").get(req.params.id);
  if (!question) return res.status(404).json({ error: "Not found" });
  const attempts = db
    .prepare("SELECT * FROM attempts WHERE question_id = ? ORDER BY date ASC")
    .all(req.params.id)
    .map((a: any) => ({ ...a, ai_code_analysis: a.ai_code_analysis ? JSON.parse(a.ai_code_analysis) : null }));

  const state = attempts.length
    ? computeQuestionState(attempts.map((a: any) => ({ date: a.date, confidence: a.confidence })))
    : null;

  res.json({ question: rowToQuestion(question), attempts, state });
});

// PATCH /api/questions/:id -> update notes-equivalent editable fields
questionsRouter.patch("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM questions WHERE id = ?").get(req.params.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const fields = ["title", "difficulty", "leetcode_url"] as const;
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  if (req.body.topics !== undefined) {
    updates.push("topics = ?");
    values.push(JSON.stringify(req.body.topics));
  }
  if (!updates.length) return res.status(400).json({ error: "No editable fields provided" });

  values.push(req.params.id);
  db.prepare(`UPDATE questions SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  const updated = db.prepare("SELECT * FROM questions WHERE id = ?").get(req.params.id);
  res.json({ question: rowToQuestion(updated) });
});

// DELETE /api/questions -> bulk delete ALL questions (and their attempts)
questionsRouter.delete("/", (_req, res) => {
  const info = db.prepare("DELETE FROM questions").run();
  res.json({ deleted: info.changes });
});

// DELETE /api/questions/:id
questionsRouter.delete("/:id", (req, res) => {
  const info = db.prepare("DELETE FROM questions WHERE id = ?").run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// POST /api/questions/:id/attempts -> log a subsequent review
questionsRouter.post("/:id/attempts", async (req, res) => {
  const question: any = db.prepare("SELECT * FROM questions WHERE id = ?").get(req.params.id);
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

  const info = db
    .prepare(
      `INSERT INTO attempts (question_id, date, confidence, notes, code, ai_code_analysis, time_taken_sec)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(question.id, date, confidence, notes, code, aiCodeAnalysis, timeTakenSec);

  const attempt = db.prepare("SELECT * FROM attempts WHERE id = ?").get(info.lastInsertRowid) as any;
  res.status(201).json({
    attempt: { ...attempt, ai_code_analysis: attempt.ai_code_analysis ? JSON.parse(attempt.ai_code_analysis) : null },
  });
});

// POST /api/questions/:id/analyze-code { attemptId, code? } -> (re)run AI analysis on an attempt's code
questionsRouter.post("/:id/analyze-code", async (req, res) => {
  const question: any = db.prepare("SELECT * FROM questions WHERE id = ?").get(req.params.id);
  if (!question) return res.status(404).json({ error: "Not found" });

  const attemptId = req.body.attemptId;
  const attempt: any = db.prepare("SELECT * FROM attempts WHERE id = ? AND question_id = ?").get(attemptId, question.id);
  if (!attempt) return res.status(404).json({ error: "Attempt not found" });

  const code = req.body.code ?? attempt.code;
  if (!code) return res.status(400).json({ error: "No code to analyze" });

  try {
    const analysis = await analyzeCode({ title: question.title, difficulty: question.difficulty, code });
    db.prepare("UPDATE attempts SET code = ?, ai_code_analysis = ? WHERE id = ?").run(
      code,
      JSON.stringify(analysis),
      attemptId
    );
    res.json({ ai_code_analysis: analysis });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});
