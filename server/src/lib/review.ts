export const MILESTONES_DAYS = [7, 10, 15, 30];

export type Bucket = "7" | "10" | "15" | "30" | "maintenance";

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/**
 * Given the last attempt date and how many reviews have happened since,
 * compute the bucket this question belongs to and its next due date.
 */
export function computeSchedule(lastAttemptDate: Date, stage: number, now: Date = new Date()) {
  const cappedStage = Math.min(stage, MILESTONES_DAYS.length - 1);
  const intervalDays =
    stage < MILESTONES_DAYS.length ? MILESTONES_DAYS[stage] : MILESTONES_DAYS[MILESTONES_DAYS.length - 1];

  const nextDue = new Date(lastAttemptDate);
  nextDue.setDate(nextDue.getDate() + intervalDays);

  const bucket: Bucket =
    stage < MILESTONES_DAYS.length ? (String(MILESTONES_DAYS[cappedStage]) as Bucket) : "maintenance";

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
 * The first attempt always seeds stage 0 (review again in 7 days); each attempt after
 * that uses its self-reported confidence to adjust the stage for the next interval.
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
