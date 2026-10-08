/**
 * Multilingual Co-Pilot Language-Handling Module for GABAI AI
 * Enables zero-dependency language mirroring across Philippine regional languages
 * (Kapampangan, Bisaya, Ilocano, Hiligaynon, Waray, Bikol, Tagalog/Taglish, English).
 */

export interface ChatHistoryTurn {
  role: 'user' | 'model'
  text: string
}

export type SupportedLanguageHint =
  | 'kapampangan'
  | 'bisaya'
  | 'ilocano'
  | 'hiligaynon'
  | 'waray'
  | 'bikol'
  | 'tagalog'
  | 'english'
  | 'unknown'

/**
 * Lightweight heuristic detector for common linguistic markers in Philippine queries.
 * The primary LLM prompt still handles generative zero-shot detection, while this
 * heuristic powers instant client-side route card formatting and chips.
 */
export function detectLanguageHint(text: string): SupportedLanguageHint {
  const lower = text.toLowerCase().trim()

  // 1. Bisaya / Cebuano markers (distinctive words)
  if (
    /\b(asa|padulong|padung|muagi|agian|dili|karon|luwas|aduna|unsa|unsaon|palihug)\b/i.test(lower) ||
    lower.includes('bawal ba muagi') ||
    lower.includes('padung sa') ||
    lower.includes('padulong sa') ||
    lower.includes('dili ba maagian') ||
    (lower.includes('dalan') && (lower.includes('asa') || lower.includes('karon') || lower.includes('luwas') || lower.includes('og')))
  ) {
    return 'bisaya'
  }

  // 2. Ilocano markers
  if (
    /\b(anya|ayan|layus|nalayus|lumabas|mapan|awan|adda|dagiti|apay|agsapul|mabalin kadi)\b/i.test(lower) ||
    lower.includes('adda kadi layus') ||
    lower.includes('mabalin kadi lumabas') ||
    lower.includes('mapan idiay') ||
    lower.includes('ayan ti')
  ) {
    return 'ilocano'
  }

  // 3. Kapampangan markers (distinctive words)
  if (
    /\b(nukarin|atin|albug|munta|muntang|kekami|kekatamu|keng|king|alayu|duman|bawal king|nanu|masanting)\b/i.test(
      lower
    ) ||
    lower.includes('atin bang') ||
    lower.includes('bawal bang duman') ||
    lower.includes('king dalan') ||
    lower.includes('munta king') ||
    lower.includes('dalan papuntang') ||
    (lower.includes('dalan') && (lower.includes('king') || lower.includes('keng') || lower.includes('munta') || lower.includes('albug')))
  ) {
    return 'kapampangan'
  }

  // 4. Hiligaynon / Ilonggo markers
  if (
    /\b(diin|pakadto|bala|subong|maagyan|waay|ari|palihog)\b/i.test(lower) ||
    lower.includes('baha bala') ||
    lower.includes('pwede bala maagyan')
  ) {
    return 'hiligaynon'
  }

  // 5. Waray markers
  if (/\b(hain|ngadto|waray|diri|hin|han|yana)\b/i.test(lower)) {
    return 'waray'
  }

  // 6. Bikol markers
  if (/\b(saen|papaduman|dae|bako|ngunyan|marhay)\b/i.test(lower) || lower.includes('baha daw')) {
    return 'bikol'
  }

  // 7. English markers (when purely English phrasing is used)
  if (
    /\b(where|route|directions|navigate|flood|flooded|safe|can i pass|is it clear|hospital|shelter|airport)\b/i.test(
      lower
    ) &&
    !/\b(ba|sa|ang|ng|mga|na|may|kay|ko|mo|si)\b/i.test(lower)
  ) {
    return 'english'
  }

  // 8. Tagalog / Taglish (common national lingua franca)
  if (
    /\b(saan|paano|baha|ligtas|kalsada|daan|punta|papunta|bawal|meron|wala|puwede|pede|mag-ingat)\b/i.test(
      lower
    ) ||
    lower.includes('bawal ba dumaan') ||
    lower.includes('may baha ba') ||
    lower.includes('baha ba')
  ) {
    return 'tagalog'
  }

  return 'unknown'
}

/**
 * Builds the comprehensive, additively extended multilingual system instruction for Gemini.
 */
export function buildMultilingualSystemPrompt(params: {
  userQuery: string
  currentLocation: string
  activeHazardsList?: string[]
  evacuationCenters?: string[]
  routeDetails?: {
    destinationName: string
    distanceKm: number
    durationMin: number
    isClear: boolean
  }
}): string {
  const { userQuery, currentLocation, activeHazardsList, evacuationCenters, routeDetails } = params

  return `You are GABAI, an official AI disaster navigation and public safety assistant in the Philippines.

CRITICAL MULTILINGUAL INSTRUCTIONS:
1. DETECT & MIRROR LANGUAGE:
   - Identify the user's language or Philippine regional language (e.g., Kapampangan, Bisaya / Cebuano, Ilocano, Hiligaynon, Waray, Bikol, Tagalog / Taglish, English, Pangasinan, etc.).
   - Respond in the EXACT SAME language or dialect the user writes in.
2. MID-CHAT LANGUAGE SWITCHING:
   - If the user changes language mid-conversation, immediately follow their lead and reply in their new language.
3. CONCISENESS & EMERGENCY TONE:
   - Keep replies short (1-2 sentences max).
   - Use simple, direct words suited for high-stress disaster situations.
4. STRICT GROUND-TRUTH & ENTITY INTEGRITY:
   - Use ONLY the verified ground-truth data below. NEVER hallucinate false floods, nonexistent road blocks, or exaggerated hazards.
   - PRESERVE PROPER NOUNS: Keep road names (e.g. "MacArthur Highway", "Jose Abad Santos Avenue"), place names ("San Fernando", "Clark", "San Mateo"), municipality names, and phone numbers ("911", "(045) 961-2468") EXACTLY as written. Do NOT translate or corrupt proper names.
   - If routeDetails are provided, the route is 100% verified flood-free by GABAI. Confirm it reassuringly.
5. ROAD PASSABILITY & CLOSURE QUERIES:
   - If the user asks whether they can pass through a road or place (e.g. "Bawal ba dumaan sa [Road]?", "Atin bang albug king [Road]?", "Can I pass [Road]?"):
     - If the road is in the verified active flood list: State clearly that it is flooded, impassable for light vehicles, and urge using a bypass route.
     - If the road is NOT in the active flood list: Confirm clearly that there are no active flood reports there and it is currently passable.
6. LOW CONFIDENCE / UNSUPPORTED DIALECT FALLBACK:
   - If you are NOT confident in a rare or unsupported language/dialect, reply in simple Tagalog or English, and briefly state so (e.g. "Sasagutin kita sa Tagalog/English upang matiyak ang kaligtasan ng impormasyon." or "Responding in English/Tagalog for accurate safety guidance."). Never fake fluency.

GROUND-TRUTH DATA:
- Current User Location: ${currentLocation}
${
  routeDetails
    ? `- Active Calculated Route: To ${routeDetails.destinationName} (${routeDetails.distanceKm.toFixed(
        1
      )} km · ~${routeDetails.durationMin} mins) — Status: Flood-Free & Verified Passable`
    : ''
}
- Verified Active Flood Road Segments: ${
    activeHazardsList && activeHazardsList.length > 0
      ? activeHazardsList.join('; ')
      : 'None (All major road corridors currently passable)'
  }
- Key Designated Evacuation Centers: ${(evacuationCenters || []).slice(0, 5).join(', ')}

User Query: "${userQuery}"

Provide a 1-2 sentence emergency-ready response in the user's language.`
}

/**
 * Localizes route confirmation cards for place queries & chips to mirror the user's language.
 */
export function formatLocalizedRouteCardText(
  targetName: string,
  distKm: number,
  durationMin: number,
  queryText: string
): string {
  const lang = detectLanguageHint(queryText)

  switch (lang) {
    case 'kapampangan':
      return `🧭 Menakit kung pekaligtas a dalan papuntang ${targetName} (${distKm.toFixed(
        1
      )} km · mga ${durationMin} mins). Kusang lilisanan ding mengalubug a dalan.`

    case 'bisaya':
      return `🧭 Nakakita ko og pinakaluwas nga ruta padulong sa ${targetName} (${distKm.toFixed(
        1
      )} km · mga ${durationMin} mins). Awtomatikong ginalikayan ang mga baha nga dalan.`

    case 'ilocano':
      return `🧭 Nakasarakak iti kaligtasan a rota mapan idiay ${targetName} (${distKm.toFixed(
        1
      )} km · agarup ${durationMin} mins). Awtomatiko a liklikan dagiti nalayus a kalsada.`

    case 'hiligaynon':
      return `🧭 Nakakita ako sang pinakaluwas nga rota pakadto sa ${targetName} (${distKm.toFixed(
        1
      )} km · mga ${durationMin} mins). Awtomatiko nga ginalikawan ang mga baha nga dalan.`

    case 'english':
      return `🧭 Found the safest route to ${targetName} (${distKm.toFixed(
        1
      )} km · approx ${durationMin} mins). Automatically bypassing flooded corridors.`

    case 'tagalog':
    default:
      return `🧭 Nakahanap ako ng pinakaligtas na ruta papuntang ${targetName} (${distKm.toFixed(
        1
      )} km · humigit-kumulang ${durationMin} mins). Awtomatikong iniiwasan ang mga bahang kalsada sa paligid.`
  }
}

/**
 * Localizes instant flood inquiry responses (e.g. "Bawal ba dumaan sa San Mateo?")
 */
export function formatLocalizedFloodResponse(params: {
  roadOrPlace: string
  isFlooded: boolean
  waterDepth?: string
  status?: string
  queryText: string
}): string {
  const { roadOrPlace, isFlooded, waterDepth, status, queryText } = params
  const lang = detectLanguageHint(queryText)

  if (isFlooded) {
    const depth = waterDepth || 'Knee Deep'
    const stat = status || 'Not Passable to Light Vehicles'

    switch (lang) {
      case 'kapampangan':
        return `⚠️ Bawal duman king ${roadOrPlace}! Atin albug (${depth}) at ${stat}. Gumamit kang alternatibong dalan.`
      case 'bisaya':
        return `⚠️ Dili puwede maagian ang ${roadOrPlace}! Adunay baha (${depth}) ug ${stat}. Palihug gamit og alternatibong ruta.`
      case 'ilocano':
        return `⚠️ Madi mabalin a pagnaan ti ${roadOrPlace}! Adda layus (${depth}) ken ${stat}. Agusar iti sabali a rota.`
      case 'english':
        return `⚠️ Caution: Flooding reported on ${roadOrPlace} (${depth}, ${stat}). Please take an alternate safe bypass route.`
      case 'tagalog':
      default:
        return `⚠️ Mag-ingat! Bawal dumaan sa ${roadOrPlace} dahil sa baha (${depth}). Katayuan: ${stat}. Gumamit ng alternatibong ligtas na ruta.`
    }
  } else {
    // Clear / safe
    switch (lang) {
      case 'kapampangan':
        return `✅ Ligtas duman king ${roadOrPlace}. Ala yang naiulat a albug king kasalukuyan at bukas ya karing saken.`
      case 'bisaya':
        return `✅ Luwas agian ang ${roadOrPlace}. Walay na-report nga baha karon ug maagian sa tanang sakyanan.`
      case 'ilocano':
        return `✅ Ligtas a pagnaan ti ${roadOrPlace}. Awan ti naipadamag a layus ita ken silulukat kadagiti lugan.`
      case 'english':
        return `✅ ${roadOrPlace} is clear and passable. There are currently no active flood hazard reports on this road.`
      case 'tagalog':
      default:
        return `✅ Ligtas at madaanan ang ${roadOrPlace}. Walang naiulat na aktibong baha sa kalsadang ito sa kasalukuyan.`
    }
  }
}

/**
 * Localizes general chatbot fallback message
 */
export function formatLocalizedFallback(targetQuery: string, queryText: string): string {
  const lang = detectLanguageHint(queryText)

  switch (lang) {
    case 'kapampangan':
      return `Maliari da kang saupan munta king ${targetQuery} o nukarin mang lugal king Pampanga. I-type mu ing kekang pupuntalan o mangutang tungkul king albug.`
    case 'bisaya':
      return `Andam ko motabang nimo padulong sa ${targetQuery} o bisan asang dapita. I-type ang imong destinasyon o pangutana bahin sa baha.`
    case 'ilocano':
      return `Mabalin ka a tulongan mapan idiay ${targetQuery} wenno uray ania a lugar. I-type ti destinasionmo wenno agdamag maipanggep iti layus.`
    case 'english':
      return `Ready to assist you with routes to "${targetQuery}" and flood-free navigation. You can ask for directions or current road flood conditions.`
    case 'tagalog':
    default:
      return `Handa akong gabayan ka patungo sa kahit saang lugar sa Pampanga tulad ng "${targetQuery}". Maaari kang magtanong ukol sa ligtas na ruta o baha.`
  }
}
