import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, AlertOctagon, RotateCcw, Volume2, Shield, Radio, X } from "lucide-react";
import { RouteInfo } from "../utils/routingEngine";
import { hazardFeedback } from "../utils/hazardAlertFeedback";

interface Props {
  activeRoute: RouteInfo | null;
  isNavigating: boolean;
  onUpdatePosition: (lat: number, lng: number) => void;
  onInjectFakeReport: (distanceAheadKm?: number, roadName?: string) => void;
  darkMode?: boolean;
}

export default function HazardSimulationPanel({
  activeRoute,
  isNavigating,
  onUpdatePosition,
  onInjectFakeReport,
  darkMode = true,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSimulatingMove, setIsSimulatingMove] = useState(false);
  const [simStepIndex, setSimStepIndex] = useState(0);

  const coords: [number, number][] = activeRoute?.geoJSON?.geometry?.coordinates || [];
  const simTimerRef = useRef<number | null>(null);

  // Step movement along route line
  useEffect(() => {
    if (!isSimulatingMove || coords.length === 0) {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
      return;
    }

    simTimerRef.current = window.setInterval(() => {
      setSimStepIndex((prev) => {
        const next = prev + 1;
        if (next >= coords.length) {
          setIsSimulatingMove(false);
          return prev;
        }
        const [lng, lat] = coords[next];
        onUpdatePosition(lat, lng);
        return next;
      });
    }, 1800);

    return () => {
      if (simTimerRef.current) clearInterval(simTimerRef.current);
    };
  }, [isSimulatingMove, coords, onUpdatePosition]);

  if (!isNavigating || coords.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-40 select-none">
      {!isOpen ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="px-3 py-1.5 rounded-full bg-slate-900/90 hover:bg-slate-800 text-white border border-cyan-500/50 shadow-xl backdrop-blur-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:scale-105 active:scale-95"
          title="Open Live Hazard Test Simulator"
        >
          <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span>Test Hazard Mode</span>
        </button>
      ) : (
        <div
          className={`w-72 p-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl anim-scale-up ${
            darkMode
              ? "bg-slate-900/95 border-cyan-500/50 text-white"
              : "bg-white/95 border-cyan-500 text-slate-900"
          }`}
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60">
            <div className="flex items-center gap-1.5 text-xs font-extrabold text-cyan-400">
              <Radio className="w-4 h-4 animate-pulse" />
              <span>Route Hazard Simulator</span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[10px] text-slate-400 leading-tight mb-3">
            Simulate moving along route and inject a flood report directly on the road ahead.
          </p>

          <div className="space-y-2">
            {/* 1. Moving Driver Simulator */}
            <button
              type="button"
              onClick={() => setIsSimulatingMove(!isSimulatingMove)}
              className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isSimulatingMove
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white"
              }`}
            >
              {isSimulatingMove ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              <span>{isSimulatingMove ? "Pause Driver Motion" : "Start Moving Along Route"}</span>
            </button>

            {/* 2. Inject Fake Flood Ahead */}
            <button
              type="button"
              onClick={() => {
                onInjectFakeReport(0.4, "MacArthur Highway");
              }}
              className="w-full py-2 px-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all active:scale-95 cursor-pointer"
            >
              <AlertOctagon className="w-3.5 h-3.5 text-yellow-300" />
              <span>Simulate Flood 400m Ahead</span>
            </button>

            {/* 3. Test Audio Tone */}
            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => hazardFeedback.triggerAll("MacArthur Highway", "400 m")}
                className="flex-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <Volume2 className="w-3 h-3 text-cyan-400" />
                <span>Test Audio</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSimStepIndex(0);
                  if (coords.length > 0) onUpdatePosition(coords[0][1], coords[0][0]);
                }}
                className="py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                title="Reset to Start"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
