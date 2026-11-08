import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EXPORT_BUDGET, EXPORT_BUDGET_TOKEN } from './export.constants';
import { CalendarEvent } from '../calendar/calendar-event.entity';
import { HabitCheck } from '../habits/habit-check.entity';
import { Habit } from '../habits/habit.entity';
import { MoodOption } from '../moods/mood-option.entity';
import { Mood } from '../moods/mood.entity';
import { NoteAttachment } from '../notes/note-attachment.entity';
import { Note } from '../notes/notes.entity';
import { Tag } from '../tags/tags.entity';
import { Task } from '../tasks/tasks.entity';
import { User } from '../users/user.entity';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Note,
      NoteAttachment,
      Tag,
      Task,
      Habit,
      HabitCheck,
      Mood,
      MoodOption,
      CalendarEvent,
    ]),
  ],
  controllers: [ExportController],
  providers: [
    ExportService,
    { provide: EXPORT_BUDGET_TOKEN, useValue: EXPORT_BUDGET },
  ],
})
export class ExportModule {}
