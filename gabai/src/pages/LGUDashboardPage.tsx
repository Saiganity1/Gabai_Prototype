import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Shield, Sun, Moon,
  Clock, Layers, Locate,
  ChevronDown, ChevronUp, CheckCircle, XCircle, Flag, Sparkles, AlertTriangle,
  Users, Megaphone, Send, LifeBuoy,
  Copy, Check, Search, Plus, Minus, Volume2, VolumeX, Eye,
  Radio, Anchor, HeartPulse, Truck
} from 'lucide-react'
import MapCanvas, { Hazard, MapCanvasHandle } from '../components/MapCanvas'
import { useDisaster } from '../context/DisasterContext'

interface Props {
  darkMode?: boolean
  toggleDark?: () => void
}

interface DispatchUnit {
  id: string
  name: string
  agency: 'LGU' | 'PCG' | 'RED_CROSS' | 'BFP' | 'DPWH'
  type: 'rescue_boat' | 'medical_emt' | 'fire_engine' | 'dpwh_clearing'
  status: 'en_route' | 'on_scene' | 'standby' | 'returning'
  assignedIncident?: string
  location: string
  eta?: string
}

interface MutualAidRequest {
  id: string
  agency: 'PCG' | 'RED_CROSS' | 'BFP' | 'DPWH'
  resource: string
  quantity: string
  status: 'APPROVED & EN ROUTE' | 'PENDING APPROVAL' | 'DEPLOYED'
  eta: string
}

export default function LGUDashboardPage({ darkMode = true, toggleDark = () => {} }: Props) {
  const {
    hazards,
    reports,
    evacCenters,
    userLocation,
    locationName,
    isLocationLoading,
    requestLocation,
    verifyReport,
    rejectReport,
    resolveReport,
    addHazardReport,
    aiPatternInsight,
    lastActionMessage,
    isWsConnected,
  } = useDisaster()

  // State Management
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null)
  const [activeTab, setActiveTab] = useState<'triage' | 'hazards' | 'evacuation' | 'dispatch' | 'sitrep'>('triage')
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'verified' | 'resolved'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [layersOpen, setLayersOpen] = useState(false)
  const [isPanelMinimized, setIsPanelMinimized] = useState(false)
  const [alertLevel, setAlertLevel] = useState<'red' | 'orange' | 'blue'>('red')
  const [isSirenActive, setIsSirenActive] = useState(false)
  const [copiedSitRep, setCopiedSitRep] = useState(false)
  const [showRadar, setShowRadar] = useState(true)

  // Modals
  const [showBroadcastModal, setShowBroadcastModal] = useState(false)
  const [broadcastMessage, setBroadcastMessage] = useState('CRITICAL ADVISORY: Evacuate low-lying river areas immediately.')
  const [showDispatchModal, setShowDispatchModal] = useState(false)
  const [dispatchTargetReport, setDispatchTargetReport] = useState<any>(null)
  const [selectedUnitType, setSelectedUnitType] = useState<string>('rescue_boat')
  const [selectedAgency, setSelectedAgency] = useState<'LGU' | 'PCG' | 'RED_CROSS' | 'BFP' | 'DPWH'>('LGU')

  // Live Digital Clock
  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Local Shelter Occupancy State (modifiable by LGU)
  const [localShelters, setLocalShelters] = useState(evacCenters)
  useEffect(() => {
    setLocalShelters(evacCenters)
  }, [evacCenters])

  // Active Dispatch Fleet (Inter-Agency Mutual Aid)
  const [fleet, setFleet] = useState<DispatchUnit[]>([
    {
      id: 'unit-1',
      name: 'PCG Water Search & Rescue Unit',
      agency: 'PCG',
      type: 'rescue_boat',
      status: 'en_route',
      assignedIncident: 'Flash Flood — Main Avenue',
      location: 'En route to Sector 2',
      eta: '4 mins',
    },
    {
      id: 'unit-2',
      name: 'Philippine Red Cross EMT Ambulance',
      agency: 'RED_CROSS',
      type: 'medical_emt',
      status: 'on_scene',
      assignedIncident: 'Barangay Medical Aid',
      location: 'Central Gymnasium',
      eta: 'On Scene',
    },
    {
      id: 'unit-3',
      name: 'BFP High-Volume Flood Pumper 4',
      agency: 'BFP',
      type: 'fire_engine',
      status: 'standby',
      location: 'Central Fire Station Headquarters',
    },
    {
      id: 'unit-4',
      name: 'DPWH Heavy Payloader Clearing Crew',
      agency: 'DPWH',
      type: 'dpwh_clearing',
      status: 'on_scene',
      assignedIncident: 'Road Blockage — Fallen Tree',
      location: 'Sta. Cruz Avenue',
      eta: 'On Scene',
    },
  ])

  // Mutual Aid Requests
  const [mutualAidRequests] = useState<MutualAidRequest[]>([
    {
      id: 'ma-1',
      agency: 'PCG',
      resource: '4x Inflatable Rubber Boats & 8 Divers',
      quantity: '4 Boats',
      status: 'APPROVED & EN ROUTE',
      eta: '12 mins',
    },
    {
      id: 'ma-2',
      agency: 'RED_CROSS',
      resource: 'Emergency Food Truck & Mobile Water Purifier',
      quantity: '500 Meals/hr',
      status: 'DEPLOYED',
      eta: 'On Scene',
    },
  ])

  const mapCanvasRef = useRef<MapCanvasHandle>(null)

  // Metrics computation
  const pendingReports = useMemo(() => reports.filter((r) => r.status === 'pending'), [reports])
  const verifiedReports = useMemo(() => reports.filter((r) => r.status === 'verified'), [reports])
  const activeHazardsCount = useMemo(() => hazards.filter((h) => h.status !== 'Resolved').length, [hazards])

  // Filtered reports stream
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (reportFilter !== 'all' && r.status !== reportFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        return (
          r.desc.toLowerCase().includes(q) ||
          r.citizen.toLowerCase().includes(q) ||
          (r.locationName && r.locationName.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [reports, reportFilter, searchQuery])

  // Capacity modifiers
  const handleModifyShelter = (idx: number, delta: number) => {
    setLocalShelters((prev) =>
      prev.map((s, i) => {
        if (i === idx) {
          const currentPct = parseInt(s.cap) || 50
          const nextPct = Math.max(0, Math.min(100, currentPct + delta))
          return { ...s, cap: `${nextPct}%` }
        }
        return s
      })
    )
  }

  const handleLocateMe = () => {
    requestLocation()
    mapCanvasRef.current?.flyToUser()
  }

  const handleAssignDispatch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!dispatchTargetReport) return

    const newUnit: DispatchUnit = {
      id: `unit-${Date.now()}`,
      name:
        selectedAgency === 'PCG'
          ? 'Philippine Coast Guard Rubber Boat Alpha'
          : selectedAgency === 'RED_CROSS'
          ? 'Philippine Red Cross Emergency EMT'
          : selectedAgency === 'BFP'
          ? 'BFP Rapid Water Pumper Engine'
          : selectedAgency === 'DPWH'
          ? 'DPWH Heavy Road Clearing Payloader'
          : 'CDRRMO Municipal Response Crew',
      agency: selectedAgency,
      type: selectedUnitType as any,
      status: 'en_route',
      assignedIncident: dispatchTargetReport.desc.slice(0, 30),
      location: `Dispatched to ${dispatchTargetReport.locationName || 'Incident GPS'}`,
      eta: '5 mins',
    }

    setFleet((prev) => [newUnit, ...prev])
    setShowDispatchModal(false)
    setDispatchTargetReport(null)
    setActiveTab('dispatch')
  }

  // SitRep Generator in Markdown
  const sitRepContent = useMemo(() => {
    const timeStr = currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    const dateStr = currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const highHazards = hazards.filter((h) => h.severity === 'high')

    return `# GABAI DISASTER SITUATION REPORT (SITREP)
**Jurisdiction:** ${locationName} — Incident Command Post
**Date / Time:** ${dateStr} @ ${timeStr} PST
**Alert Level:** ${alertLevel.toUpperCase()} ALERT (Active Response Phase)

## 1. EXECUTIVE SUMMARY
- Total Incidents Under Surveillance: **${hazards.length}**
- Critical / High-Risk Danger Zones: **${highHazards.length}**
- Citizen Incident Reports Processed: **${reports.length}** (${verifiedReports.length} Verified, ${pendingReports.length} Pending Triage)
- Operational Evacuation Shelters: **${localShelters.length}**
- Inter-Agency Response Fleet: **${fleet.length} Units Active** (PCG, Red Cross, BFP, DPWH, LGU)

## 2. ACTIVE HAZARDS INVENTORY
${hazards.map((h, i) => `${i + 1}. **${h.label}** (${h.severity.toUpperCase()}) — ${h.status} [${h.reports} reports, ${h.verified} verified]`).join('\n')}

## 3. EVACUATION SHELTER STATUS
${localShelters.map((s) => `- **${s.name}**: ${s.cap} Occupancy (${s.status})`).join('\n')}

## 4. INTER-AGENCY MUTUAL AID
${mutualAidRequests.map((m) => `- **[${m.agency}]** ${m.resource} — Status: ${m.status} (ETA: ${m.eta})`).join('\n')}

## 5. ACTION DIRECTIVES & ORDERS
- Precautionary evacuation enforced along low-lying river corridors.
- Traffic rerouted through GABAI AI Safe Navigation Corridors.
- Response fleet on continuous 24/7 operational standby.`
  }, [currentTime, locationName, alertLevel, hazards, reports, verifiedReports, pendingReports, localShelters, fleet, mutualAidRequests])

  const copySitRep = () => {
    navigator.clipboard.writeText(sitRepContent)
    setCopiedSitRep(true)
    setTimeout(() => setCopiedSitRep(false), 3000)
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* Background Interactive Map */}
      <div className="absolute inset-0 z-0">
        <MapCanvas
          ref={mapCanvasRef}
          darkMode={darkMode}
          selectedHazard={selectedHazard}
          showRoutes={false}
          selectedRoute={null}
          onHazardClick={setSelectedHazard}
          emergencyMode={alertLevel === 'red'}
          navPosition="top-right"
          userLocation={userLocation}
          hazards={hazards}
          showRadar={showRadar}
        />
      </div>

      {/* ── Fixed Header Command Bar (Zero Overlap) ───────────── */}
      <header className="absolute top-0 left-0 right-0 z-20 bg-slate-900/90 backdrop-blur-xl border-b border-slate-800 shadow-2xl p-2.5 sm:p-3">
        <div className="max-w-7xl mx-auto flex flex-col gap-2.5">
          {/* Top Row: Brand + Controls */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {/* OpCen Logo & Location */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shrink-0 border border-blue-400/30">
                <Shield className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm tracking-tight text-white">GABAI COMMAND</span>
                  <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[9px] font-black px-1.5 py-0.5 rounded uppercase">
                    DISASTER OPCEN
                  </span>
                  <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} title={isWsConnected ? 'Live WebSocket Connected' : 'Syncing'} />
                </div>
                <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                  <span className="text-slate-200 font-semibold truncate max-w-[200px]">{locationName}</span>
                  <span>•</span>
                  <span className="text-emerald-400 font-mono font-bold">
                    {currentTime.toLocaleTimeString('en-US', { hour12: false })} PST
                  </span>
                </div>
              </div>
            </div>

            {/* Right Action Tools */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Alert Level Pill */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-1 flex items-center gap-1">
                <span className="text-[9px] uppercase font-bold text-slate-400 px-1">ALERT:</span>
                {(['blue', 'orange', 'red'] as const).map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setAlertLevel(lvl)}
                    className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase transition-all ${
                      alertLevel === lvl
                        ? lvl === 'red'
                          ? 'bg-red-600 text-white shadow-[0_0_10px_rgba(239,68,68,0.8)]'
                          : lvl === 'orange'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-[0_0_10px_rgba(245,158,11,0.6)]'
                          : 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.6)]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {lvl === 'red' ? '🔴 RED' : lvl === 'orange' ? '🟠 YELLOW' : '🔵 BLUE'}
                  </button>
                ))}
              </div>

              {/* Broadcast Alert Button */}
              <button
                onClick={() => setShowBroadcastModal(true)}
                className="bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-md border border-red-400/40 flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Broadcast Alert</span>
              </button>

              {/* Siren Audio Toggle */}
              <button
                onClick={() => setIsSirenActive(!isSirenActive)}
                className={`p-2 rounded-xl border transition-all ${
                  isSirenActive
                    ? 'bg-red-600 border-red-400 text-white animate-pulse'
                    : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
                }`}
                title="Toggle Emergency Audio Siren"
              >
                {isSirenActive ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Public Citizen Map View */}
              <a
                href="/"
                className="bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-200 hover:text-blue-400 transition-colors flex items-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">Public Map</span>
              </a>

              {/* Theme Toggle */}
              <button
                onClick={toggleDark}
                className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 text-slate-400 hover:text-white transition-colors"
              >
                {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-blue-400" />}
              </button>
            </div>
          </div>

          {/* Row 2: Telemetry Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              {
                label: 'Active Danger Pins',
                val: activeHazardsCount,
                icon: AlertTriangle,
                color: 'text-red-400',
                border: 'border-red-500/30',
              },
              {
                label: 'Pending Triage',
                val: pendingReports.length,
                icon: Clock,
                color: 'text-amber-400',
                border: 'border-amber-500/30',
              },
              {
                label: 'Verified Incidents',
                val: verifiedReports.length,
                icon: CheckCircle,
                color: 'text-emerald-400',
                border: 'border-emerald-500/30',
              },
              {
                label: 'Active Shelters',
                val: localShelters.length,
                icon: Users,
                color: 'text-blue-400',
                border: 'border-blue-500/30',
              },
              {
                label: 'Dispatched Fleet',
                val: fleet.length,
                icon: LifeBuoy,
                color: 'text-indigo-400',
                border: 'border-indigo-500/30',
              },
            ].map((m) => {
              const Icon = m.icon
              return (
                <div
                  key={m.label}
                  className={`bg-slate-950/70 rounded-xl p-2 px-3 border ${m.border} flex items-center justify-between shadow-inner`}
                >
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{m.label}</div>
                    <div className="text-base font-black text-white">{m.val}</div>
                  </div>
                  <div className={`p-1.5 rounded-lg bg-slate-900 ${m.color}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </header>

      {/* ── Fixed Floating Notification Toast ── */}
      {lastActionMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto anim-slide-up">
          <div className="bg-slate-900/95 text-white text-xs font-bold px-5 py-2.5 rounded-full shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl flex items-center gap-2.5 border border-blue-500/50">
            <Sparkles className="w-4 h-4 text-blue-400 shrink-0 animate-spin" />
            <span>{lastActionMessage}</span>
          </div>
        </div>
      )}

      {/* ── Main Command Sidebar Panel ───────────────────────── */}
      <div className="absolute top-[138px] bottom-4 left-4 z-20 w-full sm:w-[440px] max-w-[calc(100vw-32px)] pointer-events-none transition-all duration-300">
        <div className="h-full bg-slate-900/95 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] border border-slate-700/60 overflow-hidden flex flex-col pointer-events-auto">
          {/* AI Pattern Alert Pill */}
          {aiPatternInsight && (
            <div className="bg-amber-950/80 border-b border-amber-500/40 p-3 flex items-start gap-2.5 anim-slide-down">
              <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40 shrink-0 mt-0.5">
                <Sparkles className="w-3.5 h-3.5 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0 text-xs">
                <div className="font-black text-amber-300 text-[11px] leading-tight flex items-center gap-1.5">
                  <span className="truncate">{aiPatternInsight.title}</span>
                </div>
                <p className="text-slate-300 text-[10px] mt-0.5 line-clamp-2 leading-relaxed">
                  {aiPatternInsight.description}
                </p>
              </div>
            </div>
          )}

          {/* Tabs Navigation */}
          <div className="p-2 bg-slate-950/80 border-b border-slate-800 flex items-center gap-1">
            <button
              onClick={() => setIsPanelMinimized(!isPanelMinimized)}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-colors"
              title={isPanelMinimized ? 'Expand Control Panel' : 'Minimize Control Panel'}
            >
              {isPanelMinimized ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            <div className="grid grid-cols-5 flex-1 gap-1">
              {[
                { id: 'triage', label: 'Triage', count: pendingReports.length },
                { id: 'hazards', label: 'Hazards', count: activeHazardsCount },
                { id: 'evacuation', label: 'Shelters', count: localShelters.length },
                { id: 'dispatch', label: 'Fleet', count: fleet.length },
                { id: 'sitrep', label: 'SitRep', count: undefined },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id as any)
                    setIsPanelMinimized(false)
                  }}
                  className={`py-1.5 px-1 rounded-xl text-[11px] font-extrabold capitalize transition-all relative flex flex-col items-center justify-center ${
                    activeTab === t.id && !isPanelMinimized
                      ? 'bg-blue-600 text-white shadow-md border border-blue-400/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <span>{t.label}</span>
                  {t.count !== undefined && (
                    <span
                      className={`text-[8px] px-1.5 py-0.2 rounded-full font-black mt-0.5 ${
                        activeTab === t.id && !isPanelMinimized
                          ? 'bg-white text-blue-900'
                          : t.count > 0 && t.id === 'triage'
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Panel Content Stream */}
          {!isPanelMinimized && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
              {/* ════ TAB 1: TRIAGE QUEUE ════ */}
              {activeTab === 'triage' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search incident reports, citizen, location..."
                        className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>

                    <div className="flex gap-1 overflow-x-auto pb-1">
                      {(['all', 'pending', 'verified', 'resolved'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={() => setReportFilter(st)}
                          className={`px-3 py-1 rounded-xl text-[10px] font-bold capitalize transition-colors whitespace-nowrap ${
                            reportFilter === st
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {st} ({st === 'all' ? reports.length : reports.filter((r) => r.status === st).length})
                        </button>
                      ))}
                    </div>
                  </div>

                  {filteredReports.map((report) => {
                    const isPending = report.status === 'pending'
                    const isVerified = report.status === 'verified'
                    const isResolved = report.status === 'resolved'

                    return (
                      <div
                        key={report.id}
                        onClick={() => mapCanvasRef.current?.flyToCoords(report.lat, report.lng, 16)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                          isPending
                            ? 'border-amber-500/60 bg-amber-500/5 hover:bg-amber-500/10'
                            : isVerified
                            ? 'border-emerald-500/60 bg-emerald-500/5 hover:bg-emerald-500/10'
                            : 'border-slate-800 bg-slate-950/40 hover:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{report.emoji}</span>
                            <div>
                              <div className="font-extrabold text-xs text-slate-100 flex items-center gap-1.5">
                                <span>{report.citizen}</span>
                                {isVerified && <span className="text-[9px] text-emerald-400 font-bold">✓ Verified</span>}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Clock className="w-3 h-3" /> {report.time} · {report.locationName || 'Live GPS'}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                              isVerified
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : isPending
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                                : isResolved
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {report.status}
                          </span>
                        </div>

                        {/* Road Flood Line & Passability Specific Badge in LGU Triage */}
                        {report.isRoadSegment && report.roadSegment && (
                          <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800 my-2 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                                🛣️ Road Stretch: {report.roadSegment.roadName || 'Road Segment'}
                              </span>
                              <span
                                className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${
                                  isVerified ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white'
                                }`}
                              >
                                {isVerified ? '🔵 Verified Blue Line' : '🟠 Pending Orange Line'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                              <div className="bg-slate-950 p-1.5 rounded-lg text-slate-300 truncate">
                                A: {report.roadSegment.from.name || 'Start Pin'}
                              </div>
                              <div className="bg-slate-950 p-1.5 rounded-lg text-slate-300 truncate">
                                B: {report.roadSegment.to.name || 'End Pin'}
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-[11px] pt-0.5">
                              <span className="font-bold text-amber-400">
                                {report.passability === 'not_passable_all'
                                  ? '⛔ Closed to All Vehicles'
                                  : report.passability === 'all_passable'
                                  ? '🟢 Passable to All Vehicles'
                                  : '🚫 Not Passable to Light Vehicles'}
                              </span>
                              {report.waterDepth && (
                                <span className="font-semibold text-cyan-300 text-[10px]">
                                  🌊 {report.waterDepth}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/70 text-xs text-slate-300 leading-relaxed my-2">
                          "{report.desc}"
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 pt-2 border-t border-slate-800/80">
                          {isPending && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  verifyReport(report.id)
                                }}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 rounded-xl text-xs flex items-center justify-center gap-1 transition-all shadow-md active:scale-95"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>{report.isRoadSegment ? 'Verify Road Flood (Turns Blue)' : 'Verify & Publish'}</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDispatchTargetReport(report)
                                  setShowDispatchModal(true)
                                }}
                                className="px-3 bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 rounded-xl text-xs flex items-center gap-1 transition-all active:scale-95"
                              >
                                <LifeBuoy className="w-3.5 h-3.5" />
                                <span>Dispatch</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  rejectReport(report.id)
                                }}
                                className="px-2.5 bg-slate-800 hover:bg-red-950/60 hover:text-red-400 text-slate-400 font-bold py-1.5 rounded-xl text-xs"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {isVerified && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setDispatchTargetReport(report)
                                  setShowDispatchModal(true)
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-1.5 rounded-xl text-xs flex items-center justify-center gap-1 transition-all shadow-md active:scale-95"
                              >
                                <LifeBuoy className="w-3.5 h-3.5" />
                                <span>Assign Mutual Aid / Fleet</span>
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  resolveReport(report.id)
                                }}
                                className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-1.5 rounded-xl text-xs flex items-center gap-1"
                              >
                                <Flag className="w-3.5 h-3.5 text-blue-400" />
                                <span>Resolve</span>
                              </button>
                            </>
                          )}

                          {isResolved && (
                            <div className="w-full text-center text-[10px] text-slate-500 font-bold py-1">
                              🏁 Incident Cleared & Closed
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ════ TAB 2: HAZARD INVENTORY ════ */}
              {activeTab === 'hazards' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Active Map Hazards</h3>
                      <p className="text-[11px] text-slate-400">Broadcasting to citizen route routers</p>
                    </div>
                    <button
                      onClick={() =>
                        addHazardReport({
                          type: 'flood',
                          description: 'LGU Commanded Hazard Zone: High Risk Flood Warning',
                          severity: 'high',
                          citizenName: 'LGU Incident Commander',
                        })
                      }
                      className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Zone
                    </button>
                  </div>

                  {hazards.map((h) => (
                    <div
                      key={h.id}
                      onClick={() => {
                        setSelectedHazard(h)
                        mapCanvasRef.current?.flyToCoords(h.lat, h.lng, 16)
                      }}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                        selectedHazard?.id === h.id
                          ? 'border-blue-500 bg-blue-500/20 shadow-lg'
                          : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{h.emoji}</span>
                          <div>
                            <div className="font-bold text-xs text-white">{h.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {h.distance} · {h.reports} reports · {h.verified} LGU verified
                            </div>
                          </div>
                        </div>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                            h.severity === 'high'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : h.severity === 'medium'
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          }`}
                        >
                          {h.severity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ════ TAB 3: EVACUATION SHELTERS ════ */}
              {activeTab === 'evacuation' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Shelter Logistics</h3>
                      <p className="text-[11px] text-slate-400">Live capacity controls</p>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 rounded-lg">
                      100% OPERATIONAL
                    </span>
                  </div>

                  {localShelters.map((shelter, idx) => {
                    const pct = parseInt(shelter.cap) || 50
                    return (
                      <div
                        key={shelter.name}
                        onClick={() => mapCanvasRef.current?.flyToCoords(shelter.lat, shelter.lng, 16)}
                        className="p-3 rounded-2xl border border-slate-800 bg-slate-950/60 hover:border-slate-700 transition-all cursor-pointer space-y-2.5"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-extrabold text-xs text-white">{shelter.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{shelter.dist} away from OpCen</div>
                          </div>
                          <span className="text-xs font-bold text-emerald-400">{shelter.status}</span>
                        </div>

                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1">
                            <span>Occupancy Rate</span>
                            <span className={pct > 80 ? 'text-red-400 font-black' : 'text-slate-200'}>{shelter.cap}</span>
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${
                                pct > 80 ? 'bg-red-500' : pct > 60 ? 'bg-amber-400' : 'bg-emerald-500'
                              }`}
                              style={{ width: shelter.cap }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-xs">
                          <span className="text-[10px] text-slate-400 font-medium">Adjust Occupancy:</span>
                          <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleModifyShelter(idx, -10)}
                              className="p-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleModifyShelter(idx, 10)}
                              className="p-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ════ TAB 4: INTER-AGENCY MUTUAL AID & FLEET ════ */}
              {activeTab === 'dispatch' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-white">Inter-Agency Response Fleet</h3>
                      <p className="text-[11px] text-slate-400">PCG, Red Cross, BFP, DPWH, LGU</p>
                    </div>
                    <button
                      onClick={() => {
                        setDispatchTargetReport(reports[0])
                        setShowDispatchModal(true)
                      }}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-md"
                    >
                      <Plus className="w-3.5 h-3.5" /> Request Aid
                    </button>
                  </div>

                  {fleet.map((unit) => (
                    <div
                      key={unit.id}
                      className="p-3 rounded-2xl border border-slate-800 bg-slate-950/60 space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                            {unit.agency === 'PCG' ? <Anchor className="w-3.5 h-3.5" /> : unit.agency === 'RED_CROSS' ? <HeartPulse className="w-3.5 h-3.5" /> : <LifeBuoy className="w-3.5 h-3.5" />}
                          </div>
                          <div>
                            <div className="font-bold text-xs text-white flex items-center gap-1.5">
                              <span>{unit.name}</span>
                              <span className="text-[9px] bg-slate-800 px-1.5 py-0.2 rounded font-mono text-indigo-300">
                                {unit.agency}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{unit.location}</div>
                          </div>
                        </div>
                        <span
                          className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${
                            unit.status === 'en_route'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                              : unit.status === 'on_scene'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {unit.status.replace('_', ' ')}
                        </span>
                      </div>

                      {unit.assignedIncident && (
                        <div className="bg-slate-900/80 p-2 rounded-xl text-[10px] text-slate-300 flex justify-between items-center border border-slate-800">
                          <span className="truncate max-w-[220px]">Mission: {unit.assignedIncident}</span>
                          {unit.eta && <span className="text-amber-400 font-mono font-bold">{unit.eta}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ════ TAB 5: AI SITREP GENERATOR ════ */}
              {activeTab === 'sitrep' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-extrabold text-sm text-white">AI Situation Report (SitRep)</h3>
                      <p className="text-[11px] text-slate-400">Automated government executive brief</p>
                    </div>
                    <button
                      onClick={copySitRep}
                      className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded-xl flex items-center gap-1.5 shadow-md"
                    >
                      {copiedSitRep ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedSitRep ? 'Copied!' : 'Copy SitRep'}</span>
                    </button>
                  </div>

                  <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 font-mono text-[10px] text-slate-300 whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
                    {sitRepContent}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Map Action Controls (Bottom Right) ────────────────── */}
      <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2 pointer-events-none">
        <button
          onClick={handleLocateMe}
          title="Center OpCen on GPS coordinates"
          className="pointer-events-auto w-11 h-11 bg-slate-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-700/60 flex items-center justify-center text-slate-300 hover:text-blue-400 hover:bg-slate-800 transition-all active:scale-95 group"
        >
          <Locate className={`w-4 h-4 transition-transform ${isLocationLoading ? 'animate-spin text-blue-400' : 'group-hover:scale-110'}`} />
        </button>

        <button
          onClick={() => setLayersOpen(!layersOpen)}
          className={`pointer-events-auto w-11 h-11 rounded-2xl shadow-2xl border flex items-center justify-center transition-all active:scale-95 backdrop-blur-xl ${
            layersOpen
              ? 'bg-blue-600 border-blue-400 text-white'
              : 'bg-slate-900/90 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-blue-400'
          }`}
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* Layers Dropdown */}
      {layersOpen && (
        <div className="absolute bottom-20 right-4 z-30 bg-slate-900/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-700/60 p-4 w-56 anim-slide-up pointer-events-auto">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Map Layers</div>
          <label className="flex items-center gap-2.5 py-1.5 cursor-pointer text-xs text-slate-300 hover:text-white">
            <input
              type="checkbox"
              checked={showRadar}
              onChange={(e) => setShowRadar(e.target.checked)}
              className="w-3.5 h-3.5 accent-blue-500"
            />
            <span className="font-bold">PAGASA Doppler Weather Radar</span>
          </label>
          {[
            { id: 'hazards', label: 'Hazard Danger Pins' },
            { id: 'evac', label: 'Evacuation Shelters' },
            { id: '3d', label: '3D Buildings Extrusion' },
          ].map((l) => (
            <label key={l.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer text-xs text-slate-300 hover:text-white">
              <input type="checkbox" defaultChecked={l.id !== '3d'} className="w-3.5 h-3.5 accent-blue-500" />
              <span>{l.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* ════ MODALS ════ */}

      {/* 1. Emergency Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 anim-fade-in">
          <div className="bg-slate-900 border border-red-500/50 rounded-3xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.3)] anim-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Public Emergency Broadcast</h3>
                <p className="text-xs text-slate-400">Pushes red alert notification to all active citizen devices</p>
              </div>
            </div>

            <textarea
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-3 text-xs text-white placeholder-slate-500 outline-none focus:border-red-500 resize-none mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setShowBroadcastModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowBroadcastModal(false)
                  setIsSirenActive(true)
                }}
                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Broadcast</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Mutual Aid & Dispatch Modal */}
      {showDispatchModal && dispatchTargetReport && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 anim-fade-in">
          <form
            onSubmit={handleAssignDispatch}
            className="bg-slate-900 border border-indigo-500/50 rounded-3xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(99,102,241,0.3)] anim-slide-up"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-base">Inter-Agency Mutual Aid Dispatch</h3>
                <p className="text-xs text-slate-400 truncate max-w-[280px]">Incident: {dispatchTargetReport.desc}</p>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Select Responding Agency:</label>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'PCG', label: 'Coast Guard', icon: Anchor },
                  { id: 'RED_CROSS', label: 'Red Cross', icon: HeartPulse },
                  { id: 'BFP', label: 'Fire Bureau', icon: Shield },
                  { id: 'DPWH', label: 'DPWH Infra', icon: Truck },
                  { id: 'LGU', label: 'LGU OpCen', icon: LifeBuoy },
                ].map((ag) => {
                  const Icon = ag.icon
                  return (
                    <button
                      key={ag.id}
                      type="button"
                      onClick={() => setSelectedAgency(ag.id as any)}
                      className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                        selectedAgency === ag.id
                          ? 'border-indigo-500 bg-indigo-500/20 text-white'
                          : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{ag.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDispatchModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Deploy Unit</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
