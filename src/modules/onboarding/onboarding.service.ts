import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  MoodOption,
  defaultMoodOptionDrafts,
} from '../moods/mood-option.entity';

/**
 * Seeds the default mood palette for a newly registered user.
 *
 * Sample notes, tags, contracts, and tasks are not created. Accounts that
 * already have those rows keep them; this service does not read or delete
 * them. The tour's last step logs a mood, so a new account still needs the
 * palette before that step.
 *
 * Seeding is best-effort: a failure must never block signup, so errors are
 * logged and swallowed. The write goes through the repository directly to
 * avoid coupling AuthModule to MoodModule.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(MoodOption)
    private readonly moodOptions: Repository<MoodOption>,
  ) {}

  async seedDefaultMoods(userId: number): Promise<void> {
    try {
      const rows = defaultMoodOptionDrafts(userId).map((draft) =>
        this.moodOptions.create(draft),
      );
      await this.moodOptions.save(rows);
    } catch (err) {
      this.logger.error(
        `Failed to seed default moods for user ${userId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
