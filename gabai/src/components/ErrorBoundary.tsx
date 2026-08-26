import React, { Component, ErrorInfo, ReactNode } from 'react'
import { AlertTriangle, RefreshCw, RotateCcw, ShieldAlert, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  showDetails: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  }

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
      showDetails: false,
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('GABAI System Error Caught by ErrorBoundary:', error, errorInfo)
    this.setState({ errorInfo })
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleHardReset = () => {
    try {
      localStorage.removeItem('gabai-theme')
      sessionStorage.clear()
    } catch {
      // Ignore storage errors
    }
    window.location.href = '/'
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-slate-950 text-white flex flex-col items-center justify-center p-4 sm:p-6 select-none font-sans">
          <div className="max-w-lg w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center">
            {/* Warning Icon */}
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto flex items-center justify-center mb-4">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <h1 className="text-2xl font-black text-white tracking-tight mb-2">
              {this.props.fallbackTitle || 'Disaster System Safeguard Triggered'}
            </h1>
            <p className="text-sm text-slate-400 leading-relaxed mb-6">
              GABAI caught an unexpected interface or WebGL render glitch. The core disaster engine has safely paused to protect your current session.
            </p>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <button
                onClick={this.handleReload}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload Live Map</span>
              </button>

              <button
                onClick={this.handleHardReset}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-700 transition-all active:scale-95"
              >
                <RotateCcw className="w-4 h-4 text-cyan-400" />
                <span>Reset Cache & Return</span>
              </button>
            </div>

            {/* Technical Details Toggle */}
            <div className="mt-4 pt-4 border-t border-slate-800/80">
              <button
                onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-400 flex items-center justify-center gap-1.5 mx-auto transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{this.state.showDetails ? 'Hide Diagnostics' : 'Show Error Diagnostics'}</span>
              </button>

              {this.state.showDetails && (
                <div className="mt-3 p-3 rounded-xl bg-slate-950 border border-slate-800/60 text-left overflow-x-auto text-[10px] font-mono text-red-400 max-h-40 no-scrollbar">
                  <div className="font-bold text-slate-300 mb-1">{this.state.error?.toString()}</div>
                  <pre className="text-slate-500 whitespace-pre-wrap">{this.state.errorInfo?.componentStack}</pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
