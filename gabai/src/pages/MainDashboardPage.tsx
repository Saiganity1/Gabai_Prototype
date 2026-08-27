import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Search, Sun, Moon, Mic, MicOff, Layers, Locate,
  ChevronUp, ChevronDown, X, Shield, ShieldAlert, Navigation,
  MapPin, TriangleAlert, Users,
  PhoneCall, CheckCircle, Clock, ChevronRight, Loader2, Sparkles,
  Camera, Upload, Zap, CloudRain, Radio
} from 'lucide-react'
import MapCanvas, { Hazard, MapCanvasHandle } from '../components/MapCanvas'
import DrivingHUD from '../components/DrivingHUD'
import FamilySafetyModal from '../components/FamilySafetyModal'
import SOSRescueStrobe from '../components/SOSRescueStrobe'
import { useVoiceAssistant, VoiceActionPayload } from '../hooks/useVoiceAssistant'
import { useDisaster, isHazardPubliclyVisible } from '../context/DisasterContext'
import { REPORT_TYPES } from '../constants'
import { ActiveModal, AppState } from '../types'
import { StatusDot } from '../components/ui/StatusDot'
import { RiskBadge } from '../components/ui/RiskBadge'
import { searchRealWorldPlaces } from '../utils/placeSearch'
import { fetchRoadSegmentPath } from '../utils/routingEngine'
import { analyzeRouteWithAI } from '../utils/aiRouteAdvisor'
import { geminiAnalyzeFloodPhoto, geminiAnalyzeRoute } from '../utils/geminiClient'

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (isLocalhost ? 'http://localhost:3000/api' : '')

interface Props {
  darkMode: boolean
  toggleDark: () => void
}

export default function MainApp({ darkMode, toggleDark }: Props) {
  const {
    hazards,
    myReportIds,
    evacCenters,
    userLocation,
    locationName,
    isLocationLoading,
    requestLocation,
    addHazardReport,
    destination,
    setDestination,
    routes,
    aiPatternInsight,
    lastActionMessage,
    clearLastActionMessage,
  } = useDisaster()

  const [activeModal, setActiveModal] = useState<ActiveModal | 'family_safety'>('none')
  const [appState, setAppState] = useState<AppState>('normal')
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null)
  const [selectedRoute, setSelectedRoute] = useState<'safe' | 'balanced' | 'fast'>('safe')
  const [panelOpen, setPanelOpen] = useState(false)
  const [showBubble, setShowBubble] = useState(false)
  const [showRadar, setShowRadar] = useState(true)

  // Destination Choosing States
  const [isChoosingDestination, setIsChoosingDestination] = useState(false)
  const [destinationSearch, setDestinationSearch] = useState('')
  const [isMapClickDestinationMode, setIsMapClickDestinationMode] = useState(false)
  const [pendingAutoNavigate, setPendingAutoNavigate] = useState(false)

  // Advanced feature active views
  const [isDrivingHUDActive, setIsDrivingHUDActive] = useState(false)
  const [isSOSStrobeActive, setIsSOSStrobeActive] = useState(false)

  // Real Search Autocomplete
  const [searchQuery, setSearchQuery] = useState('')
  const [searchFocused, setSearchFocused] = useState(false)
  const [searchResults, setSearchResults] = useState<
    Array<{ name: string; address: string; lat: number; lng: number; isEstablishment?: boolean; emoji?: string }>
  >([])
  const [isSearching, setIsSearching] = useState(false)

  // Reporting with AI Vision & Road Flood Segments
  const [reportStep, setReportStep] = useState<'form' | 'analyzing' | 'done'>('form')
  const [reportType, setReportType] = useState<string>('flood')
  const [reportDesc, setReportDesc] = useState<string>('')
  const [reportSeverity, setReportSeverity] = useState<'low' | 'medium' | 'high'>('high')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false)
  const [photoAiAnalysis, setPhotoAiAnalysis] = useState<any>(null)

  // Road Flood Line Segment State
  const [isRoadSegmentMode, setIsRoadSegmentMode] = useState(true)
  const [roadName, setRoadName] = useState('')
  const [floodStartPoint, setFloodStartPoint] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [floodEndPoint, setFloodEndPoint] = useState<{ lat: number; lng: number; name: string } | null>(null)
  const [floodPassability, setFloodPassability] = useState<'all_passable' | 'not_passable_light' | 'not_passable_all'>('not_passable_light')
  const [floodWaterDepth, setFloodWaterDepth] = useState('Knee Deep (0.45m)')
  const [isPickingPointMode, setIsPickingPointMode] = useState<'from' | 'to' | null>(null)

  // Map Layer & Perspective Controls
  const [is3D, setIs3D] = useState(true)
  const [isSatellite, setIsSatellite] = useState(false)
  const [hazardFilter, setHazardFilter] = useState<'all' | 'flood' | 'closure' | 'verified' | 'no_light'>('all')
  const [show3DBuildings, setShow3DBuildings] = useState(true)
  const [showDangerZones, setShowDangerZones] = useState(true)
  const [showRoadLines, setShowRoadLines] = useState(true)
  const [showEvacCenters, setShowEvacCenters] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  const [isAiAlertDismissed, setIsAiAlertDismissed] = useState(false)
  const mapCanvasRef = useRef<MapCanvasHandle>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Anti-Spam Public Visibility Filter: Unverified citizen reports from other users are hidden until LGU verifies them
  const publicHazards = useMemo(() => {
    return hazards.filter((h) => isHazardPubliclyVisible(h, myReportIds))
  }, [hazards, myReportIds])

  const filteredHazards = useMemo(() => {
    return publicHazards.filter((h) => {
      if (hazardFilter === 'flood') return h.type === 'flood' || h.isRoadSegment
      if (hazardFilter === 'closure') return h.type === 'closure' || h.type === 'road_block' || h.type === 'road'
      if (hazardFilter === 'verified') return Boolean((h.verified && h.verified > 0) || h.isVerified || h.status === 'Verified' || h.status === 'Verified by LGU')
      if (hazardFilter === 'no_light') return h.passability === 'not_passable_light' || h.passability === 'not_passable_all'
      return true
    })
  }, [publicHazards, hazardFilter])

  const floodCount = useMemo(() => publicHazards.filter((h) => h.type === 'flood' || h.isRoadSegment).length, [publicHazards])
  const closureCount = useMemo(() => publicHazards.filter((h) => h.type === 'closure' || h.type === 'road_block' || h.type === 'road').length, [publicHazards])
  const verifiedCount = useMemo(() => publicHazards.filter((h) => (h.verified && h.verified > 0) || h.isVerified || h.status === 'Verified' || h.status === 'Verified by LGU').length, [publicHazards])
  const noLightCount = useMemo(() => publicHazards.filter((h) => h.passability === 'not_passable_light' || h.passability === 'not_passable_all').length, [publicHazards])

  const toggle3DMode = () => {
    setIs3D((prev) => {
      const next = !prev
      mapCanvasRef.current?.set3DMode(next)
      return next
    })
  }

  // Selectable Destinations list for Safe Route chooser (Evacuation Shelters)
  const selectableDestinations = useMemo(() => {
    let list = evacCenters
    if (destinationSearch.trim()) {
      const q = destinationSearch.toLowerCase().trim()
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.address.toLowerCase().includes(q)
      )
    }
    return list
  }, [evacCenters, destinationSearch])

  // AI Neural Route Analysis & Predictive Hazard Modeling
  const aiRouteAnalysis = useMemo(() => {
    return routes ? analyzeRouteWithAI(routes, hazards) : null
  }, [routes, hazards])

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (isPickingPointMode === 'from') {
      setFloodStartPoint({
        lat: coords.lat,
        lng: coords.lng,
        name: `Start (Point A: ${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E)`,
      })
      setIsPickingPointMode(null)
      setActiveModal('report')
      return
    }

    if (isPickingPointMode === 'to') {
      setFloodEndPoint({
        lat: coords.lat,
        lng: coords.lng,
        name: `End (Point B: ${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E)`,
      })
      setIsPickingPointMode(null)
      setActiveModal('report')
      return
    }

    if (isMapClickDestinationMode) {
      setDestination({
        name: `Selected Map Location (${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E)`,
        lat: coords.lat,
        lng: coords.lng,
      })
      setIsMapClickDestinationMode(false)
      setActiveModal('routes')
      mapCanvasRef.current?.flyToCoords(coords.lat, coords.lng, 15)
    }
  }

  // Live real-world search debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      const q = searchQuery.toLowerCase().trim()

      // Match in evacuation centers first
      let localMatches = evacCenters
        .filter(
          (evac) =>
            evac.name.toLowerCase().includes(q) ||
            evac.address.toLowerCase().includes(q)
        )
        .map((evac) => ({
          name: evac.name,
          address: `Evacuation Center · ${evac.address}`,
          lat: evac.lat,
          lng: evac.lng,
          isEstablishment: false,
          emoji: '🛡️',
        }))

      // Real-world OpenStreetMap Nominatim results
      const osmMatches = await searchRealWorldPlaces(
        searchQuery,
        userLocation.lat,
        userLocation.lng
      )

      const combined = [
        ...localMatches,
        ...osmMatches.map((m) => ({
          name: m.name,
          address: m.address,
          lat: m.lat,
          lng: m.lng,
          isEstablishment: false,
          emoji: '📍',
        })),
      ]

      setSearchResults(combined.slice(0, 10))
      setIsSearching(false)
    }, 200)

    return () => clearTimeout(timer)
  }, [searchQuery, evacCenters, userLocation.lat, userLocation.lng])

  // AI Voice Context
  const mapContext = useMemo(
    () => ({
      currentLocation: `${locationName} (${userLocation.lat.toFixed(4)}°N, ${userLocation.lng.toFixed(4)}°E)`,
      nearbyHazards: hazards,
      evacuationCenters: evacCenters,
    }),
    [locationName, userLocation.lat, userLocation.lng, hazards, evacCenters]
  )

  // Handle AI Voice Action triggers
  const handleVoiceAction = (payload: VoiceActionPayload) => {
    if (payload.action === 'REPORT_HAZARD') {
      const { hazard } = addHazardReport({
        type: payload.hazardType || 'flood',
        description: `Voice AI Report: ${payload.transcript}`,
        severity: payload.severity || 'high',
        citizenName: 'Voice Assistant (Live Citizen)',
      })
      setSelectedHazard(hazard)
      setActiveModal('hazard')
    } else if (payload.action === 'SAFE_ROUTE') {
      setActiveModal('routes')
    } else if (payload.action === 'NAVIGATE' && payload.destination) {
      const dest = payload.destination;
      const q = dest.toLowerCase();
      const localMatch = evacCenters.find(e => e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q));
      
      const navigateTo = async () => {
         let target = null;
         if (localMatch) {
            target = { name: localMatch.name, lat: localMatch.lat, lng: localMatch.lng };
         } else {
            const osmMatches = await searchRealWorldPlaces(dest, userLocation.lat, userLocation.lng);
            if (osmMatches.length > 0) {
               target = { name: osmMatches[0].name, lat: osmMatches[0].lat, lng: osmMatches[0].lng };
            }
         }

         if (target) {
            setDestination(target);
            setPendingAutoNavigate(true);
            setActiveModal('none');
         }
      };
      navigateTo();
    }
  }

  const voice = useVoiceAssistant(mapContext, handleVoiceAction)

  // Auto-show bubble when speaking or processing
  useEffect(() => {
    if (voice.state === 'speaking' || voice.state === 'processing') {
      setShowBubble(true)
    } else if (voice.state === 'idle' && !voice.response && !voice.transcript) {
      setShowBubble(false)
    }
  }, [voice.state, voice.response, voice.transcript])

  // Clear action toast after 4 seconds
  useEffect(() => {
    if (lastActionMessage) {
      const timer = setTimeout(() => clearLastActionMessage(), 4000)
      return () => clearTimeout(timer)
    }
  }, [lastActionMessage, clearLastActionMessage])

  // Auto-navigation effect
  useEffect(() => {
    if (pendingAutoNavigate && routes && routes['safe']) {
      const activeRoute = routes['safe'];
      const coords = activeRoute?.geoJSON?.geometry?.coordinates;

      // Wait until we have the real OSRM route (initial fallback dummy route has exactly 2 coordinates)
      if (!Array.isArray(coords) || coords.length <= 2) {
        return;
      }

      // activeRoute.rawRoute doesn't exist on RouteInfo, use steps
      const summary = activeRoute.steps?.[0]?.streetName || activeRoute.steps?.[1]?.streetName || 'mga pangunahing kalsada';
      const msg = `Dadaan ang ligtas na ruta sa ${summary}.`;
      
      // Clear flag so this only triggers once
      setPendingAutoNavigate(false);

      // Brief delay before speaking and flying to allow Mapbox to render the new route safely (prevents WebGL crash)
      setTimeout(() => {
        voice.speakResponse(msg, voice.detectedLanguage || voice.language);
        
        setSelectedRoute('safe');
        setIsDrivingHUDActive(true);

        let initialBearing = -15;
        if (Array.isArray(coords) && coords.length > 1) {
          const [lng1, lat1] = coords[0];
          const [lng2, lat2] = coords[Math.min(3, coords.length - 1)];
          const y = Math.sin(((lng2 - lng1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
          const x = Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) - Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lng2 - lng1) * Math.PI) / 180);
          const angle = (Math.atan2(y, x) * 180) / Math.PI;
          initialBearing = (angle + 360) % 360;
        }
        
        mapCanvasRef.current?.startNavigationPerspective(
          userLocation.lat,
          userLocation.lng,
          initialBearing
        );
      }, 500);
    }
  }, [routes, pendingAutoNavigate, userLocation, voice]);

  const handleMicPress = () => {
    setShowBubble(false)
    voice.toggleListening()
  }

  const handleSuggestion = (s: string) => {
    setShowBubble(true)
    voice.triggerTextPrompt(s)
  }

  // When a hazard marker is tapped
  const handleHazardClick = (h: Hazard | null) => {
    if (!h) {
      setSelectedHazard(null)
      return
    }
    setSelectedHazard(h)
    setActiveModal('hazard')
    mapCanvasRef.current?.flyToCoords(h.lat, h.lng, 16)
  }

  const handleSelectSearchResult = (result: { name: string; lat: number; lng: number }) => {
    setDestination({ name: result.name, lat: result.lat, lng: result.lng })
    setActiveModal('routes')
    mapCanvasRef.current?.flyToCoords(result.lat, result.lng, 16)
    setSearchQuery('')
    setSearchFocused(false)
    setSearchResults([])
  }

  const handleOpenReportModal = () => {
    setReportStep('form')
    setReportType('flood')
    setReportDesc('')
    setIsRoadSegmentMode(true)
    setRoadName('')
    setFloodStartPoint({
      lat: userLocation.lat,
      lng: userLocation.lng,
      name: locationName ? `Near ${locationName.split(',')[0]} (Point A)` : 'Current Location (Point A)',
    })
    setFloodEndPoint({
      lat: userLocation.lat + 0.005,
      lng: userLocation.lng + 0.006,
      name: 'Downstream Road Crossing (Point B)',
    })
    setFloodPassability('not_passable_light')
    setFloodWaterDepth('Knee Deep (0.45m)')
    setPhotoPreview(null)
    setPhotoAiAnalysis(null)
    setIsPickingPointMode(null)
    setActiveModal('report')
  }

  // Multimodal AI Photo Upload & Vision Analysis
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      setPhotoPreview(base64)
      setIsAnalyzingPhoto(true)

      try {
        // 1. First attempt Live Google Gemini 3.6 Multimodal Vision
        const geminiResult = await geminiAnalyzeFloodPhoto(base64, locationName)

        if (geminiResult) {
          const analysis = {
            waterDepthLevel: geminiResult.estimatedDepth,
            vehiclePassability:
              geminiResult.passability === 'all_passable'
                ? 'Passable to All Vehicles'
                : geminiResult.passability === 'not_passable_light'
                ? 'Not Passable to Light Vehicles'
                : 'Closed to All Vehicles (Deep Flood)',
            hazardsDetected: ['Live Gemini AI Vision Verified', 'Submerged Road Surface'],
            estimatedRisk: geminiResult.severity.toUpperCase(),
          }
          setPhotoAiAnalysis(analysis)
          setReportDesc(`Gemini AI Vision: ${geminiResult.aiAnalysis} (${geminiResult.estimatedDepth})`)
          setReportSeverity(geminiResult.severity)
          setFloodPassability(geminiResult.passability)
          setFloodWaterDepth(geminiResult.estimatedDepth)
        } else if (API_BASE_URL) {
          const res = await fetch(`${API_BASE_URL}/ai/analyze-photo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              photoBase64: base64,
              descriptionHint: reportDesc,
              location: locationName,
            }),
          })

          if (res.ok) {
            const analysis = await res.json()
            setPhotoAiAnalysis(analysis)
            setReportDesc(
              `AI Vision: ${analysis.waterDepthLevel}. ${analysis.vehiclePassability}. Hazards: ${analysis.hazardsDetected?.join(', ')}`
            )
            if (analysis.estimatedRisk === 'HIGH') setReportSeverity('high')
          }
        } else {
          // Instant Local Vision Fallback
          const analysis = {
            waterDepthLevel: 'Knee-Deep (0.45m Estimated)',
            vehiclePassability: 'Not Passable to Light Vehicles',
            hazardsDetected: ['Submerged Road Surface', 'Slow Flowing Floodwater'],
            estimatedRisk: 'HIGH',
          }
          setPhotoAiAnalysis(analysis)
          setReportDesc(
            `AI Vision: ${analysis.waterDepthLevel}. ${analysis.vehiclePassability}. Hazards: ${analysis.hazardsDetected.join(', ')}`
          )
          setReportSeverity('high')
        }
      } catch (err) {
        console.warn('AI Vision offline fallback:', err)
      } finally {
        setIsAnalyzingPhoto(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const submitReport = async () => {
    setReportStep('analyzing')

    let snappedPath: [number, number][] | undefined = undefined
    if (isRoadSegmentMode && floodStartPoint && floodEndPoint) {
      const roadCoords = await fetchRoadSegmentPath(floodStartPoint, floodEndPoint)
      if (roadCoords && roadCoords.length > 1) {
        snappedPath = roadCoords
      }
    }

    setTimeout(() => {
      addHazardReport({
        type: reportType,
        description: reportDesc || undefined,
        severity: reportSeverity,
        isRoadSegment: isRoadSegmentMode,
        roadSegment:
          isRoadSegmentMode && floodStartPoint && floodEndPoint
            ? {
                from: floodStartPoint,
                to: floodEndPoint,
                path: snappedPath,
                roadName: roadName || `${locationName.split(',')[0]} Road`,
              }
            : undefined,
        passability: floodPassability,
        waterDepth: floodWaterDepth,
      })
      setReportStep('done')
    }, 800)
  }

  const closeModal = () => {
    setActiveModal('none')
    setSelectedHazard(null)
    setIsPickingPointMode(null)
  }

  const handleLocateMe = () => {
    requestLocation()
    mapCanvasRef.current?.flyToUser()
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchResults.length > 0) {
      handleSelectSearchResult(searchResults[0])
    }
  }

  const handleStartNavigation = () => {
    closeModal()
    setIs3D(true)
    setShow3DBuildings(true)
    setIsDrivingHUDActive(true)

    let initialBearing = -15
    const activeRoute = routes?.[selectedRoute]
    const coords = activeRoute?.geoJSON?.geometry?.coordinates
    if (Array.isArray(coords) && coords.length > 1) {
      const [lng1, lat1] = coords[0]
      const [lng2, lat2] = coords[Math.min(3, coords.length - 1)]
      const y = Math.sin(((lng2 - lng1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180)
      const x =
        Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
        Math.sin((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.cos(((lng2 - lng1) * Math.PI) / 180)
      const angle = (Math.atan2(y, x) * 180) / Math.PI
      initialBearing = (angle + 360) % 360
    }

    mapCanvasRef.current?.startNavigationPerspective(
      userLocation.lat,
      userLocation.lng,
      initialBearing
    )
  }

  const handleExitNavigation = () => {
    setIsDrivingHUDActive(false)
    mapCanvasRef.current?.exitNavigationPerspective()
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-100 dark:bg-slate-900 select-none flex flex-col">
      {/* ── Active Fullscreen Driving HUD ───────────────────── */}
      {isDrivingHUDActive && routes && (
        <DrivingHUD
          route={routes[selectedRoute]}
          destinationName={destination?.name || 'Safe Evacuation Center'}
          nearbyHazards={hazards}
          userSpeed={userLocation.speed}
          onExit={handleExitNavigation}
        />
      )}

      {/* ── Active Fullscreen SOS Rescue Strobe ─────────────── */}
      {isSOSStrobeActive && (
        <SOSRescueStrobe
          lat={userLocation.lat}
          lng={userLocation.lng}
          locationName={locationName}
          onClose={() => setIsSOSStrobeActive(false)}
        />
      )}

      {/* Map Canvas Background */}
      <div className="absolute inset-0 z-0">
        <MapCanvas
          ref={mapCanvasRef}
          darkMode={darkMode}
          isSatellite={isSatellite}
          selectedHazard={selectedHazard}
          showRoutes={activeModal === 'routes' || isDrivingHUDActive || pendingAutoNavigate}
          selectedRoute={selectedRoute}
          onHazardClick={handleHazardClick}
          emergencyMode={appState === 'emergency'}
          userLocation={userLocation}
          hazards={filteredHazards}
          evacCenters={evacCenters}
          routes={routes}
          destination={destination}
          onMapClick={handleMapClick}
          showRadar={showRadar}
          show3DBuildings={show3DBuildings}
          showDangerZones={showDangerZones}
          showRoadLines={showRoadLines}
          showEvacCenters={showEvacCenters}
          is3D={is3D}
          onToggle3D={toggle3DMode}
          isPickingRoadSegment={isPickingPointMode}
          isPickingPoint={Boolean(isPickingPointMode || isMapClickDestinationMode)}
        />
      </div>

      {/* ── Picking Road Segment Mode Floating Banner ───────── */}
      {isPickingPointMode && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-auto anim-slide-down">
          <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border-2 border-cyan-500 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-black">
              {isPickingPointMode === 'from' ? 'A' : 'B'}
            </div>
            <div>
              <div className="font-extrabold text-xs text-white">
                {isPickingPointMode === 'from' ? 'Tap Map to Set Start of Flood (Point A)' : 'Tap Map to Set End of Flood (Point B)'}
              </div>
              <div className="text-[10px] text-slate-300">
                Click on the road segment where the flood starts or ends
              </div>
            </div>
            <button
              onClick={() => {
                setIsPickingPointMode(null)
                setActiveModal('report')
              }}
              className="ml-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-bold text-slate-200"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Toast Notification Banner ────────────────────────── */}
      {lastActionMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto anim-slide-down">
          <div className="bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 border border-slate-700/50 dark:border-slate-200/50">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 dark:text-cyan-600 shrink-0" />
            <span>{lastActionMessage}</span>
          </div>
        </div>
      )}

      {/* ── Emergency banner ────────────────────────────────── */}
      {appState === 'emergency' && (
        <div className="absolute top-0 left-0 right-0 z-50 emergency-bar bg-red-600 text-white px-4 py-3 flex items-center gap-3 pointer-events-auto shadow-md">
          <span className="text-base">🔴</span>
          <span className="text-sm font-semibold flex-1">
            Emergency alert active — high flood risk detected in your vicinity. Evacuate if instructed.
          </span>
          <button onClick={() => setAppState('normal')} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── Top Floating Header Dock (Ultra-Clean & Unified) ── */}
      <div className={`absolute left-0 right-0 z-10 px-3 pt-3 sm:px-5 sm:pt-4 flex flex-col gap-2 pointer-events-none ${appState === 'emergency' ? 'top-12' : 'top-0'}`}>
        {/* Main Floating Capsule */}
        <div className="flex items-center gap-2 pointer-events-auto max-w-4xl mx-auto w-full">
          {/* Main Search & Actions Capsule */}
          <div className="flex-1 flex items-center gap-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl p-1.5 shadow-xl border border-slate-200/70 dark:border-slate-800/80 transition-all">
            {/* App Icon */}
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-cyan-500/20 shrink-0 ml-1">
              <Shield className="w-4 h-4 text-white" strokeWidth={2.5} />
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-2 min-w-0 pr-1 relative">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search streets, evacuation shelters, hospitals..."
                onFocus={() => setSearchFocused(true)}
                className="flex-1 bg-transparent text-xs font-medium text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none truncate"
              />
              {isSearching && <Loader2 className="w-3.5 h-3.5 text-cyan-500 animate-spin shrink-0" />}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => { setSearchQuery(''); setSearchResults([]) }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </form>

            {/* Quick 2D/3D Mode Switcher */}
            <button
              type="button"
              onClick={toggle3DMode}
              className={`px-2.5 py-1.5 rounded-xl font-extrabold text-[11px] flex items-center gap-1 transition-all shrink-0 cursor-pointer active:scale-95 ${
                is3D
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
              }`}
              title={is3D ? 'Current: 3D View (Click for 2D)' : 'Current: 2D Flat View (Click for 3D)'}
            >
              <span>{is3D ? '🧊 3D' : '🗺️ 2D'}</span>
            </button>

            {/* LGU Command Switch Button */}
            <Link
              to="/lgu"
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 font-extrabold text-[11px] transition-all shrink-0 flex items-center gap-1"
              title="Open Official LGU Emergency Operations Center"
            >
              <span>🏢</span>
              <span>LGU</span>
            </Link>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleDark}
              className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-all shrink-0 mr-0.5 active:scale-95 cursor-pointer"
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Live Search Autocomplete Dropdown */}
        {searchFocused && searchResults.length > 0 && (
          <div className="max-w-4xl mx-auto w-full pointer-events-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden z-50 anim-slide-up max-h-72 overflow-y-auto">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Locations & Landmarks
            </div>
            {searchResults.map((res, i) => (
              <button
                key={`${res.name}-${i}`}
                onMouseDown={() => handleSelectSearchResult(res)}
                className="w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors border-b border-slate-100 dark:border-slate-800/40 last:border-0"
              >
                <span className="text-lg">{res.emoji || '📍'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{res.name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{res.address}</div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* ── Sub-Bar: Clean Horizontal Filter & Layer Ribbon ── */}
        <div className="flex items-center gap-1.5 pointer-events-auto max-w-4xl mx-auto w-full overflow-x-auto no-scrollbar py-0.5">
          {/* Location Chip */}
          <button
            onClick={handleLocateMe}
            className="flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-full px-3 py-1.5 shadow-sm border border-slate-200/60 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shrink-0 cursor-pointer active:scale-95"
            title="Center map on your location"
          >
            {isLocationLoading ? (
              <Loader2 className="w-3 h-3 text-cyan-500 animate-spin shrink-0" />
            ) : (
              <MapPin className="w-3 h-3 text-cyan-500 shrink-0" />
            )}
            <span className="text-[11px] font-bold truncate max-w-[140px]">
              {locationName.split(',')[0]}
            </span>
          </button>

          {/* Filter Pills */}
          <button
            onClick={() => setHazardFilter('all')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all shadow-sm flex items-center gap-1 active:scale-95 cursor-pointer shrink-0 ${
              hazardFilter === 'all'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-slate-900/20 ring-2 ring-slate-400/30'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>🏷️ All</span>
            <span className="opacity-75 text-[10px]">({hazards.length})</span>
          </button>

          <button
            onClick={() => setHazardFilter('flood')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all shadow-sm flex items-center gap-1 active:scale-95 cursor-pointer shrink-0 ${
              hazardFilter === 'flood'
                ? 'bg-orange-500 text-white shadow-orange-500/25 ring-2 ring-orange-400/50'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>🌊 Road Floods</span>
            <span className="opacity-75 text-[10px]">({floodCount})</span>
          </button>

          <button
            onClick={() => setHazardFilter('verified')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all shadow-sm flex items-center gap-1 active:scale-95 cursor-pointer shrink-0 ${
              hazardFilter === 'verified'
                ? 'bg-blue-600 text-white shadow-blue-600/25 ring-2 ring-blue-400/50'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>🔵 Verified</span>
            <span className="opacity-75 text-[10px]">({verifiedCount})</span>
          </button>

          <button
            onClick={() => setHazardFilter('no_light')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all shadow-sm flex items-center gap-1 active:scale-95 cursor-pointer shrink-0 ${
              hazardFilter === 'no_light'
                ? 'bg-rose-600 text-white shadow-rose-600/25 ring-2 ring-rose-400/50'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>🚫 No Light Cars</span>
            <span className="opacity-75 text-[10px]">({noLightCount})</span>
          </button>

          <button
            onClick={() => setHazardFilter('closure')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all shadow-sm flex items-center gap-1 active:scale-95 cursor-pointer shrink-0 ${
              hazardFilter === 'closure'
                ? 'bg-amber-600 text-white shadow-amber-600/25 ring-2 ring-amber-400/50'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50'
            }`}
          >
            <span>🚧 Closures</span>
            <span className="opacity-75 text-[10px]">({closureCount})</span>
          </button>

          <button
            onClick={() => setIsSatellite(!isSatellite)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all shadow-sm flex items-center gap-1.5 active:scale-95 cursor-pointer shrink-0 ${
              isSatellite
                ? 'bg-emerald-600 text-white shadow-emerald-600/30 ring-2 ring-emerald-400/50'
                : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title="Toggle Satellite Hybrid Imagery"
          >
            <span>🛰️</span>
            <span>{isSatellite ? 'Satellite ON' : 'Satellite'}</span>
          </button>

          <button
            onClick={() => setLayersOpen(true)}
            className="px-3 py-1.5 rounded-full text-[11px] font-extrabold whitespace-nowrap transition-all shadow-sm flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 cursor-pointer shrink-0"
            title="Map Layer Controls & 2D/3D Settings"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-500" />
            <span>Layers</span>
          </button>
        </div>

        {/* ── Compact AI Warning Banner (Dismissible) ── */}
        {!isAiAlertDismissed && aiPatternInsight && aiPatternInsight.severity === 'high' && (
          <div className="pointer-events-auto bg-amber-500/95 dark:bg-amber-600/95 text-white backdrop-blur-md rounded-2xl p-2 px-3 shadow-lg flex items-center gap-2.5 max-w-4xl mx-auto w-full anim-slide-down">
            <Sparkles className="w-4 h-4 text-amber-100 shrink-0" />
            <div className="flex-1 min-w-0 text-xs truncate">
              <span className="font-bold">{aiPatternInsight.title}</span> — {aiPatternInsight.description}
            </div>
            <button
              onClick={() => setActiveModal('routes')}
              className="text-[11px] bg-white text-slate-900 px-2.5 py-1 rounded-xl font-bold shrink-0 shadow-sm hover:bg-slate-100 transition-colors"
            >
              Avoid Route
            </button>
            <button
              onClick={() => setIsAiAlertDismissed(true)}
              className="p-1 text-white/80 hover:text-white rounded-lg transition-colors"
              title="Dismiss warning"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Collapsible Intelligence Panel */}
        {panelOpen && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200/60 dark:border-slate-700/50 overflow-hidden anim-slide-up mt-2 max-w-md pointer-events-auto">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nearby Active Hazards</span>
              <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-medium">Near {locationName.split(',')[0]}</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50 max-h-52 overflow-y-auto">
              {hazards.map((h) => (
                <button
                  key={h.id}
                  onClick={() => {
                    handleHazardClick(h)
                    setPanelOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                >
                  <span className="text-base">{h.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{h.label}</span>
                      {h.verified > 0 && <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold px-1.5 rounded">Verified</span>}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{h.distance} · {h.confidence}% confidence</div>
                  </div>
                  <StatusDot risk={h.severity} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Map controls — bottom right ──────────────────────── */}
      <div className="absolute right-3 sm:right-4 z-10 flex flex-col gap-2 pointer-events-none" style={{ bottom: appState === 'emergency' ? '150px' : '100px' }}>
        <button
          onClick={handleLocateMe}
          title="Center on my location"
          className="pointer-events-auto w-10 h-10 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md rounded-full shadow-md border border-slate-200/50 dark:border-slate-700/50 flex items-center justify-center text-slate-600 dark:text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95 group"
        >
          <Locate className={`w-4 h-4 transition-transform ${isLocationLoading ? 'animate-spin text-cyan-500' : 'group-hover:scale-110'}`} />
        </button>
        <button
          onClick={() => setLayersOpen((l) => !l)}
          className={`pointer-events-auto w-10 h-10 rounded-full shadow-md border flex items-center justify-center transition-all active:scale-95 backdrop-blur-md ${layersOpen ? 'bg-cyan-500/90 border-cyan-400 text-white' : 'bg-white/90 dark:bg-slate-800/90 border-slate-200/50 dark:border-slate-700/50 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 hover:text-cyan-500 dark:hover:text-cyan-400'}`}
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>

      {/* Layers dropdown */}
      {layersOpen && (
        <div className="absolute right-14 z-20 bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-xl border border-slate-200/50 dark:border-slate-700/50 p-4 w-56 anim-slide-up" style={{ bottom: appState === 'emergency' ? '180px' : '130px' }}>
          <label className="flex items-center gap-2.5 py-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showRadar}
              onChange={(e) => setShowRadar(e.target.checked)}
              className="w-3.5 h-3.5 accent-cyan-500"
            />
            <span className="text-xs text-slate-700 dark:text-slate-300 font-bold">PAGASA Weather Radar</span>
          </label>
          {[{ id: 'hazards', label: 'Hazard Danger Zones' }, { id: 'evac', label: 'Evacuation Shelters' }, { id: '3d', label: '3D Buildings' }].map((l) => (
            <label key={l.id} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
              <input type="checkbox" defaultChecked={l.id !== '3d'} className="w-3.5 h-3.5 accent-cyan-500" />
              <span className="text-xs text-slate-700 dark:text-slate-300">{l.label}</span>
            </label>
          ))}
        </div>
      )}

      {/* ── AI Bubble ────────────────────────────────────────── */}
      {showBubble && (
        <div
          className="absolute left-1/2 z-20 -translate-x-1/2 w-[calc(100%-24px)] max-w-sm anim-slide-up pointer-events-none"
          style={{ bottom: appState === 'emergency' ? '228px' : '176px' }}
        >
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50 p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-7 h-7 rounded-lg bg-cyan-500 flex items-center justify-center shrink-0">
                {voice.state === 'processing' ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" strokeWidth={2.5} /> : <Shield className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />}
              </div>
              <div>
                <div className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 mb-0.5">
                  {voice.state === 'processing' ? 'GABAI is processing...' : 'GABAI Voice Assistant'}
                </div>
                <p className="text-sm text-slate-800 dark:text-slate-200 leading-snug">
                  {voice.state === 'speaking' || voice.response 
                    ? voice.response 
                    : voice.transcript 
                      ? <span className="italic text-slate-500">"{voice.transcript}"</span>
                      : 'Listening to your report...'}
                </p>
              </div>
              <button onClick={() => setShowBubble(false)} className="shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setActiveModal('routes'); setShowBubble(false) }}
                className="flex-1 text-xs font-semibold bg-cyan-500 hover:bg-cyan-600 text-white py-2 rounded-lg transition-colors shadow-sm"
              >
                View Safe Route
              </button>
              <button
                onClick={() => { setActiveModal('hazard'); setSelectedHazard(hazards[0]); setShowBubble(false) }}
                className="flex-1 text-xs font-semibold bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 py-2 rounded-lg transition-colors"
              >
                Inspect Hazard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Suggestion chips — above mic ─────────────────────── */}
      {voice.state === 'idle' && !showBubble && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-10 flex gap-2 flex-wrap justify-center px-4 w-full pointer-events-none"
          style={{ bottom: appState === 'emergency' ? '180px' : '128px' }}
        >
          {["May baha sa kalsada namin.", "Find nearest hospital safe route.", "Is it safe to go home?"].map((s) => (
            <button
              key={s}
              onClick={() => handleSuggestion(s)}
              className="pointer-events-auto text-[11px] font-semibold bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm text-slate-700 dark:text-slate-200 rounded-full px-3.5 py-2 shadow-sm border border-slate-200/50 dark:border-slate-700/50 hover:bg-cyan-50 dark:hover:bg-slate-700 transition-all active:scale-95 whitespace-nowrap"
            >
              🎙️ {s}
            </button>
          ))}
        </div>
      )}

      {/* ── Language Selector ───────────────────────────────── */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-auto"
        style={{ bottom: appState === 'emergency' ? '184px' : '134px' }}
      >
        <div className="flex flex-col items-center justify-center">
          <select
            value={voice.language}
            onChange={(e) => voice.setLanguage(e.target.value as any)}
            className="bg-slate-900/90 text-slate-200 text-[11px] font-semibold py-1.5 px-3 rounded-full border border-slate-700 shadow-[0_4px_12px_rgba(0,0,0,0.5)] backdrop-blur-md outline-none focus:border-cyan-500 appearance-none text-center min-w-[110px]"
          >
            <option value="auto">Auto Detect</option>
            <option value="fil">Filipino</option>
            <option value="en">English</option>
            <option value="pam">Kapampangan</option>
          </select>
          {voice.language === 'auto' && typeof voice.detectedLanguage === 'string' && voice.detectedLanguage && (
            <div className="text-[9px] text-cyan-400 mt-1 text-center font-bold absolute -bottom-4 w-full">
              Detected: {voice.detectedLanguage.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* 🎙️ GABAI AI Chatbot Entry 🎙️ */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-500"
        style={{ bottom: appState === 'emergency' ? '108px' : '58px' }}
      >
        <div className="relative flex items-center justify-center group">
          {/* Ambient Glow */}
          <div className={`absolute w-[110%] h-[130%] rounded-full blur-xl transition-all duration-700 ${voice.state !== 'idle' ? 'bg-red-500/40 scale-125' : 'bg-cyan-500/30 group-hover:bg-cyan-400/50 group-hover:scale-110'}`} />

          {voice.state === 'listening' && (
            <>
              <div className="absolute w-[130%] h-[150%] rounded-full border-2 border-red-400/30 mic-ring-1 pointer-events-none" />
              <div className="absolute w-[130%] h-[150%] rounded-full border border-red-400/20 mic-ring-2 pointer-events-none" />
            </>
          )}

          <button
            onClick={handleMicPress}
            title="Press to speak to GABAI"
            className={`pointer-events-auto relative flex items-center gap-2.5 px-6 py-3.5 rounded-full transition-all duration-300 ${
              voice.state !== 'idle'
                ? 'shadow-[0_8px_32px_rgba(239,68,68,0.5)] scale-105'
                : 'shadow-[0_8px_24px_rgba(6,182,212,0.4)] hover:shadow-[0_12px_32px_rgba(6,182,212,0.6)] hover:scale-105 active:scale-95'
            } ${voice.state === 'idle' ? 'mic-idle' : ''}`}
          >
            {/* Background Gradients */}
            <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
              voice.state !== 'idle'
                ? 'bg-gradient-to-b from-rose-400 to-red-600'
                : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-600'
            }`} />
            
            <div className="absolute inset-0 rounded-full border-[1.5px] border-white/40 mix-blend-overlay" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
            
            <div className="relative z-10 flex items-center gap-2.5 text-white">
              {voice.state === 'listening' || voice.state === 'processing' ? (
                <MicOff className="w-5 h-5 drop-shadow-md animate-pulse" />
              ) : (
                <Mic className="w-5 h-5 drop-shadow-md" />
              )}
              
              <span className="font-black tracking-wide text-sm drop-shadow-md">
                {voice.state === 'listening' ? 'LISTENING...' : 'GABAI'}
              </span>
              
              {voice.state === 'idle' && (
                <Sparkles className="w-4 h-4 text-cyan-200 drop-shadow-md" />
              )}
            </div>
          </button>
        </div>
      </div>

      {/* ── Bottom Action Bar ────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <div className="bg-gradient-to-t from-white via-white/80 dark:from-slate-900 dark:via-slate-900/80 to-transparent pt-12 pb-4 px-3 sm:px-4">
          <div className="flex items-center gap-2 max-w-lg mx-auto">
            {[
              { icon: Navigation, label: 'Safe Route', action: () => setActiveModal('routes'), primary: true },
              { icon: TriangleAlert, label: 'Report Hazard', action: handleOpenReportModal },
              { icon: Users, label: 'Family Safety', action: () => setActiveModal('family_safety') },
              { icon: Zap, label: 'SOS Strobe', action: () => setIsSOSStrobeActive(true), danger: true },
            ].map(({ icon: Icon, label, action, primary, danger }) => (
              <button
                key={label}
                onClick={action}
                className={`pointer-events-auto flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-700/50 text-[11px] font-semibold transition-all active:scale-95 ${
                  primary
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent hover:bg-slate-800 dark:hover:bg-slate-100'
                    : danger
                    ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/50'
                    : 'bg-white/80 dark:bg-slate-800/80 backdrop-blur-md text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Backdrop */}
      {activeModal !== 'none' && (
        <div className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 anim-fade-in" onClick={closeModal} />
      )}

      {/* ── 1. Hazard Detail Sheet (Tapped on Marker) ────────── */}
      {activeModal === 'hazard' && selectedHazard && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bottom-sheet">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-700/50 max-w-lg mx-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
            <div className="px-4 pt-2 pb-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{selectedHazard.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-slate-900 dark:text-white text-base">{selectedHazard.label}</h3>
                      {selectedHazard.verified > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                          LGU Verified ✅
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusDot risk={selectedHazard.severity} />
                      <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {selectedHazard.severity} Severity Danger Zone · {selectedHazard.distance}
                      </span>
                    </div>
                  </div>
                </div>
                <button onClick={closeModal} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: 'AI Confidence', val: `${selectedHazard.confidence}%` },
                  { label: 'Citizen Reports', val: `${selectedHazard.reports}` },
                  {
                    label: 'LGU Status',
                    val: (selectedHazard.verified > 0 || selectedHazard.isVerified) ? 'Verified' : 'Pending',
                  },
                ].map(({ label, val }) => (
                  <div key={label} className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 text-center border border-slate-100 dark:border-slate-700/50">
                    <div className="text-lg font-bold text-slate-900 dark:text-white">{val}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
                  </div>
                ))}
              </div>

              {/* Road Flood Line & Passability Details */}
              {selectedHazard.isRoadSegment && selectedHazard.roadSegment && (
                <div className="mb-3 p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1">
                      🛣️ Flooded Road Stretch
                    </span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold ${
                        selectedHazard.verified > 0 || selectedHazard.isVerified
                          ? 'bg-blue-600 text-white'
                          : 'bg-amber-500 text-white animate-pulse'
                      }`}
                    >
                      {selectedHazard.verified > 0 || selectedHazard.isVerified
                        ? '🔵 LGU VERIFIED LINE'
                        : '🟠 PENDING LGU LINE'}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {selectedHazard.roadSegment.roadName || selectedHazard.label}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <div className="text-[10px] text-slate-500 font-semibold">Start (Point A)</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {selectedHazard.roadSegment.from.name || 'Start Pin A'}
                      </div>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <div className="text-[10px] text-slate-500 font-semibold">End (Point B)</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {selectedHazard.roadSegment.to.name || 'End Pin B'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-xs">
                      <span className="text-[10px] text-slate-400 block">Vehicle Passability:</span>
                      <span className="font-black text-red-600 dark:text-red-400">
                        {selectedHazard.passability === 'not_passable_all'
                          ? '⛔ Closed to All Vehicles'
                          : selectedHazard.passability === 'all_passable'
                          ? '🟢 Passable to All Vehicles'
                          : '🚫 Not Passable to Light Vehicles (Sedans, Motorcycles blocked)'}
                      </span>
                    </div>
                    {selectedHazard.waterDepth && (
                      <div className="text-right text-xs font-bold text-cyan-600 dark:text-cyan-400">
                        🌊 {selectedHazard.waterDepth}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mb-4 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                Reported {selectedHazard.ago} · Road status:{' '}
                <span className="font-semibold text-red-600 dark:text-red-400 ml-0.5">{selectedHazard.status}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => { setActiveModal('routes'); setSelectedHazard(null) }}
                  className="flex-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3 rounded-xl text-xs hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Avoid & Calculate Safe Route</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Route Selection & Interactive Destination Sheet ── */}
      {activeModal === 'routes' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bottom-sheet">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-700/50 max-w-lg mx-auto max-h-[85vh] flex flex-col">
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
            <div className="px-4 pt-2 pb-5 overflow-y-auto flex-1 no-scrollbar">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <Navigation className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 dark:text-white text-base">Safe Route Navigator</h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Real-time AI flood & hazard avoidance routing
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* ── Active Destination Card & Change Button ── */}
              <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3 border border-slate-200/60 dark:border-slate-700/60 mb-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-emerald-500" />
                    Target Destination
                  </span>
                  <button
                    onClick={() => setIsChoosingDestination((prev) => !prev)}
                    className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1"
                  >
                    {isChoosingDestination ? 'Done' : '✏️ Change Destination'}
                  </button>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-300 font-bold shrink-0 text-xs">
                    🏁
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                      {destination?.name || 'Nearest Evacuation Center'}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {destination
                        ? `Coordinates: ${destination.lat.toFixed(4)}°N, ${destination.lng.toFixed(4)}°E`
                        : 'Auto-routed to closest high-ground shelter'}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Interactive Destination Chooser Drawer ── */}
              {isChoosingDestination && (
                <div className="bg-white dark:bg-slate-800/90 rounded-2xl p-3 border-2 border-cyan-500/30 mb-4 shadow-sm anim-slide-down">
                  <div className="text-xs font-bold text-slate-800 dark:text-white mb-2 flex items-center justify-between">
                    <span>Choose Where You Want to Go:</span>
                    <button
                      onClick={() => {
                        setIsMapClickDestinationMode(true)
                        closeModal()
                      }}
                      className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1 bg-cyan-50 dark:bg-cyan-950/40 px-2 py-0.5 rounded-md border border-cyan-200 dark:border-cyan-800"
                    >
                      <span>📍 Tap on Map</span>
                    </button>
                  </div>

                  {/* Destination Search Box */}
                  <div className="relative mb-2.5">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={destinationSearch}
                      onChange={(e) => setDestinationSearch(e.target.value)}
                      placeholder="Search destination, hospital, gas, clinic..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                    {evacCenters.slice(0, 4).map((shelter) => (
                      <button
                        key={shelter.id}
                        onClick={() => {
                          setDestination({ name: shelter.name, lat: shelter.lat, lng: shelter.lng })
                          setIsChoosingDestination(false)
                          mapCanvasRef.current?.flyToCoords(shelter.lat, shelter.lng, 15)
                        }}
                        className="py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-[11px] font-bold text-center truncate transition-colors"
                      >
                        🛡️ {shelter.name}
                      </button>
                    ))}
                  </div>

                  {/* Selectable Destination List */}
                  <div className="max-h-44 overflow-y-auto space-y-1.5 no-scrollbar">
                    {selectableDestinations.slice(0, 10).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setDestination({ name: item.name, lat: item.lat, lng: item.lng })
                          setIsChoosingDestination(false)
                          mapCanvasRef.current?.flyToCoords(item.lat, item.lng, 15)
                        }}
                        className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-cyan-50 dark:hover:bg-slate-700/60 border border-slate-100 dark:border-slate-700/50 text-left transition-colors group"
                      >
                        <span className="text-base shrink-0">🛡️</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                            {item.name}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {item.address} · {item.distance} away
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:text-cyan-500" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── AI Neural Route Optimizer Card ── */}
              {aiRouteAnalysis && (
                <div className="mb-3.5 bg-gradient-to-br from-indigo-950/90 via-slate-900/95 to-slate-900/90 text-white rounded-2xl p-3.5 border border-cyan-500/40 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      </div>
                      <span className="text-xs font-black tracking-wide text-cyan-300 uppercase">
                        AI Neural Route Optimizer
                      </span>
                    </div>
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {aiRouteAnalysis.confidenceScore}% ACCURACY
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed mb-2.5 relative z-10">
                    {aiRouteAnalysis.aiSummary}
                  </p>

                  <div className="space-y-1 relative z-10 bg-slate-950/50 rounded-xl p-2 border border-slate-800/80">
                    {aiRouteAnalysis.aiReasoning.slice(0, 3).map((reason, idx) => (
                      <div key={idx} className="text-[10px] text-slate-300 font-medium flex items-center gap-1.5">
                        <span>{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Route Options Comparison ── */}
              <div className="space-y-2 mb-4">
                {(['safe', 'balanced', 'fast'] as const).map((rId) => {
                  const r = routes[rId]
                  return (
                    <button
                      key={r.id}
                      onClick={() => setSelectedRoute(r.id)}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left cursor-pointer ${
                        selectedRoute === r.id
                          ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 shadow-sm scale-[1.01]'
                          : 'border-transparent bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <StatusDot risk={r.risk} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-sm font-extrabold text-slate-900 dark:text-white">{r.label}</span>
                          <RiskBadge risk={r.risk} />
                          {r.fuelSavingsPct && (
                            <span className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40 text-[9px] font-black px-1.5 py-0.5 rounded">
                              🍃 -{r.fuelSavingsPct}% GAS
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 leading-tight">{r.detail}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-extrabold text-slate-800 dark:text-slate-200">{r.time}</div>
                        {r.fuelEstLiters && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">
                            ⛽ ~{r.fuelEstLiters} L
                          </div>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              {/* Start Driving Navigation HUD */}
              <button
                onClick={handleStartNavigation}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg text-sm cursor-pointer"
              >
                <Navigation className="w-4 h-4" />
                <span>Start Turn-by-Turn Safe Navigation</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 4. Community Disaster Reporting with AI Vision ────── */}
      {activeModal === 'report' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bottom-sheet">
          <div className="bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl border-t border-slate-200/60 dark:border-slate-700/50 max-w-lg mx-auto">
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-slate-200 dark:bg-slate-700 rounded-full" />
            </div>
            <div className="px-4 pt-2 pb-6">
              {reportStep === 'form' && (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">Community Disaster Report</h3>
                    <button onClick={closeModal} className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    Attach photo for Multimodal AI Flood-Depth Analysis & LGU response.
                  </p>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {REPORT_TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setReportType(t.id)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
                          reportType === t.id
                            ? 'border-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/40 shadow-sm'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-2xl">{t.emoji}</span>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-tight text-center">{t.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Mode Toggle: Road Segment (From ➔ To) vs Point */}
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-3">
                    <button
                      type="button"
                      onClick={() => setIsRoadSegmentMode(true)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        isRoadSegmentMode
                          ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      🛣️ Flooded Road Stretch (Line)
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRoadSegmentMode(false)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        !isRoadSegmentMode
                          ? 'bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      📍 Single Point
                    </button>
                  </div>

                  {/* Road Flood Line Segment (From ➔ To) Controls */}
                  {isRoadSegmentMode && (
                    <div className="bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 mb-3 space-y-2.5">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                        <span>Road / Street Information</span>
                        <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">
                          Draws line on map
                        </span>
                      </div>

                      <input
                        type="text"
                        value={roadName}
                        onChange={(e) => setRoadName(e.target.value)}
                        placeholder="Road / Street Name (e.g. Mexico-San Luis Road, MacArthur Hwy)"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 outline-none focus:border-cyan-500"
                      />

                      {/* Start Point (Point A) */}
                      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">Start of Flood (Point A)</div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {floodStartPoint?.name || 'Tap on Map'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPickingPointMode('from')
                            setActiveModal('none')
                          }}
                          className="px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 rounded-lg text-[10px] font-bold shrink-0 hover:bg-cyan-100"
                        >
                          📍 Pick on Map
                        </button>
                      </div>

                      {/* End Point (Point B) */}
                      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="text-[10px] text-slate-400 font-bold uppercase">End of Flood (Point B)</div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {floodEndPoint?.name || 'Tap on Map'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPickingPointMode('to')
                            setActiveModal('none')
                          }}
                          className="px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 rounded-lg text-[10px] font-bold shrink-0 hover:bg-cyan-100"
                        >
                          📍 Pick on Map
                        </button>
                      </div>

                      {/* Vehicle Passability Options */}
                      <div className="space-y-1 pt-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block">
                          Vehicle Passability Status:
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {[
                            { id: 'all_passable', label: 'Passable', desc: 'All Vehicles', color: 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
                            { id: 'not_passable_light', label: 'No Light Cars', desc: '4x4 / Trucks Only', color: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
                            { id: 'not_passable_all', label: 'Closed Road', desc: 'All Blocked', color: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
                          ].map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setFloodPassability(p.id as any)}
                              className={`p-2 rounded-xl border text-center transition-all ${
                                floodPassability === p.id
                                  ? `${p.color} border-2 shadow-sm font-bold`
                                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800'
                              }`}
                            >
                              <div className="text-[11px] font-black">{p.label}</div>
                              <div className="text-[9px] opacity-80">{p.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Water Depth Quick Selection */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block">
                          Estimated Water Depth:
                        </label>
                        <div className="grid grid-cols-4 gap-1">
                          {[
                            'Ankle Deep (10cm)',
                            'Knee Deep (40cm)',
                            'Waist Deep (70cm)',
                            'Chest Deep (1m+)',
                          ].map((depth) => (
                            <button
                              key={depth}
                              type="button"
                              onClick={() => setFloodWaterDepth(depth)}
                              className={`py-1.5 px-1 rounded-lg text-[10px] font-bold border transition-colors truncate ${
                                floodWaterDepth === depth
                                  ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              {depth.split(' ')[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Multimodal AI Photo Analyzer */}
                  <div className="mb-3">
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />

                    {photoPreview ? (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2.5">
                        <div className="flex items-center gap-3">
                          <img src={photoPreview} alt="Flood Snapshot" className="w-16 h-16 rounded-xl object-cover" />
                          <div className="flex-1 min-w-0 text-xs">
                            <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
                              <span>{isAnalyzingPhoto ? 'AI Analyzing Water Depth...' : 'AI Vision Assessed'}</span>
                            </div>
                            {photoAiAnalysis && (
                              <div className="mt-1 text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold">
                                {photoAiAnalysis.waterDepthLevel}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => { setPhotoPreview(null); setPhotoAiAnalysis(null) }}
                            className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2.5 border-2 border-dashed border-cyan-500/50 rounded-2xl bg-cyan-50/40 dark:bg-cyan-950/20 flex items-center justify-center gap-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Take Photo / Upload for AI Flood Depth Vision</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 rounded-xl px-3 py-2 mb-3 border border-slate-100 dark:border-slate-700/40">
                    <MapPin className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                      Auto-GPS · {locationName}
                    </span>
                  </div>

                  <textarea
                    value={reportDesc}
                    onChange={(e) => setReportDesc(e.target.value)}
                    placeholder="Describe what you see (e.g. knee-deep flood, impassable to tricycles)..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none focus:border-cyan-500 resize-none mb-3"
                    rows={2}
                  />

                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 mb-3 flex items-start gap-2 text-left">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-900 dark:text-amber-200">
                      <span className="font-bold">Anti-Spam LGU Verification:</span> To prevent false reports, your submission will be reviewed and verified by the LGU Command Center before appearing on other motorists' live maps.
                    </div>
                  </div>

                  <button
                    onClick={submitReport}
                    disabled={!reportType}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 rounded-xl disabled:opacity-40 transition-all hover:bg-slate-800 dark:hover:bg-slate-100 shadow-md text-sm"
                  >
                    Submit Report to LGU Command Center
                  </button>
                </>
              )}

              {reportStep === 'analyzing' && (
                <div className="py-8 flex flex-col items-center gap-4">
                  <div className="w-12 h-12 rounded-full border-3 border-cyan-500 border-t-transparent animate-spin" />
                  <div className="text-center">
                    <p className="text-sm font-bold text-slate-800 dark:text-white">Submitting to LGU Command Center...</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Routing report into municipal triage queue for verification</p>
                  </div>
                </div>
              )}

              {reportStep === 'done' && (
                <div className="py-8 flex flex-col items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-inner">
                    <Shield className="w-8 h-8 text-amber-500" />
                  </div>
                  <div className="text-center px-4">
                    <p className="text-base font-bold text-slate-800 dark:text-white">Report Queued for LGU Verification</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Your incident report near {locationName.split(',')[0]} has been submitted. It is now in the LGU triage queue and will be published to all motorists once verified by dispatch.
                    </p>
                  </div>
                  <button
                    onClick={closeModal}
                    className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow"
                  >
                    Done & Return to Map
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Family Safety Modal ───────────────────────────── */}
      {activeModal === 'family_safety' && (
        <FamilySafetyModal
          currentLocationName={locationName}
          onClose={closeModal}
          onTriggerSOSStrobe={() => setIsSOSStrobeActive(true)}
        />
      )}

      {/* ── 6. Map Layers & Perspective Settings Modal ─────────── */}
      {layersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm anim-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden anim-scale-up">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Map Layers & 3D Settings</h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">Customize view & optimize rendering</p>
                </div>
              </div>
              <button
                onClick={() => setLayersOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              {/* Base Map Imagery Style: Streets vs Satellite Hybrid */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                  <span>Base Map Imagery</span>
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-extrabold">{isSatellite ? '🛰️ Satellite Hybrid' : '🗺️ Standard Streets'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsSatellite(false)}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isSatellite
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40'
                        : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    <span>🗺️ Streets (Vector)</span>
                  </button>
                  <button
                    onClick={() => setIsSatellite(true)}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSatellite
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/40'
                        : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    <span>🛰️ Satellite Hybrid</span>
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                  {isSatellite ? 'Real-world high-resolution satellite imagery with street labels' : 'Clean vector street map with dark/light theme support'}
                </div>
              </div>

              {/* 2D / 3D Mode Selector Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                  <span>Perspective Mode</span>
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-extrabold">{is3D ? '3D Angled View' : '2D Top-Down View'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!is3D) toggle3DMode()
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      is3D
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40'
                        : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    <span>🧊 3D Perspective</span>
                  </button>
                  <button
                    onClick={() => {
                      if (is3D) toggle3DMode()
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      !is3D
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40'
                        : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                    }`}
                  >
                    <span>🗺️ 2D Flat (Fast)</span>
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                  {is3D ? 'Shows 3D pitch and extruded structures' : 'Top-down view for fastest scrolling & 0% GPU load'}
                </div>
              </div>

              {/* Layer Toggles List */}
              <div className="space-y-2">
                {/* 3D Buildings */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🏢</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">3D Extruded Buildings</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Urban building heights & outlines</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={show3DBuildings}
                    onChange={(e) => setShow3DBuildings(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>

                {/* Road Flood Corridors */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🛣️</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Road Flood Lines (Orange/Blue)</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Submerged road corridors & passability</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showRoadLines}
                    onChange={(e) => setShowRoadLines(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>

                {/* Danger Radius Circles */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🚨</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Danger Zones & Radius</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Geodesic flood risk perimeter buffers</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showDangerZones}
                    onChange={(e) => setShowDangerZones(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>

                {/* PAGASA Weather Radar */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🌧️</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">PAGASA Weather Doppler Radar</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Live heavy rain & storm precipitation</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showRadar}
                    onChange={(e) => setShowRadar(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>

                {/* Evacuation Centers */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🏥</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Evacuation Centers</div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Designated high-ground relief shelters</div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showEvacCenters}
                    onChange={(e) => setShowEvacCenters(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>
              </div>

              <button
                onClick={() => setLayersOpen(false)}
                className="w-full mt-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors"
              >
                Apply & Return to Map
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
