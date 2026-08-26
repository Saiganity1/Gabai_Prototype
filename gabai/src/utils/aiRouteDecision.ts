/**
 * GABAI Gemini AI Route Decision Engine
 * Sends all candidate routes to Gemini AI for intelligent decision-making
 * Priorities: 1) Safety (avoid floods) 2) Gas Efficiency 3) Shortest Distance
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
  fuelEstLiters: number
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
 * Asks Gemini AI to evaluate all candidate routes and pick the best ones.
 * Falls back to algorithmic scoring if Gemini is unavailable.
 */
export async function geminiDecideRoute(
  candidates: CandidateRouteData[],
  hazardDescriptions: string[],
  originDesc: string,
  destDesc: string
): Promise<AIDecisionResult> {
  // Always compute algorithmic scores as baseline/fallback
  const algorithmicResult = computeAlgorithmicDecision(candidates)

  if (!GEMINI_API_KEY || candidates.length === 0) {
    return algorithmicResult
  }

  try {
    const candidateSummaries = candidates.map((c, i) => ({
      id: c.id,
      index: i,
      distance_km: c.distanceKm.toFixed(2),
      duration_min: c.durationMin,
      is_flood_free: c.isSafeAndDry,
      nearest_flood_km: c.minHazardDistKm.toFixed(2),
      fuel_liters: c.fuelEstLiters.toFixed(2),
      is_detour: c.isDetour,
    }))

    const prompt = `You are GABAI AI, an intelligent disaster navigation route optimizer for the Philippines.

ACTIVE FLOOD HAZARDS ON MAP:
${hazardDescriptions.length > 0 ? hazardDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n') : 'None reported'}

ROUTE FROM: ${originDesc}
ROUTE TO: ${destDesc}

CANDIDATE ROUTES (all use real OpenStreetMap roads):
${JSON.stringify(candidateSummaries, null, 2)}

YOUR TASK: Pick the BEST route for "safe" (primary recommendation) and "balanced" (eco-friendly backup).

STRICT RULES:
1. NEVER pick a route where is_flood_free = false if ANY route has is_flood_free = true
2. Among flood-free routes, prefer SHORTEST distance (saves gas)
3. Break ties by fastest duration
4. The "balanced" route should be a DIFFERENT route from "safe" if possible, optimized for fuel
5. If all routes pass through flood, pick the one with highest nearest_flood_km

Respond ONLY with valid JSON:
{
  "selectedSafeRouteId": "the id of the best safe route",
  "selectedBalancedRouteId": "the id of the best eco route",
  "reasoning": "1-2 sentence explanation of why these routes were chosen",
  "safetyScore": 95,
  "gasEfficiencyScore": 88,
  "overallScore": 92,
  "aiExplanation": "Brief Filipino/Taglish explanation for the driver"
}`

    const res = await fetch(GEMINI_DECISION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })

    if (!res.ok) return algorithmicResult
    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) return algorithmicResult

    const parsed = JSON.parse(rawText) as AIDecisionResult

    // Validate that Gemini picked valid route IDs
    const validIds = new Set(candidates.map((c) => c.id))
    if (!validIds.has(parsed.selectedSafeRouteId)) {
      parsed.selectedSafeRouteId = algorithmicResult.selectedSafeRouteId
    }
    if (!validIds.has(parsed.selectedBalancedRouteId)) {
      parsed.selectedBalancedRouteId = algorithmicResult.selectedBalancedRouteId
    }

    // CRITICAL SAFETY CHECK: Override Gemini if it picked an unsafe route when safe ones exist
    const safeCandidate = candidates.find((c) => c.id === parsed.selectedSafeRouteId)
    const floodFreeExists = candidates.some((c) => c.isSafeAndDry)
    if (safeCandidate && !safeCandidate.isSafeAndDry && floodFreeExists) {
      parsed.selectedSafeRouteId = algorithmicResult.selectedSafeRouteId
      parsed.reasoning = algorithmicResult.reasoning + ' (AI safety override applied)'
    }

    return parsed
  } catch (err) {
    console.warn('Gemini AI decision fallback to algorithmic scoring:', err)
    return algorithmicResult
  }
}

/**
 * Pure algorithmic route scoring (no API call needed).
 * Used as fallback and safety net for Gemini decisions.
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

  // Score each route: lower distance = higher gas score, higher hazard dist = higher safety
  const scored = pool.map((c) => {
    const safetySc = Math.min(100, Math.max(0, c.isSafeAndDry ? 80 + Math.min(20, c.minHazardDistKm * 10) : c.minHazardDistKm * 20))
    const gasSc = Math.max(0, 100 - c.distanceKm * 3)
    const speedSc = Math.max(0, 100 - c.durationMin * 2)
    // Weighted composite: safety 50%, gas 30%, speed 20%
    const overall = safetySc * 0.5 + gasSc * 0.3 + speedSc * 0.2
    return { ...c, safetySc, gasSc, speedSc, overall }
  })

  scored.sort((a, b) => b.overall - a.overall)

  const best = scored[0]
  const secondBest = scored.length > 1 ? scored[1] : scored[0]

  const isFloodFree = floodFree.length > 0

  return {
    selectedSafeRouteId: best.id,
    selectedBalancedRouteId: secondBest.id,
    reasoning: isFloodFree
      ? `Selected ${best.distanceKm.toFixed(1)} km flood-free route (${best.minHazardDistKm.toFixed(1)} km from nearest flood). Gas efficient at ~${best.fuelEstLiters.toFixed(2)} L.`
      : `No completely flood-free route found. Selected route with ${best.minHazardDistKm.toFixed(1)} km clearance from flood.`,
    safetyScore: Math.round(best.safetySc),
    gasEfficiencyScore: Math.round(best.gasSc),
    overallScore: Math.round(best.overall),
    aiExplanation: isFloodFree
      ? `Pinili ng AI ang pinakamaikli at ligtas na ruta — ${best.distanceKm.toFixed(1)} km, walang dadaanang baha, matipid sa gas.`
      : `Pinili ng AI ang rutang pinakamalayo sa baha — ${best.minHazardDistKm.toFixed(1)} km ang layo sa pinakamalapit na baha.`,
  }
}
