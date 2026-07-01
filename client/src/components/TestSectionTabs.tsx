import { NavLink } from 'react-router-dom'
import { Timer, CalendarRange } from 'lucide-react'

const TABS = [
  { to: '/test/new', label: 'Build test', icon: Timer },
  { to: '/test/schedule', label: 'Monthly schedule', icon: CalendarRange },
]

export function TestSectionTabs() {
  return (
    <div className="mb-6 flex gap-1 border-b border-(--color-border)">
      {TABS.map((tab) => {
        const Icon = tab.icon
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              `flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors duration-150 ${
                isActive
                  ? 'border-(--color-accent) text-(--color-text)'
                  : 'border-transparent text-(--color-text-dim) hover:text-(--color-text)'
              }`
            }
          >
            <Icon size={14} />
            {tab.label}
          </NavLink>
        )
      })}
    </div>
  )
}
