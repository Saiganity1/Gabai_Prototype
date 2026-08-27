import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Send, X, Bot, User, Sparkles } from 'lucide-react';

interface GabaiChatbotProps {
  onClose: () => void;
  voice: any;
}

export function GabaiChatbot({ onClose, voice }: GabaiChatbotProps) {
  const [messages, setMessages] = useState<{ sender: 'user' | 'gabai', text: string }[]>([
    { sender: 'gabai', text: 'Magandang araw! Ako si GABAI, ang iyong emergency disaster assistant. Paano kita matutulungan ngayon?' }
  ]);
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, voice.state]);

  const prevTranscript = useRef('');
  useEffect(() => {
    if (voice.state === 'processing' && voice.transcript && voice.transcript !== prevTranscript.current) {
      setMessages(prev => [...prev, { sender: 'user', text: voice.transcript }]);
      prevTranscript.current = voice.transcript;
    }
  }, [voice.state, voice.transcript]);

  const prevResponse = useRef('');
  useEffect(() => {
    if (voice.response && voice.response !== prevResponse.current) {
      setMessages(prev => [...prev, { sender: 'gabai', text: voice.response }]);
      prevResponse.current = voice.response;
    }
  }, [voice.response]);

  const handleSend = () => {
    if (!inputText.trim() || voice.state !== 'idle') return;
    const text = inputText;
    setInputText('');
    setMessages(prev => [...prev, { sender: 'user', text }]);
    voice.triggerTextPrompt(text, true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-x-4 bottom-24 top-24 md:top-auto md:left-1/2 md:-translate-x-1/2 md:w-[400px] md:h-[600px] bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden z-50 transition-all duration-300">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-cyan-600 to-blue-600 p-4 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              GABAI <Sparkles className="w-4 h-4 text-cyan-300" />
            </h3>
            <p className="text-cyan-100 text-xs font-medium">Disaster Assistant</p>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 rounded-full hover:bg-white/20 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-900/50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-2 max-w-[85%] ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.sender === 'user' ? 'bg-slate-200 dark:bg-slate-700' : 'bg-cyan-100 dark:bg-cyan-900/40'}`}>
                {msg.sender === 'user' ? <User className="w-4 h-4 text-slate-600 dark:text-slate-300" /> : <Bot className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />}
              </div>
              <div className={`p-3 rounded-2xl text-sm shadow-sm ${
                msg.sender === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-sm' 
                  : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-sm'
              }`}>
                {msg.text}
              </div>
            </div>
          </div>
        ))}

        {voice.state === 'listening' && (
          <div className="flex justify-start">
            <div className="flex gap-2 max-w-[85%] flex-row">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-red-100 dark:bg-red-900/40">
                <Mic className="w-4 h-4 text-red-600 dark:text-red-400 animate-pulse" />
              </div>
              <div className="p-3 rounded-2xl text-sm shadow-sm bg-white dark:bg-slate-800 text-slate-500 italic border border-slate-100 dark:border-slate-700 rounded-tl-sm">
                Listening...
              </div>
            </div>
          </div>
        )}

        {(voice.state === 'processing' || voice.state === 'speaking') && (
          <div className="flex justify-start">
            <div className="flex gap-2 max-w-[85%] flex-row">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-cyan-100 dark:bg-cyan-900/40">
                <Bot className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="p-3 rounded-2xl text-sm shadow-sm bg-white dark:bg-slate-800 text-slate-500 border border-slate-100 dark:border-slate-700 rounded-tl-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce delay-100"></span>
                <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-full border border-slate-200 dark:border-slate-700">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={voice.state !== 'idle'}
            placeholder={voice.state !== 'idle' ? 'GABAI is thinking...' : 'Type your message...'}
            className="flex-1 bg-transparent outline-none text-slate-800 dark:text-slate-200 px-2 text-sm disabled:opacity-50 min-w-0"
          />
          
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || voice.state !== 'idle'}
            className="p-2.5 bg-cyan-600 text-white rounded-full hover:bg-cyan-700 disabled:opacity-50 transition-colors flex shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
