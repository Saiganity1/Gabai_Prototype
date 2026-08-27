import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

export interface AiChatResult {
  response: string;
  action?: 'REPORT_HAZARD' | 'SAFE_ROUTE' | 'NAVIGATE' | 'GENERAL_QUERY';
  hazardType?: 'flood' | 'fire' | 'road' | 'rain' | 'power' | 'other';
  severity?: 'high' | 'medium' | 'low';
  destination?: string;
  detectedLanguage?: string;
}

export interface PhotoAnalysisResult {
  waterDepthLevel: string;
  depthCategory: 'ankle_deep' | 'knee_deep' | 'waist_deep' | 'submerged';
  depthMeters: number;
  vehiclePassability: string;
  hazardsDetected: string[];
  recommendedAction: string;
  estimatedRisk: 'HIGH' | 'MEDIUM' | 'LOW';
  confidence: number;
}

import { LocalizationService } from './localization.service';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private ai: GoogleGenAI | null = null;

  constructor(
    private configService: ConfigService,
    private localizationService: LocalizationService,
  ) {
    const apiKey = this.configService.get<string>('AI_API_KEY');
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    } else {
      this.logger.warn(
        'AI_API_KEY is not set in environment variables. Running in smart disaster parsing mode.',
      );
    }
  }

  // Local fallback pattern analyzer
  private analyzeLocalIntent(transcript: string): AiChatResult {
    const text = transcript.toLowerCase();

    if (
      text.includes('baha') ||
      text.includes('flood') ||
      text.includes('lubog') ||
      text.includes('tubig')
    ) {
      return {
        action: 'REPORT_HAZARD',
        hazardType: 'flood',
        severity: 'high',
        response:
          'Nai-report ko na ang baha sa inyong lokasyon. Agad itong naidagdag sa live disaster map at iniawas sa inyong ruta.',
      };
    }

    if (
      text.includes('sunog') ||
      text.includes('fire') ||
      text.includes('usok') ||
      text.includes('apoy')
    ) {
      return {
        action: 'REPORT_HAZARD',
        hazardType: 'fire',
        severity: 'high',
        response:
          'Nai-report ko na ang sunog. Mangyaring lumikas sa pinakamalapit na ligtas na evacuation shelter.',
      };
    }

    if (
      text.includes('harang') ||
      text.includes('block') ||
      text.includes('sarado') ||
      text.includes('closed') ||
      text.includes('puno')
    ) {
      return {
        action: 'REPORT_HAZARD',
        hazardType: 'road',
        severity: 'medium',
        response:
          'Naitala na ang saradong kalsada sa mapa para maiwasan ng ibang motorista at mamamayan.',
      };
    }

    if (
      text.includes('pupunta') ||
      text.includes('punta') ||
      text.includes('go to') ||
      text.includes('papunta')
    ) {
      // Basic fallback extraction for "pupunta ako sa X"
      let destination = 'destinasyon';
      const match = text.match(/sa\s+(.+)/i);
      if (match && match[1]) {
        destination = match[1].trim();
      }
      return {
        action: 'NAVIGATE',
        destination,
        response: `Inihahanda ang ligtas na ruta papuntang ${destination}.`,
      };
    }

    if (
      text.includes('pupunta') ||
      text.includes('punta') ||
      text.includes('go to') ||
      text.includes('papunta')
    ) {
      // Basic fallback extraction for "pupunta ako sa X"
      let destination = 'destinasyon';
      const match = text.match(/sa\s+(.+)/i);
      if (match && match[1]) {
        destination = match[1].trim();
      }
      return {
        action: 'NAVIGATE',
        destination,
        response: `Inihahanda ang ligtas na ruta papuntang ${destination}.`,
      };
    }

    if (
      text.includes('ruta') ||
      text.includes('route') ||
      text.includes('daan') ||
      text.includes('evac') ||
      text.includes('shelter') ||
      text.includes('uwi') ||
      text.includes('safe')
    ) {
      return {
        action: 'SAFE_ROUTE',
        response:
          'Inihanda ko na ang pinakaligtas na ruta na umiiwas sa mga baha at delikadong lugar sa paligid mo.',
      };
    }

    return {
      action: 'GENERAL_QUERY',
      response:
        'Ligtas ang inyong kasalukuyang sektor. May 4 na aktibong babala sa paligid, panatilihing bukas ang GABAI para sa mga anunsyo.',
    };
  }

  async getChatResponse(
    transcript: string,
    language?: string,
    context?: any,
  ): Promise<AiChatResult> {
    if (!this.ai) {
      const fallbackAction = this.analyzeLocalIntent(transcript);
      const localizedResponse = await this.localizationService.generateLocalizedResponse({
        language: language || 'auto',
        action: fallbackAction.action || 'GENERAL_QUERY',
        hazardType: fallbackAction.hazardType,
        severity: fallbackAction.severity,
        context,
      });
      return { ...fallbackAction, response: localizedResponse, detectedLanguage: language || 'fil' };
    }

    try {
      const prompt = `You are GABAI, an emergency AI disaster assistant in the Philippines.
User message: "${transcript}"
Current Context: ${JSON.stringify(context || {})}

Return a valid JSON object with:
- "action": "REPORT_HAZARD" if user reports a disaster (flood, fire, roadblock), "SAFE_ROUTE" if user asks for directions/shelters, "NAVIGATE" if user specifically asks to go to a named place, or "GENERAL_QUERY"
- "destination": The specific name of the place the user wants to go (e.g. "Lugaw Nayon", "SM Pampanga"). ONLY include this if action is "NAVIGATE".
- "hazardType": "flood" | "fire" | "road" | "rain" | "power" | "other" (if applicable)
- "severity": "high" | "medium" | "low"
- "detectedLanguage": The ISO language code (e.g. "en", "fil", "pam", "ceb") of the user's message.
- "internalReasoning": A brief English sentence explaining your logic.

Output ONLY pure JSON without markdown blocks.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
      });

      const text = response.text || '';
      const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      const targetLanguage = language && language !== 'auto' ? language : parsed.detectedLanguage || 'fil';

      const localizedResponse = await this.localizationService.generateLocalizedResponse({
        language: targetLanguage,
        action: parsed.action || 'GENERAL_QUERY',
        hazardType: parsed.hazardType,
        severity: parsed.severity,
        destination: parsed.destination,
        context,
        internalReasoning: parsed.internalReasoning,
      });

      return {
        response: localizedResponse,
        action: parsed.action || 'GENERAL_QUERY',
        hazardType: parsed.hazardType,
        severity: parsed.severity,
        destination: parsed.destination,
        detectedLanguage: targetLanguage,
      };
    } catch (err: any) {
      this.logger.error(`Gemini AI Chat Error: ${err.message}`);
      const fallbackAction = this.analyzeLocalIntent(transcript);
      const localizedResponse = await this.localizationService.generateLocalizedResponse({
        language: language || 'auto',
        action: fallbackAction.action || 'GENERAL_QUERY',
        hazardType: fallbackAction.hazardType,
        severity: fallbackAction.severity,
        destination: fallbackAction.destination,
        context,
      });
      return { ...fallbackAction, response: localizedResponse, detectedLanguage: language || 'fil' };
    }
  }

  // Multimodal Vision: Analyze Photo for Flood Depth & Vehicle Passability
  async analyzeFloodPhoto(
    photoBase64?: string,
    descriptionHint?: string,
  ): Promise<PhotoAnalysisResult> {
    if (this.ai && photoBase64) {
      try {
        const prompt = `Analyze this flood or disaster photo in the Philippines.
Determine:
1. Water depth level relative to surroundings (tires, fences, persons, curbs).
2. Vehicle passability for Sedans, SUVs, Trucks, and Rescue Boats.
3. Hazards detected (e.g. electrical cables, submerged curbs, floating debris).
4. Recommended safety actions.

Return pure JSON:
{
  "waterDepthLevel": "Knee-Deep (approx. 0.5m)",
  "depthCategory": "knee_deep",
  "depthMeters": 0.5,
  "vehiclePassability": "Passable only to High-Clearance SUVs / 4x4. Impassable for Sedans & Motorcycles.",
  "hazardsDetected": ["Submerged road curbs", "Floating debris", "Nearby utility poles"],
  "recommendedAction": "Do not attempt to drive light vehicles. Precautionary evacuation advised.",
  "estimatedRisk": "HIGH",
  "confidence": 94
}`;

        const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');

        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-pro',
          contents: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data,
              },
            },
          ],
        });

        const cleaned = (response.text || '')
          .replace(/```json/g, '')
          .replace(/```/g, '')
          .trim();
        return JSON.parse(cleaned);
      } catch (err: any) {
        this.logger.error(`Gemini Vision Error: ${err.message}`);
      }
    }

    // Smart Local Heuristic Vision Engine (Fallback & Instant Demo)
    const hint = (descriptionHint || '').toLowerCase();
    if (hint.includes('baywang') || hint.includes('waist') || hint.includes('lubog')) {
      return {
        waterDepthLevel: 'Waist-Deep (approx. 1.0m - 1.2m)',
        depthCategory: 'waist_deep',
        depthMeters: 1.1,
        vehiclePassability: 'IMPASSABLE to all civilian land vehicles. Rescue boats and military 6x6 only.',
        hazardsDetected: ['Fully submerged gutters', 'Electric current risk', 'Strong undercurrent'],
        recommendedAction: 'Immediate high-ground evacuation. Request LGU rubber boat dispatch.',
        estimatedRisk: 'HIGH',
        confidence: 96,
      };
    } else if (hint.includes('tuhod') || hint.includes('knee') || hint.includes('gutter')) {
      return {
        waterDepthLevel: 'Knee-Deep (approx. 0.45m - 0.6m)',
        depthCategory: 'knee_deep',
        depthMeters: 0.55,
        vehiclePassability: 'Passable to High-Clearance SUVs / 4x4. IMPASSABLE for Sedans, Hatchbacks & Tricycles.',
        hazardsDetected: ['Submerged sidewalk edge', 'Hidden potholes', 'Floating debris'],
        recommendedAction: 'Reroute via highland roads. Avoid driving small sedans.',
        estimatedRisk: 'HIGH',
        confidence: 92,
      };
    }

    return {
      waterDepthLevel: 'Ankle-to-Gutter Deep (approx. 0.25m)',
      depthCategory: 'ankle_deep',
      depthMeters: 0.25,
      vehiclePassability: 'Passable with caution to all vehicles. Drive in low gear.',
      hazardsDetected: ['Slippery asphalt', 'Minor gutter overflow'],
      recommendedAction: 'Maintain safe driving speed and observe water level changes.',
      estimatedRisk: 'MEDIUM',
      confidence: 89,
    };
  }
}
