/** Regular review checkpoints, as a day-of-month. Stage 4+ is the monthly test (big test) checkpoint. */
export const CHECKPOINT_DAYS = [5, 10, 15, 20];
export const MONTHLY_TEST_DAY = 30;

export type Bucket = "5" | "10" | "15" | "20" | "monthly-test";

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** The next date, strictly after `from`, that falls on `targetDay` of its month (clamped to short months). */
function nextCalendarCheckpoint(from: Date, targetDay: number): Date {
  const year = from.getFullYear();
  const month = from.getMonth();

  const clampedThisMonth = Math.min(targetDay, lastDayOfMonth(year, month));
  const candidate = new Date(year, month, clampedThisMonth);
  if (candidate.getTime() > from.getTime()) return candidate;

  const clampedNextMonth = Math.min(targetDay, lastDayOfMonth(year, month + 1));
  return new Date(year, month + 1, clampedNextMonth);
}

/**
 * Given the last attempt date and how many reviews have happened since,
 * compute the calendar checkpoint bucket this question belongs to and its next due date.
 */
export function computeSchedule(lastAttemptDate: Date, stage: number, now: Date = new Date()) {
  const isMonthlyTest = stage >= CHECKPOINT_DAYS.length;
  const targetDay = isMonthlyTest ? MONTHLY_TEST_DAY : CHECKPOINT_DAYS[stage];
  const bucket: Bucket = isMonthlyTest ? "monthly-test" : (String(targetDay) as Bucket);

  const nextDue = nextCalendarCheckpoint(lastAttemptDate, targetDay);
  const daysOverdue = daysBetween(nextDue, now);

  return {
    bucket,
    nextDue,
    isDue: now.getTime() >= nextDue.getTime(),
    daysOverdue: Math.max(0, daysOverdue),
  };
}

/** Confidence (1-5) nudges the stage: low resets to 0, high advances by one extra stage. */
export function adjustStageForConfidence(currentStage: number, confidence: number): number {
  if (confidence <= 2) return 0;
  if (confidence >= 5) return currentStage + 2;
  return currentStage + 1;
}

export type AttemptLite = { date: string; confidence: number };

/**
 * Replays a question's attempt history to find its current review stage and schedule.
 * The first attempt always seeds stage 0 (next checkpoint: the 5th); each attempt after
 * that uses its self-reported confidence to adjust the stage for the next checkpoint.
 */
export function computeQuestionState(attempts: AttemptLite[], now: Date = new Date()) {
  const sorted = [...attempts].sort((a, b) => a.date.localeCompare(b.date));
  let stage = 0;
  for (let i = 1; i < sorted.length; i++) {
    stage = adjustStageForConfidence(stage, sorted[i].confidence);
  }
  const lastAttemptDate = new Date(sorted[sorted.length - 1].date);
  const schedule = computeSchedule(lastAttemptDate, stage, now);
  return { stage, lastAttemptDate, attemptCount: sorted.length, ...schedule };
}
