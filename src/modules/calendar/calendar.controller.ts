import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCalendarEventDto } from '../../dtos/create-calendar-event.dto';
import { UpdateCalendarEventDto } from '../../dtos/update-calendar-event.dto';
import { QueryCalendarDto } from '../../dtos/query-calendar.dto';

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private calendarService: CalendarService) {}

  /** Aggregated feed across events, tasks, habits, moods and notes. */
  @Get()
  getFeed(@Request() req, @Query() query: QueryCalendarDto) {
    return this.calendarService.getFeed(req.user.userId, query.from, query.to);
  }

  @Post('events')
  createEvent(@Request() req, @Body() dto: CreateCalendarEventDto) {
    return this.calendarService.createEvent(req.user.userId, dto);
  }

  @Get('events/:id')
  getEvent(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.calendarService.getEvent(id, req.user.userId);
  }

  @Patch('events/:id')
  updateEvent(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.updateEvent(id, req.user.userId, dto);
  }

  @Delete('events/:id')
  deleteEvent(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.calendarService.deleteEvent(id, req.user.userId);
  }
}
