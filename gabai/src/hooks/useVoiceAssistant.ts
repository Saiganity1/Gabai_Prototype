import { useState, useRef, useEffect, useCallback } from 'react';

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export interface VoiceActionPayload {
  action: 'REPORT_HAZARD' | 'SAFE_ROUTE' | 'GENERAL_QUERY';
  hazardType?: 'flood' | 'fire' | 'road' | 'rain' | 'power' | 'other';
  severity?: 'high' | 'medium' | 'low';
  transcript: string;
}

export function useVoiceAssistant(
  contextData: any,
  onAction?: (payload: VoiceActionPayload) => void
) {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [response, setResponse] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis | null>(null);
  const contextRef = useRef<any>(contextData);
  const onActionRef = useRef(onAction);

  useEffect(() => {
    contextRef.current = contextData;
  }, [contextData]);

  useEffect(() => {
    onActionRef.current = onAction;
  }, [onAction]);

  // Client-side instant keyword parser for offline / instantaneous feedback
  const parseLocalIntent = (text: string): VoiceActionPayload => {
    const lower = text.toLowerCase();
    if (
      lower.includes('baha') ||
      lower.includes('flood') ||
      lower.includes('lubog') ||
      lower.includes('tubig')
    ) {
      return {
        action: 'REPORT_HAZARD',
        hazardType: 'flood',
        severity: 'high',
        transcript: text,
      };
    }
    if (
      lower.includes('sunog') ||
      lower.includes('fire') ||
      lower.includes('apoy') ||
      lower.includes('usok')
    ) {
      return {
        action: 'REPORT_HAZARD',
        hazardType: 'fire',
        severity: 'high',
        transcript: text,
      };
    }
    if (
      lower.includes('harang') ||
      lower.includes('block') ||
      lower.includes('sarado') ||
      lower.includes('closed') ||
      lower.includes('puno')
    ) {
      return {
        action: 'REPORT_HAZARD',
        hazardType: 'road',
        severity: 'medium',
        transcript: text,
      };
    }
    if (
      lower.includes('ruta') ||
      lower.includes('route') ||
      lower.includes('daan') ||
      lower.includes('evac') ||
      lower.includes('shelter') ||
      lower.includes('uwi') ||
      lower.includes('safe')
    ) {
      return {
        action: 'SAFE_ROUTE',
        transcript: text,
      };
    }
    return {
      action: 'GENERAL_QUERY',
      transcript: text,
    };
  };

  // Initialize Web Speech API
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.lang = 'tl-PH'; 
        recognitionRef.current.interimResults = true;
        recognitionRef.current.continuous = true;

        let silenceTimer: any = null;

        const startSilenceTimer = () => {
          if (silenceTimer) clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            recognitionRef.current?.stop();
          }, 1600); // 1.6s of silence
        };

        recognitionRef.current.onstart = () => {
          startSilenceTimer();
        };

        recognitionRef.current.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          setTranscript(currentTranscript);
          startSilenceTimer();
        };

        recognitionRef.current.onend = () => {
          if (silenceTimer) clearTimeout(silenceTimer);
          setState((prevState) => {
            if (prevState === 'listening') {
              processTranscript();
              return 'processing';
            }
            return prevState;
          });
        };
        
        recognitionRef.current.onerror = (event: any) => {
          if (silenceTimer) clearTimeout(silenceTimer);
          console.error('Speech recognition error', event.error);
          setState('idle');
        };
      } else {
        console.warn('Speech Recognition API not supported in this browser.');
      }

      synthesisRef.current = window.speechSynthesis;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const processTranscript = async () => {
    setTimeout(async () => {
      setTranscript((finalTranscript) => {
        if (!finalTranscript.trim()) {
          setState('idle');
          return finalTranscript;
        }

        const localIntent = parseLocalIntent(finalTranscript);

        // Send to backend
        fetch('http://localhost:3000/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: finalTranscript,
            context: contextRef.current,
          }),
        })
          .then((res) => res.json())
          .then((data) => {
            const aiReply = data.response || 'Naitala ang iyong ulat.';
            const action = data.action || localIntent.action;
            const hazardType = data.hazardType || localIntent.hazardType;
            const severity = data.severity || localIntent.severity;

            setResponse(aiReply);
            speakResponse(aiReply);

            if (onActionRef.current && (action === 'REPORT_HAZARD' || action === 'SAFE_ROUTE')) {
              onActionRef.current({
                action,
                hazardType,
                severity,
                transcript: finalTranscript,
              });
            }
          })
          .catch((err) => {
            console.warn('AI backend unavailable, using local disaster intent engine:', err);
            let fallbackReply = 'Narinig ko ang iyong ulat.';
            if (localIntent.action === 'REPORT_HAZARD') {
              fallbackReply = `Nai-report ko na ang ${localIntent.hazardType === 'flood' ? 'baha' : localIntent.hazardType === 'fire' ? 'sunog' : 'harang sa kalsada'} sa inyong lokasyon.`;
            } else if (localIntent.action === 'SAFE_ROUTE') {
              fallbackReply = 'Ipinapakita ang pinakaligtas na ruta sa evacuation shelter.';
            }

            setResponse(fallbackReply);
            speakResponse(fallbackReply);

            if (onActionRef.current && (localIntent.action === 'REPORT_HAZARD' || localIntent.action === 'SAFE_ROUTE')) {
              onActionRef.current(localIntent);
            }
          });
          
        return finalTranscript;
      });
    }, 100);
  };

  const speakResponse = (text: string) => {
    if (!synthesisRef.current) {
      setState('idle');
      return;
    }

    synthesisRef.current.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synthesisRef.current.getVoices();
    const phVoice = voices.find((v) => v.lang.includes('tl') || v.lang.includes('ph') || v.lang.includes('PH'));
    if (phVoice) utterance.voice = phVoice;

    utterance.onstart = () => setState('speaking');
    utterance.onend = () => setState('idle');
    utterance.onerror = () => setState('idle');

    synthesisRef.current.speak(utterance);
  };

  const toggleListening = useCallback(() => {
    if (state === 'idle') {
      if (synthesisRef.current) synthesisRef.current.cancel();
      setTranscript('');
      setResponse('');
      setState('listening');
      try {
        recognitionRef.current?.start();
      } catch (e) {
        console.error(e);
      }
    } else {
      recognitionRef.current?.stop();
      if (synthesisRef.current) synthesisRef.current.cancel();
      setState('idle');
    }
  }, [state]);

  const triggerTextPrompt = useCallback((text: string) => {
    setTranscript(text);
    setState('processing');
    const localIntent = parseLocalIntent(text);

    fetch('http://localhost:3000/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: text,
        context: contextRef.current,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        const aiReply = data.response || 'Naitala ang iyong ulat.';
        const action = data.action || localIntent.action;
        const hazardType = data.hazardType || localIntent.hazardType;
        const severity = data.severity || localIntent.severity;

        setResponse(aiReply);
        speakResponse(aiReply);

        if (onActionRef.current && (action === 'REPORT_HAZARD' || action === 'SAFE_ROUTE')) {
          onActionRef.current({
            action,
            hazardType,
            severity,
            transcript: text,
          });
        }
      })
      .catch(() => {
        let fallbackReply = 'Narinig ko ang iyong ulat.';
        if (localIntent.action === 'REPORT_HAZARD') {
          fallbackReply = `Nai-report ko na ang ${localIntent.hazardType === 'flood' ? 'baha' : localIntent.hazardType === 'fire' ? 'sunog' : 'harang sa kalsada'} sa inyong lokasyon.`;
        } else if (localIntent.action === 'SAFE_ROUTE') {
          fallbackReply = 'Ipinapakita ang pinakaligtas na ruta sa evacuation shelter.';
        }

        setResponse(fallbackReply);
        speakResponse(fallbackReply);

        if (onActionRef.current && (localIntent.action === 'REPORT_HAZARD' || localIntent.action === 'SAFE_ROUTE')) {
          onActionRef.current(localIntent);
        }
      });
  }, []);

  return {
    state,
    transcript,
    response,
    toggleListening,
    triggerTextPrompt,
  };
}
