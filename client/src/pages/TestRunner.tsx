import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, ListChecks, Timer as TimerIcon, MousePointerClick, Lightbulb } from 'lucide-react'
import { api, type TestResults } from '../lib/api'
import { Button, Card, DifficultyBadge, Spinner, TopicTag } from '../components/ui'

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const RESULT_OPTIONS: Array<{ value: 'correct' | 'struggled' | 'failed' | 'skipped'; label: string; className: string }> = [
  { value: 'correct', label: 'Solved', className: 'border-(--color-easy)/40 text-(--color-easy) hover:bg-(--color-easy)/10' },
  { value: 'struggled', label: 'Struggled', className: 'border-(--color-medium)/40 text-(--color-medium) hover:bg-(--color-medium)/10' },
  { value: 'failed', label: 'Failed', className: 'border-(--color-hard)/40 text-(--color-hard) hover:bg-(--color-hard)/10' },
  { value: 'skipped', label: 'Skip', className: 'border-(--color-border) text-(--color-text-dim) hover:border-(--color-text-dim)' },
]

export default function TestRunner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const session = useQuery({ queryKey: ['test', id], queryFn: () => api.get<TestResults>(`/tests/${id}`) })

  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [questionElapsed, setQuestionElapsed] = useState(0)
  const [totalElapsed, setTotalElapsed] = useState(0)
  const [hintsShown, setHintsShown] = useState(0)

  // Timers are derived from wall-clock timestamps, not tick counts — a backgrounded tab (e.g.
  // while you're solving on leetcode.com) throttles setInterval, which would otherwise silently
  // undercount the time actually spent. Recomputing from Date.now() on every tick and on tab
  // refocus keeps the displayed time (and what gets submitted) accurate regardless.
  const questionStartRef = useRef(Date.now())
  const totalStartRef = useRef(Date.now())

  useEffect(() => {
    if (!started) return
    const tick = () => {
      setQuestionElapsed(Math.round((Date.now() - questionStartRef.current) / 1000))
      setTotalElapsed(Math.round((Date.now() - totalStartRef.current) / 1000))
    }
    tick()
    const t = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [started])

  useEffect(() => {
    questionStartRef.current = Date.now()
    setQuestionElapsed(0)
    setHintsShown(0)
  }, [index])

  useEffect(() => {
    if (started) {
      totalStartRef.current = Date.now()
      questionStartRef.current = Date.now()
    }
  }, [started])

  const config = useMemo(() => (session.data ? JSON.parse(session.data.session.config) : {}), [session.data])
  const perQuestionSec: number | null = config.perQuestionSec ?? null

  const mark = useMutation({
    mutationFn: (result: string) => {
      const timeSpentSec = Math.round((Date.now() - questionStartRef.current) / 1000)
      return api.patch(`/tests/${id}/questions/${current!.question_id}`, { result, time_spent_sec: timeSpentSec })
    },
  })

  const finish = useMutation({
    mutationFn: () => api.post(`/tests/${id}/finish`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test', id] })
      navigate(`/test/${id}/results`)
    },
  })

  if (session.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    )
  }

  if (session.isError || !session.data) {
    return (
      <div className="flex h-screen items-center justify-center text-(--color-hard)">
        {(session.error as Error)?.message ?? 'Test not found'}
      </div>
    )
  }

  const items = session.data.items
  const current = items[index]
  const isLast = index === items.length - 1
  const overTime = perQuestionSec != null && questionElapsed > perQuestionSec

  async function handleMark(result: string) {
    await mark.mutateAsync(result)
    if (isLast) {
      finish.mutate()
    } else {
      setIndex((i) => i + 1)
    }
  }

  if (!started) {
    return (
      <div className="flex h-screen items-center justify-center px-6">
        <Card className="w-full max-w-md">
          <h1 className="text-lg font-semibold tracking-tight">Before you start</h1>
          <ul className="mt-4 space-y-3 text-sm text-(--color-text-dim)">
            <li className="flex gap-2.5">
              <ExternalLink size={16} className="mt-0.5 shrink-0 text-(--color-accent)" />
              Each question shows its number and title with an "Open on LeetCode" button — click it, solve the
              problem there.
            </li>
            <li className="flex gap-2.5">
              <MousePointerClick size={16} className="mt-0.5 shrink-0 text-(--color-accent)" />
              Come back here and self-mark it Solved, Struggled, Failed, or Skip.
            </li>
            <li className="flex gap-2.5">
              <TimerIcon size={16} className="mt-0.5 shrink-0 text-(--color-accent)" />
              {perQuestionSec != null
                ? `A ${formatTime(perQuestionSec)} soft timer runs per question, plus a total session timer. Neither auto-submits — they're just for pacing.`
                : 'A timer tracks time per question and for the whole session — no limit is enforced.'}
            </li>
            <li className="flex gap-2.5">
              <ListChecks size={16} className="mt-0.5 shrink-0 text-(--color-accent)" />
              {items.length} question{items.length === 1 ? '' : 's'} in this session, shuffled. Results and a topic
              breakdown are waiting for you at the end.
            </li>
          </ul>
          <Button className="mt-6 w-full" onClick={() => setStarted(true)}>
            Start test
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col items-center justify-center px-6">
      <div className="absolute top-6 left-6 font-mono text-xs text-(--color-text-faint)">
        question {index + 1} / {items.length}
      </div>
      <div className="absolute top-6 right-6 font-mono text-xs text-(--color-text-faint)">
        total {formatTime(totalElapsed)}
      </div>

      <div className="w-full max-w-xl text-center">
        <div className={`font-mono text-4xl font-semibold ${overTime ? 'text-(--color-hard)' : 'text-(--color-accent)'}`}>
          {formatTime(questionElapsed)}
          {perQuestionSec != null && <span className="text-(--color-text-faint)"> / {formatTime(perQuestionSec)}</span>}
        </div>

        <div className="mt-8 flex items-center justify-center gap-3">
          <span className="font-mono text-(--color-text-dim)">#{current.number}</span>
          <DifficultyBadge difficulty={current.difficulty} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{current.title}</h1>

        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {current.topics.map((t) => (
            <TopicTag key={t} topic={t} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-center gap-2">
          <a
            href={current.leetcode_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-(--color-accent)/40 px-3 py-1.5 text-sm text-(--color-accent) transition-colors hover:bg-(--color-accent)/10"
          >
            <ExternalLink size={14} /> Open on LeetCode
          </a>
          {current.hints.length > 0 && hintsShown < current.hints.length && (
            <button
              onClick={() => setHintsShown((n) => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-(--color-border) px-3 py-1.5 text-sm text-(--color-text-dim) transition-colors hover:border-(--color-text-faint)"
            >
              <Lightbulb size={14} /> {hintsShown === 0 ? 'Show a hint' : 'Show another hint'}
            </button>
          )}
        </div>

        {hintsShown > 0 && (
          <div className="mx-auto mt-3 max-w-lg space-y-2 text-left">
            {current.hints.slice(0, hintsShown).map((hint, i) => (
              <p key={i} className="rounded-lg border border-(--color-border) bg-(--color-surface-2) px-3 py-2 text-xs text-(--color-text-dim)">
                <span className="font-mono text-(--color-text-faint)">Hint {i + 1}:</span> {hint}
              </p>
            ))}
          </div>
        )}

        <div className="mt-10 flex justify-center gap-3">
          {RESULT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleMark(opt.value)}
              disabled={mark.isPending || finish.isPending}
              className={`rounded-lg border px-4 py-2 text-sm transition-colors disabled:opacity-40 ${opt.className}`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(mark.isPending || finish.isPending) && (
          <div className="mt-4 flex justify-center">
            <Spinner />
          </div>
        )}
      </div>

      <Button variant="ghost" className="absolute bottom-6" onClick={() => navigate('/')}>
        Exit test
      </Button>
    </div>
  )
}
