import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { TagsModule } from '../tags/tags.module';
import { NotesModule } from '../notes/notes.module';
import { HabitModule } from '../habits/habit.module';
import { TaskModule } from '../tasks/tasks.module';

@Module({
  imports: [TagsModule, NotesModule, HabitModule, TaskModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
