import { useMemo } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CalendarRange, Flag, Award } from 'lucide-react'
import { api, type ScheduleItem, type MilestoneBucket, type TestSession } from '../lib/api'
import { Button, Card, DifficultyBadge, EmptyState, Spinner } from '../components/ui'
import { TestSectionTabs } from '../components/TestSectionTabs'

const CHECKPOINTS: Array<{ day: number; bucket: MilestoneBucket; label: string; fullLabel: string }> = [
  { day: 5, bucket: '5', label: '5th', fullLabel: 'Milestone Exam — 5th of the month' },
  { day: 10, bucket: '10', label: '10th', fullLabel: 'Milestone Exam — 10th of the month' },
  { day: 15, bucket: '15', label: '15th', fullLabel: 'Milestone Exam — 15th of the month' },
  { day: 20, bucket: '20', label: '20th', fullLabel: 'Milestone Exam — 20th of the month' },
  { day: 30, bucket: 'monthly-test', label: 'Exam', fullLabel: 'Monthly Milestone Exam (covers the full month)' },
]

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

export default function TestSchedule() {
  const navigate = useNavigate()
  const schedule = useQuery({
    queryKey: ['review', 'schedule'],
    queryFn: () => api.get<{ items: ScheduleItem[] }>('/review/schedule'),
  })

  const generate = useMutation({
    mutationFn: (bucket: MilestoneBucket) => api.post<{ session: TestSession }>('/tests/milestone/generate', { bucket }),
    onSuccess: (data) => navigate(`/test/${data.session.id}`),
  })

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = lastDayOfMonth(year, month)
  const monthLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const todayPct = daysInMonth > 1 ? ((now.getDate() - 1) / (daysInMonth - 1)) * 100 : 0

  const itemsThisMonth = useMemo(() => {
    return (schedule.data?.items ?? []).filter((item) => {
      const d = new Date(item.nextDue)
      return d.getFullYear() === year && d.getMonth() === month
    })
  }, [schedule.data, year, month])

  const byCheckpoint = useMemo(() => {
    const map: Record<string, ScheduleItem[]> = { '5': [], '10': [], '15': [], '20': [], 'monthly-test': [] }
    for (const item of itemsThisMonth) map[item.bucket]?.push(item)
    return map
  }, [itemsThisMonth])

  return (
    <div className="mx-auto max-w-3xl">
      <TestSectionTabs />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Monthly schedule</h1>
        <p className="mt-1 text-sm text-(--color-text-dim)">
          {monthLabel} — your Milestone Exam plan for this month.
        </p>
      </div>

      {schedule.isLoading && (
        <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
          <Spinner /> Loading…
        </div>
      )}

      {schedule.data && itemsThisMonth.length === 0 && (
        <EmptyState
          icon={CalendarRange}
          title="Nothing scheduled this month"
          description="Log a question to put it on the calendar — Milestone Exams land on the 5th/10th/15th/20th, with the Monthly Milestone Exam on the 30th."
        />
      )}

      {generate.isError && <p className="mb-4 text-sm text-(--color-hard)">{(generate.error as Error).message}</p>}

      {itemsThisMonth.length > 0 && (
        <>
          <Card>
            <div className="relative mt-8 mb-14 h-1 rounded-full bg-(--color-surface-2)">
              <div className="absolute -top-7 -translate-x-1/2 text-center" style={{ left: `${todayPct}%` }}>
                <div className="whitespace-nowrap text-[10px] font-medium uppercase tracking-wide text-(--color-gold)">
                  Today
                </div>
                <div className="mx-auto mt-1 h-3 w-0.5 bg-(--color-gold)" />
              </div>

              {CHECKPOINTS.map((cp) => {
                const day = Math.min(cp.day, daysInMonth)
                const pct = daysInMonth > 1 ? ((day - 1) / (daysInMonth - 1)) * 100 : 0
                const count = byCheckpoint[cp.bucket].length
                const passed = now.getDate() > day

                return (
                  <div key={cp.bucket} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct}%` }}>
                    <div
                      className={`h-4 w-4 rounded-full border-2 ${
                        passed
                          ? 'border-(--color-text-faint) bg-(--color-surface-2)'
                          : count > 0
                            ? 'border-(--color-accent) bg-(--color-accent)'
                            : 'border-(--color-border) bg-(--color-surface)'
                      }`}
                    />
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 text-center">
                      <div className="whitespace-nowrap text-xs text-(--color-text-dim)">{cp.label}</div>
                      {count > 0 && <div className="font-mono text-xs text-(--color-text)">{count}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <div className="mt-8 space-y-5">
            {CHECKPOINTS.filter((cp) => byCheckpoint[cp.bucket].length > 0).map((cp) => (
              <Card key={cp.bucket}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 font-medium">
                    <Flag size={15} className="text-(--color-accent)" />
                    {cp.fullLabel}
                    <span className="text-sm font-normal text-(--color-text-faint)">· {byCheckpoint[cp.bucket].length}</span>
                  </h2>
                  <Button
                    variant="ghost"
                    onClick={() => generate.mutate(cp.bucket)}
                    disabled={generate.isPending}
                    className="text-xs"
                  >
                    {generate.isPending ? (
                      <Spinner />
                    ) : (
                      <>
                        <Award size={13} /> Start Milestone Exam
                      </>
                    )}
                  </Button>
                </div>
                <div className="mt-3 space-y-2">
                  {byCheckpoint[cp.bucket].map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-surface-2) px-3 py-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm text-(--color-text-dim)">#{item.number}</span>
                        <span className="text-sm">{item.title}</span>
                        <DifficultyBadge difficulty={item.difficulty} />
                      </div>
                      <span className={item.isDue && item.daysOverdue > 0 ? 'text-xs text-(--color-hard)' : 'text-xs text-(--color-text-faint)'}>
                        {item.isDue
                          ? item.daysOverdue > 0
                            ? `${item.daysOverdue}d overdue`
                            : 'due now'
                          : new Date(item.nextDue).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
