import { sql } from "./db.js";
import { findOrCreateQuestion } from "./enrichment.js";
import { generateSimilarQuestionNumbers } from "./llm.js";
import { CHECKPOINT_DAYS, MONTHLY_TEST_DAY, lastDayOfMonth, toLocalDateString, type Bucket } from "./review.js";

const CHECKPOINT_DAY: Record<Bucket, number> = {
  "5": CHECKPOINT_DAYS[0],
  "10": CHECKPOINT_DAYS[1],
  "15": CHECKPOINT_DAYS[2],
  "20": CHECKPOINT_DAYS[3],
  "monthly-test": MONTHLY_TEST_DAY,
};

const EXAM_SIZE: Record<Bucket, number> = { "5": 8, "10": 8, "15": 8, "20": 8, "monthly-test": 16 };

// Difficulty skews harder as the month progresses toward the big monthly test — the 5th checkpoint
// is the gentlest refresher, the monthly-test is the real stress-test.
const DIFFICULTY_TARGETS: Record<Bucket, { Easy: number; Medium: number; Hard: number }> = {
  "5": { Easy: 0.4, Medium: 0.5, Hard: 0.1 },
  "10": { Easy: 0.3, Medium: 0.55, Hard: 0.15 },
  "15": { Easy: 0.2, Medium: 0.55, Hard: 0.25 },
  "20": { Easy: 0.15, Medium: 0.55, Hard: 0.3 },
  "monthly-test": { Easy: 0.1, Medium: 0.5, Hard: 0.4 },
};

const MIN_EXAM_SIZE = 4;
const MAX_EXAM_SIZE = 30;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtDate(year: number, month: number, day: number): string {
  return toLocalDateString(new Date(year, month, day));
}

/** The next calendar occurrence of `targetDay`, on or after `today`. */
export function upcomingCheckpointDate(targetDay: number, today: Date = new Date()): Date {
  const year = today.getFullYear();
  const month = today.getMonth();
  const clampedThisMonth = Math.min(targetDay, lastDayOfMonth(year, month));
  if (clampedThisMonth >= today.getDate()) return new Date(year, month, clampedThisMonth);
  const clampedNextMonth = Math.min(targetDay, lastDayOfMonth(year, month + 1));
  return new Date(year, month + 1, clampedNextMonth);
}

/** Which bucket's checkpoint comes soonest from today. */
export function nextMilestoneBucket(today: Date = new Date()): Bucket {
  const buckets: Bucket[] = ["5", "10", "15", "20", "monthly-test"];
  let best: Bucket = "5";
  let bestDate = upcomingCheckpointDate(CHECKPOINT_DAY["5"], today);
  for (const b of buckets.slice(1)) {
    const d = upcomingCheckpointDate(CHECKPOINT_DAY[b], today);
    if (d.getTime() < bestDate.getTime()) {
      best = b;
      bestDate = d;
    }
  }
  return best;
}

/** The window of dates whose practiced topics feed a given milestone's exam. The final (monthly-test) milestone always covers the complete month. */
function windowForBucket(bucket: Bucket, resolvedDate: Date): { start: string; end: string } {
  const year = resolvedDate.getFullYear();
  const month = resolvedDate.getMonth();
  switch (bucket) {
    case "5":
      return { start: fmtDate(year, month, 1), end: fmtDate(year, month, 5) };
    case "10":
      return { start: fmtDate(year, month, 6), end: fmtDate(year, month, 10) };
    case "15":
      return { start: fmtDate(year, month, 11), end: fmtDate(year, month, 15) };
    case "20":
      return { start: fmtDate(year, month, 16), end: fmtDate(year, month, 20) };
    case "monthly-test":
      return { start: fmtDate(year, month, 1), end: fmtDate(year, month, lastDayOfMonth(year, month)) };
  }
}

/** Topics practiced (and the tracked questions that cover them) within a milestone's window, with an all-time fallback if the window is empty. */
export async function milestoneTopics(bucket: Bucket, now: Date = new Date()) {
  const resolvedDate = upcomingCheckpointDate(CHECKPOINT_DAY[bucket], now);
  const { start, end } = windowForBucket(bucket, resolvedDate);

  const windowRows = await sql`
    SELECT DISTINCT q.* FROM attempts a
    JOIN questions q ON q.id = a.question_id
    WHERE a.date >= ${start} AND a.date <= ${end}
  `;

  const topics = new Set<string>();
  const poolMap = new Map<number, any>();
  for (const q of windowRows) {
    for (const t of JSON.parse(q.topics ?? "[]")) topics.add(t);
    poolMap.set(q.id, q);
  }

  let usedFallback = false;
  if (topics.size === 0) {
    usedFallback = true;
    const allQuestions = await sql`SELECT * FROM questions`;
    for (const q of allQuestions) {
      for (const t of JSON.parse(q.topics ?? "[]")) topics.add(t);
      poolMap.set(q.id, q);
    }
  }

  return { resolvedDate, start, end, topics: [...topics], poolMap, usedFallback };
}

/** Picks `count` questions from `pool`, weighted by difficulty per the bucket's target mix (which
 *  gets harder as the month progresses — see DIFFICULTY_TARGETS), filling from whatever's available. */
function selectWithDifficultySkew(pool: any[], count: number, bucket: Bucket): any[] {
  const byDifficulty: Record<string, any[]> = { Easy: [], Medium: [], Hard: [] };
  for (const q of pool) (byDifficulty[q.difficulty] ??= []).push(q);
  for (const d of Object.keys(byDifficulty)) byDifficulty[d] = shuffle(byDifficulty[d]);

  const weights = DIFFICULTY_TARGETS[bucket];
  const targets = {
    Medium: Math.round(count * weights.Medium),
    Easy: Math.round(count * weights.Easy),
    Hard: Math.round(count * weights.Hard),
  };
  const selected: any[] = [];
  const usedIds = new Set<number>();

  for (const d of ["Medium", "Easy", "Hard"] as const) {
    for (const q of byDifficulty[d].slice(0, targets[d])) {
      if (usedIds.has(q.id)) continue;
      usedIds.add(q.id);
      selected.push(q);
    }
  }

  if (selected.length < count) {
    for (const q of shuffle(pool)) {
      if (selected.length >= count) break;
      if (usedIds.has(q.id)) continue;
      usedIds.add(q.id);
      selected.push(q);
    }
  }

  return shuffle(selected.slice(0, count));
}

/** How many milestone exam sessions already exist for this bucket's checkpoint date — lets the
 *  UI offer "retake" / label each attempt as its own iteration instead of pretending the
 *  checkpoint was never attempted. */
export async function countMilestoneAttempts(bucket: Bucket, milestoneDate: string): Promise<number> {
  const rows = await sql`SELECT config FROM test_sessions`;
  let count = 0;
  for (const r of rows) {
    try {
      const cfg = JSON.parse(r.config);
      if (cfg.source === "milestone" && cfg.bucket === bucket && cfg.milestoneDate === milestoneDate) count++;
    } catch {
      continue;
    }
  }
  return count;
}

export async function generateMilestoneExam(bucket: Bucket, requestedSize?: number) {
  const { resolvedDate, topics, poolMap } = await milestoneTopics(bucket);
  if (poolMap.size === 0) {
    throw new Error("Log some questions before generating a milestone exam");
  }

  const targetSize = Math.max(MIN_EXAM_SIZE, Math.min(MAX_EXAM_SIZE, requestedSize ?? EXAM_SIZE[bucket]));
  const milestoneDate = toLocalDateString(resolvedDate);
  const previousAttempts = await countMilestoneAttempts(bucket, milestoneDate);
  const trackedNumbers = new Set((await sql`SELECT number FROM questions`).map((r: any) => r.number as number));
  const wantSupplemental = Math.max(4, Math.ceil(targetSize / 2));

  // Prefer LeetCode's own curated "similar questions" for each question already in the pool —
  // real editorial data beats an LLM guessing at what's related.
  const realCandidates = new Set<number>();
  for (const q of poolMap.values()) {
    let similar: Array<{ number: number | null }> = [];
    try {
      similar = JSON.parse(q.similar_questions ?? "[]");
    } catch {
      continue;
    }
    for (const s of similar) {
      if (s.number && !trackedNumbers.has(s.number)) realCandidates.add(s.number);
    }
  }

  const candidateNumbers = [...realCandidates].slice(0, wantSupplemental);

  // Only ask the LLM to fill whatever gap real curated data couldn't cover.
  if (candidateNumbers.length < wantSupplemental) {
    try {
      const suggestedNumbers = await generateSimilarQuestionNumbers({
        topics,
        count: wantSupplemental - candidateNumbers.length,
        excludeNumbers: [...trackedNumbers, ...candidateNumbers],
      });
      candidateNumbers.push(...suggestedNumbers);
    } catch (err) {
      console.warn("Milestone exam: AI suggestion failed, using curated + tracked questions only:", (err as Error).message);
    }
  }

  for (const num of candidateNumbers) {
    try {
      const q = await findOrCreateQuestion(num);
      poolMap.set(q.id, q);
    } catch (err) {
      console.warn(`Milestone exam: couldn't add candidate #${num}:`, (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  const combined = [...poolMap.values()];
  const selected = selectWithDifficultySkew(combined, Math.min(targetSize, combined.length), bucket);
  if (!selected.length) throw new Error("Couldn't put together a milestone exam from your current data");

  const config = {
    count: selected.length,
    source: "milestone",
    bucket,
    milestoneDate,
    iteration: previousAttempts + 1,
    topics,
  };
  const [session] = await sql`INSERT INTO test_sessions (config) VALUES (${JSON.stringify(config)}) RETURNING *`;

  for (let idx = 0; idx < selected.length; idx++) {
    await sql`INSERT INTO test_session_questions (session_id, question_id, order_index) VALUES (${session.id}, ${selected[idx].id}, ${idx})`;
  }

  const sessionQuestions = selected.map((q, idx) => ({
    order_index: idx,
    question: {
      id: q.id,
      number: q.number,
      title: q.title,
      difficulty: q.difficulty,
      topics: JSON.parse(q.topics ?? "[]"),
      leetcode_url: q.leetcode_url,
    },
  }));

  return { session: { id: session.id, config, questions: sessionQuestions } };
}
