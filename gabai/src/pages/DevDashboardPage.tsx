import React from 'react'

export default function DevDashboardPage({ darkMode, toggleDark }: { darkMode?: boolean, toggleDark?: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-2xl w-full text-center">
        <h1 className="text-4xl font-bold text-purple-600 dark:text-purple-400 mb-4">Dev Tools</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Welcome to the Developer testing interface. Use this to mock backend responses or simulate emergency events.
        </p>
        <div className="space-y-4">
          <button className="w-full py-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-xl font-medium transition-colors">
            Trigger Mock Flood Alert
          </button>
          <button className="w-full py-3 bg-yellow-100 hover:bg-yellow-200 text-yellow-700 rounded-xl font-medium transition-colors">
            Reset Application State
          </button>
        </div>
        <div className="mt-8">
          <a href="/" className="inline-block px-6 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-xl font-medium transition-colors">
            Back to Public Map
          </a>
        </div>
      </div>
    </div>
  )
}
