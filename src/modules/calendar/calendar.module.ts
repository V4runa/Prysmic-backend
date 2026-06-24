import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarEvent } from './calendar-event.entity';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { Task } from '../tasks/tasks.entity';
import { Habit } from '../habits/habit.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Mood } from '../moods/mood.entity';
import { Note } from '../notes/notes.entity';

/**
 * The calendar owns its own events and reads (never writes) the other modules'
 * entities purely to aggregate them onto the grid. Registering those entities
 * here for read access avoids circular module dependencies.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CalendarEvent, Task, Habit, HabitCheck, Mood, Note]),
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
