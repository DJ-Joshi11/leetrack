import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BookOpen, Trash2 } from 'lucide-react'
import { api, type Question } from '../lib/api'
import { Button, Card, ConfirmButton, DifficultyBadge, EmptyState, Input, Select, Spinner, TopicTag } from '../components/ui'

export default function QuestionBank() {
  const queryClient = useQueryClient()
  const questions = useQuery({ queryKey: ['questions'], queryFn: () => api.get<{ questions: Question[] }>('/questions') })
  const [search, setSearch] = useState('')
  const [difficulty, setDifficulty] = useState('')

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/questions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
  })

  const removeAll = useMutation({
    mutationFn: () => api.delete('/questions'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
  })

  const filtered = useMemo(() => {
    const list = questions.data?.questions ?? []
    return list.filter((q) => {
      if (difficulty && q.difficulty !== difficulty) return false
      if (search) {
        const s = search.toLowerCase()
        const matchesNumber = String(q.number).includes(s)
        const matchesTitle = q.title.toLowerCase().includes(s)
        const matchesTopic = q.topics.some((t) => t.toLowerCase().includes(s))
        if (!matchesNumber && !matchesTitle && !matchesTopic) return false
      }
      return true
    })
  }, [questions.data, search, difficulty])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Question bank</h1>
          <p className="mt-1 text-sm text-(--color-text-dim)">Everything you've logged.</p>
        </div>
        <div className="flex items-center gap-2">
          {questions.data && questions.data.questions.length > 0 && (
            <ConfirmButton
              onConfirm={() => removeAll.mutate()}
              disabled={removeAll.isPending}
              confirmLabel="Delete all — click again"
            >
              <Trash2 size={13} /> Delete all
            </ConfirmButton>
          )}
          <Link to="/log">
            <Button>Log a question</Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-3">
        <Input placeholder="Search by number, title, topic…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="max-w-40">
          <option value="">All difficulties</option>
          <option value="Easy">Easy</option>
          <option value="Medium">Medium</option>
          <option value="Hard">Hard</option>
        </Select>
      </div>

      {questions.isLoading && (
        <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
          <Spinner /> Loading…
        </div>
      )}

      {questions.data && questions.data.questions.length === 0 && (
        <EmptyState
          icon={BookOpen}
          title="No questions logged yet"
          description="Start by logging the number of a question you've solved."
          action={
            <Link to="/log">
              <Button>Log a question</Button>
            </Link>
          }
        />
      )}

      {filtered.length > 0 && (
        <Card className="p-0">
          <div className="divide-y divide-(--color-border)">
            {filtered.map((q) => (
              <div key={q.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-(--color-text-dim)">#{q.number}</span>
                    <a
                      href={q.leetcode_url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-sm hover:text-(--color-accent)"
                    >
                      {q.title}
                    </a>
                    <DifficultyBadge difficulty={q.difficulty} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {q.topics.slice(0, 5).map((t) => (
                      <TopicTag key={t} topic={t} />
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 pl-4">
                  <div className="text-right text-xs text-(--color-text-faint)">
                    <div>{q.attempt_count} attempt{q.attempt_count === 1 ? '' : 's'}</div>
                    <div>last {q.last_attempt_date ?? '—'}</div>
                  </div>
                  <Button variant="danger" onClick={() => remove.mutate(q.id)} disabled={remove.isPending}>
                    <Trash2 size={13} /> Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
