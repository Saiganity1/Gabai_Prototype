import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { Hazard, RoadSegment, PassabilityType } from '../components/MapCanvas'
import { useUserLocation, UserCoordinates } from '../hooks/useUserLocation'
import { getContextualHazards, getContextualEvacCenters } from '../utils/geoHazards'
import { generateDynamicRoutes, fetchAccurateRealWorldRoutes, RouteInfo } from '../utils/routingEngine'

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
  isRoadSegment?: boolean
  roadSegment?: RoadSegment
  passability?: PassabilityType
  waterDepth?: string
  isMine?: boolean
}

export interface AIPatternInsight {
  title: string
  description: string
  severity: 'high' | 'medium' | 'low'
  clusterCount: number
  recommendedAction: string
  timestamp: string
}

/**
 * Anti-Spam Filter: Determines if a hazard is visible to the public.
 * Unverified citizen reports are hidden from other users until verified by the LGU.
 */
export function isHazardPubliclyVisible(h: Hazard, myReportIds: string[] = []): boolean {
  if (!h || h.status === 'Resolved' || h.status === 'rejected' || h.status?.includes('Rejected')) {
    return false
  }

  // 1. Officially verified by LGU (published to all motorists)
  if (
    h.isVerified ||
    (h.verified && h.verified > 0) ||
    h.status === 'Verified' ||
    h.status === 'Verified by LGU' ||
    h.status?.includes('Verified')
  ) {
    return true
  }

  // 2. Pre-seeded baseline official LGU hazards
  if (typeof h.id === 'string' && h.id.startsWith('haz-pamp-')) {
    return true
  }

  // 3. User's own report (visible to creator with Pending status)
  if (h.isMine || myReportIds.includes(String(h.id))) {
    return true
  }

  // Hide unverified reports from other users to reduce spam and false reports
  return false
}

interface DisasterContextType {
  hazards: Hazard[]
  reports: CitizenReport[]
  myReportIds: string[]
  evacCenters: ReturnType<typeof getContextualEvacCenters>
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
    isRoadSegment?: boolean
    roadSegment?: RoadSegment
    passability?: PassabilityType
    waterDepth?: string
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

const DEFAULT_SEED_REPORTS: CitizenReport[] = [
  {
    id: 'rep-santamaria',
    hazardId: 'haz-pamp-santamaria',
    citizen: 'Barangay Santa Maria Watch',
    type: 'flood',
    emoji: '🌊',
    desc: 'Flooding along Mexico-San Luis Road from Santa Maria Chapel to Purok 2. Not passable to light vehicles (tricycles and motorcycles submerged).',
    lat: 15.074,
    lng: 120.781,
    severity: 'high',
    time: '2 mins ago',
    status: 'pending',
    locationName: 'Mexico - San Luis Provincial Road',
    isRoadSegment: true,
    roadSegment: {
      from: { lat: 15.071, lng: 120.776, name: 'Santa Maria Chapel (Tramo)' },
      to: { lat: 15.078, lng: 120.789, name: 'Purok 2 Highway Crossing' },
      roadName: 'Mexico - San Luis Provincial Road',
      path: [
        [120.7760, 15.0710],
        [120.7774, 15.0719],
        [120.7792, 15.0731],
        [120.7811, 15.0744],
        [120.7830, 15.0756],
        [120.7852, 15.0768],
        [120.7872, 15.0775],
        [120.7890, 15.0780],
      ],
    },
    passability: 'not_passable_light',
    waterDepth: 'Knee Deep (0.45m)',
  },
  {
    id: 'rep-101',
    hazardId: 'haz-pamp-1',
    citizen: 'Maria S. (Citizen)',
    type: 'flood',
    emoji: '🌊',
    desc: 'MacArthur Highway knee-deep flash flood near Dolores flyover.',
    lat: 15.039,
    lng: 120.684,
    severity: 'high',
    time: '3 mins ago',
    status: 'verified',
    locationName: 'MacArthur Highway Commercial Strip',
    isRoadSegment: true,
    roadSegment: {
      from: { lat: 15.035, lng: 120.681, name: 'San Fernando Junction' },
      to: { lat: 15.044, lng: 120.688, name: 'Dolores Flyover Intersection' },
      roadName: 'MacArthur Highway',
      path: [
        [120.6810, 15.0350],
        [120.6828, 15.0375],
        [120.6840, 15.0390],
        [120.6860, 15.0415],
        [120.6880, 15.0440],
      ],
    },
    passability: 'not_passable_light',
    waterDepth: 'Knee Deep (0.50m)',
  },
  {
    id: 'rep-102',
    hazardId: 'haz-pamp-3',
    citizen: 'Juan D. (Barangay Patrol)',
    type: 'road',
    emoji: '🚧',
    desc: 'JASA road clearing in progress. Counterflow traffic enforced.',
    lat: 15.046,
    lng: 120.676,
    severity: 'medium',
    time: '10 mins ago',
    status: 'verified',
    locationName: 'Jose Abad Santos Avenue',
  },
]

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

  const [hazards, setHazards] = useState<Hazard[]>(() => {
    const defaults = getContextualHazards(15.074, 120.781)
    try {
      const saved = localStorage.getItem('gabai-live-hazards')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any) => {
            const match = defaults.find((d) => d.id === item.id)
            if (match && match.isRoadSegment && match.roadSegment) {
              return { ...item, roadSegment: match.roadSegment }
            }
            return item
          })
        }
      }
    } catch {}
    return defaults
  })

  const [reports, setReports] = useState<CitizenReport[]>(() => {
    try {
      const saved = localStorage.getItem('gabai-live-reports')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return DEFAULT_SEED_REPORTS
  })

  const [myReportIds, setMyReportIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gabai-my-reported-ids')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {}
    return []
  })

  // Auto-sync state to localStorage and broadcast to other tabs
  useEffect(() => {
    try {
      localStorage.setItem('gabai-live-reports', JSON.stringify(reports))
      localStorage.setItem('gabai-live-hazards', JSON.stringify(hazards))
      localStorage.setItem('gabai-my-reported-ids', JSON.stringify(myReportIds))
    } catch {}
  }, [reports, hazards, myReportIds])

  // Multi-tab real-time listener (Cross-tab broadcast channel)
  useEffect(() => {
    if (typeof window === 'undefined') return

    let bc: BroadcastChannel | null = null
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('gabai-sync-channel')
        bc.onmessage = (event) => {
          if (event.data?.type === 'SYNC_REPORTS' && Array.isArray(event.data.reports)) {
            setReports(event.data.reports)
          }
          if (event.data?.type === 'SYNC_HAZARDS' && Array.isArray(event.data.hazards)) {
            setHazards(event.data.hazards)
          }
        }
      }
    } catch {}

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'gabai-live-reports' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (Array.isArray(parsed)) setReports(parsed)
        } catch {}
      }
      if (e.key === 'gabai-live-hazards' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue)
          if (Array.isArray(parsed)) setHazards(parsed)
        } catch {}
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => {
      window.removeEventListener('storage', handleStorageChange)
      if (bc) bc.close()
    }
  }, [])

  const [destination, setDestination] = useState<{ name: string; lat: number; lng: number } | null>(null)
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null)

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
                citizen: r.citizen || 'Resident',
                type: r.type || 'flood',
                emoji: r.type === 'flood' ? '🌊' : '⚠️',
                desc: r.desc || r.description,
                lat: r.lat,
                lng: r.lng,
                severity: r.severity || 'medium',
                time: r.createdAt ? new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently',
                status: r.status || 'pending',
                locationName: r.locationName,
              }))
            )
          }
        }
      } catch (err) {
        console.log('REST initial fetch skipped:', err)
      }
    }

    fetchInitialData()
  }, [])

  // ── 2. WebSocket Real-Time Integration ────────────────────────────
  useEffect(() => {
    if (!WS_URL) return

    try {
      const socket = io(WS_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      })

      socketRef.current = socket

      socket.on('connect', () => {
        setIsWsConnected(true)
        console.log('⚡ Connected to GABAI Live Disaster Engine WebSocket')
      })

      socket.on('disconnect', () => {
        setIsWsConnected(false)
      })

      socket.on('report:new', (newReport: CitizenReport) => {
        setReports((prev) => {
          if (prev.some((r) => r.id === newReport.id)) return prev
          return [newReport, ...prev]
        })
      })

      socket.on('report:verified', ({ reportId }: { reportId: number | string }) => {
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: 'verified' as const } : r))
        )
      })

      socket.on('hazard:update', (updatedHazards: Hazard[]) => {
        if (Array.isArray(updatedHazards)) {
          setHazards(updatedHazards)
        }
      })

      return () => {
        socket.disconnect()
      }
    } catch (err) {
      console.log('WebSocket connection error (using mock state):', err)
    }
  }, [])

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

  // ── 3. Citizen Actions (Add Report with Anti-Spam LGU Verification) ─
  const addHazardReport = useCallback(
    ({
      type,
      description,
      lat,
      lng,
      severity = 'medium',
      citizenName = 'Resident (GABAI User)',
      isRoadSegment,
      roadSegment,
      passability,
      waterDepth,
    }: {
      type: string
      description?: string
      lat?: number
      lng?: number
      severity?: 'low' | 'medium' | 'high'
      citizenName?: string
      isRoadSegment?: boolean
      roadSegment?: any
      passability?: string
      waterDepth?: string
    }) => {
      let effectiveLat = lat
      let effectiveLng = lng
      if (typeof effectiveLat !== 'number' || typeof effectiveLng !== 'number') {
        if (roadSegment?.path && Array.isArray(roadSegment.path) && roadSegment.path.length > 0) {
          const midIdx = Math.floor(roadSegment.path.length / 2)
          effectiveLng = roadSegment.path[midIdx][0]
          effectiveLat = roadSegment.path[midIdx][1]
        } else if (roadSegment?.from && roadSegment?.to) {
          effectiveLat = (roadSegment.from.lat + roadSegment.to.lat) / 2
          effectiveLng = (roadSegment.from.lng + roadSegment.to.lng) / 2
        } else {
          effectiveLat = userLoc.coords.lat
          effectiveLng = userLoc.coords.lng
        }
      }

      const reportLat = effectiveLat
      const reportLng = effectiveLng
      const newHazardId = `haz-${Date.now()}`
      const newReportId = `rep-${Date.now()}`

      let statusText = severity === 'high' ? 'Impassable' : 'Passable with caution'
      if (passability === 'not_passable_all') statusText = 'Closed to All Vehicles'
      if (passability === 'not_passable_light') statusText = 'Not Passable to Light Vehicles'
      if (passability === 'all_passable') statusText = 'Passable to All Vehicles'

      const newHazard: Hazard = {
        id: newHazardId,
        type,
        emoji: EMOJI_MAP[type] || '⚠️',
        label: roadSegment?.roadName
          ? `${roadSegment.roadName} Flooding`
          : LABEL_MAP[type] || 'Disaster Incident',
        lat: reportLat,
        lng: reportLng,
        severity,
        confidence: 85,
        distance: 'Nearby (< 100m)',
        reports: 1,
        verified: 0,
        ago: 'Just now',
        status: statusText,
        isRoadSegment,
        roadSegment,
        passability: passability || 'not_passable_light',
        waterDepth: waterDepth || 'Flood on Road',
        isVerified: false,
        isMine: true,
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
        locationName: roadSegment?.roadName || userLoc.locationName,
        isRoadSegment,
        roadSegment,
        passability: passability || 'not_passable_light',
        waterDepth: waterDepth || 'Flood on Road',
        isMine: true,
      }

      // Record in local reporting ID list
      setMyReportIds((prev) => [...prev, String(newReportId), String(newHazardId)])

      setHazards((prev) => [newHazard, ...prev])
      setReports((prev) => [newReport, ...prev])
      setLastActionMessage(`📢 Report submitted! Awaiting LGU verification before broadcasting to all motorists.`)

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
            isRoadSegment,
            roadSegment,
            passability,
            waterDepth,
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
      const matched = reports.find((r) => r.id === reportId)

      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: 'verified' as const } : r))
      )
      setHazards((prev) =>
        prev.map((h) => {
          if (matched && (matched.hazardId === h.id || matched.id === h.id)) {
            return {
              ...h,
              verified: (h.verified || 0) + 1,
              isVerified: true,
              status: 'Verified by LGU',
              confidence: Math.min(99, (h.confidence || 80) + 15),
            }
          }
          if (matched && matched.isRoadSegment && h.isRoadSegment) {
            const hRoadName = h.roadSegment?.roadName || h.label || ''
            const mRoadName = matched.roadSegment?.roadName || matched.locationName || ''
            if (
              (hRoadName && mRoadName && hRoadName.toLowerCase().includes(mRoadName.toLowerCase().slice(0, 8))) ||
              (mRoadName && hRoadName && mRoadName.toLowerCase().includes(hRoadName.toLowerCase().slice(0, 8)))
            ) {
              return {
                ...h,
                verified: (h.verified || 0) + 1,
                isVerified: true,
                status: 'Verified by LGU',
                confidence: Math.min(99, (h.confidence || 80) + 15),
              }
            }
          }
          return h
        })
      )
      setLastActionMessage('✅ Report verified by LGU! Now published to all motorists on the live map.')

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
    const matched = reports.find((r) => r.id === reportId)

    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: 'rejected' as const } : r))
    )

    setHazards((prev) =>
      prev.map((h) => {
        if (matched && (matched.hazardId === h.id || matched.id === h.id)) {
          return { ...h, status: 'Rejected by LGU', isVerified: false }
        }
        return h
      }).filter((h) => h.status !== 'Rejected by LGU')
    )

    setLastActionMessage('❌ Report rejected by LGU Dispatch (marked as false alarm / spam).')

    if (API_BASE_URL) {
      fetch(`${API_BASE_URL}/reports/${reportId}/reject`, { method: 'PATCH' }).catch(() => {})
    }
  }, [])

  const resolveReport = useCallback(async (reportId: number | string) => {
    const matched = reports.find((r) => r.id === reportId)

    setReports((prev) =>
      prev.map((r) => (r.id === reportId ? { ...r, status: 'resolved' as const } : r))
    )

    setHazards((prev) =>
      prev
        .map((h) => {
          if (matched && (h.id === matched.hazardId || h.id === matched.id)) {
            return { ...h, status: 'Resolved' }
          }
          if (matched && matched.isRoadSegment && h.isRoadSegment) {
            const hRoadName = h.roadSegment?.roadName || h.label || ''
            const mRoadName = matched.roadSegment?.roadName || matched.locationName || ''
            if (
              (hRoadName && mRoadName && hRoadName.toLowerCase().includes(mRoadName.toLowerCase().slice(0, 8))) ||
              (mRoadName && hRoadName && mRoadName.toLowerCase().includes(hRoadName.toLowerCase().slice(0, 8)))
            ) {
              return { ...h, status: 'Resolved' }
            }
          }
          if (matched) {
            const dist = Math.hypot(h.lat - matched.lat, h.lng - matched.lng)
            if (dist < 0.004) {
              return { ...h, status: 'Resolved' }
            }
          }
          return h
        })
        .filter((h) => h.status !== 'Resolved')
    )

    setLastActionMessage('🏁 Incident resolved! Flood corridor cleared from live citizen map.')

    if (API_BASE_URL) {
      fetch(`${API_BASE_URL}/reports/${reportId}/resolve`, { method: 'PATCH' }).catch(() => {})
    }
  }, [reports])

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
  const latestRequestIdRef = useRef(0)

  useEffect(() => {
    const dest = destination || {
      name: evacCenters[0]?.name || 'Primary Evacuation Center',
      lat: evacCenters[0]?.lat || userLoc.coords.lat + 0.015,
      lng: evacCenters[0]?.lng || userLoc.coords.lng - 0.012,
    }

    const currentRequestId = ++latestRequestIdRef.current

    fetchAccurateRealWorldRoutes(
      userLoc.coords.lat,
      userLoc.coords.lng,
      dest.lat,
      dest.lng,
      hazards
    ).then((res) => {
      if (currentRequestId === latestRequestIdRef.current && res) {
        setLiveRoutes(res)
      }
    })
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
        myReportIds,
        evacCenters,
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
