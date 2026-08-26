import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Hazard } from '../components/MapCanvas'
import { useUserLocation, UserCoordinates } from '../hooks/useUserLocation'
import { getContextualHazards, getContextualEvacCenters } from '../utils/geoHazards'
import { generateDynamicRoutes, fetchAccurateRealWorldRoutes, RouteInfo } from '../utils/routingEngine'
import {
  Establishment,
  fetchLiveMapEstablishments,
  getContextualEstablishments,
} from '../utils/establishmentImporter'

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (isLocalhost ? 'http://localhost:3000/api' : '')
const WS_URL = import.meta.env.VITE_WS_URL || (isLocalhost ? 'http://localhost:3000/realtime' : '')

export interface CitizenReport {
  id: number | string
  hazardId?: number | string
  citizen: string
  type: string
  emoji: string
  desc: string
  lat: number
  lng: number
  severity: 'low' | 'medium' | 'high'
  time: string
  status: 'pending' | 'verified' | 'rejected' | 'resolved'
  locationName?: string
}

export interface AIPatternInsight {
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
  clusterCount: number
  recommendedAction: string
  timestamp: string
}

interface DisasterContextType {
  hazards: Hazard[]
  reports: CitizenReport[]
  evacCenters: ReturnType<typeof getContextualEvacCenters>
  establishments: Establishment[]
  selectedEstablishment: Establishment | null
  setSelectedEstablishment: (e: Establishment | null) => void
  userLocation: UserCoordinates
  locationName: string
  isLocationLive: boolean
  isLocationLoading: boolean
  isWsConnected: boolean
  requestLocation: () => void
  addHazardReport: (params: {
    type: string
    description?: string
    lat?: number
    lng?: number
    severity?: 'low' | 'medium' | 'high'
    citizenName?: string
  }) => { report: CitizenReport; hazard: Hazard }
  verifyReport: (reportId: number | string) => Promise<void>
  rejectReport: (reportId: number | string) => Promise<void>
  resolveReport: (reportId: number | string) => Promise<void>
  destination: { name: string; lat: number; lng: number } | null
  setDestination: (dest: { name: string; lat: number; lng: number } | null) => void
  routes: Record<'safe' | 'balanced' | 'fast', RouteInfo>
  aiPatternInsight: AIPatternInsight | null
  lastActionMessage: string | null
  clearLastActionMessage: () => void
  importEstablishmentsFromMap: () => Promise<void>
}

const DisasterContext = createContext<DisasterContextType | null>(null)

const EMOJI_MAP: Record<string, string> = {
  flood: '🌊',
  closure: '🚧',
  road_block: '🚧',
  road: '🚧',
  fire: '🔥',
  rain: '🌧️',
  power: '⚡',
  person: '🧍',
  other: '⚠️',
}

const LABEL_MAP: Record<string, string> = {
  flood: 'Flash Flood',
  closure: 'Road Blocked',
  road_block: 'Road Blocked',
  road: 'Road Blocked',
  fire: 'Structural Fire',
  rain: 'Heavy Rain Advisory',
  power: 'Power Outage',
  person: 'Person in Danger',
  other: 'Hazard Advisory',
}

export const DisasterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const userLoc = useUserLocation()
  const socketRef = useRef<Socket | null>(null)
  const [isWsConnected, setIsWsConnected] = useState(false)

  // Contextual base data
  const baseHazards = useMemo(
    () => getContextualHazards(userLoc.coords.lat, userLoc.coords.lng),
    [userLoc.coords.lat, userLoc.coords.lng]
  )

  const evacCenters = useMemo(
    () => getContextualEvacCenters(userLoc.coords.lat, userLoc.coords.lng, userLoc.locationName),
    [userLoc.coords.lat, userLoc.coords.lng, userLoc.locationName]
  )

  const [hazards, setHazards] = useState<Hazard[]>(baseHazards)
  const [establishments, setEstablishments] = useState<Establishment[]>([])
  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null)

  const [reports, setReports] = useState<CitizenReport[]>([
    {
      id: 'rep-101',
      hazardId: 'haz-1',
      citizen: 'Maria S. (Citizen)',
      type: 'flood',
      emoji: '🌊',
      desc: 'Water is knee-deep in front of the plaza.',
      lat: userLoc.coords.lat - 0.0075,
      lng: userLoc.coords.lng - 0.0062,
      severity: 'high',
      time: '3 mins ago',
      status: 'pending',
      locationName: userLoc.locationName,
    },
    {
      id: 'rep-102',
      hazardId: 'haz-2',
      citizen: 'Juan D. (Barangay Patrol)',
      type: 'road',
      emoji: '🚧',
      desc: 'Fallen tree blocking both lanes.',
      lat: userLoc.coords.lat + 0.0092,
      lng: userLoc.coords.lng + 0.0055,
      severity: 'medium',
      time: '8 mins ago',
      status: 'verified',
      locationName: userLoc.locationName,
    },
  ])

  const [destination, setDestination] = useState<{ name: string; lat: number; lng: number } | null>(null)
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null)

  // ── Import all data from the map on establishments ──────────────
  const importEstablishmentsFromMap = useCallback(async () => {
    try {
      const results = await fetchLiveMapEstablishments(
        userLoc.coords.lat,
        userLoc.coords.lng,
        userLoc.locationName
      )
      if (results && results.length > 0) {
        setEstablishments(results)
        setLastActionMessage(`🗺️ Imported ${results.length} establishments & POIs from map!`)
      }
    } catch (err) {
      console.warn('Establishment import error:', err)
    }
  }, [userLoc.coords.lat, userLoc.coords.lng, userLoc.locationName])

  // Auto-import establishments when user coordinates are updated
  useEffect(() => {
    importEstablishmentsFromMap()
  }, [importEstablishmentsFromMap])

  // ── 1. Fetch initial data from REST API ──────────────────────────
  useEffect(() => {
    if (!API_BASE_URL) return

    const fetchInitialData = async () => {
      try {
        const [hazRes, repRes] = await Promise.all([
          fetch(`${API_BASE_URL}/hazards`),
          fetch(`${API_BASE_URL}/reports`),
        ])

        if (hazRes.ok) {
          const apiHazards = await hazRes.json()
          if (Array.isArray(apiHazards) && apiHazards.length > 0) {
            setHazards(apiHazards)
          }
        }

        if (repRes.ok) {
          const apiReports = await repRes.json()
          if (Array.isArray(apiReports) && apiReports.length > 0) {
            setReports(
              apiReports.map((r: any) => ({
                id: r.id,
                hazardId: r.hazardId,
                citizen: r.citizen || r.citizenName || 'Citizen Report',
                type: r.type,
                emoji: r.emoji || EMOJI_MAP[r.type] || '⚠️',
                desc: r.desc || r.description,
                lat: r.lat,
                lng: r.lng,
                severity: r.severity || 'medium',
                time: r.time || 'just now',
                status: r.status || 'pending',
                locationName: r.locationName,
              }))
            )
          }
        }
      } catch (err) {
        console.warn('REST API offline fallback:', err)
      }
    }

    fetchInitialData()
  }, [])

  // ── 2. Real-Time WebSockets Gateway Connection ────────────────────
  useEffect(() => {
    if (!WS_URL) return

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setIsWsConnected(true)
      console.log('⚡ Connected to GABAI Realtime Gateway')
    })

    socket.on('disconnect', () => {
      setIsWsConnected(false)
    })

    socket.on('hazard:new', (newHazard: Hazard) => {
      setHazards((prev) => {
        if (prev.some((h) => h.id === newHazard.id)) return prev
        return [newHazard, ...prev]
      })
      setLastActionMessage(`🚨 New live hazard broadcast: ${newHazard.label}`)
    })

    socket.on('hazard:updated', (updatedHazard: Hazard) => {
      setHazards((prev) =>
        prev.map((h) => (h.id === updatedHazard.id ? { ...h, ...updatedHazard } : h))
      )
    })

    socket.on('report:new', (newReport: any) => {
      setReports((prev) => {
        if (prev.some((r) => r.id === newReport.id)) return prev
        return [newReport, ...prev]
      })
    })

    socket.on('report:status_changed', ({ reportId, status }: { reportId: string; status: any }) => {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status } : r))
      )
    })

    return () => {
      socket.disconnect()
    }
  }, [])

  // Update base hazards on GPS change
  useEffect(() => {
    setHazards((prev) => {
      if (prev.length === 0 || prev === baseHazards) {
        return baseHazards
      }
      return prev
    })
  }, [baseHazards])

  // ── AI Pattern Detection ──────────────────────────────────────────
  const aiPatternInsight: AIPatternInsight | null = useMemo(() => {
    const highSeverityReports = reports.filter(
      (r) => r.severity === 'high' && r.status !== 'rejected'
    )
    if (highSeverityReports.length >= 2) {
      return {
        title: `Flooding Cluster Detected (${highSeverityReports.length} Reports)`,
        description: `Multiple flood reports registered near ${userLoc.locationName}. Rising water level detected. Roads are impassable for light vehicles.`,
        severity: 'high',
        clusterCount: highSeverityReports.length,
        recommendedAction: 'Reroute traffic to higher ground corridors immediately.',
        timestamp: 'Active Now',
      }
    }
    return null
  }, [reports, userLoc.locationName])

  // ── Add Community Hazard Report ───────────────────────────────────
  const addHazardReport = useCallback(
    ({
      type,
      description,
      lat,
      lng,
      severity = 'high',
      citizenName = 'Live Citizen (You)',
    }: {
      type: string
      description?: string
      lat?: number
      lng?: number
      severity?: 'low' | 'medium' | 'high'
      citizenName?: string
    }) => {
      const reportLat = lat ?? userLoc.coords.lat
      const reportLng = lng ?? userLoc.coords.lng
      const newHazardId = `haz-${Date.now()}`
      const newReportId = `rep-${Date.now()}`

      const newHazard: Hazard = {
        id: newHazardId,
        type,
        emoji: EMOJI_MAP[type] || '⚠️',
        label: LABEL_MAP[type] || 'Disaster Incident',
        lat: reportLat,
        lng: reportLng,
        severity,
        confidence: 85,
        distance: 'Nearby (< 100m)',
        reports: 1,
        verified: 0,
        ago: 'Just now',
        status: severity === 'high' ? 'Impassable' : 'Passable with caution',
      }

      const newReport: CitizenReport = {
        id: newReportId,
        hazardId: newHazardId,
        citizen: citizenName,
        type,
        emoji: EMOJI_MAP[type] || '⚠️',
        desc: description || `Community reported ${LABEL_MAP[type] || 'incident'} in this area.`,
        lat: reportLat,
        lng: reportLng,
        severity,
        time: 'Just now',
        status: 'pending',
        locationName: userLoc.locationName,
      }

      setHazards((prev) => [newHazard, ...prev])
      setReports((prev) => [newReport, ...prev])
      setLastActionMessage(`📢 Report submitted and broadcast to GABAI Live Map!`)

      // Sync via REST
      if (API_BASE_URL) {
        fetch(`${API_BASE_URL}/reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            desc: newReport.desc,
            lat: reportLat,
            lng: reportLng,
            severity,
            citizen: citizenName,
            locationName: userLoc.locationName,
          }),
        }).catch((err) => console.log('REST sync skipped:', err))
      }

      // Emit over WebSockets
      if (socketRef.current?.connected) {
        socketRef.current.emit('report:submit', newReport)
      }

      return { report: newReport, hazard: newHazard }
    },
    [userLoc.coords.lat, userLoc.coords.lng, userLoc.locationName]
  )

  // ── LGU Verification Mutations ────────────────────────────────────
  const verifyReport = useCallback(
    async (reportId: number | string) => {
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'verified' as const } : r))
      )
      setHazards((prev) =>
        prev.map((h) => {
          const matched = reports.find((r) => r.id === reportId)
          if (matched && matched.hazardId === h.id) {
            return {
              ...h,
              verified: (h.verified || 0) + 1,
              confidence: Math.min(99, (h.confidence || 80) + 10),
            }
          }
          return h
        })
      )
      setLastActionMessage('✅ Report verified and published to official alert channels.')

      if (API_BASE_URL) {
        fetch(`${API_BASE_URL}/reports/${reportId}/verify`, { method: 'PATCH' }).catch(() => {})
      }
      if (socketRef.current?.connected) {
        socketRef.current.emit('report:verify', { reportId })
      }
    },
    [reports]
  )

  const rejectReport = useCallback(async (reportId: number | string) => {
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: 'rejected' as const } : r))
    )
    setLastActionMessage('❌ Report rejected by LGU Dispatch.')

    if (API_BASE_URL) {
      fetch(`${API_BASE_URL}/reports/${reportId}/reject`, { method: 'PATCH' }).catch(() => {})
    }
  }, [])

  const resolveReport = useCallback(async (reportId: number | string) => {
    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: 'resolved' as const } : r))
    )
    setLastActionMessage('🏁 Incident resolved and marked cleared.')

    if (API_BASE_URL) {
      fetch(`${API_BASE_URL}/reports/${reportId}/resolve`, { method: 'PATCH' }).catch(() => {})
    }
  }, [])

  // ── Dynamic Safe Routes Engine with Real-World Road Network Routing ──
  const initialRoutes = useMemo(() => {
    const dest = destination || {
      name: evacCenters[0]?.name || 'Primary Evacuation Center',
      lat: evacCenters[0]?.lat || userLoc.coords.lat + 0.015,
      lng: evacCenters[0]?.lng || userLoc.coords.lng - 0.012,
    }
    return generateDynamicRoutes(
      userLoc.coords.lat,
      userLoc.coords.lng,
      dest.lat,
      dest.lng,
      hazards
    )
  }, [userLoc.coords.lat, userLoc.coords.lng, destination, evacCenters, hazards])

  const [liveRoutes, setLiveRoutes] = useState<Record<'safe' | 'balanced' | 'fast', RouteInfo> | null>(null)

  useEffect(() => {
    const dest = destination || {
      name: evacCenters[0]?.name || 'Primary Evacuation Center',
      lat: evacCenters[0]?.lat || userLoc.coords.lat + 0.015,
      lng: evacCenters[0]?.lng || userLoc.coords.lng - 0.012,
    }

    let isMounted = true
    fetchAccurateRealWorldRoutes(
      userLoc.coords.lat,
      userLoc.coords.lng,
      dest.lat,
      dest.lng,
      hazards
    ).then((res) => {
      if (isMounted && res) {
        setLiveRoutes(res)
      }
    })

    return () => {
      isMounted = false
    }
  }, [userLoc.coords.lat, userLoc.coords.lng, destination, evacCenters, hazards])

  const routes = liveRoutes || initialRoutes

  const clearLastActionMessage = useCallback(() => {
    setLastActionMessage(null)
  }, [])

  return (
    <DisasterContext.Provider
      value={{
        hazards,
        reports,
        evacCenters,
        establishments,
        selectedEstablishment,
        setSelectedEstablishment,
        userLocation: userLoc.coords,
        locationName: userLoc.locationName,
        isLocationLive: userLoc.isLive,
        isLocationLoading: userLoc.isLoading,
        isWsConnected,
        requestLocation: userLoc.requestLocation,
        addHazardReport,
        verifyReport,
        rejectReport,
        resolveReport,
        destination,
        setDestination,
        routes,
        aiPatternInsight,
        lastActionMessage,
        clearLastActionMessage,
        importEstablishmentsFromMap,
      }}
    >
      {children}
    </DisasterContext.Provider>
  )
}

export function useDisaster() {
  const ctx = useContext(DisasterContext)
  if (!ctx) throw new Error('useDisaster must be used within DisasterProvider')
  return ctx
}
