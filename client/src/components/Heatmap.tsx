import { useState } from 'react'
import type { ActivityDay } from '../lib/api'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '']

const CELL = 11
const GAP = 3
const STEP = CELL + GAP
const DAY_LABEL_WIDTH = 22
const MONTH_GAP = 12

function levelFor(count: number): number {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 6) return 3
  return 4
}

const LEVEL_COLORS = [
  'var(--color-surface-2)',
  'color-mix(in srgb, var(--color-accent) 25%, var(--color-surface-2))',
  'color-mix(in srgb, var(--color-accent) 50%, var(--color-surface-2))',
  'color-mix(in srgb, var(--color-accent) 75%, var(--color-surface-2))',
  'var(--color-accent)',
]

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

type MonthGroup = { key: string; label: string; weeks: Array<Array<ActivityDay | null>> }

function groupByMonth(data: ActivityDay[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  let current: MonthGroup | null = null
  let currentWeek: Array<ActivityDay | null> = []

  for (const day of data) {
    const d = new Date(`${day.date}T00:00:00`)
    const month = d.getMonth()
    const year = d.getFullYear()
    const weekday = d.getDay()
    const key = `${year}-${month}`

    if (!current || current.key !== key) {
      if (current && currentWeek.length) current.weeks.push(currentWeek)
      current = { key, label: MONTH_LABELS[month], weeks: [] }
      groups.push(current)
      currentWeek = new Array(weekday).fill(null)
    }

    currentWeek.push(day)
    if (weekday === 6) {
      current.weeks.push(currentWeek)
      currentWeek = []
    }
  }
  if (current && currentWeek.length) current.weeks.push(currentWeek)
  return groups
}

export function Heatmap({ data }: { data: ActivityDay[] }) {
  const [hovered, setHovered] = useState<{ groupKey: string; day: ActivityDay; col: number; row: number } | null>(null)
  if (!data.length) return null

  const groups = groupByMonth(data)

  return (
    <div className="overflow-x-auto scrollbar-thin pt-5">
      <div className="inline-flex items-start" style={{ gap: MONTH_GAP }}>
        <div className="flex flex-col gap-[3px] pt-[18px]" style={{ width: DAY_LABEL_WIDTH }}>
          {DAY_LABELS.map((label, i) => (
            <div key={i} style={{ height: CELL }} className="text-[9px] leading-[11px] text-(--color-text-faint)">
              {label}
            </div>
          ))}
        </div>

        {groups.map((group) => {
          const cells = group.weeks.flat()
          return (
            <div key={group.key} className="flex flex-col">
              <div className="mb-1 h-[14px] whitespace-nowrap text-[9px] leading-[14px] text-(--color-text-faint)">
                {group.label}
              </div>
              <div className="relative">
                <div className="grid grid-flow-col gap-[3px]" style={{ gridTemplateRows: `repeat(7, ${CELL}px)` }}>
                  {cells.map((day, i) => {
                    const col = Math.floor(i / 7)
                    const row = i % 7
                    return (
                      <div
                        key={i}
                        onMouseEnter={() => day && setHovered({ groupKey: group.key, day, col, row })}
                        onMouseLeave={() => setHovered(null)}
                        className="rounded-[2px] transition-transform duration-100 hover:scale-125"
                        style={{
                          width: CELL,
                          height: CELL,
                          background: day ? LEVEL_COLORS[levelFor(day.count)] : 'transparent',
                        }}
                      />
                    )
                  })}
                </div>

                {hovered && hovered.groupKey === group.key && (
                  <div
                    className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center"
                    style={{ left: hovered.col * STEP + CELL / 2, top: hovered.row * STEP - 6 }}
                  >
                    <div className="whitespace-nowrap rounded-md border border-(--color-border) bg-(--color-surface-2) px-2.5 py-1.5 text-xs shadow-lg">
                      <span className="font-medium text-(--color-text)">
                        {hovered.day.count > 0 ? `${hovered.day.count} ${hovered.day.count === 1 ? 'entry' : 'entries'}` : 'No activity'}
                      </span>
                      <span className="text-(--color-text-faint)"> · {formatDate(hovered.day.date)}</span>
                    </div>
                    <div className="h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-b border-r border-(--color-border) bg-(--color-surface-2)" />
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
