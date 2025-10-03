// src/modules/moods/mood.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
  Delete,
  Param,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MoodService } from './mood.service';
import { CreateMoodDto } from '../../dtos/create-mood.dto';

@UseGuards(JwtAuthGuard)
@Controller('moods')
export class MoodController {
  constructor(private readonly moodService: MoodService) {}

  /**
   * Get the user's mood for today
   */
  @Get('today')
  getToday(@Req() req: Request) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodService.getToday(userId);
  }

  /**
   * Create or update today's mood (forgiveness design)
   */
  @Post()
  @HttpCode(200)
  createOrUpdate(@Req() req: Request, @Body() dto: CreateMoodDto) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodService.createOrUpdateToday(userId, dto);
  }

  /**
   * Get last 10 mood entries
   */
  @Get('history')
  getHistory(@Req() req: Request) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodService.getHistory(userId);
  }

  /**
   * Get all moods (for dev/debug or full analytics use)
   */
  @Get()
  getAll(@Req() req: Request) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodService.getAll(userId);
  }

  /**
   * Delete a mood by ID
   */
  @Delete(':id')
  deleteOne(@Req() req: Request, @Param('id') id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodService.deleteById(userId, id);
  }
}
