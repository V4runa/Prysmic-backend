import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from '../notes/notes.entity';
import { User } from '../users/user.entity';
import { FamiliarEngineService } from './familiar-engine.service';
import { SummarizeNoteDto } from '../../dtos/summarize-note.dto';
import { WeeklyDigestDto } from '../../dtos/weekly-digest.dto';
import { FreeformEvokeDto } from '../../dtos/freeform-evoke.dto';
import { ExportChatDto } from '../../dtos/export-chat.dto';

import OpenAI from 'openai';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class AiService {
  private readonly openai: OpenAI;

  constructor(
    private readonly engine: FamiliarEngineService,
    @InjectRepository(Note) private noteRepo: Repository<Note>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async summarizeNote(dto: SummarizeNoteDto) {
    const prompt = this.engine.getSummarizePrompt(dto.noteContent);
    return this.callOpenAi(prompt);
  }

  async generateWeeklyDigest(dto: WeeklyDigestDto) {
    const prompt = this.engine.getWeeklyDigestPrompt(dto.noteContents);
    return this.callOpenAi(prompt);
  }

  async evokeFamiliar(dto: FreeformEvokeDto) {
    const prompt = this.engine.getFreeformPrompt(dto.input, dto.familiarName);
    return this.callOpenAi(prompt);
  }

  async exportChatSummary(dto: ExportChatDto) {
    const prompt = this.engine.getChatExportPrompt(dto.dialogue);
    return this.callOpenAi(prompt);
  }

  private async callOpenAi(prompt: string): Promise<{ result: string }> {
    const res = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a poetic, wise inner voice that helps users reflect and grow.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.8,
      max_tokens: 500,
    });

    const result = res.choices[0].message?.content?.trim() || '';
    return { result };
  }
}
