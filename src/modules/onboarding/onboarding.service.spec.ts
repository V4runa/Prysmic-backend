import { Repository } from 'typeorm';
import {
  DEFAULT_MOOD_OPTIONS,
  MoodOption,
  defaultMoodOptionDrafts,
} from '../moods/mood-option.entity';
import { OnboardingService } from './onboarding.service';

describe('OnboardingService default moods', () => {
  it('seeds the default palette for a new account', async () => {
    const rows: MoodOption[] = [];
    const repo = {
      create: (value: MoodOption) => value,
      save: (value: MoodOption[]) => {
        rows.push(...value);
        return Promise.resolve(value);
      },
    };
    const service = new OnboardingService(
      repo as unknown as Repository<MoodOption>,
    );
    await service.seedDefaultMoods(7);

    expect(rows).toEqual(defaultMoodOptionDrafts(7));
    expect(rows.map((mood) => mood.label)).toEqual(
      DEFAULT_MOOD_OPTIONS.map((mood) => mood.label),
    );
    expect(rows.every((mood) => mood.user.id === 7)).toBe(true);
  });

  it('does not block signup when the palette insert fails', async () => {
    const repo = {
      create: (value: MoodOption) => value,
      save: () => Promise.reject(new Error('palette unavailable')),
    };
    const service = new OnboardingService(
      repo as unknown as Repository<MoodOption>,
    );

    await expect(service.seedDefaultMoods(7)).resolves.toBeUndefined();
  });
});
