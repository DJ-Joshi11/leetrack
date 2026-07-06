import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
      // The backend is on a free tier that sleeps when idle, so a cold start can take up to a
      // minute. Refetching everything on every window focus (e.g. every time you tab back from
      // leetcode.com) turned that into a visible full-dashboard reload each time — data doesn't
      // change fast enough here to need it; the manual "Sync now" control covers the real case.
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
