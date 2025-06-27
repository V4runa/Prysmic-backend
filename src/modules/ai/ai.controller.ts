import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SummarizeNoteDto } from '../../dtos/summarize-note.dto';
import { WeeklyDigestDto } from '../../dtos/weekly-digest.dto';
import { FreeformEvokeDto } from '../../dtos/freeform-evoke.dto';
import { ExportChatDto } from '../../dtos/export-chat.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('summarize')
  summarizeNote(@Body() dto: SummarizeNoteDto) {
    return this.aiService.summarizeNote(dto);
  }

  @Post('weekly-digest')
  weeklyDigest(@Body() dto: WeeklyDigestDto) {
    return this.aiService.generateWeeklyDigest(dto);
  }

  @Post('evoke')
  evokeFamiliar(@Body() dto: FreeformEvokeDto) {
    return this.aiService.evokeFamiliar(dto);
  }

  @Post('export-chat-summary')
  exportChat(@Body() dto: ExportChatDto) {
    return this.aiService.exportChatSummary(dto);
  }
}
