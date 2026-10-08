/**
 * Multilingual Co-Pilot Test Suite
 * Tests language detection, localized route cards, passability queries,
 * mid-chat switching, prompt synthesis, and unsupported dialect fallbacks.
 */

import {
  detectLanguageHint,
  formatLocalizedRouteCardText,
  formatLocalizedFloodResponse,
  buildMultilingualSystemPrompt,
  formatLocalizedFallback,
} from './multilingualCoPilot.ts'

interface TestCaseResult {
  name: string
  passed: boolean
  input: string
  output: string
  details?: string
}

export function runMultilingualTestSuite(): TestCaseResult[] {
  const results: TestCaseResult[] = []

  // 1. Language Detection & Mirroring Tests
  const detectionCases = [
    { input: 'Atin bang albug king MacArthur Highway?', expected: 'kapampangan', label: 'Kapampangan Hazard Query' },
    { input: 'Nukarin ing dalan munta SM City Pampanga?', expected: 'kapampangan', label: 'Kapampangan Route Query' },
    { input: 'Asa ang dalan padulong sa Clark Airport?', expected: 'bisaya', label: 'Bisaya Route Query' },
    { input: 'Baha ba sa dalan karon?', expected: 'bisaya', label: 'Bisaya Hazard Query' },
    { input: 'Ayan ti kalsada mapan iti ospital?', expected: 'ilocano', label: 'Ilocano Route Query' },
    { input: 'Adda kadi layus kadagiti kalsada ita?', expected: 'ilocano', label: 'Ilocano Hazard Query' },
    { input: 'May baha ba papuntang San Fernando?', expected: 'tagalog', label: 'Tagalog Hazard Query' },
    { input: 'Where is the safest route to Clark Airport?', expected: 'english', label: 'English Route Query' },
  ]

  for (const tc of detectionCases) {
    const detected = detectLanguageHint(tc.input)
    results.push({
      name: `Detection: ${tc.label}`,
      passed: detected === tc.expected,
      input: tc.input,
      output: `Detected: ${detected}`,
      details: `Expected: ${tc.expected}`,
    })
  }

  // 2. "Bawal ba dumaan sa San Mateo?" in Several Languages
  const passabilityCases = [
    {
      query: 'Bawal ba dumaan sa San Mateo?',
      lang: 'Tagalog',
      isFlooded: true,
      containsKeywords: ['Mag-ingat', 'Bawal dumaan sa San Mateo', 'baha'],
    },
    {
      query: 'Bawal bang duman king San Mateo?',
      lang: 'Kapampangan',
      isFlooded: true,
      containsKeywords: ['Bawal duman king San Mateo', 'albug'],
    },
    {
      query: 'Bawal ba muagi sa San Mateo?',
      lang: 'Bisaya',
      isFlooded: true,
      containsKeywords: ['Dili puwede maagian', 'San Mateo', 'baha'],
    },
    {
      query: 'Mabalin kadi lumabas idiay San Mateo?',
      lang: 'Ilocano',
      isFlooded: true,
      containsKeywords: ['Madi mabalin a pagnaan', 'San Mateo', 'layus'],
    },
    {
      query: 'Can I pass through San Mateo?',
      lang: 'English',
      isFlooded: true,
      containsKeywords: ['Caution: Flooding reported on San Mateo', 'bypass route'],
    },
    // Clear road variants
    {
      query: 'Bawal ba dumaan sa San Mateo?',
      lang: 'Tagalog (Clear)',
      isFlooded: false,
      containsKeywords: ['Ligtas at madaanan ang San Mateo', 'Walang naiulat na aktibong baha'],
    },
    {
      query: 'Bawal bang duman king San Mateo?',
      lang: 'Kapampangan (Clear)',
      isFlooded: false,
      containsKeywords: ['Ligtas duman king San Mateo', 'Ala yang naiulat a albug'],
    },
    {
      query: 'Can I pass through San Mateo?',
      lang: 'English (Clear)',
      isFlooded: false,
      containsKeywords: ['San Mateo is clear and passable', 'no active flood hazard reports'],
    },
  ]

  for (const tc of passabilityCases) {
    const response = formatLocalizedFloodResponse({
      roadOrPlace: 'San Mateo',
      isFlooded: tc.isFlooded,
      waterDepth: 'Knee Deep (0.45m)',
      status: 'Impassable to Light Vehicles',
      queryText: tc.query,
    })
    const passed = tc.containsKeywords.every((kw) => response.includes(kw))
    results.push({
      name: `Passability Check [${tc.lang}]: "${tc.query}"`,
      passed,
      input: tc.query,
      output: response,
      details: passed ? 'All localized key phrases verified' : `Missing phrases in: ${response}`,
    })
  }

  // 3. Localized Route Cards for Chips & Places
  const routeCardCases = [
    { query: 'Nukarin ing dalan munta Clark Airport', expectedKeyword: 'Menakit kung pekaligtas a dalan', lang: 'Kapampangan' },
    { query: 'Asa ang dalan padulong SM City Pampanga', expectedKeyword: 'Nakakita ko og pinakaluwas nga ruta', lang: 'Bisaya' },
    { query: 'Ayan ti kalsada mapan San Fernando', expectedKeyword: 'Nakasarakak iti kaligtasan a rota', lang: 'Ilocano' },
    { query: 'Find route to Clark International Airport', expectedKeyword: 'Found the safest route', lang: 'English' },
    { query: 'Papunta sa San Luis Freedom Park', expectedKeyword: 'Nakahanap ako ng pinakaligtas na ruta', lang: 'Tagalog' },
  ]

  for (const rc of routeCardCases) {
    const cardText = formatLocalizedRouteCardText('Destination', 12.4, 25, rc.query)
    const passed = cardText.includes(rc.expectedKeyword)
    results.push({
      name: `Route Card [${rc.lang}]: "${rc.query}"`,
      passed,
      input: rc.query,
      output: cardText,
      details: passed ? 'Mirrored route card format verified' : `Unexpected: ${cardText}`,
    })
  }

  // 4. Mid-Chat Language Switching & System Instruction Prompt Verification
  const prompt = buildMultilingualSystemPrompt({
    userQuery: 'Asa man ang luwas nga dalan?',
    currentLocation: 'San Fernando, Pampanga',
    activeHazardsList: ['MacArthur Highway (Knee Deep)'],
    evacuationCenters: ['San Fernando Central Evacuation Center'],
  })

  const promptChecks = [
    { label: 'Prompt contains Language Mirroring instruction', check: prompt.includes('DETECT & MIRROR LANGUAGE') },
    { label: 'Prompt contains Mid-Chat Switching instruction', check: prompt.includes('MID-CHAT LANGUAGE SWITCHING') },
    { label: 'Prompt contains Entity Integrity (proper noun preservation)', check: prompt.includes('ENTITY INTEGRITY') },
    { label: 'Prompt contains Low Confidence / Unsupported Dialect Fallback', check: prompt.includes('LOW CONFIDENCE / UNSUPPORTED DIALECT FALLBACK') },
    { label: 'Prompt contains Road Passability Query Handling', check: prompt.includes('ROAD PASSABILITY & CLOSURE QUERIES') },
  ]

  for (const pc of promptChecks) {
    results.push({
      name: `Prompt Architecture: ${pc.label}`,
      passed: pc.check,
      input: 'Prompt Specification',
      output: pc.check ? 'Verified present in prompt' : 'Missing from prompt',
    })
  }

  // 5. Unsupported Dialect Fallback Test
  const fallbackText = formatLocalizedFallback('Batanes Shelter', 'Kallahan / rare dialect input query text')
  results.push({
    name: 'Unsupported Dialect Fallback',
    passed: fallbackText.length > 0 && fallbackText.includes('Batanes Shelter'),
    input: 'Kallahan dialect query',
    output: fallbackText,
    details: 'Gracefully fell back to clear lingua franca guidance',
  })

  return results
}
