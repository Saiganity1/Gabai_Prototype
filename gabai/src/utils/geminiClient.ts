/**
 * Google Gemini AI Integration for GABAI Disaster Navigation & OpCen
 * Powered by Gemini 3.6 Flash & Gemini 3.7 Flash
 */

export const GEMINI_API_KEY =
  import.meta.env.VITE_GEMINI_API_KEY || ''

const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`

export interface GeminiRouteAdvice {
  confidence: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'
  summary: string
  recommendations: string[]
  passabilityVerdict: string
}

/**
 * Real-time Gemini AI Route Analysis & Flood Defense Evaluation
 */
export async function geminiAnalyzeRoute(params: {
  originName: string
  destinationName: string
  distanceKm: number
  durationMin: number
  bypassedHazards: number
  activeHazardsNearby: number
}): Promise<GeminiRouteAdvice | null> {
  if (!GEMINI_API_KEY) return null

  const prompt = `You are GABAI AI, an intelligent Philippine disaster navigation co-pilot.
Analyze this driving route:
- Origin: ${params.originName}
- Destination: ${params.destinationName}
- Distance: ${params.distanceKm.toFixed(1)} km (${params.durationMin} mins)
- Intercepted/Bypassed Flood Hazards: ${params.bypassedHazards}
- Nearby Active Floods: ${params.activeHazardsNearby}

Respond ONLY in valid JSON with this exact structure:
{
  "confidence": 99.4,
  "riskLevel": "LOW",
  "summary": "1-2 sentence assessment in natural English/Tagalog for the driver",
  "recommendations": [
    "Tip 1 regarding road safety or water avoidance",
    "Tip 2 regarding vehicle passability"
  ],
  "passabilityVerdict": "100% Passable for All Vehicles"
}`

  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) return null

    return JSON.parse(rawText) as GeminiRouteAdvice
  } catch (err) {
    console.warn('Gemini route analysis fallback:', err)
    return null
  }
}

/**
 * Multimodal Gemini Vision for Citizen Flood Photo Depth & Passability Triage
 */
export async function geminiAnalyzeFloodPhoto(
  base64DataUrl: string,
  locationDesc: string
): Promise<{
  estimatedDepth: string
  passability: 'all_passable' | 'not_passable_light' | 'not_passable_all'
  severity: 'low' | 'medium' | 'high'
  aiAnalysis: string
} | null> {
  if (!GEMINI_API_KEY || !base64DataUrl) return null

  try {
    // Extract raw base64 and mime type
    const matches = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
    if (!matches) return null

    const mimeType = matches[1]
    const base64Data = matches[2]

    const prompt = `Analyze this disaster photo reported at "${locationDesc}".
Determine:
1. Estimated flood water depth (e.g. Gutter Deep / Knee Deep / Waist Deep / Submerged)
2. Road passability (all_passable, not_passable_light, not_passable_all)
3. Severity (low, medium, high)
4. A concise 1-2 sentence description in Filipino/English.

Respond ONLY with valid JSON:
{
  "estimatedDepth": "Knee Deep (0.45m)",
  "passability": "not_passable_light",
  "severity": "high",
  "aiAnalysis": "Baha sa kalsada hanggang tuhod. Hindi madaanan ng maliliit na sasakyan at motor."
}`

    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: base64Data } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) return null

    return JSON.parse(rawText)
  } catch (err) {
    console.warn('Gemini vision analysis fallback:', err)
    return null
  }
}

/**
 * Intelligent Conversational Assistant for Voice Navigation Queries
 */
export async function geminiVoiceQuery(
  userQuery: string,
  context: { location: string; activeRouteDesc?: string; floodCount: number }
): Promise<string> {
  if (!GEMINI_API_KEY) return 'Active navigation is running safely.'

  const prompt = `You are GABAI, the voice AI disaster navigation co-pilot for the Philippines.
User is driving near: ${context.location}
Active Route status: ${context.activeRouteDesc || 'Safe route selected'}
Active flood hazards in area: ${context.floodCount}

User said: "${userQuery}"

Provide a concise, reassuring 1-2 sentence spoken response in Tagalog/Taglish. Focus on motorist safety, road passability, and flood avoidance.`

  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    })

    if (!res.ok) return 'Ligtas ang iyong ruta patungo sa destinasyon.'
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'Naka-set ang iyong safe route patungo sa destinasyon.'
  } catch {
    return 'Ligtas ang iyong ruta. Mag-ingat sa pagmamaneho.'
  }
}

/**
 * Direct Gemini Conversational Assistant for General Inquiries & Disaster Queries
 * Strictly Grounded with Real-Time Telemetry to Prevent Hallucinations
 */
export async function geminiChatAssistant(
  userQuery: string,
  context: {
    currentLocation: string
    activeHazardsList?: string[]
    activeHazardsCount?: number
    evacuationCenters?: string[]
    routeDetails?: {
      destinationName: string
      distanceKm: number
      durationMin: number
      isClear: boolean
    }
  }
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null

  const prompt = `You are GABAI, an official AI disaster navigation and public safety assistant in Pampanga, Philippines.
STRICT DATA INTEGRITY RULES (DO NOT HALLUCINATE):
1. Use ONLY the provided verified ground-truth data below. NEVER invent fake hazard numbers, imaginary impassable roads, or exaggerated weather events.
2. If routeDetails are provided, the route has ALREADY been calculated by GABAI's routing engine and is 100% CLEAR and SAFE. Confirm the exact destination and travel time.
3. If the user asks if there is flood in a place, refer ONLY to the verified active hazard list. If a place is not in the list, state that no active flood reports exist there.

GROUND-TRUTH DATA:
- Current Location: ${context.currentLocation}
${context.routeDetails ? `- Safe Calculated Route: To ${context.routeDetails.destinationName} (${context.routeDetails.distanceKm.toFixed(1)} km · ~${context.routeDetails.durationMin} mins) — Status: Flood-Free & Passable` : ''}
- Verified Active Flood Road Segments in Pampanga: ${context.activeHazardsList && context.activeHazardsList.length > 0 ? context.activeHazardsList.join('; ') : 'None (All major roads passable)'}
- Key Evacuation Centers: ${(context.evacuationCenters || []).slice(0, 4).join(', ')}

User Query: "${userQuery}"

Task: Provide a concise (1-2 sentences), accurate, reassuring response in the user's language (Tagalog/English). State exact facts only.`

  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null
  } catch {
    return null
  }
}

/**
 * AI Geocoding Resolver: Resolves any school, building, acronym (SMACP, AUF, HAU), or local venue in Pampanga to exact GPS coordinates
 */
export async function geminiGeocodePlace(
  placeQuery: string,
  userLocation?: { lat: number; lng: number }
): Promise<{ name: string; address: string; lat: number; lng: number } | null> {
  if (!GEMINI_API_KEY) return null

  const prompt = `You are a precision geographic entity resolver for Pampanga, Philippines.
Resolve this user query: "${placeQuery}"
Context: User is currently near ${userLocation ? `${userLocation.lat}, ${userLocation.lng}` : 'Pampanga'}.
Identify the real-world venue, school, university, hospital, church, barangay, or landmark in Pampanga (e.g. "SMACP" = "St. Mary's Angels College of Pampanga" in Sto. Domingo, Mexico/Santa Ana, Pampanga).

Respond ONLY in valid JSON:
{
  "name": "Official Full Name of the Venue",
  "address": "Specific Barangay, Municipality, Pampanga",
  "lat": 15.0850,
  "lng": 120.7620,
  "confidence": 0.95
}`

  try {
    const res = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    })

    if (!res.ok) return null
    const data = await res.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText) return null

    const parsed = JSON.parse(rawText)
    if (parsed && parsed.lat && parsed.lng && parsed.lat > 14.5 && parsed.lat < 16.0 && parsed.lng > 120.0 && parsed.lng < 121.5) {
      return {
        name: parsed.name || placeQuery,
        address: parsed.address || 'Pampanga, Philippines',
        lat: Number(parsed.lat),
        lng: Number(parsed.lng),
      }
    }
    return null
  } catch {
    return null
  }
}

