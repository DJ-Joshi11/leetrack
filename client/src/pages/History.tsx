import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Timer, Trash2, Award } from 'lucide-react'
import { api } from '../lib/api'
import { Button, Card, ConfirmButton, EmptyState, Spinner } from '../components/ui'

type SessionSummary = {
  id: number
  started_at: string
  ended_at: string | null
  config: string
  summary: {
    score: number
    accuracy: number
    totalQuestions: number
    correctCount: number
  }
}

export default function History() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const sessions = useQuery({ queryKey: ['tests'], queryFn: () => api.get<{ sessions: SessionSummary[] }>('/tests') })

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/tests/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tests'] }),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-sm text-(--color-text-dim)">Past review tests.</p>
      </div>

      {sessions.isLoading && (
        <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
          <Spinner /> Loading…
        </div>
      )}

      {sessions.data && sessions.data.sessions.length === 0 && (
        <EmptyState
          icon={Timer}
          title="No tests yet"
          description="Build a review test from your due questions to see results here."
          action={
            <Link to="/test/new">
              <Button>Build a test</Button>
            </Link>
          }
        />
      )}

      {sessions.data && sessions.data.sessions.length > 0 && (
        <Card className="p-0">
          <div className="divide-y divide-(--color-border)">
            {sessions.data.sessions.map((s) => {
              const isMilestone = JSON.parse(s.config || '{}').source === 'milestone'
              return (
              <div
                key={s.id}
                onClick={() => navigate(`/test/${s.id}/results`)}
                className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-(--color-surface-2)"
              >
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    {new Date(s.started_at).toLocaleString()}
                    {isMilestone && (
                      <span className="flex items-center gap-1 rounded-full border border-(--color-gold)/30 px-2 py-0.5 text-[10px] font-medium text-(--color-gold)">
                        <Award size={10} /> Milestone
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-(--color-text-faint)">
                    {s.ended_at ? 'completed' : 'in progress'} · {s.summary.totalQuestions} questions
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono text-lg">{s.summary.score}</div>
                    <div className="text-xs text-(--color-text-faint)">{Math.round(s.summary.accuracy * 100)}% accuracy</div>
                  </div>
                  <ConfirmButton
                    onConfirm={() => remove.mutate(s.id)}
                    disabled={remove.isPending}
                    className="!px-2.5"
                  >
                    <Trash2 size={14} />
                  </ConfirmButton>
                </div>
              </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
