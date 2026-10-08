/**
 * Hazard Alert Feedback: Web Audio API Sound and Device Vibration
 * Ensures immediate sensory warning for motorists without external media assets.
 */

class HazardFeedbackManager {
  private audioCtx: AudioContext | null = null

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass()
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {})
    }
    return this.audioCtx
  }

  /**
   * Plays a high-visibility dual-tone warning sound sequence
   */
  public playAlertSound(): void {
    try {
      const ctx = this.getAudioContext()
      if (!ctx) return

      const now = ctx.currentTime

      // Tone 1: 880 Hz (A5)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, now)

      gain1.gain.setValueAtTime(0, now)
      gain1.gain.linearRampToValueAtTime(0.35, now + 0.04)
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.22)

      osc1.connect(gain1)
      gain1.connect(ctx.destination)

      osc1.start(now)
      osc1.stop(now + 0.25)

      // Tone 2: 660 Hz (E5)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'triangle'
      osc2.frequency.setValueAtTime(660, now + 0.25)

      gain2.gain.setValueAtTime(0, now + 0.25)
      gain2.gain.linearRampToValueAtTime(0.38, now + 0.28)
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.48)

      osc2.connect(gain2)
      gain2.connect(ctx.destination)

      osc2.start(now + 0.25)
      osc2.stop(now + 0.5)

      // Tone 3: 880 Hz urgent chime pulse
      const osc3 = ctx.createOscillator()
      const gain3 = ctx.createGain()
      osc3.type = 'sine'
      osc3.frequency.setValueAtTime(880, now + 0.52)

      gain3.gain.setValueAtTime(0, now + 0.52)
      gain3.gain.linearRampToValueAtTime(0.4, now + 0.55)
      gain3.gain.exponentialRampToValueAtTime(0.01, now + 0.85)

      osc3.connect(gain3)
      gain3.connect(ctx.destination)

      osc3.start(now + 0.52)
      osc3.stop(now + 0.9)
    } catch (e) {
      console.warn('Audio alert play skipped:', e)
    }
  }

  /**
   * Triggers rhythmic tactile device vibration for mobile devices
   */
  public triggerVibration(): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        // [vibrate, pause, vibrate, pause, long vibrate]
        navigator.vibrate([300, 150, 300, 150, 450])
      }
    } catch (e) {
      console.warn('Vibration skipped:', e)
    }
  }

  /**
   * Speaks voice warning over speech synthesis if permitted
   */
  public speakHazardWarning(roadName: string, distanceStr: string): void {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(
          `Attention: Flooded road reported ahead on ${roadName}, ${distanceStr} away.`
        )
        utterance.rate = 1.05
        utterance.pitch = 1.0
        utterance.volume = 1.0
        window.speechSynthesis.speak(utterance)
      }
    } catch {}
  }

  /**
   * Triggers the combined multisensory hazard alert
   */
  public triggerAll(roadName?: string, distanceStr?: string): void {
    this.playAlertSound()
    this.triggerVibration()
    if (roadName && distanceStr) {
      // Delay speech slightly so chime plays first
      setTimeout(() => {
        this.speakHazardWarning(roadName, distanceStr)
      }, 700)
    }
  }
}

export const hazardFeedback = new HazardFeedbackManager()
