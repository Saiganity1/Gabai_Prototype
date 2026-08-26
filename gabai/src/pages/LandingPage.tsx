import { Shield, ChevronRight, Sun, Moon, AlertTriangle } from 'lucide-react'

interface Props {
  onEnter: () => void
  darkMode: boolean
  toggleDark: () => void
}

export default function Landing({ onEnter, darkMode, toggleDark }: Props) {
  return (
    <div className="relative h-full w-full bg-slate-50 dark:bg-slate-950 flex flex-col overflow-hidden">
      {/* Map background image */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1524661135-423995f22d0b?w=1600&h=900&fit=crop&auto=format')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: darkMode ? 0.12 : 0.18,
          filter: darkMode ? 'invert(1) grayscale(0.4)' : 'grayscale(0.3)',
        }}
      />
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/90 via-white/80 to-slate-100/70 dark:from-slate-950/95 dark:via-slate-950/90 dark:to-slate-900/80" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500 flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-semibold text-slate-900 dark:text-white tracking-tight text-lg">GABAI</span>
        </div>
        <button
          onClick={toggleDark}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Toggle dark mode"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* Main */}
      <main className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 text-center pb-8">
        <div className="max-w-md">
          {/* Live indicator */}
          <div className="inline-flex items-center gap-2 bg-cyan-50 dark:bg-cyan-950 border border-cyan-200 dark:border-cyan-800 text-cyan-700 dark:text-cyan-400 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
            AI Disaster Intelligence · Active
          </div>

          <h1 className="text-4xl sm:text-5xl font-semibold text-slate-900 dark:text-white tracking-tight leading-[1.1] mb-4">
            Know the danger.<br />
            <span className="text-cyan-600 dark:text-cyan-400">Find the safer way.</span>
          </h1>

          <p className="text-slate-500 dark:text-slate-400 text-lg leading-relaxed mb-10">
            Real-time disaster intelligence to help you get home safely.
          </p>

          <button
            onClick={onEnter}
            className="inline-flex items-center gap-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold px-7 py-3.5 rounded-full hover:bg-slate-700 dark:hover:bg-slate-100 transition-all text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5"
          >
            Enter GABAI
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Stats strip */}
          <div className="mt-12 grid grid-cols-3 gap-4 text-center">
            {[
              { val: '94%', label: 'AI accuracy' },
              { val: '2.4k', label: 'Active users' },
              { val: '<30s', label: 'Alert time' },
            ].map(({ val, label }) => (
              <div key={label} className="bg-white/70 dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200/60 dark:border-slate-700/40">
                <div className="text-xl font-bold text-slate-900 dark:text-white">{val}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Active hazard banner */}
      <div className="relative z-10 mx-4 mb-4 sm:mx-8 sm:mb-6">
        <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            2 active hazards near Metro Manila — Flash flood advisory in effect
          </span>
        </div>
      </div>
    </div>
  )
}
