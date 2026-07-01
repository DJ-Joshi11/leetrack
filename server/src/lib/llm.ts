const MODEL_NAME = "llama-3.3-70b-versatile";

function extractJson(text: string): any {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw.trim());
}

async function chatCompletion(params: { prompt: string; jsonMode?: boolean }): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set on the server");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [{ role: "user", content: params.prompt }],
      temperature: 0.3,
      ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

export async function analyzeProblem(params: {
  title: string;
  difficulty: string;
  topics: string[];
  content: string;
}): Promise<{ optimalTimeComplexity: string; optimalSpaceComplexity: string; patternSummary: string }> {
  const prompt = `You are an expert competitive programmer. Given this LeetCode problem, respond with ONLY a JSON object (no prose) with keys "optimalTimeComplexity", "optimalSpaceComplexity", "patternSummary" (1-2 sentences naming the core technique/pattern, e.g. "two pointers + sliding window").

Title: ${params.title}
Difficulty: ${params.difficulty}
Topics: ${params.topics.join(", ")}
Description: ${params.content.slice(0, 4000)}`;

  const text = await chatCompletion({ prompt, jsonMode: true });
  const parsed = extractJson(text);
  return {
    optimalTimeComplexity: parsed.optimalTimeComplexity ?? "Unknown",
    optimalSpaceComplexity: parsed.optimalSpaceComplexity ?? "Unknown",
    patternSummary: parsed.patternSummary ?? "",
  };
}

export async function analyzeCode(params: {
  title: string;
  difficulty: string;
  code: string;
}): Promise<{
  estimatedTimeComplexity: string;
  estimatedSpaceComplexity: string;
  correctnessNotes: string;
  feedback: string;
}> {
  const prompt = `You are an expert code reviewer grading a LeetCode submission. Respond with ONLY a JSON object (no prose) with keys "estimatedTimeComplexity", "estimatedSpaceComplexity", "correctnessNotes" (does it look correct / any edge cases missed), "feedback" (2-3 sentences of constructive, specific feedback on the approach and how to improve it).

Problem: ${params.title} (${params.difficulty})
Submitted code:
${params.code.slice(0, 6000)}`;

  const text = await chatCompletion({ prompt, jsonMode: true });
  const parsed = extractJson(text);
  return {
    estimatedTimeComplexity: parsed.estimatedTimeComplexity ?? "Unknown",
    estimatedSpaceComplexity: parsed.estimatedSpaceComplexity ?? "Unknown",
    correctnessNotes: parsed.correctnessNotes ?? "",
    feedback: parsed.feedback ?? "",
  };
}

export type AnalysisPlan = {
  strengths: string[];
  weakTopics: string[];
  suggestedTopics: string[];
  suggestedQuestionNumbers: number[];
  plan: string;
};

export async function generateAnalysisPlan(snapshot: unknown): Promise<AnalysisPlan> {
  const prompt = `You are a coding interview coach analyzing a student's full LeetCode practice history (all logged questions, topics, difficulty, confidence over time, and test session results). Respond with ONLY a JSON object (no prose) with keys:
- "strengths": array of up to 5 short strings naming specific topics/difficulties they're strong in, each with brief reasoning
- "weakTopics": array of up to 5 short strings naming specific weak topics/areas, each with brief reasoning
- "suggestedTopics": array of up to 5 topic name strings worth studying next, ordered by priority
- "suggestedQuestionNumbers": array of up to 8 real LeetCode question numbers (integers only) that would help address the weak topics, spanning a sensible difficulty progression
- "plan": a 4-6 sentence narrative study plan in plain text (no markdown)

Data:
${JSON.stringify(snapshot, null, 2)}`;

  const text = await chatCompletion({ prompt, jsonMode: true });
  const parsed = extractJson(text);
  return {
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    weakTopics: Array.isArray(parsed.weakTopics) ? parsed.weakTopics : [],
    suggestedTopics: Array.isArray(parsed.suggestedTopics) ? parsed.suggestedTopics : [],
    suggestedQuestionNumbers: Array.isArray(parsed.suggestedQuestionNumbers)
      ? parsed.suggestedQuestionNumbers.filter((n: unknown) => Number.isInteger(n))
      : [],
    plan: parsed.plan ?? "",
  };
}

export async function generateInsights(statsSnapshot: unknown): Promise<string> {
  const prompt = `You are a coding interview coach. Based on this JSON summary of a student's LeetCode practice history (topics covered, accuracy/confidence by topic and difficulty, attempt counts, recent test results), write a concise, high-level insights report in markdown with these four "####" sections in order: "Strengths", "Weak Topics", "Suggested Next Topics", "Overall Trend". Do not include a top-level title before the first section. Be specific and reference actual topic names and numbers from the data. Keep it under 300 words.

Data:
${JSON.stringify(statsSnapshot, null, 2)}`;

  const text = await chatCompletion({ prompt });
  return text.trim();
}
