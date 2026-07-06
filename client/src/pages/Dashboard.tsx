import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { Flame, CalendarClock, Sparkles, CheckCircle2, Pencil, Clock, RefreshCw, Award, Repeat } from 'lucide-react'
import {
  api,
  type DueResponse,
  type InsightsReport,
  type LeetCodeProfile,
  type ActivityDay,
  type ActivityTracker,
  type SyncResult,
  type MilestoneNext,
  type MilestoneBucket,
  type RevisePreview,
  type TestSession,
} from '../lib/api'
import { Button, Card, DifficultyBadge, EmptyState, Input, Spinner, TopicTag } from '../components/ui'
import { Heatmap } from '../components/Heatmap'

const MILESTONE_EXAM_LABEL: Record<MilestoneBucket, string> = {
  '5': '5th of the month',
  '10': '10th of the month',
  '15': '15th of the month',
  '20': '20th of the month',
  'monthly-test': 'Monthly Milestone Exam',
}

// Question-count options offered for any Milestone Exam — the server clamps to whatever pool is
// actually available, this just sets the target.
const RANGE_OPTIONS = [
  { label: '5–10', count: 10 },
  { label: '10–15', count: 15 },
  { label: '15–20', count: 20 },
  { label: '20–25', count: 25 },
]
const DEFAULT_RANGE_INDEX: Record<MilestoneBucket, number> = {
  '5': 0,
  '10': 1,
  '15': 1,
  '20': 2,
  'monthly-test': 3,
}

function MilestoneExamCard() {
  const navigate = useNavigate()
  const next = useQuery({
    queryKey: ['tests', 'milestone', 'next'],
    queryFn: () => api.get<MilestoneNext>('/tests/milestone/next'),
  })
  const [rangeIdx, setRangeIdx] = useState<number | null>(null)

  const generate = useMutation({
    mutationFn: (vars: { bucket: MilestoneBucket; count: number }) =>
      api.post<{ session: TestSession }>('/tests/milestone/generate', vars),
    onSuccess: (data) => navigate(`/test/${data.session.id}`),
  })

  if (next.isLoading || !next.data) {
    return (
      <Card className="border-(--color-gold)/25">
        <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
          <Spinner /> Loading next milestone exam…
        </div>
      </Card>
    )
  }

  const dueDate = new Date(`${next.data.dueDate}T00:00:00`)
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const daysUntil = Math.round((dueDate.getTime() - startOfToday.getTime()) / 86_400_000)
  const attemptsSoFar = next.data.attemptsSoFar
  const activeRangeIdx = rangeIdx ?? DEFAULT_RANGE_INDEX[next.data.bucket]

  return (
    <Card className="border-(--color-gold)/25 shadow-[0_0_30px_-12px_color-mix(in_srgb,var(--color-gold)_60%,transparent)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-medium">
          <Award size={17} className="text-(--color-gold)" />
          Next Milestone Exam
        </h2>
        <span className="text-xs font-medium text-(--color-gold)">
          {daysUntil <= 0 ? 'due today' : `in ${daysUntil} day${daysUntil === 1 ? '' : 's'}`}
        </span>
      </div>

      <p className="mt-2 text-sm text-(--color-text-dim)">
        {MILESTONE_EXAM_LABEL[next.data.bucket]} —{' '}
        {dueDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        {next.data.bucket === 'monthly-test' && ' · covers everything practiced this month · hardest of the month'}
      </p>

      {attemptsSoFar > 0 && (
        <p className="mt-1.5 text-xs text-(--color-text-faint)">
          Already attempted {attemptsSoFar} time{attemptsSoFar === 1 ? '' : 's'} for this checkpoint.
        </p>
      )}

      {next.data.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {next.data.topics.slice(0, 10).map((t) => (
            <TopicTag key={t} topic={t} />
          ))}
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1.5 text-xs text-(--color-text-faint)">Questions</div>
        <div className="flex flex-wrap gap-1.5">
          {RANGE_OPTIONS.map((opt, idx) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setRangeIdx(idx)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                idx === activeRangeIdx
                  ? 'border-(--color-gold) text-(--color-gold)'
                  : 'border-(--color-border) text-(--color-text-dim) hover:border-(--color-text-faint)'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Button
        className="mt-4"
        onClick={() => generate.mutate({ bucket: next.data!.bucket, count: RANGE_OPTIONS[activeRangeIdx].count })}
        disabled={generate.isPending}
      >
        {generate.isPending ? (
          <>
            <Spinner /> Building your exam…
          </>
        ) : attemptsSoFar > 0 ? (
          `Retake — attempt ${attemptsSoFar + 1}`
        ) : (
          'Start Milestone Exam'
        )}
      </Button>

      {generate.isError && <p className="mt-2 text-sm text-(--color-hard)">{(generate.error as Error).message}</p>}
    </Card>
  )
}

function ReviseLatestCard() {
  const navigate = useNavigate()
  const preview = useQuery({
    queryKey: ['tests', 'revise-latest', 'preview'],
    queryFn: () => api.get<RevisePreview>('/tests/revise-latest/preview'),
  })

  const generate = useMutation({
    mutationFn: () => api.post<{ session: TestSession }>('/tests/revise-latest/generate'),
    onSuccess: (data) => navigate(`/test/${data.session.id}`),
  })

  if (preview.isLoading || !preview.data) {
    return (
      <Card className="border-(--color-accent)/25">
        <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
          <Spinner /> Loading today's revision…
        </div>
      </Card>
    )
  }

  const { topics } = preview.data

  return (
    <Card className="border-(--color-accent)/25 shadow-[0_0_30px_-12px_color-mix(in_srgb,var(--color-accent)_50%,transparent)]">
      <h2 className="flex items-center gap-2 font-medium">
        <Repeat size={17} className="text-(--color-accent)" />
        Revise latest topics
      </h2>

      {topics.length === 0 ? (
        <p className="mt-2 text-sm text-(--color-text-dim)">
          Solve a couple of questions over the next few days and this'll build a quick revision test from what you've
          been practicing.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-(--color-text-dim)">
            Currently practicing, from the last few days:
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {topics.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-md border border-(--color-accent)/30 bg-(--color-accent)/10 px-2.5 py-1 text-xs font-medium text-(--color-accent)"
              >
                {t}
              </span>
            ))}
          </div>

          <Button className="mt-4" onClick={() => generate.mutate()} disabled={generate.isPending}>
            {generate.isPending ? (
              <>
                <Spinner /> Building…
              </>
            ) : (
              'Start revision test'
            )}
          </Button>
        </>
      )}

      {generate.isError && <p className="mt-2 text-sm text-(--color-hard)">{(generate.error as Error).message}</p>}
    </Card>
  )
}

/** Syncs recent LeetCode submissions once per Dashboard visit (server-side throttled to 5min), plus an
 *  on-demand "Sync now" that bypasses the throttle. */
function useAutoSync() {
  const queryClient = useQueryClient()
  const firedRef = useRef(false)

  const sync = useMutation({
    mutationFn: (force: boolean) => api.post<SyncResult>('/leetcode/sync', { force }),
    onSuccess: (result) => {
      if (result.synced > 0) {
        queryClient.invalidateQueries({ queryKey: ['stats'] })
        queryClient.invalidateQueries({ queryKey: ['review'] })
        queryClient.invalidateQueries({ queryKey: ['questions'] })
        queryClient.invalidateQueries({ queryKey: ['leetcode', 'profile'] })
      }
    },
  })

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    sync.mutate(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return sync
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (diffSec < 10) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  return `${Math.round(diffHour / 24)}d ago`
}

const BUCKET_LABELS: Record<string, string> = {
  '5': 'Milestone Exam — 5th of the month',
  '10': 'Milestone Exam — 10th of the month',
  '15': 'Milestone Exam — 15th of the month',
  '20': 'Milestone Exam — 20th of the month',
  'monthly-test': 'Monthly Milestone Exam (covers the full month)',
}

function SubmissionStat({ label, counts }: { label: string; counts: { total: number; new: number; repeated: number } }) {
  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-surface-2) p-4">
      <div className="text-xs uppercase tracking-wide text-(--color-text-faint)">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold text-(--color-text)">{counts.total}</div>
      <div className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-(--color-text-dim)">
        <span className="text-(--color-accent)">{counts.new} new</span>
        <span className="text-(--color-text-faint)">·</span>
        <span>{counts.repeated} repeated</span>
      </div>
    </div>
  )
}

function TimelyTracker() {
  const tracker = useQuery({ queryKey: ['stats', 'tracker'], queryFn: () => api.get<ActivityTracker>('/stats/tracker') })

  return (
    <Card>
      <h2 className="flex items-center gap-2 font-medium">
        <Clock size={16} className="text-(--color-accent)" />
        Timely tracker
      </h2>
      <p className="mt-1 text-xs text-(--color-text-faint)">
        Questions solved, split by whether you'd done them before. "Today" follows LeetCode's own day boundary.
      </p>

      {tracker.isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-(--color-text-dim)">
          <Spinner /> Loading…
        </div>
      )}

      {tracker.data && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SubmissionStat label="Today" counts={tracker.data.today} />
          <SubmissionStat label="This month" counts={tracker.data.thisMonth} />
        </div>
      )}
    </Card>
  )
}

function LeetCodeProfileCard({ sync }: { sync: ReturnType<typeof useAutoSync> }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')

  const savedUsername = useQuery({
    queryKey: ['settings', 'leetcode_username'],
    queryFn: () => api.get<{ value: string | null }>('/settings/leetcode_username'),
  })
  const username = savedUsername.data?.value

  const profile = useQuery({
    queryKey: ['leetcode', 'profile', username],
    queryFn: () => api.get<{ profile: LeetCodeProfile }>(`/leetcode/profile?username=${encodeURIComponent(username!)}`),
    enabled: !!username,
    retry: false,
  })

  const localActivity = useQuery({
    queryKey: ['stats', 'activity'],
    queryFn: () => api.get<{ calendar: ActivityDay[] }>('/stats/activity'),
    enabled: !username || profile.isError,
  })

  const saveUsername = useMutation({
    mutationFn: (value: string) => api.put('/settings/leetcode_username', { value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'leetcode_username'] })
      setEditing(false)
    },
  })

  const showConnectForm = editing || (!username && !savedUsername.isLoading)

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-medium">
          <Flame size={16} className="text-(--color-accent)" />
          Activity
        </h2>
        {username && !showConnectForm && (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => {
                setUsernameInput(username)
                setEditing(true)
              }}
              className="flex items-center gap-1 text-xs text-(--color-text-faint) hover:text-(--color-text-dim)"
            >
              <Pencil size={12} /> {username}
            </button>
            <div className="flex items-center gap-2 text-xs text-(--color-text-faint)">
              <span>{sync.isPending ? 'syncing…' : `synced ${timeAgo(sync.data?.lastSyncedAt ?? null)}`}</span>
              <button
                onClick={() => sync.mutate(true)}
                disabled={sync.isPending}
                className="flex items-center gap-1 text-(--color-accent) hover:text-(--color-accent)/80 disabled:opacity-50"
              >
                <RefreshCw size={11} className={sync.isPending ? 'animate-spin' : ''} /> Sync now
              </button>
            </div>
          </div>
        )}
      </div>
      {sync.isSuccess && sync.data.synced > 0 && (
        <p className="mt-1 text-xs text-(--color-accent)">synced {sync.data.synced} new from LeetCode</p>
      )}
      {sync.isError && <p className="mt-1 text-xs text-(--color-hard)">{(sync.error as Error).message}</p>}

      {showConnectForm && (
        <div className="mt-3 flex gap-2">
          <Input
            placeholder="Your LeetCode username"
            value={usernameInput}
            onChange={(e) => setUsernameInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && usernameInput && saveUsername.mutate(usernameInput)}
          />
          <Button disabled={!usernameInput || saveUsername.isPending} onClick={() => saveUsername.mutate(usernameInput)}>
            {saveUsername.isPending ? <Spinner /> : 'Connect'}
          </Button>
          {username && (
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      )}

      {!showConnectForm && username && profile.isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-(--color-text-dim)">
          <Spinner /> Loading LeetCode profile…
        </div>
      )}

      {!showConnectForm && username && profile.isError && (
        <p className="mt-3 text-sm text-(--color-hard)">{(profile.error as Error).message}</p>
      )}

      {!showConnectForm && profile.data && (
        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="font-mono text-lg font-semibold">{profile.data.profile.totalSolved.all}</span>
            <span className="ml-1 text-(--color-text-faint)">solved on LeetCode</span>
          </span>
          <span className="text-(--color-easy)">{profile.data.profile.totalSolved.easy} easy</span>
          <span className="text-(--color-medium)">{profile.data.profile.totalSolved.medium} medium</span>
          <span className="text-(--color-hard)">{profile.data.profile.totalSolved.hard} hard</span>
          {profile.data.profile.streak > 0 && (
            <span
              className="flex items-center gap-1 font-medium text-(--color-gold)"
              style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--color-gold) 70%, transparent))' }}
            >
              <Flame size={14} fill="currentColor" /> {profile.data.profile.streak} day streak
            </span>
          )}
        </div>
      )}

      <div className="mt-4">
        {profile.data && <Heatmap data={profile.data.profile.calendar} />}
        {!profile.data && localActivity.data && <Heatmap data={localActivity.data.calendar} />}
      </div>

      {!username && (
        <p className="mt-3 text-xs text-(--color-text-faint)">
          Connect your LeetCode username to pull your real total-solved count and activity calendar automatically.
        </p>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const queryClient = useQueryClient()
  const sync = useAutoSync()
  const due = useQuery({ queryKey: ['review', 'due'], queryFn: () => api.get<DueResponse>('/review/due') })
  const insights = useQuery({
    queryKey: ['insights', 'latest'],
    queryFn: () => api.get<{ report: InsightsReport | null }>('/insights/latest'),
  })

  const generateInsights = useMutation({
    mutationFn: () => api.post<{ report: InsightsReport }>('/insights/generate'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['insights', 'latest'] }),
  })

  const bucketEntries = due.data
    ? (Object.entries(due.data.buckets) as [string, typeof due.data.buckets[keyof typeof due.data.buckets]][]).filter(
        ([, items]) => items.length > 0
      )
    : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-(--color-text-dim)">Pure focus. Review what's due, then move on.</p>
      </div>

      <ReviseLatestCard />

      <MilestoneExamCard />

      <LeetCodeProfileCard sync={sync} />

      <TimelyTracker />

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium">
            <CalendarClock size={16} className="text-(--color-accent)" />
            Due for review
          </h2>
          {!!due.data?.dueTotal && (
            <Link to="/test/new">
              <Button>Start review test</Button>
            </Link>
          )}
        </div>

        {due.isLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-(--color-text-dim)">
            <Spinner /> Loading…
          </div>
        )}

        {due.data && due.data.dueTotal === 0 && (
          <div className="mt-4">
            <EmptyState
              icon={CheckCircle2}
              title="Nothing due right now"
              description="Log a question or two — they'll show up here for Milestone Exams on the 5th/10th/15th/20th, with the Monthly Milestone Exam on the 30th."
              action={
                <Link to="/log">
                  <Button variant="ghost">Log a question</Button>
                </Link>
              }
            />
          </div>
        )}

        {bucketEntries.length > 0 && (
          <div className="mt-4 space-y-5">
            {bucketEntries.map(([bucket, items]) => (
              <div key={bucket}>
                <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-faint)">
                  {BUCKET_LABELS[bucket]} · {items.length}
                </div>
                <div className="space-y-2">
                  {items.slice(0, 5).map((q) => (
                    <div
                      key={q.id}
                      className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-surface-2) px-3 py-2 transition-colors hover:border-(--color-text-faint)"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-(--color-text-dim)">#{q.number}</span>
                        <span className="text-sm">{q.title}</span>
                        <DifficultyBadge difficulty={q.difficulty} />
                      </div>
                      {q.daysOverdue > 0 && (
                        <span className="text-xs text-(--color-hard)">{q.daysOverdue}d overdue</span>
                      )}
                    </div>
                  ))}
                  {items.length > 5 && (
                    <div className="text-xs text-(--color-text-faint)">+{items.length - 5} more</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-medium">
            <Sparkles size={16} className="text-(--color-accent)" />
            AI insights
          </h2>
          <Button variant="ghost" onClick={() => generateInsights.mutate()} disabled={generateInsights.isPending}>
            {generateInsights.isPending ? <Spinner /> : insights.data?.report ? 'Regenerate' : 'Generate'}
          </Button>
        </div>

        {generateInsights.isError && (
          <p className="mt-3 text-sm text-(--color-hard)">{(generateInsights.error as Error).message}</p>
        )}

        {!insights.data?.report && !generateInsights.isPending && (
          <p className="mt-3 text-sm text-(--color-text-dim)">
            Generate a high-level report on your strengths, weak topics, and what to study next.
          </p>
        )}

        {insights.data?.report && (
          <div className="mt-3">
            <div className="mb-2 text-xs text-(--color-text-faint)">
              Generated {new Date(insights.data.report.generated_at).toLocaleString()}
            </div>
            <div className="insights-markdown text-sm leading-relaxed text-(--color-text)">
              <ReactMarkdown>{insights.data.report.summary}</ReactMarkdown>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
