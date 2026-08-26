import { Controller, Post, Body } from '@nestjs/common';
import { IsString, IsOptional } from 'class-validator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiService } from './ai.service';

export class ChatRequestDto {
  @IsString()
  transcript: string;

  @IsOptional()
  context?: any;
}

export class AnalyzePhotoDto {
  @IsOptional()
  @IsString()
  photoBase64?: string;

  @IsOptional()
  @IsString()
  descriptionHint?: string;

  @IsOptional()
  @IsString()
  location?: string;
}

@ApiTags('AI Intelligence')
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI Voice & Chat Intent Classifier' })
  async chat(@Body() body: ChatRequestDto) {
    const result = await this.aiService.getChatResponse(
      body.transcript,
      body.context,
    );
    return result;
  }

  @Post('analyze-photo')
  @ApiOperation({ summary: 'Multimodal AI Photo Vision: Flood Depth & Vehicle Passability' })
  async analyzePhoto(@Body() body: AnalyzePhotoDto) {
    const result = await this.aiService.analyzeFloodPhoto(
      body.photoBase64,
      body.descriptionHint,
    );
    return result;
  }
}
