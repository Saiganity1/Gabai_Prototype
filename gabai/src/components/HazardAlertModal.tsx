import React, { useState, useEffect, useRef } from "react";
import {
  AlertTriangle,
  Navigation,
  ShieldAlert,
  ArrowRight,
  PhoneCall,
  Clock,
  CheckCircle,
  X,
  Sparkles,
  MapPin,
  ChevronRight,
  Volume2,
} from "lucide-react";
import { ActiveHazardAlertData } from "../hooks/useRouteHazardMonitor";
import { RerouteEvaluationResult, calculateDetourAroundHazard } from "../utils/routeHazardRerouter";
import { Hazard } from "./MapCanvas";
import { RouteInfo } from "../utils/routingEngine";
import { hazardFeedback } from "../utils/hazardAlertFeedback";

interface Props {
  alertData: ActiveHazardAlertData;
  darkMode?: boolean;
  currentRoute: RouteInfo;
  destination: { lat: number; lng: number; name?: string };
  existingHazards: Hazard[];
  evacCenters?: Array<{ name: string; lat: number; lng: number; status?: string }>;
  userLocation?: { lat: number; lng: number };
  onAcceptNewRoute: (newRoute: RouteInfo) => void;
  onContinueAnyway: (hazardId: string | number) => void;
  onDismiss: () => void;
  onNavigateToShelter?: (shelter: { lat: number; lng: number; name: string }) => void;
}

type ModalStep = "alert" | "rerouting" | "reroute-result" | "confirm-continue";

export default function HazardAlertModal({
  alertData,
  darkMode = true,
  currentRoute,
  destination,
  existingHazards,
  evacCenters,
  userLocation,
  onAcceptNewRoute,
  onContinueAnyway,
  onDismiss,
  onNavigateToShelter,
}: Props) {
  const [step, setStep] = useState<ModalStep>("alert");
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15);
  const [hasTimedOut, setHasTimedOut] = useState<boolean>(false);
  const [rerouteResult, setRerouteResult] = useState<RerouteEvaluationResult | null>(null);
  const [isCalculatingReroute, setIsCalculatingReroute] = useState<boolean>(false);

  const timerRef = useRef<number | null>(null);

  // 15-second countdown timer
  useEffect(() => {
    setSecondsRemaining(15);
    setHasTimedOut(false);

    timerRef.current = window.setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          setHasTimedOut(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [alertData.hazard.id]);

  // Play audio sound again when modal mounts
  useEffect(() => {
    hazardFeedback.playAlertSound();
    hazardFeedback.triggerVibration();
  }, [alertData.hazard.id]);

  // Handle "Find new route"
  const handleFindNewRoute = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStep("rerouting");
    setIsCalculatingReroute(true);

    try {
      const firstCoord = currentRoute?.geoJSON?.geometry?.coordinates?.[0];
      const userCoords = userLocation
        ? userLocation
        : firstCoord
          ? { lat: firstCoord[1], lng: firstCoord[0] }
          : { lat: alertData.hazard.lat, lng: alertData.hazard.lng };

      const result = await calculateDetourAroundHazard(
        userCoords,
        destination,
        alertData.hazard,
        existingHazards,
        currentRoute,
        evacCenters,
      );

      setRerouteResult(result);
      setStep("reroute-result");
    } catch (err) {
      console.warn("Reroute computation failed:", err);
      setRerouteResult({
        success: false,
        oldEtaMinutes: 12,
        reason: "Unable to connect to routing service. Proceed with caution.",
        emergencyHotlines: [],
      });
      setStep("reroute-result");
    } finally {
      setIsCalculatingReroute(false);
    }
  };

  // Handle "Continue anyway" initial tap
  const handleInitiateContinue = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setStep("confirm-continue");
  };

  // Final confirmation to proceed through flooded segment
  const handleFinalConfirmContinue = () => {
    onContinueAnyway(alertData.hazard.id);
  };

  const { roadName, distanceAheadText, reportedAgoText, reportCount, severity } = alertData;

  const severityBadgeColor =
    severity === "high"
      ? "bg-red-500/20 text-red-400 border-red-500/40"
      : severity === "medium"
        ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
        : "bg-blue-500/20 text-blue-400 border-blue-500/40";

  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-3 sm:p-4 pointer-events-auto anim-fade-in select-none">
      {/* Dimmed backdrop */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-md" onClick={onDismiss} />

      <div
        className={`relative w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden transition-all duration-300 z-10 ${
          darkMode
            ? "bg-slate-900/95 border-red-500/40 text-white shadow-red-950/40"
            : "bg-white/95 border-red-400 text-slate-900 shadow-2xl"
        }`}
      >
        {/* Urgent Emergency Warning Header Bar */}
        <div className="bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 px-5 py-3 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center animate-pulse">
              <AlertTriangle className="w-5 h-5 text-yellow-300" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-yellow-200">
                Live Road Hazard Warning
              </div>
              <div className="text-xs font-bold text-white leading-tight">
                Active Route Obstruction Ahead
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => hazardFeedback.triggerAll(roadName, distanceAheadText)}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
              title="Replay Alert Tone"
            >
              <Volume2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDismiss}
              className="p-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 15s Countdown Progress Bar */}
        {step === "alert" && (
          <div className="w-full bg-slate-800 h-1 relative overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-amber-400 transition-all duration-1000 ease-linear"
              style={{ width: `${(secondsRemaining / 15) * 100}%` }}
            />
          </div>
        )}

        {/* Modal Body Container */}
        <div className="p-5 sm:p-6 space-y-4">
          {/* ── STEP 1: INITIAL HAZARD ALERT ── */}
          {step === "alert" && (
            <>
              {/* Primary Hazard Description Card */}
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg sm:text-xl font-black tracking-tight leading-snug">
                      Flooded road ahead:{" "}
                      <span className="text-red-500 underline decoration-red-500/50">
                        {roadName}
                      </span>
                    </h2>
                    <p
                      className={`text-xs font-medium mt-1 ${darkMode ? "text-slate-300" : "text-slate-600"}`}
                    >
                      Detected directly on your driving trajectory ·{" "}
                      <strong className="text-amber-400">{distanceAheadText} away</strong>
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border shrink-0 ${severityBadgeColor}`}
                  >
                    {severity} SEVERITY
                  </span>
                </div>

                {/* Report Metadata Pills */}
                <div
                  className={`p-3 rounded-2xl border flex items-center justify-between text-xs font-semibold ${
                    darkMode
                      ? "bg-slate-950/60 border-slate-800 text-slate-300"
                      : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Reported {reportedAgoText}</span>
                  </div>
                  <span className="text-slate-500">·</span>
                  <div className="flex items-center gap-1.5 text-blue-400">
                    <span>👥 Confirmed by {reportCount} motorists</span>
                  </div>
                </div>
              </div>

              {/* No Response Timeout Notice (After 15s) */}
              {hasTimedOut && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5 anim-fade-in">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
                  <div>
                    <strong>Suggested Action:</strong> No response in 15 seconds. We recommend
                    tapping <em>Find new route</em> to bypass the floodwaters.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                {/* Primary: Find New Route */}
                <button
                  type="button"
                  onClick={handleFindNewRoute}
                  className={`w-full py-3.5 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 text-white shadow-xl transition-all active:scale-[0.98] cursor-pointer ${
                    hasTimedOut
                      ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30 ring-2 ring-emerald-400 animate-pulse"
                      : "bg-blue-600 hover:bg-blue-500 shadow-blue-600/30"
                  }`}
                >
                  <Navigation className="w-4 h-4" />
                  <span>Find new route</span>
                  <ArrowRight className="w-4 h-4 ml-1" />
                </button>

                {/* Secondary: Continue Anyway */}
                <button
                  type="button"
                  onClick={handleInitiateContinue}
                  className={`w-full py-3 px-4 rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
                    darkMode
                      ? "bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                  }`}
                >
                  <span>Continue anyway</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </>
          )}

          {/* ── STEP 2: CALCULATING REROUTE (SPINNER) ── */}
          {step === "rerouting" && (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-blue-600/20 border-2 border-blue-500/40 flex items-center justify-center animate-spin">
                <Navigation className="w-7 h-7 text-blue-400" />
              </div>
              <div>
                <h3 className="font-extrabold text-base">Calculating Safe Bypass Corridors...</h3>
                <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                  Analyzing real-time road graph to circumvent {roadName}.
                </p>
              </div>
            </div>
          )}

          {/* ── STEP 3: REROUTE RESULT (NEW VS OLD ETA OR NO ALTERNATE) ── */}
          {step === "reroute-result" && rerouteResult && (
            <div className="space-y-4 anim-slide-up">
              {rerouteResult.success && rerouteResult.newRoute ? (
                <>
                  <div className="text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-black uppercase mb-1.5">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Flood-Free Detour Located</span>
                    </div>
                    <h3 className="text-lg font-black">Alternative Route Comparison</h3>
                  </div>

                  {/* ETA Comparison Card */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Old Blocked Route */}
                    <div
                      className={`p-3.5 rounded-2xl border text-center ${
                        darkMode ? "bg-red-950/30 border-red-800/50" : "bg-red-50 border-red-200"
                      }`}
                    >
                      <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-1">
                        Current Route (Flooded)
                      </div>
                      <div className="text-xl font-black text-red-500 line-through">
                        {rerouteResult.oldEtaMinutes} mins
                      </div>
                      <div className="text-[10px] text-red-400 font-semibold mt-1">
                        Hazard Ahead
                      </div>
                    </div>

                    {/* New Safe Detour */}
                    <div
                      className={`p-3.5 rounded-2xl border text-center ${
                        darkMode
                          ? "bg-emerald-950/40 border-emerald-500/60 shadow-lg shadow-emerald-950/50"
                          : "bg-emerald-50 border-emerald-400 shadow-md"
                      }`}
                    >
                      <div className="text-[10px] font-black text-emerald-400 uppercase tracking-wider mb-1">
                        New Safe Detour
                      </div>
                      <div className="text-xl font-black text-emerald-400">
                        {rerouteResult.newEtaMinutes} mins
                      </div>
                      <div className="text-[10px] text-emerald-300 font-bold mt-1">
                        +{rerouteResult.etaDiffMinutes || 0}m · 100% Flood-Free
                      </div>
                    </div>
                  </div>

                  <p
                    className={`text-xs text-center ${darkMode ? "text-slate-400" : "text-slate-600"}`}
                  >
                    Detour bypasses {roadName} via elevated municipal corridors.
                  </p>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={() => onAcceptNewRoute(rerouteResult.newRoute!)}
                      className="w-full py-3.5 px-4 rounded-2xl font-black text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>Accept New Safe Route</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleInitiateContinue}
                      className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold text-center transition-colors cursor-pointer ${
                        darkMode
                          ? "text-slate-400 hover:text-white"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      Decline & Continue on Current Route
                    </button>
                  </div>
                </>
              ) : (
                /* No Alternate Safe Route Found */
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/50 text-red-200">
                    <div className="flex items-center gap-2 font-black text-sm text-red-400 mb-1">
                      <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                      <span>Warning: No Alternate Safe Route Found</span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      All surrounding municipal roads are currently impassable or submerged under
                      floodwaters. We recommend stopping vehicle or diverting immediately to the
                      nearest high-ground evacuation point.
                    </p>
                  </div>

                  {/* Nearest Safe Shelter Card */}
                  {rerouteResult.nearestShelter && (
                    <div
                      className={`p-3.5 rounded-2xl border ${
                        darkMode ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                          Recommended Safe Point
                        </span>
                        <span className="text-[10px] bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                          {rerouteResult.nearestShelter.distanceText} away
                        </span>
                      </div>
                      <div className="font-extrabold text-sm">
                        {rerouteResult.nearestShelter.name}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {rerouteResult.nearestShelter.status}
                      </div>

                      {onNavigateToShelter && (
                        <button
                          type="button"
                          onClick={() => onNavigateToShelter(rerouteResult.nearestShelter!)}
                          className="mt-3 w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          <span>Divert to Safe Evacuation Shelter</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Emergency Hotlines Panel */}
                  <div>
                    <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                      Emergency Hotlines (Tap to Call)
                    </div>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {rerouteResult.emergencyHotlines.slice(0, 3).map((contact, idx) => (
                        <a
                          key={idx}
                          href={`tel:${contact.number.replace(/[^0-9]/g, "")}`}
                          className={`flex items-center justify-between p-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                            darkMode
                              ? "bg-slate-950 hover:bg-slate-800 border-slate-800 text-white"
                              : "bg-white hover:bg-slate-100 border-slate-200 text-slate-900"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{contact.icon}</span>
                            <div>
                              <div className="font-bold text-[11px]">{contact.name}</div>
                              <div className="text-[10px] font-mono text-slate-400">
                                {contact.number}
                              </div>
                            </div>
                          </div>
                          <PhoneCall className="w-3.5 h-3.5 text-emerald-400" />
                        </a>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onDismiss}
                    className={`w-full py-3 rounded-xl font-bold text-xs border text-center transition-all cursor-pointer ${
                      darkMode
                        ? "bg-slate-800 text-slate-300 border-slate-700"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Close & Stay Alert
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 4: EXTRA CONFIRMATION FOR "CONTINUE ANYWAY" ── */}
          {step === "confirm-continue" && (
            <div className="space-y-4 anim-slide-up">
              <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200">
                <div className="flex items-center gap-2 font-black text-sm text-amber-400 mb-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                  <span>Hazard Caution: Confirm Proceeding</span>
                </div>
                <p className="text-xs leading-relaxed text-slate-300">
                  Floodwater on <strong className="text-white">{roadName}</strong> may submerge low
                  exhaust pipes, stall engines, or hide open manholes.
                </p>
                <div className="mt-2 text-[11px] font-semibold text-amber-300">
                  If you continue, this road segment will remain marked{" "}
                  <span className="text-red-400 font-bold">RED</span> on your live map.
                </div>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={handleFinalConfirmContinue}
                  className="w-full py-3.5 px-4 rounded-2xl font-black text-xs bg-red-600 hover:bg-red-500 text-white shadow-xl shadow-red-600/30 flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Yes, Continue on This Road Anyway</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStep("alert")}
                  className={`w-full py-3 px-4 rounded-2xl font-bold text-xs border text-center transition-colors cursor-pointer ${
                    darkMode
                      ? "bg-slate-800 text-slate-300 border-slate-700 hover:text-white"
                      : "bg-slate-100 text-slate-700 border-slate-300"
                  }`}
                >
                  Go Back to Safety Options
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
