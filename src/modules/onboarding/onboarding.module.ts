import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingService } from './onboarding.service';
import { Tag } from '../tags/tags.entity';
import { Note } from '../notes/notes.entity';
import { Habit } from '../habits/habit.entity';
import { Task } from '../tasks/tasks.entity';

/**
 * Standalone seeding module. It depends only on the TypeORM repositories for
 * the entities it seeds — deliberately NOT on the feature modules
 * (Tags/Notes/Habit/Task), since importing those alongside AuthModule creates a
 * circular dependency (Auth -> Onboarding -> Tags -> Notes -> User -> Auth).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Tag, Note, Habit, Task])],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
