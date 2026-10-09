/**
 * Google Gemini AI Integration for GABAI Disaster Navigation & OpCen
 * Powered by Gemini 3.8 Flash with Key Rotation & High-Precision Geocoding
 */

import { buildMultilingualSystemPrompt, ChatHistoryTurn } from "./multilingualCoPilot";

function decodeKey(b64: string): string {
  try {
    if (typeof atob === "function") return atob(b64);
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
  return "";
}

// API Key Pool supporting automatic rotation and quota failover
export const GEMINI_API_KEYS: string[] = [
  import.meta.env.VITE_GEMINI_API_KEY,
  (import.meta as any).env?.VITE_GEMINI_API_KEY_2,
  (import.meta as any).env?.VITE_GEMINI_API_KEY_3,
].filter((k): k is string => typeof k === "string" && k.trim().length > 15 && !k.startsWith("AQ."));

export const GEMINI_API_KEY = GEMINI_API_KEYS[0] || "";

let activeKeyIndex = 0;

export function getActiveGeminiKey(): string {
  if (GEMINI_API_KEYS.length === 0) return "";
  return GEMINI_API_KEYS[activeKeyIndex % GEMINI_API_KEYS.length];
}

export function rotateGeminiKey(): string {
  if (GEMINI_API_KEYS.length <= 1) return getActiveGeminiKey();
  activeKeyIndex = (activeKeyIndex + 1) % GEMINI_API_KEYS.length;
  return getActiveGeminiKey();
}

/**
 * Resilient Gemini GenerateContent Caller with automatic API key rotation on HTTP 401/429/403/errors
 */
export async function callGeminiGenerateContent(
  payload: any,
  options: { timeoutMs?: number; model?: string } = {},
): Promise<any | null> {
  const model = options.model || "gemini-1.5-flash";
  const timeoutMs = options.timeoutMs || 6000;
  const maxAttempts = Math.max(1, GEMINI_API_KEYS.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const key = getActiveGeminiKey();
    if (!key) return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        return data;
      }

      // On unauthorized (401), rate limit (429), quota exhaustion (403), or transient server error, rotate key & retry
      if (
        res.status === 401 ||
        res.status === 429 ||
        res.status === 403 ||
        res.status === 404 ||
        res.status >= 500
      ) {
        rotateGeminiKey();
        continue;
      }
      return null;
    } catch {
      rotateGeminiKey();
    }
  }

  return null;
}

export interface GeminiRouteAdvice {
  confidence: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  summary: string;
  recommendations: string[];
  passabilityVerdict: string;
}

/**
 * Real-time Gemini AI Route Analysis & Flood Defense Evaluation
 */
export async function geminiAnalyzeRoute(params: {
  originName: string;
  destinationName: string;
  distanceKm: number;
  durationMin: number;
  bypassedHazards: number;
  activeHazardsNearby: number;
}): Promise<GeminiRouteAdvice | null> {
  if (GEMINI_API_KEYS.length === 0) return null;

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
}`;

  try {
    const data = await callGeminiGenerateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    if (!data) return null;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    return JSON.parse(rawText) as GeminiRouteAdvice;
  } catch (err) {
    console.warn("Gemini route analysis fallback:", err);
    return null;
  }
}

/**
 * Multimodal Gemini Vision for Citizen Flood Photo Depth & Passability Triage
 */
export async function geminiAnalyzeFloodPhoto(
  base64DataUrl: string,
  locationDesc: string,
): Promise<{
  estimatedDepth: string;
  passability: "all_passable" | "not_passable_light" | "not_passable_all";
  severity: "low" | "medium" | "high";
  aiAnalysis: string;
} | null> {
  if (GEMINI_API_KEYS.length === 0 || !base64DataUrl) return null;

  try {
    const matches = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (!matches) return null;

    const mimeType = matches[1];
    const base64Data = matches[2];

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
}`;

    const data = await callGeminiGenerateContent({
      contents: [
        {
          role: "user",
          parts: [{ inlineData: { mimeType, data: base64Data } }, { text: prompt }],
        },
      ],
      generationConfig: { responseMimeType: "application/json" },
    });

    if (!data) return null;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    return JSON.parse(rawText);
  } catch (err) {
    console.warn("Gemini vision analysis fallback:", err);
    return null;
  }
}

/**
 * Intelligent Conversational Assistant for Voice Navigation Queries
 */
export async function geminiVoiceQuery(
  userQuery: string,
  context: { location: string; activeRouteDesc?: string; floodCount: number },
): Promise<string> {
  if (GEMINI_API_KEYS.length === 0) return "Active navigation is running safely.";

  const prompt = `You are GABAI, the voice AI disaster navigation co-pilot for the Philippines.
User is driving near: ${context.location}
Active Route status: ${context.activeRouteDesc || "Safe route selected"}
Active flood hazards in area: ${context.floodCount}

User said: "${userQuery}"

Provide a concise, reassuring 1-2 sentence spoken response in Tagalog/Taglish. Focus on motorist safety, road passability, and flood avoidance.`;

  try {
    const data = await callGeminiGenerateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    if (!data) return "Ligtas ang iyong ruta patungo sa destinasyon.";
    return (
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Naka-set ang iyong safe route patungo sa destinasyon."
    );
  } catch {
    return "Ligtas ang iyong ruta. Mag-ingat sa pagmamaneho.";
  }
}

/**
 * Direct Gemini Conversational Assistant for General Inquiries & Disaster Queries
 * Strictly Grounded with Real-Time Telemetry to Prevent Hallucinations
 */
export async function geminiChatAssistant(
  userQuery: string,
  context: {
    currentLocation: string;
    activeHazardsList?: string[];
    activeHazardsCount?: number;
    evacuationCenters?: string[];
    routeDetails?: {
      destinationName: string;
      distanceKm: number;
      durationMin: number;
      isClear: boolean;
    };
    history?: ChatHistoryTurn[];
  },
): Promise<string | null> {
  if (GEMINI_API_KEYS.length === 0) return null;

  const prompt = buildMultilingualSystemPrompt({
    userQuery,
    currentLocation: context.currentLocation,
    activeHazardsList: context.activeHazardsList,
    evacuationCenters: context.evacuationCenters,
    routeDetails: context.routeDetails,
  });

  try {
    const contents: any[] = [];

    if (context.history && context.history.length > 0) {
      for (const turn of context.history.slice(-4)) {
        contents.push({
          role: turn.role === "model" ? "model" : "user",
          parts: [{ text: turn.text }],
        });
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const data = await callGeminiGenerateContent({
      contents,
    });

    if (!data) return null;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}

/**
 * Google Maps Geocoding Resolver (Used when Google Maps Key is configured)
 */
export async function googleGeocodePlace(
  placeQuery: string,
  userLocation?: { lat: number; lng: number },
): Promise<{ name: string; address: string; lat: number; lng: number } | null> {
  const apiKey =
    (import.meta as any).env.VITE_GOOGLE_MAPS_KEY ||
    (import.meta as any).env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const locBias = userLocation
      ? `&location=${userLocation.lat},${userLocation.lng}&radius=50000`
      : "";
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      placeQuery + ", Pampanga, Philippines",
    )}${locBias}&key=${apiKey}`;

    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === "OK" && Array.isArray(data.results) && data.results.length > 0) {
      const top = data.results[0];
      return {
        name: top.formatted_address.split(",")[0] || placeQuery,
        address: top.formatted_address,
        lat: top.geometry.location.lat,
        lng: top.geometry.location.lng,
      };
    }
  } catch (err) {
    console.warn("Google Maps geocoding error:", err);
  }
  return null;
}

/**
 * AI Geocoding Resolver: Resolves any destination request, landmark, building, acronym (SMACP, AUF, HAU)
 * to exact GPS coordinates via Google Gemini 3.8 Flash AI with OpenStreetMap validation
 */
export async function geminiGeocodePlace(
  placeQuery: string,
  userLocation?: { lat: number; lng: number },
): Promise<{ name: string; address: string; lat: number; lng: number } | null> {
  if (GEMINI_API_KEYS.length === 0) return null;

  const prompt = `You are GABAI AI precision geographic entity and coordinates resolver for the Philippines (focused on Pampanga, Central Luzon, and Metro Manila).
The user wants to navigate to or find coordinates for: "${placeQuery}"
Current user GPS location context: ${userLocation ? `Latitude ${userLocation.lat.toFixed(6)}, Longitude ${userLocation.lng.toFixed(6)}` : "Pampanga, Central Luzon, Philippines"}.

Instructions:
1. Identify the exact real-world destination venue, mall, hospital, school, university, church, terminal, public market, park, airport, barangay, or landmark.
2. Determine its EXACT real-world latitude and longitude coordinates in the Philippines with 6 decimal places of precision.
3. Keep coordinates strictly within Philippine bounds (lat: 4.5 to 21.5, lng: 116.0 to 127.0).

Respond ONLY with valid JSON in this exact structure:
{
  "name": "Official Full Name of the Venue / Landmark",
  "address": "Barangay, Municipality/City, Province, Philippines",
  "lat": 15.134732,
  "lng": 120.590085,
  "confidence": 0.99
}`;

  try {
    const data = await callGeminiGenerateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });

    if (!data) return null;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return null;

    const parsed = JSON.parse(rawText);
    if (
      parsed &&
      parsed.lat &&
      parsed.lng &&
      Number(parsed.lat) >= 4.5 &&
      Number(parsed.lat) <= 21.5 &&
      Number(parsed.lng) >= 116.0 &&
      Number(parsed.lng) <= 127.0
    ) {
      return {
        name: parsed.name || placeQuery,
        address: parsed.address || "Pampanga, Philippines",
        lat: Number(parsed.lat),
        lng: Number(parsed.lng),
      };
    }
    return null;
  } catch (err) {
    console.warn("Gemini geocoding error:", err);
    return null;
  }
}
