import { sql, nowText } from "./db.js";
import { lookupQuestionByNumber } from "./leetcode.js";
import { analyzeProblem } from "./llm.js";

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function fetchAndEnrich(number: number) {
  const detail = await lookupQuestionByNumber(number);
  let ai = { optimalTimeComplexity: "Unknown", optimalSpaceComplexity: "Unknown", patternSummary: "" };
  try {
    ai = await analyzeProblem(detail);
  } catch (err) {
    console.warn(`LLM analyzeProblem failed for #${number}:`, (err as Error).message);
  }
  return { detail, ai };
}

export async function insertQuestion(
  detail: Awaited<ReturnType<typeof lookupQuestionByNumber>>,
  ai: { optimalTimeComplexity: string; optimalSpaceComplexity: string; patternSummary: string }
) {
  const [row] = await sql`
    INSERT INTO questions
      (number, title, slug, difficulty, topics, leetcode_url, optimal_time_complexity, optimal_space_complexity, ai_pattern_summary, fetched_at)
    VALUES
      (${detail.number}, ${detail.title}, ${detail.slug}, ${detail.difficulty}, ${JSON.stringify(detail.topics)}, ${detail.url}, ${ai.optimalTimeComplexity}, ${ai.optimalSpaceComplexity}, ${ai.patternSummary}, ${nowText()})
    RETURNING *
  `;
  return row;
}

/** Finds or creates the question row for a LeetCode number, enriching via AI if it's new. */
export async function findOrCreateQuestion(number: number) {
  const [existing] = await sql`SELECT * FROM questions WHERE number = ${number}`;
  if (existing) return existing;
  const { detail, ai } = await fetchAndEnrich(number);
  return insertQuestion(detail, ai);
}
