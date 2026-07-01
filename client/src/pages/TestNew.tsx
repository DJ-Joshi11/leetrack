import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api, type Question, type TestSession, type Difficulty } from '../lib/api'
import { Button, Card, Input, Select } from '../components/ui'
import { TestSectionTabs } from '../components/TestSectionTabs'

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard']

export default function TestNew() {
  const navigate = useNavigate()
  const questions = useQuery({ queryKey: ['questions'], queryFn: () => api.get<{ questions: Question[] }>('/questions') })

  const [count, setCount] = useState(10)
  const [source, setSource] = useState<'due' | 'overdue' | 'all'>('due')
  const [difficulties, setDifficulties] = useState<Difficulty[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [perQuestionSec, setPerQuestionSec] = useState<number | ''>('')

  const availableTopics = useMemo(() => {
    const set = new Set<string>()
    for (const q of questions.data?.questions ?? []) for (const t of q.topics) set.add(t)
    return [...set].sort()
  }, [questions.data])

  const create = useMutation({
    mutationFn: () =>
      api.post<{ session: TestSession }>('/tests', {
        count,
        source,
        difficulties: difficulties.length ? difficulties : undefined,
        topics: topics.length ? topics : undefined,
        perQuestionSec: perQuestionSec || undefined,
      }),
    onSuccess: (data) => navigate(`/test/${data.session.id}`),
  })

  function toggle<T>(list: T[], setList: (l: T[]) => void, value: T) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value])
  }

  return (
    <div className="mx-auto max-w-xl">
      <TestSectionTabs />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Build a review test</h1>
        <p className="mt-1 text-sm text-(--color-text-dim)">Shuffled, timed, scored.</p>
      </div>

      <Card className="space-y-5">
        <div>
          <label className="mb-1 block text-xs text-(--color-text-dim)">Source</label>
          <Select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
            <option value="due">Due for review</option>
            <option value="overdue">Overdue only</option>
            <option value="all">All logged questions</option>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs text-(--color-text-dim)">Number of questions</label>
            <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-(--color-text-dim)">
              Per-question timer <span className="text-(--color-text-faint)">(sec, optional)</span>
            </label>
            <Input
              type="number"
              min={30}
              placeholder="none"
              value={perQuestionSec}
              onChange={(e) => setPerQuestionSec(e.target.value ? Number(e.target.value) : '')}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-(--color-text-dim)">Difficulty mix</label>
          <div className="flex gap-2">
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => toggle(difficulties, setDifficulties, d)}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  difficulties.includes(d)
                    ? 'border-(--color-accent) text-(--color-accent)'
                    : 'border-(--color-border) text-(--color-text-dim)'
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-(--color-text-faint)">None selected = all difficulties</p>
        </div>

        {availableTopics.length > 0 && (
          <div>
            <label className="mb-1 block text-xs text-(--color-text-dim)">Topics</label>
            <div className="flex flex-wrap gap-1.5">
              {availableTopics.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggle(topics, setTopics, t)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    topics.includes(t)
                      ? 'border-(--color-accent) text-(--color-accent)'
                      : 'border-(--color-border) text-(--color-text-dim)'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-(--color-text-faint)">None selected = all topics</p>
          </div>
        )}

        {create.isError && <p className="text-sm text-(--color-hard)">{(create.error as Error).message}</p>}

        <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full">
          {create.isPending ? 'Building…' : 'Start test'}
        </Button>
      </Card>
    </div>
  )
}
