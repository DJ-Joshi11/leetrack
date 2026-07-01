import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api, type Attempt, type Question } from '../lib/api'
import { todayIso } from '../lib/date'
import { Button, Card, DifficultyBadge, Input, Spinner, Textarea, TopicTag } from '../components/ui'

export default function LogQuestion() {
  const [searchParams] = useSearchParams()
  const [number, setNumber] = useState(searchParams.get('number') ?? '')
  const [date, setDate] = useState(todayIso())
  const [confidence, setConfidence] = useState(3)
  const [code, setCode] = useState('')
  const [notes, setNotes] = useState('')

  const submit = useMutation({
    mutationFn: () =>
      api.post<{ question: Question; attempt: Attempt }>('/questions', {
        number: Number(number),
        date,
        confidence,
        code: code || undefined,
        notes: notes || undefined,
      }),
  })

  function reset() {
    setNumber('')
    setCode('')
    setNotes('')
    setConfidence(3)
    submit.reset()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log a question</h1>
        <p className="mt-1 text-sm text-(--color-text-dim)">
          Type the question number — title, difficulty, topics, and optimal complexity are fetched automatically.
        </p>
      </div>

      <Card>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit.mutate()
          }}
        >
          <div>
            <label className="mb-1 block text-xs text-(--color-text-dim)">Question number</label>
            <Input
              type="number"
              min={1}
              required
              autoFocus
              placeholder="e.g. 1"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="font-mono text-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-(--color-text-dim)">Date practiced</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-(--color-text-dim)">
                Confidence <span className="font-mono">{confidence}/5</span>
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full accent-(--color-accent)"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-(--color-text-dim)">
              Your solution code <span className="text-(--color-text-faint)">(optional — gets AI analysis)</span>
            </label>
            <Textarea rows={8} placeholder="Paste your code…" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block text-xs text-(--color-text-dim)">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any gotchas, approach, etc." />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={submit.isPending || !number}>
              {submit.isPending ? <Spinner /> : 'Fetch & save'}
            </Button>
            {submit.isSuccess && (
              <Button type="button" variant="ghost" onClick={reset}>
                Log another
              </Button>
            )}
          </div>

          {submit.isError && <p className="text-sm text-(--color-hard)">{(submit.error as Error).message}</p>}
        </form>
      </Card>

      {submit.data && (
        <Card className="border-(--color-accent)/30">
          <div className="flex items-center gap-3">
            <span className="font-mono text-(--color-text-dim)">#{submit.data.question.number}</span>
            <h2 className="font-medium">{submit.data.question.title}</h2>
            <DifficultyBadge difficulty={submit.data.question.difficulty} />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {submit.data.question.topics.map((t) => (
              <TopicTag key={t} topic={t} />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-(--color-text-faint)">Optimal time</div>
              <div className="font-mono">{submit.data.question.optimal_time_complexity}</div>
            </div>
            <div>
              <div className="text-xs text-(--color-text-faint)">Optimal space</div>
              <div className="font-mono">{submit.data.question.optimal_space_complexity}</div>
            </div>
          </div>

          {submit.data.question.ai_pattern_summary && (
            <p className="mt-3 text-sm text-(--color-text-dim)">{submit.data.question.ai_pattern_summary}</p>
          )}

          {submit.data.attempt.ai_code_analysis && (
            <div className="mt-4 rounded-lg border border-(--color-border) bg-(--color-surface-2) p-3">
              <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-faint)">Your code — AI analysis</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-(--color-text-faint)">Time: </span>
                  <span className="font-mono">{submit.data.attempt.ai_code_analysis.estimatedTimeComplexity}</span>
                </div>
                <div>
                  <span className="text-(--color-text-faint)">Space: </span>
                  <span className="font-mono">{submit.data.attempt.ai_code_analysis.estimatedSpaceComplexity}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-(--color-text-dim)">{submit.data.attempt.ai_code_analysis.correctnessNotes}</p>
              <p className="mt-2 text-sm text-(--color-text)">{submit.data.attempt.ai_code_analysis.feedback}</p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
