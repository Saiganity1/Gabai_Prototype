import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

export interface LocalizationParams {
  language: string;
  action: string;
  hazardType?: string;
  severity?: string;
  destination?: string;
  context?: any;
  internalReasoning?: string;
  transcript?: string;
}

@Injectable()
export class LocalizationService {
  private readonly logger = new Logger(LocalizationService.name);
  private ai: GoogleGenAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('AI_API_KEY');
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  // Fallback static localization
  private generateFallback(params: LocalizationParams): string {
    const lang = params.language === 'en' ? 'en' : 'fil';
    
    if (params.action === 'REPORT_HAZARD') {
      const hazardMapEn: any = { flood: 'flood', fire: 'fire', road: 'roadblock' };
      const hazardMapFil: any = { flood: 'baha', fire: 'sunog', road: 'harang sa kalsada' };
      const hTypeEn = hazardMapEn[params.hazardType || 'flood'] || 'hazard';
      const hTypeFil = hazardMapFil[params.hazardType || 'flood'] || 'sakuna';

      if (lang === 'en') return `I have recorded the ${hTypeEn} report at your location. The map has been updated.`;
      return `Nai-report ko na ang ${hTypeFil} sa inyong lokasyon. Na-update na ang mapa.`;
    }

    if (params.action === 'SAFE_ROUTE') {
      if (lang === 'en') return 'I am calculating the safest route avoiding known hazards.';
      return 'Inihanda ko na ang pinakaligtas na ruta na umiiwas sa mga baha at delikadong lugar.';
    }

    if (params.action === 'NAVIGATE') {
      const dest = params.destination || 'iyong destinasyon';
      if (lang === 'en') return `Navigating to ${dest}. I am preparing the safest route.`;
      return `Naghahanap ng ligtas na ruta papuntang ${dest}.`;
    }

    if (lang === 'en') return 'Your current sector is safe. Please keep GABAI open for live updates.';
    return 'Ligtas ang inyong kasalukuyang sektor. Panatilihing bukas ang GABAI para sa mga anunsyo.';
  }

  async generateLocalizedResponse(params: LocalizationParams): Promise<string> {
    if (!this.ai) {
      return this.generateFallback(params);
    }

    // Default to the original language/dialect from the transcript
    const targetLang = 'the EXACT SAME LANGUAGE and DIALECT the user used in their message';

    try {
      const prompt = `You are GABAI, an emergency AI disaster chatbot assistant in the Philippines.
The user said: "${params.transcript || 'Unknown'}"
The system classified this intent as: ${params.action}

Context Data:
- Hazard Type: ${params.hazardType || 'none'}
- Severity: ${params.severity || 'none'}
- Destination: ${params.destination || 'none'}
- Context Info: ${JSON.stringify(params.context || {})}
- Internal Reasoning: ${params.internalReasoning || 'none'}

Your task is to generate a conversational, helpful, and natural response directly to the user in ${targetLang}.

STRICT CHATBOT RULES:
1. You MUST act as an emergency/disaster/navigation assistant.
2. If the system intent is "GENERAL_QUERY" or the user asks an OFF-TOPIC question (e.g., jokes, general trivia, coding, history, chitchat not related to safety/navigation/disasters), you MUST firmly but politely refuse to answer and state that you are an emergency disaster assistant.
3. If the user asks a relevant question (e.g., "Saan may baha?", "Saan ang safe na daan?"), answer it helpfully using the Context Data.
4. Keep the response concise (1-3 sentences max). Focus on safety and clarity.
5. Respond ONLY with the translated conversational text. Do not add quotes, formatting, or extra explanations.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: prompt,
      });

      return (response.text || '').trim() || this.generateFallback(params);
    } catch (err: any) {
      this.logger.error(`Localization AI Error: ${err.message}`);
      return this.generateFallback(params);
    }
  }
}
