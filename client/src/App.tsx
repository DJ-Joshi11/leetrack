import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { LayoutDashboard, PlusCircle, UploadCloud, BookOpen, Timer, History as HistoryIcon, BarChart3 } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import LogQuestion from './pages/LogQuestion'
import Import from './pages/Import'
import QuestionBank from './pages/QuestionBank'
import TestNew from './pages/TestNew'
import TestSchedule from './pages/TestSchedule'
import TestRunner from './pages/TestRunner'
import TestResults from './pages/TestResults'
import History from './pages/History'
import Analysis from './pages/Analysis'

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/log', label: 'Log', icon: PlusCircle },
  { to: '/import', label: 'Import', icon: UploadCloud },
  { to: '/questions', label: 'Questions', icon: BookOpen },
  { to: '/test/new', label: 'Test', icon: Timer },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/analysis', label: 'Analysis', icon: BarChart3 },
]

function App() {
  const location = useLocation()
  const isFocusMode = /^\/test\/\d+$/.test(location.pathname)

  return (
    <div className="min-h-screen bg-(--color-bg)">
      {!isFocusMode && (
        <header className="sticky top-0 z-10 border-b border-(--color-border) bg-(--color-bg)/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <span className="flex items-center gap-2 font-mono text-sm font-semibold tracking-tight text-(--color-text)">
              <img src="/favicon.svg" alt="" width={22} height={22} className="rounded-[6px]" />
              leet<span className="text-(--color-accent)">rack</span>
            </span>
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const Icon = link.icon
                return (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    end={link.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors duration-150 ${
                        isActive
                          ? 'bg-(--color-surface-2) text-(--color-text)'
                          : 'text-(--color-text-dim) hover:text-(--color-text) hover:bg-(--color-surface-2)/50'
                      }`
                    }
                  >
                    <Icon size={14} />
                    {link.label}
                  </NavLink>
                )
              })}
            </nav>
          </div>
        </header>
      )}
      <main className={isFocusMode ? '' : 'mx-auto max-w-6xl px-6 py-8'}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/log" element={<LogQuestion />} />
          <Route path="/import" element={<Import />} />
          <Route path="/questions" element={<QuestionBank />} />
          <Route path="/test/new" element={<TestNew />} />
          <Route path="/test/schedule" element={<TestSchedule />} />
          <Route path="/test/:id" element={<TestRunner />} />
          <Route path="/test/:id/results" element={<TestResults />} />
          <Route path="/history" element={<History />} />
          <Route path="/analysis" element={<Analysis />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
