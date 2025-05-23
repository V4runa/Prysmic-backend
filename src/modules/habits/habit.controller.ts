import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { HabitService } from './habit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateHabitDto } from '../../dtos/create-habit.dto';
import { UpdateHabitDto } from '../../dtos/update-habit.dto';

@Controller('habits')
@UseGuards(JwtAuthGuard)
export class HabitController {
  constructor(private habitService: HabitService) {}

  @Post()
  create(@Request() req, @Body() dto: CreateHabitDto) {
    return this.habitService.createHabit(req.user, dto);
  }

  @Get()
  getAll(@Request() req) {
    return this.habitService.getHabits(req.user);
  }

  @Get(':id')
  getOne(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.habitService.getHabitById(id, req.user);
  }

  @Put(':id')
  update(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHabitDto) {
    return this.habitService.updateHabit(id, req.user, dto);
  }

  @Delete(':id')
  delete(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.habitService.deleteHabit(id, req.user);
  }

  @Post(':id/check')
  toggleCheck(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.habitService.toggleCheck(id, req.user);
  }
}
