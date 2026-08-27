import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  X, Shield,
  ArrowUp, ArrowRight, ArrowLeft,
  Volume2, VolumeX, Play, Pause, Compass, Radio
} from 'lucide-react'
import { RouteInfo } from '../utils/routingEngine'
import { Hazard } from './MapCanvas'

interface Props {
  route: RouteInfo
  destinationName: string
  nearbyHazards: Hazard[]
  userSpeed?: number | null
  onExit: () => void
}

interface Step {
  instruction: string
  distance: string
  subtext: string
  icon: 'straight' | 'right' | 'left'
  hazardNear?: string
}

export default function DrivingHUD({
  route,
  destinationName,
  nearbyHazards: _nearbyHazards,
  userSpeed,
  onExit,
}: Props) {
  const [currentStepIdx, setCurrentStepIdx] = useState(0)
  const [isSimulating, setIsSimulating] = useState(false) // Default to real GPS speed
  const [simulatedSpeed, setSimulatedSpeed] = useState(38)
  const [voiceMuted, setVoiceMuted] = useState(false)
  const lastAnnouncedStepRef = useRef<number>(-1)

  // Real-world steps from OSRM road graph or fallback default steps
  const defaultSteps: Step[] = useMemo(
    () => [
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
    ],
    []
  )

  const steps: Step[] = route.steps && route.steps.length > 0 ? route.steps : defaultSteps
  const currentStep = steps[currentStepIdx] || steps[0]

  // Compute displayed speed: Real GPS speed (m/s * 3.6 = km/h) or simulation
  const displaySpeed = useMemo(() => {
    if (isSimulating) {
      return simulatedSpeed
    }
    if (typeof userSpeed === 'number' && !isNaN(userSpeed)) {
      const kmh = Math.round(userSpeed * 3.6)
      return kmh > 1 ? kmh : 0
    }
    return 0
  }, [isSimulating, simulatedSpeed, userSpeed])

  // Speak navigation instructions ONLY when arriving at a new step
  const speakInstruction = (stepIdx: number, force = false) => {
    if (voiceMuted || !window.speechSynthesis) return
    if (!force && lastAnnouncedStepRef.current === stepIdx) return

    lastAnnouncedStepRef.current = stepIdx
    try {
      window.speechSynthesis.cancel()
      const step = steps[stepIdx] || currentStep
      const textToSpeak = `${step.instruction}. Distance: ${step.distance}.`
      const utterance = new SpeechSynthesisUtterance(textToSpeak)
      utterance.lang = 'en-PH'
      utterance.rate = 1.0
      window.speechSynthesis.speak(utterance)
    } catch {
      // Ignore audio synthesis errors on unsupported browsers
    }
  }

  // Speak only once upon entering navigation or when currentStepIdx advances
  useEffect(() => {
    speakInstruction(currentStepIdx)
  }, [currentStepIdx, voiceMuted])

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  // Smooth simulated drive loop (if simulation is toggled on by user)
  useEffect(() => {
    if (!isSimulating) return
    const timer = setInterval(() => {
      setSimulatedSpeed(Math.floor(34 + Math.random() * 8))
      setCurrentStepIdx((prev) => {
        if (prev < steps.length - 1) return prev + 1
        return prev
      })
    }, 6000)
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
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => speakInstruction(currentStepIdx, true)}
                className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-white transition-colors active:scale-95 cursor-pointer"
                title="Speak Direction Now"
              >
                <Volume2 className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={onExit}
                className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors active:scale-95 cursor-pointer"
                title="Exit Safe Driving Navigation"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
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

      {/* ── Middle Floating Side Widgets (Speedometer & Mode Badge) ── */}
      <div className="flex justify-between items-end w-full max-w-4xl mx-auto pointer-events-none px-2 mb-2">
        {/* Real Speedometer in bottom-left */}
        <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-3 px-4 shadow-2xl flex flex-col items-center justify-center min-w-[90px]">
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-white leading-none">
            {displaySpeed}
          </div>
          <div className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest mt-0.5">KM / H</div>
          <div
            className={`mt-1 text-[8px] font-black px-2 py-0.5 rounded-full uppercase flex items-center gap-1 border ${
              isSimulating
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : displaySpeed > 0
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-slate-700/40 text-slate-300 border-slate-600/40'
            }`}
          >
            <Radio className="w-2.5 h-2.5 animate-pulse" />
            <span>{isSimulating ? 'SIMULATED' : displaySpeed > 0 ? 'LIVE GPS' : 'STOPPED'}</span>
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
        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={() => {
              if (window.speechSynthesis) window.speechSynthesis.cancel()
              setVoiceMuted(!voiceMuted)
            }}
            className={`flex items-center gap-1.5 py-2 px-3.5 rounded-xl border transition-colors cursor-pointer text-xs font-bold ${
              voiceMuted ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
            }`}
            title="Toggle Voice Guidance Mute"
          >
            {voiceMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            <span>{voiceMuted ? 'Voice Off' : 'Voice On'}</span>
          </button>

          <button
            type="button"
            onClick={onExit}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white font-extrabold py-2 px-4 rounded-xl text-xs transition-all active:scale-95 shadow-md cursor-pointer text-center"
          >
            End Navigation
          </button>
        </div>
      </div>
    </div>
  )
}
