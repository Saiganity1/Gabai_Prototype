import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

export interface LocalizationParams {
  language: string;
  action: string;
  hazardType?: string;
  severity?: string;
  context?: any;
  internalReasoning?: string;
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

    if (lang === 'en') return 'Your current sector is safe. Please keep GABAI open for live updates.';
    return 'Ligtas ang inyong kasalukuyang sektor. Panatilihing bukas ang GABAI para sa mga anunsyo.';
  }

  async generateLocalizedResponse(params: LocalizationParams): Promise<string> {
    if (!this.ai) {
      return this.generateFallback(params);
    }

    // Default to Filipino if auto or not provided
    const targetLang = params.language === 'auto' || !params.language ? 'Filipino/Tagalog' : 
                       params.language === 'en' ? 'English' : 
                       params.language === 'pam' ? 'Kapampangan' : 
                       params.language === 'ceb' ? 'Cebuano' : 'Filipino/Tagalog';

    try {
      const prompt = `You are the localization engine for GABAI, an emergency AI disaster assistant.
Convert the following structured emergency decision into a natural, spoken response in ${targetLang}.

Context Data:
- Action Taken: ${params.action}
- Hazard Type: ${params.hazardType || 'none'}
- Severity: ${params.severity || 'none'}
- Context Info: ${JSON.stringify(params.context || {})}
- Internal Reasoning: ${params.internalReasoning || 'none'}

Rules:
1. Preserve road names, place names, distances, and warnings. Do not translate proper nouns (e.g., "Mabini Road" stays "Mabini Road").
2. Keep the response concise, clear, and unambiguous (1-2 sentences max).
3. Focus on motorist safety.
4. Respond ONLY with the translated text. Do not add quotes, formatting, or extra explanations.`;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return (response.text || '').trim() || this.generateFallback(params);
    } catch (err: any) {
      this.logger.error(`Localization AI Error: ${err.message}`);
      return this.generateFallback(params);
    }
  }
}
