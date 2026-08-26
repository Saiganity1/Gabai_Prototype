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
        strobeColor === 'white' ? 'bg-white text-black' : 'bg-red-600 text-white'
      }`}
    >
      {/* Top Header Controls */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2 bg-black/80 text-white px-4 py-2 rounded-2xl backdrop-blur-md">
          <Radio className="w-4 h-4 text-red-400 animate-pulse" />
          <span className="font-black text-xs uppercase tracking-wider">RESCUE BEACON ACTIVE</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAudioWhistleOn(!isAudioWhistleOn)}
            className="p-3 bg-black/80 text-white rounded-2xl backdrop-blur-md hover:bg-black transition-colors"
            title="Toggle Audio Siren"
          >
            {isAudioWhistleOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            className="p-3 bg-black/80 text-white rounded-2xl backdrop-blur-md hover:bg-black transition-colors"
            title="Exit Rescue Strobe"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Center Beacon Message */}
      <div className="text-center my-auto z-10 space-y-4">
        <div className="inline-block bg-black/85 text-white p-6 sm:p-8 rounded-3xl backdrop-blur-md border border-white/20 shadow-2xl">
          <div className="text-4xl sm:text-6xl font-black uppercase tracking-tighter">
            EMERGENCY SOS
          </div>
          <p className="text-sm sm:text-base font-bold text-amber-300 mt-2">
            Hold device high toward rescue boats / drones
          </p>

          <div className="mt-6 pt-4 border-t border-white/20 text-xs font-mono text-slate-200">
            <div>GPS: {lat.toFixed(5)}°N, {lng.toFixed(5)}°E</div>
            <div className="mt-1 font-sans font-bold text-white">{locationName}</div>
          </div>
        </div>
      </div>

      {/* Bottom Dismiss */}
      <div className="text-center z-10">
        <button
          onClick={onClose}
          className="bg-black text-white font-extrabold text-sm px-8 py-4 rounded-2xl shadow-2xl hover:bg-slate-900 transition-all active:scale-95 border border-white/30"
        >
          Exit Emergency SOS Mode
        </button>
      </div>
    </div>
  )
}
