import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Trophy, Target, CheckCircle2, Clock, Award } from 'lucide-react'
import { api, type TestResults as TestResultsType } from '../lib/api'
import { Button, Card, DifficultyBadge, Spinner, StatTile } from '../components/ui'

const RESULT_LABELS: Record<string, { label: string; className: string }> = {
  correct: { label: 'Solved', className: 'text-(--color-easy)' },
  struggled: { label: 'Struggled', className: 'text-(--color-medium)' },
  failed: { label: 'Failed', className: 'text-(--color-hard)' },
  skipped: { label: 'Skipped', className: 'text-(--color-text-faint)' },
}

export default function TestResults() {
  const { id } = useParams()
  const results = useQuery({ queryKey: ['test', id], queryFn: () => api.get<TestResultsType>(`/tests/${id}`) })

  if (results.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
        <Spinner /> Loading…
      </div>
    )
  }
  if (results.isError || !results.data) {
    return <p className="text-(--color-hard)">{(results.error as Error)?.message ?? 'Not found'}</p>
  }

  const { summary, items } = results.data

  const topicChartData = Object.entries(summary.byTopic)
    .map(([topic, v]) => ({ topic, accuracy: Math.round((v.correct / v.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 8)

  const difficultyChartData = Object.entries(summary.byDifficulty).map(([difficulty, v]) => ({
    difficulty,
    accuracy: Math.round((v.correct / v.total) * 100),
  }))

  const weakest = topicChartData[0]
  const config = JSON.parse(results.data.session.config || '{}')
  const isMilestone = config.source === 'milestone'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          Results
          {isMilestone && (
            <span className="flex items-center gap-1 rounded-full border border-(--color-gold)/30 px-2.5 py-0.5 text-xs font-medium text-(--color-gold)">
              <Award size={12} /> Milestone Exam
            </span>
          )}
        </h1>
        <p className="mt-1 text-sm text-(--color-text-dim)">Session #{id}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon={Trophy} label="Score" value={`${summary.score}`} />
        <StatTile icon={Target} label="Accuracy" value={`${Math.round(summary.accuracy * 100)}%`} />
        <StatTile icon={CheckCircle2} label="Correct" value={`${summary.correctCount}/${summary.totalQuestions}`} />
        <StatTile icon={Clock} label="Avg time" value={`${summary.avgTimeSec}s`} />
      </div>

      {weakest && (
        <Card className="border-(--color-hard)/20">
          <p className="text-sm">
            Weakest topic this session: <span className="font-medium text-(--color-hard)">{weakest.topic}</span> (
            {weakest.accuracy}% accuracy)
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-medium">Accuracy by difficulty</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={difficultyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272c" />
              <XAxis dataKey="difficulty" stroke="#8d8d97" fontSize={12} />
              <YAxis stroke="#8d8d97" fontSize={12} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: '#1b1b1f', border: '1px solid #27272c', fontSize: 12 }} />
              <Bar dataKey="accuracy" fill="#5eead4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium">Accuracy by topic (weakest first)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topicChartData} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272c" />
              <XAxis type="number" domain={[0, 100]} stroke="#8d8d97" fontSize={12} />
              <YAxis type="category" dataKey="topic" stroke="#8d8d97" fontSize={11} width={90} />
              <Tooltip contentStyle={{ background: '#1b1b1f', border: '1px solid #27272c', fontSize: 12 }} />
              <Bar dataKey="accuracy" fill="#fb7185" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-0">
        <div className="divide-y divide-(--color-border)">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-(--color-text-dim)">#{item.number}</span>
                <a
                  href={item.leetcode_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm hover:text-(--color-accent)"
                >
                  {item.title}
                </a>
                <DifficultyBadge difficulty={item.difficulty} />
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-mono text-(--color-text-faint)">{item.time_spent_sec ?? 0}s</span>
                <span className={RESULT_LABELS[item.result ?? 'skipped'].className}>
                  {RESULT_LABELS[item.result ?? 'skipped'].label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex gap-3">
        <Link to="/test/new">
          <Button>Build another test</Button>
        </Link>
        <Link to="/">
          <Button variant="ghost">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  )
}
