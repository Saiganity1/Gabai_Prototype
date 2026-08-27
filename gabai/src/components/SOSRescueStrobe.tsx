import React, { useState, useEffect } from 'react'
import { X, Volume2, VolumeX, Shield, Radio } from 'lucide-react'

interface Props {
  lat: number
  lng: number
  locationName: string
  onClose: () => void
}

export default function SOSRescueStrobe({ lat, lng, locationName, onClose }: Props) {
  const [strobeColor, setStrobeColor] = useState<'white' | 'red'>('white')
  const [isAudioWhistleOn, setIsAudioWhistleOn] = useState(true)

  // Strobe flashing interval (4Hz)
  useEffect(() => {
    const timer = setInterval(() => {
      setStrobeColor((prev) => (prev === 'white' ? 'red' : 'white'))
    }, 250)
    return () => clearInterval(timer)
  }, [])

  // Audio Rescue Whistle Buzzer via Web Audio API
  useEffect(() => {
    if (!isAudioWhistleOn) return

    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      const osc = audioCtx.createOscillator()
      const gain = audioCtx.createGain()

      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(880, audioCtx.currentTime) // High-pitch whistle tone
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime)

      osc.connect(gain)
      gain.connect(audioCtx.destination)
      osc.start()

      return () => {
        try {
          osc.stop()
          audioCtx.close()
        } catch {}
      }
    } catch {}
  }, [isAudioWhistleOn])

  return (
    <div
      className={`fixed inset-0 z-50 transition-colors duration-100 flex flex-col justify-between p-6 select-none ${
        strobeColor === 'white' ? 'bg-white text-slate-900' : 'bg-rose-600 text-white'
      }`}
    >
      {/* Top Header Controls */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2 bg-slate-900/90 text-white px-4 py-2 rounded-2xl backdrop-blur-md border border-slate-800">
          <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
          <span className="font-bold text-xs uppercase tracking-wider">RESCUE BEACON ACTIVE</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAudioWhistleOn(!isAudioWhistleOn)}
            className="p-3 bg-slate-900/90 text-white rounded-2xl backdrop-blur-md hover:bg-slate-800 transition-all cursor-pointer border border-slate-800"
            title="Toggle Audio Siren"
          >
            {isAudioWhistleOn ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-slate-400" />}
          </button>
          <button
            onClick={onClose}
            className="p-3 bg-slate-900/90 text-white rounded-2xl backdrop-blur-md hover:bg-slate-800 transition-all cursor-pointer border border-slate-800"
            title="Exit Rescue Strobe"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Beacon Message */}
      <div className="text-center my-auto z-10 space-y-4">
        <div className="inline-block bg-slate-950/90 text-white p-6 sm:p-8 rounded-3xl backdrop-blur-xl border border-slate-800 shadow-[0_20px_50px_rgba(0,0,0,0.5)] max-w-lg">
          <div className="text-4xl sm:text-5xl font-extrabold uppercase tracking-tight text-white">
            EMERGENCY SOS
          </div>
          <p className="text-xs sm:text-sm font-medium text-amber-400 mt-2">
            Hold device high toward rescue responders / drones
          </p>

          <div className="mt-6 pt-4 border-t border-slate-800 text-xs font-mono text-slate-400">
            <div>GPS: {lat.toFixed(5)}°N, {lng.toFixed(5)}°E</div>
            <div className="mt-1 font-sans font-medium text-slate-200">{locationName}</div>
          </div>
        </div>
      </div>

      {/* Bottom Dismiss */}
      <div className="text-center z-10">
        <button
          onClick={onClose}
          className="bg-slate-900 text-white font-bold text-xs px-8 py-3.5 rounded-2xl shadow-xl hover:bg-slate-800 transition-all active:scale-95 border border-slate-800 cursor-pointer"
        >
          Exit Emergency SOS Mode
        </button>
      </div>
    </div>
  )
}
