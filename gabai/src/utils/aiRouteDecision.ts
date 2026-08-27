/**
 * GABAI Gemini AI Route Decision Engine v2
 * Advanced multi-factor route analysis with deep gas efficiency modeling
 *
 * Priorities: 1) Safety (flood avoidance) 2) Gas Efficiency 3) Shortest Distance
 *
 * Fuel Model Factors:
 *   - Base consumption per km (varies by avg speed band)
 *   - Turn penalty (each turn = braking + acceleration = +3ml fuel)
 *   - Idle penalty for stop-and-go near flood zones
 *   - Highway cruising bonus (steady 50-60 km/h = optimal fuel band)
 *   - Detour overhead (longer route but potentially better flow)
 */

import { GEMINI_API_KEY } from './geminiClient'

const GEMINI_DECISION_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`

export interface CandidateRouteData {
  id: string
  distanceKm: number
  durationMin: number
  isSafeAndDry: boolean
  minHazardDistKm: number
  isDetour: boolean
  // Advanced telemetry from OSRM
  turnCount: number
  avgSpeedKmh: number
  roadSegmentCount: number
  straightPct: number       // % of route that is straight (no turns)
  highwayPct: number        // % of route on named highways/arterials
  // Computed fuel metrics
  fuelEstLiters: number
  fuelPerKm: number         // L/km efficiency ratio
  turnPenaltyLiters: number
  idlePenaltyLiters: number
  cruisingBonusPct: number  // % fuel saved from highway cruising
}

export interface AIDecisionResult {
  selectedSafeRouteId: string
  selectedBalancedRouteId: string
  reasoning: string
  safetyScore: number
  gasEfficiencyScore: number
  overallScore: number
  aiExplanation: string
}

/**
 * Extract detailed telemetry from an OSRM route object
 */
export function extractRouteTelemetry(osrmRoute: any): {
  turnCount: number
  avgSpeedKmh: number
  roadSegmentCount: number
  straightPct: number
  highwayPct: number
} {
  const legs = osrmRoute.legs || []
  const allSteps = legs.flatMap((l: any) => l.steps || [])

  let turnCount = 0
  let straightDist = 0
  let highwayDist = 0
  let totalStepDist = 0

  for (const step of allSteps) {
    const maneuver = step.maneuver?.type || ''
    const modifier = step.maneuver?.modifier || ''
    const dist = step.distance || 0
    const name = (step.name || '').toLowerCase()

    totalStepDist += dist

    // Count turns (not depart/arrive/straight continuations)
    if (maneuver === 'turn' || maneuver === 'fork' || maneuver === 'roundabout' ||
        maneuver === 'rotary' || maneuver === 'merge') {
      turnCount++
    } else if (maneuver === 'new name' && (modifier.includes('right') || modifier.includes('left'))) {
      turnCount++
    }

    // Straight segments
    if (modifier === '' || modifier === 'straight' || maneuver === 'depart' || maneuver === 'new name') {
      straightDist += dist
    }

    // Highway/arterial detection by road name
    if (name.includes('highway') || name.includes('national') || name.includes('provincial') ||
        name.includes('macarthur') || name.includes('olongapo') || name.includes('manila north') ||
        name.includes('expressway') || name.includes('bypass') || name.includes('avenue') ||
        name.includes('boulevard') || name.includes('diversion')) {
      highwayDist += dist
    }
  }

  const distKm = (osrmRoute.distance || 1) / 1000
  const durMin = Math.max(1, (osrmRoute.duration || 60) / 60)
  const avgSpeed = (distKm / durMin) * 60

  return {
    turnCount,
    avgSpeedKmh: Math.round(avgSpeed * 10) / 10,
    roadSegmentCount: allSteps.length,
    straightPct: totalStepDist > 0 ? Math.round((straightDist / totalStepDist) * 100) : 50,
    highwayPct: totalStepDist > 0 ? Math.round((highwayDist / totalStepDist) * 100) : 0,
  }
}

/**
 * Compute advanced fuel estimate using multi-factor model
 */
export function computeAdvancedFuel(
  distanceKm: number,
  telemetry: ReturnType<typeof extractRouteTelemetry>,
  isNearFlood: boolean
): {
  fuelEstLiters: number
  fuelPerKm: number
  turnPenaltyLiters: number
  idlePenaltyLiters: number
  cruisingBonusPct: number
} {
  // Base fuel consumption by speed band (L/km)
  // Optimal: 50-70 km/h = 0.065 L/km
  // City: 20-40 km/h = 0.085 L/km (more shifting, braking)
  // Crawl: <20 km/h = 0.12 L/km (flood traffic, idling)
  let baseFuelPerKm = 0.075
  if (telemetry.avgSpeedKmh >= 50 && telemetry.avgSpeedKmh <= 70) {
    baseFuelPerKm = 0.065 // Highway cruising sweet spot
  } else if (telemetry.avgSpeedKmh >= 35 && telemetry.avgSpeedKmh < 50) {
    baseFuelPerKm = 0.072
  } else if (telemetry.avgSpeedKmh >= 20 && telemetry.avgSpeedKmh < 35) {
    baseFuelPerKm = 0.085
  } else if (telemetry.avgSpeedKmh < 20) {
    baseFuelPerKm = 0.12 // Stop-and-go crawl
  }

  const baseFuel = distanceKm * baseFuelPerKm

  // Turn penalty: each turn costs ~3ml fuel (braking + re-acceleration)
  const turnPenaltyLiters = telemetry.turnCount * 0.003

  // Idle penalty if near flood: assume 2-5 min idling at 0.8 L/hr
  const idlePenaltyLiters = isNearFlood ? (3 / 60) * 0.8 : 0

  // Highway cruising bonus: steady speed on arterials saves 8-15% fuel
  const cruisingBonusPct = Math.min(15, (telemetry.highwayPct / 100) * 15 + (telemetry.straightPct / 100) * 5)
  const cruisingSavings = baseFuel * (cruisingBonusPct / 100)

  const totalFuel = Math.max(0.05, baseFuel + turnPenaltyLiters + idlePenaltyLiters - cruisingSavings)
  const effectiveFuelPerKm = distanceKm > 0 ? totalFuel / distanceKm : 0.075

  return {
    fuelEstLiters: parseFloat(totalFuel.toFixed(3)),
    fuelPerKm: parseFloat(effectiveFuelPerKm.toFixed(4)),
    turnPenaltyLiters: parseFloat(turnPenaltyLiters.toFixed(3)),
    idlePenaltyLiters: parseFloat(idlePenaltyLiters.toFixed(3)),
    cruisingBonusPct: parseFloat(cruisingBonusPct.toFixed(1)),
  }
}

/**
 * Asks Gemini AI to evaluate all candidate routes with deep fuel analysis.
 * Falls back to algorithmic scoring if Gemini is unavailable.
 */
export async function geminiDecideRoute(
  candidates: CandidateRouteData[],
  hazardDescriptions: string[],
  originDesc: string,
  destDesc: string
): Promise<AIDecisionResult> {
  const algorithmicResult = computeAlgorithmicDecision(candidates)

  if (!GEMINI_API_KEY || candidates.length === 0) {
    return algorithmicResult
  }

  try {
    const candidateSummaries = candidates.map((c) => ({
      id: c.id,
      distance_km: c.distanceKm.toFixed(2),
      duration_min: c.durationMin,
      is_flood_free: c.isSafeAndDry,
      nearest_flood_km: c.minHazardDistKm.toFixed(2),
      is_detour: c.isDetour,
      // Advanced fuel telemetry for AI analysis
      fuel_liters: c.fuelEstLiters.toFixed(3),
      fuel_per_km: c.fuelPerKm.toFixed(4),
      turn_count: c.turnCount,
      avg_speed_kmh: c.avgSpeedKmh,
      road_segments: c.roadSegmentCount,
      straight_pct: c.straightPct,
      highway_pct: c.highwayPct,
      turn_penalty_liters: c.turnPenaltyLiters.toFixed(3),
      idle_penalty_liters: c.idlePenaltyLiters.toFixed(3),
      cruising_bonus_pct: c.cruisingBonusPct.toFixed(1),
    }))

    const prompt = `You are GABAI AI, an advanced disaster navigation & fuel optimization engine for Philippine road networks.

═══ ACTIVE FLOOD HAZARDS ═══
${hazardDescriptions.length > 0 ? hazardDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n') : 'None reported'}

═══ NAVIGATION REQUEST ═══
FROM: ${originDesc}
TO: ${destDesc}

═══ CANDIDATE ROUTES WITH TELEMETRY ═══
${JSON.stringify(candidateSummaries, null, 2)}

═══ YOUR ANALYSIS TASK ═══
Evaluate each route using this multi-factor decision matrix:

FACTOR 1 — FLOOD SAFETY (Weight: 40%)
• is_flood_free = true is MANDATORY if any route has it
• Higher nearest_flood_km = safer margin
• Routes near flood zones incur idle_penalty from stop-and-go traffic

FACTOR 2 — TRIP EFFICIENCY & SPEED (Weight: 35%)
• Prefer shorter distance_km (less total driving, highly prioritized)
• Prefer faster duration_min (fastest route)
• The user prefers nearby routes, so heavily penalize detours that add significant distance
• straight_pct = higher = smoother, less congested

FACTOR 3 — GAS EFFICIENCY (Weight: 25%)
• fuel_liters = total estimated consumption (lower is better)
• fuel_per_km = efficiency ratio (lower = more efficient)
• turn_count = each turn burns extra fuel from braking/accelerating
• highway_pct = higher % means more steady-speed cruising (saves fuel)

STRICT RULES:
1. NEVER select a route with is_flood_free=false if ANY route has is_flood_free=true
2. Between two flood-free routes, STRONGLY PREFER the shorter (distance_km) and faster (duration_min) route. Do not pick a very long highway route just to avoid turns.
3. The "balanced" route should differ from "safe" if possible — optimize it for lowest fuel_per_km
4. Calculate scores out of 100 for each factor, then compute weighted overall

Respond ONLY with valid JSON:
{
  "selectedSafeRouteId": "id of the best overall route (safe + gas efficient + short)",
  "selectedBalancedRouteId": "id of the most fuel-efficient alternative",
  "reasoning": "2-3 sentence technical analysis explaining the fuel-efficiency comparison between top candidates",
  "safetyScore": 95,
  "gasEfficiencyScore": 88,
  "overallScore": 92,
  "aiExplanation": "1-2 sentence Filipino/Taglish explanation for the driver about why this route saves gas and avoids floods"
}`

    const res = await fetch(GEMINI_DECISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(4000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
      }),
    })

    if (!res.ok) return algorithmicResult
    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) return algorithmicResult

    const parsed = JSON.parse(rawText) as AIDecisionResult

    // Validate Gemini picked valid route IDs
    const validIds = new Set(candidates.map((c) => c.id))
    if (!validIds.has(parsed.selectedSafeRouteId)) {
      parsed.selectedSafeRouteId = algorithmicResult.selectedSafeRouteId
    }
    // CRITICAL SAFETY CHECK: Override if AI picked unsafe when safe exists
    const safeCandidate = candidates.find((c) => c.id === parsed.selectedSafeRouteId)
    const balancedCandidate = candidates.find((c) => c.id === parsed.selectedBalancedRouteId)
    const floodFreeExists = candidates.some((c) => c.isSafeAndDry)

    if (safeCandidate && !safeCandidate.isSafeAndDry && floodFreeExists) {
      parsed.selectedSafeRouteId = algorithmicResult.selectedSafeRouteId
      parsed.reasoning = algorithmicResult.reasoning + ' (AI safety override: flood avoided)'
    }
    if (balancedCandidate && !balancedCandidate.isSafeAndDry && floodFreeExists) {
      parsed.selectedBalancedRouteId = algorithmicResult.selectedBalancedRouteId
    }

    return parsed
  } catch (err) {
    console.warn('Gemini AI decision fallback to algorithmic scoring:', err)
    return algorithmicResult
  }
}

/**
 * Advanced algorithmic route scoring with multi-factor fuel model.
 * Used as fallback and safety net.
 */
function computeAlgorithmicDecision(candidates: CandidateRouteData[]): AIDecisionResult {
  if (candidates.length === 0) {
    return {
      selectedSafeRouteId: 'direct-0',
      selectedBalancedRouteId: 'direct-0',
      reasoning: 'No candidates available, using direct route.',
      safetyScore: 50,
      gasEfficiencyScore: 50,
      overallScore: 50,
      aiExplanation: 'Gamit ang direktang ruta dahil walang ibang opsyon.',
    }
  }

  const floodFree = candidates.filter((c) => c.isSafeAndDry)
  const pool = floodFree.length > 0 ? floodFree : [...candidates]

  const scored = pool.map((c) => {
    // Safety score (0-100)
    const safetySc = Math.min(100, c.isSafeAndDry
      ? 80 + Math.min(20, c.minHazardDistKm * 5)
      : Math.min(60, c.minHazardDistKm * 15))

    // Gas efficiency score (0-100) — multi-factor
    const baseFuelSc = Math.max(0, 100 - c.fuelEstLiters * 80)  // Lower fuel = higher score
    const turnPenaltySc = Math.max(0, 100 - c.turnCount * 4)     // Fewer turns = higher score
    const highwaySc = Math.min(100, c.highwayPct * 1.2)           // More highway = higher score
    const cruisingSc = c.cruisingBonusPct * 5                     // Higher bonus = higher score
    const gasSc = baseFuelSc * 0.4 + turnPenaltySc * 0.25 + highwaySc * 0.2 + cruisingSc * 0.15

    // Trip efficiency score (0-100)
    const distSc = Math.max(0, 100 - c.distanceKm * 4)
    const speedSc = c.avgSpeedKmh >= 50 && c.avgSpeedKmh <= 70 ? 100
      : c.avgSpeedKmh >= 35 ? 75
      : c.avgSpeedKmh >= 20 ? 50 : 25
    const tripSc = distSc * 0.6 + speedSc * 0.4

    // Weighted composite: safety 40%, trip 35%, gas 25%
    const overall = safetySc * 0.4 + tripSc * 0.35 + gasSc * 0.25

    return { ...c, safetySc, gasSc, tripSc, overall }
  })

  // Sort by overall score for "safe" pick
  scored.sort((a, b) => b.overall - a.overall)
  const best = scored[0]

  // For "balanced", re-sort by gas efficiency as primary
  const gasRanked = [...scored].sort((a, b) => b.gasSc - a.gasSc || a.fuelEstLiters - b.fuelEstLiters)
  const ecoB = gasRanked.find((r) => r.id !== best.id) || gasRanked[0]

  const isFloodFree = floodFree.length > 0

  return {
    selectedSafeRouteId: best.id,
    selectedBalancedRouteId: ecoB.id,
    reasoning: isFloodFree
      ? `Selected ${best.distanceKm.toFixed(1)} km route with ${best.turnCount} turns, ${best.highwayPct}% highway, ~${best.fuelEstLiters.toFixed(2)} L fuel (${best.cruisingBonusPct.toFixed(0)}% cruising bonus). ${best.minHazardDistKm.toFixed(1)} km from flood.`
      : `No flood-free route available. Selected route with ${best.minHazardDistKm.toFixed(1)} km flood clearance and ${best.fuelEstLiters.toFixed(2)} L fuel consumption.`,
    safetyScore: Math.round(best.safetySc),
    gasEfficiencyScore: Math.round(best.gasSc),
    overallScore: Math.round(best.overall),
    aiExplanation: isFloodFree
      ? `Pinili ng AI: ${best.distanceKm.toFixed(1)} km na ruta, ${best.turnCount} liko lang, ${best.highwayPct}% highway — matipid sa gas (~${best.fuelEstLiters.toFixed(2)} L), ligtas, walang baha.`
      : `Pinili ng AI ang rutang pinakamalayo sa baha (${best.minHazardDistKm.toFixed(1)} km clearance).`,
  }
}
