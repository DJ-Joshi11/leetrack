import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import { Flame, ListChecks, CalendarClock, Sparkles, CheckCircle2, Pencil, Clock, RefreshCw } from 'lucide-react'
import {
  api,
  type DueResponse,
  type Overview,
  type InsightsReport,
  type LeetCodeProfile,
  type ActivityDay,
  type ActivityTracker,
  type SyncResult,
} from '../lib/api'
import { Button, Card, DifficultyBadge, EmptyState, Input, Spinner, StatTile } from '../components/ui'
import { Heatmap } from '../components/Heatmap'

/** Silently syncs recent LeetCode submissions once per Dashboard visit (server-side throttled to 5min). */
function useAutoSync() {
  const queryClient = useQueryClient()
  const firedRef = useRef(false)

  const sync = useMutation({
    mutationFn: () => api.post<SyncResult>('/leetcode/sync'),
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
    sync.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return sync
}

const BUCKET_LABELS: Record<string, string> = {
  '5': '5th of the month',
  '10': '10th of the month',
  '15': '15th of the month',
  '20': '20th of the month',
  'monthly-test': 'Monthly test (big test)',
}

const CHECKPOINT_ORDER: Array<keyof ActivityTracker['byCheckpoint']> = ['5', '10', '15', '20', 'monthly-test']
const CHECKPOINT_SHORT_LABELS: Record<string, string> = {
  '5': '5th',
  '10': '10th',
  '15': '15th',
  '20': '20th',
  'monthly-test': 'Monthly test',
}

function SubmissionStat({
  label,
  counts,
}: {
  label: string
  counts: { total: number; new: number; revised: number; backlog: number }
}) {
  return (
    <div className="rounded-lg border border-(--color-border) bg-(--color-surface-2) p-4">
      <div className="text-xs uppercase tracking-wide text-(--color-text-faint)">{label}</div>
      <div className="mt-1 font-mono text-2xl font-semibold text-(--color-text)">{counts.total}</div>
      <div className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-(--color-text-dim)">
        <span className="text-(--color-accent)">{counts.new} new</span>
        <span className="text-(--color-text-faint)">·</span>
        <span>{counts.revised} revised</span>
        {counts.backlog > 0 && (
          <>
            <span className="text-(--color-text-faint)">·</span>
            <span className="text-(--color-text-faint)">{counts.backlog} backlog</span>
          </>
        )}
      </div>
    </div>
  )
}

function TimelyTracker() {
  const tracker = useQuery({ queryKey: ['stats', 'tracker'], queryFn: () => api.get<ActivityTracker>('/stats/tracker') })
  const sync = useAutoSync()

  return (
    <Card>
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-medium">
          <Clock size={16} className="text-(--color-accent)" />
          Timely tracker
        </h2>
        {sync.isPending && (
          <span className="flex items-center gap-1.5 text-xs text-(--color-text-faint)">
            <RefreshCw size={12} className="animate-spin" /> syncing LeetCode…
          </span>
        )}
        {sync.data && sync.data.synced > 0 && (
          <span className="text-xs text-(--color-accent)">synced {sync.data.synced} new from LeetCode</span>
        )}
      </div>

      {tracker.isLoading && (
        <div className="mt-4 flex items-center gap-2 text-sm text-(--color-text-dim)">
          <Spinner /> Loading…
        </div>
      )}

      {tracker.data && (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <SubmissionStat label="Today" counts={tracker.data.today} />
            <SubmissionStat label="This month" counts={tracker.data.thisMonth} />
          </div>

          <div className="mt-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-faint)">On track</div>
            <div className="flex flex-wrap gap-2">
              {CHECKPOINT_ORDER.map((bucket) => (
                <div
                  key={bucket}
                  className="rounded-full border border-(--color-border) px-3 py-1 text-xs text-(--color-text-dim)"
                >
                  {CHECKPOINT_SHORT_LABELS[bucket]}
                  <span className="ml-1.5 font-mono text-(--color-text)">{tracker.data.byCheckpoint[bucket] ?? 0}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

function LeetCodeProfileCard() {
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
          <button
            onClick={() => {
              setUsernameInput(username)
              setEditing(true)
            }}
            className="flex items-center gap-1 text-xs text-(--color-text-faint) hover:text-(--color-text-dim)"
          >
            <Pencil size={12} /> {username}
          </button>
        )}
      </div>

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
  const overview = useQuery({ queryKey: ['stats', 'overview'], queryFn: () => api.get<Overview>('/stats/overview') })
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile icon={CheckCircle2} label="Unique questions tracked" value={overview.data?.totalQuestions ?? '—'} />
        <StatTile icon={ListChecks} label="Submissions tracked" value={overview.data?.totalAttempts ?? '—'} />
        <StatTile
          icon={CalendarClock}
          label="Due today"
          value={due.data?.dueTotal ?? '—'}
          sub={due.data?.overdueCount ? `${due.data.overdueCount} overdue` : undefined}
        />
      </div>

      <TimelyTracker />

      <LeetCodeProfileCard />

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
              description="Log a question or two — they'll show up here on the 5th/10th/15th/20th, with a monthly test on the 30th."
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
