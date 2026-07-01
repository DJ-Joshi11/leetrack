const BASE = `${import.meta.env.VITE_API_URL ?? ''}/api`

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Request failed: ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard'

export type Question = {
  id: number
  number: number
  title: string
  slug: string
  difficulty: Difficulty
  topics: string[]
  leetcode_url: string
  optimal_time_complexity: string | null
  optimal_space_complexity: string | null
  ai_pattern_summary: string | null
  created_at: string
  attempt_count?: number
  last_attempt_date?: string | null
}

export type CodeAnalysis = {
  estimatedTimeComplexity: string
  estimatedSpaceComplexity: string
  correctnessNotes: string
  feedback: string
}

export type Attempt = {
  id: number
  question_id: number
  date: string
  confidence: number
  notes: string | null
  code: string | null
  ai_code_analysis: CodeAnalysis | null
  time_taken_sec: number | null
  created_at: string
}

export type DueBucketItem = {
  id: number
  number: number
  title: string
  difficulty: Difficulty
  topics: string[]
  stage: number
  lastAttemptDate: string
  nextDue: string
  daysOverdue: number
}

export type DueResponse = {
  buckets: Record<'5' | '10' | '15' | '20' | 'monthly-test', DueBucketItem[]>
  overdueCount: number
  dueTotal: number
}

export type Overview = {
  totalQuestions: number
  totalAttempts: number
  streak: number
  dueCount: number
}

export type MilestoneBucket = '5' | '10' | '15' | '20' | 'monthly-test'

export type SubmissionCounts = { total: number; new: number; revised: number; backlog: number }

export type ActivityTracker = {
  today: SubmissionCounts
  thisMonth: SubmissionCounts
  byCheckpoint: Record<MilestoneBucket, number>
}

export type SyncResult = { synced: number; skipped: number; username: string | null; throttled: boolean }

export type ScheduleItem = {
  id: number
  number: number
  title: string
  difficulty: Difficulty
  topics: string[]
  stage: number
  bucket: MilestoneBucket
  lastAttemptDate: string
  nextDue: string
  isDue: boolean
  daysOverdue: number
}

export type MilestoneNext = {
  bucket: MilestoneBucket
  dueDate: string
  topics: string[]
  poolSize: number
  usedFallback: boolean
}

export type InsightsReport = {
  id: number
  generated_at: string
  summary: string
  stats_snapshot: string
}

export type ActivityDay = { date: string; count: number }

export type LeetCodeProfile = {
  username: string
  totalSolved: { all: number; easy: number; medium: number; hard: number }
  streak: number
  totalActiveDays: number
  calendar: ActivityDay[]
  recentSubmissions: Array<{ number: number | null; title: string; slug: string; date: string }>
}

export type AnalysisCharts = {
  topicDistribution: Array<{ topic: string; count: number }>
  difficultyDistribution: Array<{ difficulty: Difficulty; count: number }>
  confidenceTrend: Array<{ date: string; avgConfidence: number }>
  scoreTrend: Array<{ date: string; score: number; accuracy: number }>
  topicAccuracy: Array<{ topic: string; total: number; correct: number; accuracy: number }>
  totalQuestions: number
  totalAttempts: number
  totalTests: number
}

export type SuggestedQuestion = {
  number: number
  title: string
  difficulty: Difficulty
  url: string
  alreadyLogged: boolean
}

export type AnalysisReport = {
  id: number
  generated_at: string
  strengths: string[]
  weakTopics: string[]
  suggestedTopics: string[]
  plan: string
  suggestedQuestions: SuggestedQuestion[]
}

export type TestSessionQuestion = {
  order_index: number
  question: {
    id: number
    number: number
    title: string
    difficulty: Difficulty
    topics: string[]
    leetcode_url: string
  }
}

export type TestSession = {
  id: number
  config: any
  questions: TestSessionQuestion[]
}

export type TestResultItem = {
  id: number
  session_id: number
  question_id: number
  order_index: number
  time_spent_sec: number | null
  result: 'correct' | 'struggled' | 'failed' | 'skipped' | null
  answered_at: string | null
  number: number
  title: string
  difficulty: Difficulty
  topics: string[]
  leetcode_url: string
}

export type TestResults = {
  session: { id: number; started_at: string; ended_at: string | null; config: string }
  items: TestResultItem[]
  summary: {
    score: number
    accuracy: number
    totalQuestions: number
    answeredCount: number
    correctCount: number
    avgTimeSec: number
    byTopic: Record<string, { total: number; correct: number }>
    byDifficulty: Record<string, { total: number; correct: number }>
  }
}
