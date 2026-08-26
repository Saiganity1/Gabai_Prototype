import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MainApp from './pages/MainDashboardPage'
import LGUDashboardPage from './pages/LGUDashboardPage'
import DevDashboardPage from './pages/DevDashboardPage'
import { DisasterProvider } from './context/DisasterContext'
import ErrorBoundary from './components/ErrorBoundary'

export type AppScreen = 'landing' | 'main'

function CitizenApp() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('gabai-theme')
    if (saved !== null) return saved === 'dark'
    return true // Default to signature Dark Disaster Map
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('gabai-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const toggleDark = () => setDarkMode((d) => !d)

  return <MainApp darkMode={darkMode} toggleDark={toggleDark} />
}

function LGUApp() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('gabai-theme')
    if (saved !== null) return saved === 'dark'
    return true
  })

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode)
    localStorage.setItem('gabai-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const toggleDark = () => setDarkMode((d) => !d)

  return <LGUDashboardPage darkMode={darkMode} toggleDark={toggleDark} />
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="text-center p-8 bg-white dark:bg-gray-800 shadow-xl rounded-2xl max-w-md">
        <h1 className="text-6xl font-bold text-blue-600 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Page Not Found</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <a
          href="/"
          className="inline-block px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
        >
          Return Home
        </a>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary fallbackTitle="GABAI Disaster Mapping System Alert">
      <DisasterProvider>
        <BrowserRouter>
          <Routes>
            {/* Citizen app */}
            <Route path="/" element={<CitizenApp />} />

            {/* LGU Command Center */}
            <Route path="/lgu" element={<LGUApp />} />

            {/* Developer Testing Interface */}
            <Route path="/dev" element={<DevDashboardPage />} />

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </DisasterProvider>
    </ErrorBoundary>
  )
}
