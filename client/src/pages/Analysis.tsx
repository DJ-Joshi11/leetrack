import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import { Sparkles, TrendingUp, Layers, Target, Lightbulb, ExternalLink, Plus, BarChart3 } from 'lucide-react'
import { api, type AnalysisCharts, type AnalysisReport } from '../lib/api'
import { Button, Card, DifficultyBadge, EmptyState, Spinner, StatTile, TopicTag } from '../components/ui'

const DIFFICULTY_COLORS: Record<string, string> = { Easy: '#4ade80', Medium: '#fbbf24', Hard: '#fb7185' }
const CHART_TOOLTIP_STYLE = { background: '#1b1b1f', border: '1px solid #27272c', fontSize: 12, borderRadius: 8 }

function EmptyChartNote({ text = 'Not enough data yet' }: { text?: string }) {
  return (
    <div className="flex h-[160px] items-center justify-center text-center text-sm text-(--color-text-faint)">{text}</div>
  )
}

export default function Analysis() {
  const queryClient = useQueryClient()
  const charts = useQuery({ queryKey: ['analysis', 'charts'], queryFn: () => api.get<AnalysisCharts>('/analysis/charts') })
  const report = useQuery({
    queryKey: ['analysis', 'latest'],
    queryFn: () => api.get<{ report: AnalysisReport | null }>('/analysis/latest'),
  })

  const generate = useMutation({
    mutationFn: () => api.post<{ report: AnalysisReport }>('/analysis/generate'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['analysis', 'latest'] }),
  })

  if (charts.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-(--color-text-dim)">
        <Spinner /> Loading…
      </div>
    )
  }

  if (!charts.data || charts.data.totalQuestions === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Nothing to analyze yet"
        description="Log a few questions first — this page turns your practice history into charts and an AI improvement plan."
        action={
          <Link to="/log">
            <Button>Log a question</Button>
          </Link>
        }
      />
    )
  }

  const c = charts.data

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
          <p className="mt-1 text-sm text-(--color-text-dim)">Everything you've logged, turned into a plan.</p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? (
            <Spinner />
          ) : (
            <>
              <Sparkles size={14} /> {report.data?.report ? 'Regenerate plan' : 'Generate plan'}
            </>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile icon={Layers} label="Questions logged" value={c.totalQuestions} />
        <StatTile icon={TrendingUp} label="Total attempts" value={c.totalAttempts} />
        <StatTile icon={Target} label="Tests taken" value={c.totalTests} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-medium">Topics practiced</h2>
          {c.topicDistribution.length ? (
            <ResponsiveContainer width="100%" height={Math.max(200, c.topicDistribution.slice(0, 10).length * 28)}>
              <BarChart data={c.topicDistribution.slice(0, 10)} layout="vertical" margin={{ left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272c" horizontal={false} />
                <XAxis type="number" stroke="#8d8d97" fontSize={12} allowDecimals={false} />
                <YAxis type="category" dataKey="topic" stroke="#8d8d97" fontSize={11} width={100} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#5eead4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartNote />
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium">Difficulty split</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={c.difficultyDistribution} dataKey="count" nameKey="difficulty" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {c.difficultyDistribution.map((d) => (
                  <Cell key={d.difficulty} fill={DIFFICULTY_COLORS[d.difficulty] ?? '#8d8d97'} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium">Confidence over time</h2>
          {c.confidenceTrend.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={c.confidenceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272c" />
                <XAxis dataKey="date" stroke="#8d8d97" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                <YAxis domain={[1, 5]} stroke="#8d8d97" fontSize={12} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="avgConfidence" stroke="#5eead4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartNote text="Log on a few different days to see a trend" />
          )}
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-medium">Test score trend</h2>
          {c.scoreTrend.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={c.scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272c" />
                <XAxis dataKey="date" stroke="#8d8d97" fontSize={10} tickFormatter={(d) => d.slice(5)} />
                <YAxis domain={[0, 100]} stroke="#8d8d97" fontSize={12} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="score" stroke="#5eead4" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChartNote text="Complete a few review tests to see your score trend" />
          )}
        </Card>
      </div>

      {c.topicAccuracy.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-medium">Topic accuracy in tests (weakest first)</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, c.topicAccuracy.length * 26)}>
            <BarChart data={c.topicAccuracy} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272c" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} stroke="#8d8d97" fontSize={12} />
              <YAxis type="category" dataKey="topic" stroke="#8d8d97" fontSize={11} width={100} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Bar dataKey="accuracy" fill="#fb7185" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card>
        <h2 className="flex items-center gap-2 font-medium">
          <Lightbulb size={16} className="text-(--color-accent)" />
          AI improvement plan
        </h2>

        {generate.isError && <p className="mt-3 text-sm text-(--color-hard)">{(generate.error as Error).message}</p>}

        {!report.data?.report && !generate.isPending && (
          <p className="mt-3 text-sm text-(--color-text-dim)">
            Generate a plan: strengths, weak topics, and specific LeetCode questions to try next — validated against
            real problems, not hallucinated.
          </p>
        )}

        {generate.isPending && (
          <div className="mt-4 flex items-center gap-2 text-sm text-(--color-text-dim)">
            <Spinner /> Analyzing your history and validating question suggestions…
          </div>
        )}

        {report.data?.report && (
          <div className="mt-4 space-y-6">
            <div className="text-xs text-(--color-text-faint)">
              Generated {new Date(report.data.report.generated_at).toLocaleString()}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-(--color-easy)">Strengths</div>
                <ul className="space-y-1.5 text-sm text-(--color-text-dim)">
                  {report.data.report.strengths.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-2 text-xs uppercase tracking-wide text-(--color-hard)">Weak topics</div>
                <ul className="space-y-1.5 text-sm text-(--color-text-dim)">
                  {report.data.report.weakTopics.map((s, i) => (
                    <li key={i}>• {s}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-faint)">Suggested next topics</div>
              <div className="flex flex-wrap gap-1.5">
                {report.data.report.suggestedTopics.map((t) => (
                  <TopicTag key={t} topic={t} />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-faint)">Study plan</div>
              <p className="text-sm leading-relaxed text-(--color-text)">{report.data.report.plan}</p>
            </div>

            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-(--color-text-faint)">Suggested questions</div>
              <div className="space-y-2">
                {report.data.report.suggestedQuestions.map((q) => (
                  <div
                    key={q.number}
                    className="flex items-center justify-between rounded-lg border border-(--color-border) bg-(--color-surface-2) px-3 py-2"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-(--color-text-dim)">#{q.number}</span>
                      <span className="text-sm">{q.title}</span>
                      <DifficultyBadge difficulty={q.difficulty} />
                      {q.alreadyLogged && <span className="text-xs text-(--color-text-faint)">already logged</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={q.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-(--color-border) p-1.5 text-(--color-text-dim) transition-colors hover:text-(--color-accent)"
                      >
                        <ExternalLink size={13} />
                      </a>
                      {!q.alreadyLogged && (
                        <Link
                          to={`/log?number=${q.number}`}
                          className="rounded-md border border-(--color-accent)/40 p-1.5 text-(--color-accent) transition-colors hover:bg-(--color-accent)/10"
                        >
                          <Plus size={13} />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
