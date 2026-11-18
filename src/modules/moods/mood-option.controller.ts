// src/modules/moods/mood-option.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ParseEntityIdPipe } from '../../common/parse-entity-id.pipe';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MoodOptionService } from './mood-option.service';
import { CreateMoodOptionDto } from '../../dtos/create-mood-option.dto';
import { UpdateMoodOptionDto } from '../../dtos/update-mood-option.dto';

@UseGuards(JwtAuthGuard)
@Controller('mood-options')
export class MoodOptionController {
  constructor(private readonly moodOptionService: MoodOptionService) {}

  @Get()
  getAll(@Req() req: Request) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodOptionService.getAll(userId);
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateMoodOptionDto) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodOptionService.create(userId, dto);
  }

  @Put(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseEntityIdPipe) id: number,
    @Body() dto: UpdateMoodOptionDto,
  ) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodOptionService.update(userId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id', ParseEntityIdPipe) id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.moodOptionService.remove(userId, id);
  }
}
