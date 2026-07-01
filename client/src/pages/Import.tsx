import { useMemo, useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { DownloadCloud } from 'lucide-react'
import { api, type LeetCodeProfile, type Question } from '../lib/api'
import { todayIso } from '../lib/date'
import { Button, Card, Input, Spinner, Textarea } from '../components/ui'

type ParsedLine = { number: number; date: string; confidence?: number; raw: string; valid: boolean }

function parseLines(text: string): ParsedLine[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((raw) => {
      const parts = raw.split(',').map((p) => p.trim())
      const number = Number(parts[0])
      const date = parts[1] || todayIso()
      const confidence = parts[2] ? Number(parts[2]) : undefined
      const valid = Number.isInteger(number) && number > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date)
      return { number, date, confidence, raw, valid }
    })
}

export default function Import() {
  const [text, setText] = useState('')
  const [pullUsername, setPullUsername] = useState('')
  const [pullSummary, setPullSummary] = useState<{ pulled: number; new: number; alreadyLogged: number } | null>(null)
  const parsed = useMemo(() => parseLines(text), [text])
  const validLines = parsed.filter((l) => l.valid)

  const savedUsername = useQuery({
    queryKey: ['settings', 'leetcode_username'],
    queryFn: () => api.get<{ value: string | null }>('/settings/leetcode_username'),
  })
  useEffect(() => {
    if (savedUsername.data?.value) setPullUsername(savedUsername.data.value)
  }, [savedUsername.data?.value])

  const questions = useQuery({ queryKey: ['questions'], queryFn: () => api.get<{ questions: Question[] }>('/questions') })

  const pull = useMutation({
    mutationFn: (username: string) => api.get<{ profile: LeetCodeProfile }>(`/leetcode/profile?username=${encodeURIComponent(username)}`),
    onSuccess: (data) => {
      const loggedNumbers = new Set((questions.data?.questions ?? []).map((q) => q.number))
      const withNumbers = data.profile.recentSubmissions.filter((s): s is typeof s & { number: number } => s.number !== null)
      const newOnes = withNumbers.filter((s) => !loggedNumbers.has(s.number))
      setText(newOnes.map((s) => `${s.number}, ${s.date}`).join('\n'))
      setPullSummary({
        pulled: withNumbers.length,
        new: newOnes.length,
        alreadyLogged: withNumbers.length - newOnes.length,
      })
    },
  })

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ results: Array<{ number: number; ok: boolean; skipped?: boolean; error?: string }> }>(
        '/questions/bulk',
        { lines: validLines.map(({ number, date, confidence }) => ({ number, date, confidence })) }
      ),
  })

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bulk import</h1>
        <p className="mt-1 text-sm text-(--color-text-dim)">
          Paste your notebook history, or pull recent submissions straight from LeetCode.
        </p>
      </div>

      <Card>
        <h2 className="flex items-center gap-2 font-medium">
          <DownloadCloud size={16} className="text-(--color-accent)" />
          Pull from LeetCode
        </h2>
        <div className="mt-3 flex gap-2">
          <Input
            placeholder="Your LeetCode username"
            value={pullUsername}
            onChange={(e) => setPullUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && pullUsername && pull.mutate(pullUsername)}
          />
          <Button disabled={!pullUsername || pull.isPending} onClick={() => pull.mutate(pullUsername)}>
            {pull.isPending ? <Spinner /> : 'Pull recent'}
          </Button>
        </div>
        {pull.isError && <p className="mt-2 text-sm text-(--color-hard)">{(pull.error as Error).message}</p>}
        {pullSummary && (
          <p className="mt-2 text-sm text-(--color-text-dim)">
            Pulled {pullSummary.pulled} recent accepted submissions — <span className="text-(--color-accent)">{pullSummary.new} new</span>
            {pullSummary.alreadyLogged > 0 && `, ${pullSummary.alreadyLogged} already logged (skipped)`}. Review below before
            importing.
          </p>
        )}
        <p className="mt-2 text-xs text-(--color-text-faint)">
          LeetCode's public API only exposes your last 20 accepted submissions — it can't return your full history (no
          public endpoint for that exists). Make "Pull recent" a habit — since it skips what's already logged, running
          it regularly keeps everything captured going forward. For older backlog, paste it manually below.
        </p>
      </Card>

      <Card>
        <div className="mb-2 font-mono text-xs text-(--color-text-faint)">
          format: number, date(YYYY-MM-DD), confidence(optional 1-5)
        </div>
        <Textarea
          rows={10}
          placeholder={'1, 2026-06-01, 4\n200, 2026-06-03\n746, 2026-06-05, 2'}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        {parsed.length > 0 && (
          <div className="mt-3 text-sm text-(--color-text-dim)">
            {validLines.length} of {parsed.length} lines look valid
            {parsed.length !== validLines.length && (
              <span className="text-(--color-hard)"> — check the date format on the rest</span>
            )}
          </div>
        )}

        <div className="mt-4">
          <Button disabled={!validLines.length || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? <Spinner /> : `Import ${validLines.length || ''} question${validLines.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </Card>

      {submit.data && (
        <Card>
          <h2 className="mb-3 font-medium">Results</h2>
          <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-thin text-sm">
            {submit.data.results.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded px-2 py-1 odd:bg-(--color-surface-2)">
                <span className="font-mono">#{r.number}</span>
                {r.ok ? (
                  <span className={r.skipped ? 'text-(--color-text-faint)' : 'text-(--color-easy)'}>
                    {r.skipped ? 'already logged for that date — skipped' : 'saved'}
                  </span>
                ) : (
                  <span className="text-(--color-hard)">{r.error}</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
