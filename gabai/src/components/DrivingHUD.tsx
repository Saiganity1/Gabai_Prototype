import React, { useState, useEffect } from 'react'
import {
  X, Shield,
  ArrowUp, ArrowRight, ArrowLeft,
  Volume2, VolumeX, Play, Pause, Compass
} from 'lucide-react'
import { RouteInfo } from '../utils/routingEngine'
import { Hazard } from './MapCanvas'

interface Props {
  route: RouteInfo
  destinationName: string
  nearbyHazards: Hazard[]
  onExit: () => void
}

interface Step {
  instruction: string
  distance: string
  subtext: string
  icon: 'straight' | 'right' | 'left'
  hazardNear?: string
}

export default function DrivingHUD({ route, destinationName, nearbyHazards: _nearbyHazards, onExit }: Props) {
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [speed, setSpeed] = useState(42)
  const [isSimulating, setIsSimulating] = useState(true)
  const [voiceMuted, setVoiceMuted] = useState(false)

  // Real-world steps from OSRM road graph or fallback default steps
  const defaultSteps: Step[] = [
    {
      instruction: 'Head North on Elevated Corridor',
      distance: '350 m',
      subtext: 'Bypassing low-lying flood zone safely',
      icon: 'straight',
      hazardNear: 'Flash flood reported 500m to your right · Route adjusted',
    },
    {
      instruction: 'Turn Right onto MacArthur Highway',
      distance: '1.2 km',
      subtext: 'Highland elevated corridor clear of floodwaters',
      icon: 'right',
    },
    {
      instruction: 'Continue straight on Center Lane',
      distance: '800 m',
      subtext: 'Optimal flood-free trajectory',
      icon: 'straight',
    },
    {
      instruction: 'Turn Left toward Safe Zone Entrance',
      distance: '200 m',
      subtext: 'Destination is on your right',
      icon: 'left',
    },
    {
      instruction: 'Arrived at Safe Destination',
      distance: '0 m',
      subtext: 'You have safely reached your destination',
      icon: 'straight',
    },
  ]

  const steps: Step[] = (route.steps && route.steps.length > 0) ? route.steps : defaultSteps

  const currentStep = steps[currentStepIdx] || steps[0]

  // Speak navigation instructions
  const speakInstruction = (text: string) => {
    if (voiceMuted || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-PH'
    utterance.rate = 1.05
    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    speakInstruction(currentStep.instruction + '. ' + (currentStep.hazardNear || ''))
  }, [currentStepIdx, voiceMuted])

  // Simulation speed & step advancement
  useEffect(() => {
    if (!isSimulating) return
    const timer = setInterval(() => {
      setSpeed(Math.floor(38 + Math.random() * 10))
      setCurrentStepIdx((prev) => {
        if (prev < steps.length - 1) return prev + 1
        return prev
      })
    }, 5500)
    return () => clearInterval(timer)
  }, [isSimulating, steps.length])

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex flex-col justify-between p-3 sm:p-5 select-none anim-fade-in">
      {/* ── Top Waze-Style Floating Navigation Header ── */}
      <div className="max-w-xl w-full mx-auto pointer-events-auto">
        <div className="bg-slate-900/95 backdrop-blur-xl border-2 border-emerald-500 rounded-3xl p-4 sm:p-5 shadow-[0_12px_40px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shrink-0">
              {currentStep.icon === 'right' ? (
                <ArrowRight className="w-8 h-8 stroke-[3]" />
              ) : currentStep.icon === 'left' ? (
                <ArrowLeft className="w-8 h-8 stroke-[3]" />
              ) : (
                <ArrowUp className="w-8 h-8 stroke-[3]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xl sm:text-2xl font-black text-white leading-tight tracking-tight truncate">
                {currentStep.instruction}
              </div>
              <div className="text-xs font-bold text-emerald-400 mt-1 flex items-center gap-2">
                <span className="text-base font-extrabold text-white">{currentStep.distance}</span>
                <span>•</span>
                <span className="text-slate-300 truncate">{currentStep.subtext}</span>
              </div>
            </div>
            <button
              onClick={onExit}
              className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors shrink-0 active:scale-95"
              title="Exit Safe Driving Navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Dynamic Hazard Bypass Alert */}
          {currentStep.hazardNear && (
            <div className="mt-3 bg-amber-500/20 border border-amber-500/50 rounded-xl p-2.5 px-3 flex items-center gap-2.5 anim-slide-down">
              <Shield className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="text-[11px] font-bold text-amber-300 flex-1 truncate">
                <span>GABAI Active Bypass: </span>
                <span className="text-slate-200 font-normal">{currentStep.hazardNear}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Middle Floating Side Widgets (Waze Style Speedometer & Compass) ── */}
      <div className="flex justify-between items-end w-full max-w-4xl mx-auto pointer-events-none px-2 mb-2">
        {/* Waze-style floating speedometer in bottom-left */}
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-3 px-4 shadow-2xl flex flex-col items-center justify-center">
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white leading-none">
            {speed}
          </div>
          <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-0.5">KM / H</div>
          <div className="mt-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">
            SAFE SPEED
          </div>
        </div>

        {/* Live Re-center Compass Button */}
        <div className="pointer-events-auto">
          <div className="w-11 h-11 rounded-full bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 shadow-2xl flex items-center justify-center text-cyan-400">
            <Compass className="w-5 h-5 animate-pulse" />
          </div>
        </div>
      </div>

      {/* ── Bottom Floating Waze Glass Card ── */}
      <div className="max-w-xl w-full mx-auto pointer-events-auto bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-4 shadow-[0_12px_40px_rgba(0,0,0,0.7)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <span>🏁</span> Destination
            </div>
            <div className="text-sm sm:text-base font-extrabold text-white truncate">
              {destinationName}
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="text-xl sm:text-2xl font-black text-emerald-400 leading-none">
              {route.time}
            </div>
            <div className="text-[11px] font-bold text-slate-400 mt-1">
              {typeof route.distanceKm === 'number' ? route.distanceKm.toFixed(1) : route.distanceKm} km remaining
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
          <button
            onClick={() => setIsSimulating(!isSimulating)}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors active:scale-95"
          >
            {isSimulating ? <Pause className="w-3.5 h-3.5 text-amber-400" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
            <span>{isSimulating ? 'Pause Drive' : 'Resume Drive'}</span>
          </button>

          <button
            onClick={() => setVoiceMuted(!voiceMuted)}
            className={`p-2 rounded-xl border transition-colors ${
              voiceMuted ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-300'
            }`}
            title="Toggle Voice Guidance"
          >
            {voiceMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onExit}
            className="bg-red-600 hover:bg-red-500 text-white font-extrabold py-2 px-4 rounded-xl text-xs transition-all active:scale-95 shadow-md"
          >
            End Navigation
          </button>
        </div>
      </div>
    </div>
  )
}
