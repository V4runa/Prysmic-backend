import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Put,
} from '@nestjs/common';
import { HabitService } from './habit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('habits')
@UseGuards(JwtAuthGuard)
export class HabitController {
  constructor(private habitService: HabitService) {}

  @Post()
  createHabit(
    @Request() req,
    @Body() body: { name: string; description?: string },
  ) {
    return this.habitService.createHabit(req.user, body.name, body.description);
  }

  @Post(':id/check')
  toggleCheck(@Request() req, @Param('id') id: number) {
    return this.habitService.toggleCheck(id, req.user);
  }

  @Get()
  getHabits(@Request() req) {
    return this.habitService.getHabits(req.user);
  }

  @Get(':id')
  getHabit(@Request() req, @Param('id') id: number) {
    return this.habitService.getHabitById(id, req.user);
  }

  @Put(':id')
  updateHabit(
    @Request() req,
    @Param('id') id: number,
    @Body()
    updates: { name?: string; description?: string; isActive?: boolean },
  ) {
    return this.habitService.updateHabit(id, req.user, updates);
  }

  @Delete(':id')
  deleteHabit(@Request() req, @Param('id') id: number) {
    return this.habitService.deleteHabit(id, req.user);
  }
}
