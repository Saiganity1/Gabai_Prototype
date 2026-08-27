import React, { useState, useEffect, useRef } from 'react'
import {
  Mic,
  MicOff,
  Send,
  X,
  Bot,
  User,
  Sparkles,
  Navigation,
  MapPin,
  ArrowRight,
  Eye,
} from 'lucide-react'

export interface ChatMessage {
  sender: 'user' | 'gabai'
  text: string
  routeCard?: {
    destinationName: string
    address?: string
    distanceKm: number
    durationMin: number
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
    bypassedHazardsCount?: number
    lat: number
    lng: number
  }
}

interface GabaiChatbotProps {
  onClose: () => void
  voice: any
  destination?: { name: string; lat: number; lng: number } | null
  routes?: any
  onStartNavigation?: () => void
  onViewOnMap?: (dest?: any) => void
  onSendMessage?: (text: string) => Promise<{ text: string; routeCard?: any } | string>
}

export function GabaiChatbot({
  onClose,
  voice,
  destination,
  routes,
  onStartNavigation,
  onViewOnMap,
  onSendMessage,
}: GabaiChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'gabai',
      text: 'Magandang araw! Ako si GABAI, ang iyong disaster navigation assistant. Saan mo nais pumunta o anong tulong ang kailangan mo?',
    },
  ])
  const [inputText, setInputText] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, voice.state, isThinking])

  const prevResponse = useRef('')
  useEffect(() => {
    if (voice.response && voice.response !== prevResponse.current) {
      setMessages((prev) => [...prev, { sender: 'gabai', text: voice.response }])
      prevResponse.current = voice.response
    }
  }, [voice.response])

  const handleSend = async (customText?: string) => {
    const text = (customText || inputText).trim()
    if (!text || isThinking) return
    if (!customText) setInputText('')
    setMessages((prev) => [...prev, { sender: 'user', text }])

    if (onSendMessage) {
      setIsThinking(true)
      try {
        const res = await onSendMessage(text)
        setIsThinking(false)
        if (typeof res === 'string') {
          setMessages((prev) => [...prev, { sender: 'gabai', text: res }])
        } else if (res && res.text) {
          setMessages((prev) => [
            ...prev,
            { sender: 'gabai', text: res.text, routeCard: res.routeCard },
          ])
        }
      } catch {
        setIsThinking(false)
        setMessages((prev) => [
          ...prev,
          { sender: 'gabai', text: 'Paumanhin, may kaunting aberya. Pakisubukang muli.' },
        ])
      }
    } else {
      voice.triggerTextPrompt(text, true)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const quickPrompts = [
    { label: '🛍️ SM City Pampanga', text: 'Directions to SM City Pampanga' },
    { label: '✈️ Clark Airport', text: 'Find route to Clark International Airport' },
    { label: '🏥 Nearest Hospital', text: 'Find safe route to nearest hospital' },
    { label: '🛡️ Evacuation Center', text: 'Show safe route to evacuation shelter' },
    { label: '🌊 Check Floods', text: 'May baha ba ngayon sa mga kalsada?' },
  ]

  return (
    <div className="fixed inset-x-3 bottom-20 top-20 sm:inset-x-auto sm:left-6 sm:bottom-24 sm:top-auto sm:w-[420px] sm:h-[620px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-200/80 dark:border-slate-800 flex flex-col overflow-hidden z-50 transition-all duration-300 anim-scale-up">
      {/* Header */}
      <div className="bg-slate-900 dark:bg-slate-950 p-4 border-b border-slate-800 flex items-center justify-between shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-white font-bold text-sm flex items-center gap-1.5">
              GABAI AI Co-Pilot <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            </h3>
            <p className="text-slate-400 text-[11px] font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
              Navigation & Disaster Assistant
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Suggested Quick Action Chips */}
      <div className="px-3 py-2 bg-slate-50/80 dark:bg-slate-950/80 border-b border-slate-200/60 dark:border-slate-800/80 overflow-x-auto flex items-center gap-1.5 no-scrollbar shrink-0">
        {quickPrompts.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q.text)}
            disabled={isThinking || voice.state !== 'idle'}
            className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:border-cyan-500/50 hover:text-cyan-600 dark:hover:text-cyan-400 transition-all shrink-0 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Chat Messages Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50 dark:bg-slate-900/40">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`flex gap-2.5 max-w-[88%] ${
                msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                  msg.sender === 'user'
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-cyan-400 border border-slate-700/60'
                }`}
              >
                {msg.sender === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className="flex flex-col gap-2">
                <div
                  className={`p-3.5 rounded-2xl text-xs font-normal leading-relaxed shadow-xs whitespace-pre-line ${
                    msg.sender === 'user'
                      ? 'bg-cyan-600 text-white rounded-tr-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/70 rounded-tl-xs'
                  }`}
                >
                  {msg.text}
                </div>

                {/* Inline Interactive Route Card */}
                {msg.routeCard && (
                  <div className="anim-slide-up bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-3.5 shadow-md flex flex-col gap-2.5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center justify-center shrink-0">
                          <MapPin className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase font-bold text-cyan-400 tracking-wider">
                            Safe Destination
                          </div>
                          <div className="text-xs font-bold text-white truncate max-w-[190px]">
                            {msg.routeCard.destinationName}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shrink-0">
                        Safe Route
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 font-medium text-slate-300">
                      <span>{msg.routeCard.distanceKm.toFixed(1)} km</span>
                      <span>~{msg.routeCard.durationMin} mins</span>
                      <span className="text-emerald-400 font-semibold">Flood Bypassed</span>
                    </div>

                    <div className="flex items-center gap-2 mt-0.5">
                      {onStartNavigation && (
                        <button
                          onClick={() => {
                            onStartNavigation()
                            onClose()
                          }}
                          className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-95"
                        >
                          <Navigation className="w-3.5 h-3.5" />
                          <span>Start Navigation</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (onViewOnMap && msg.routeCard) {
                            onViewOnMap(msg.routeCard)
                          } else {
                            onClose()
                          }
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold text-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95 border border-slate-700"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Listening Indicator */}
        {voice.state === 'listening' && (
          <div className="flex justify-start anim-fade-in">
            <div className="flex gap-2 max-w-[85%] flex-row items-center">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <Mic className="w-3.5 h-3.5 animate-pulse" />
              </div>
              <div className="p-2.5 rounded-2xl text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 font-medium flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                Listening...
              </div>
            </div>
          </div>
        )}

        {/* Processing Indicator */}
        {(isThinking || voice.state === 'processing' || voice.state === 'speaking') && (
          <div className="flex justify-start anim-fade-in">
            <div className="flex gap-2 max-w-[85%] flex-row items-center">
              <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3 rounded-2xl text-xs bg-white dark:bg-slate-800 text-slate-500 border border-slate-200/60 dark:border-slate-700/60 flex items-center gap-1.5">
                <span className="text-slate-600 dark:text-slate-300 font-medium">GABAI is thinking</span>
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.15s]" />
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1.5 rounded-full border border-slate-200 dark:border-slate-700/80 focus-within:border-cyan-500 dark:focus-within:border-cyan-400 transition-all shadow-xs">
          {/* Voice Microphone Toggle */}
          <button
            type="button"
            onClick={voice.toggleListening}
            title={voice.state === 'listening' ? 'Stop listening' : 'Speak to GABAI'}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
              voice.state === 'listening'
                ? 'bg-rose-500 text-white animate-pulse shadow-xs'
                : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {voice.state === 'listening' ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={voice.state === 'listening' || isThinking}
            placeholder={
              voice.state === 'listening'
                ? 'Listening to voice...'
                : isThinking || voice.state === 'processing'
                ? 'GABAI is thinking...'
                : 'Type destination or ask a question...'
            }
            className="flex-1 bg-transparent outline-none text-slate-800 dark:text-slate-100 px-2 text-xs font-medium disabled:opacity-50 min-w-0"
          />

          <button
            type="button"
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isThinking || voice.state !== 'idle'}
            className="w-8 h-8 bg-cyan-600 text-white rounded-full hover:bg-cyan-500 disabled:opacity-40 transition-all flex items-center justify-center shrink-0 cursor-pointer shadow-xs active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

