import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoodOption } from '../moods/mood-option.entity';
import { OnboardingService } from './onboarding.service';

/**
 * Seeds the default mood palette at signup. It depends only on that
 * repository, not on MoodModule, because importing the feature module from
 * AuthModule cycles through UserModule.
 */
@Module({
  imports: [TypeOrmModule.forFeature([MoodOption])],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
