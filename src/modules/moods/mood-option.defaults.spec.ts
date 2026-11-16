import { MoodOptionService } from './mood-option.service';
import { DEFAULT_MOOD_OPTIONS, MoodOption } from './mood-option.entity';

const PALETTE = [
  'amber',
  'cyan',
  'blue',
  'violet',
  'rose',
  'emerald',
  'yellow',
  'slate',
  'red',
  'fuchsia',
];

describe('default mood palette', () => {
  it('adds Content and Reflective among the existing tokens', () => {
    expect(DEFAULT_MOOD_OPTIONS.map((mood) => mood.label)).toEqual([
      'Joyful',
      'Content',
      'Calm',
      'Focused',
      'Tired',
      'Anxious',
      'Inspired',
      'Reflective',
      'Grateful',
      'Lonely',
      'Angry',
      'Hopeful',
    ]);
    expect(
      DEFAULT_MOOD_OPTIONS.find((mood) => mood.label === 'Content'),
    ).toEqual({ label: 'Content', emoji: '🍃', color: 'emerald' });
    expect(
      DEFAULT_MOOD_OPTIONS.find((mood) => mood.label === 'Reflective'),
    ).toEqual({ label: 'Reflective', emoji: '🪞', color: 'slate' });
    for (const mood of DEFAULT_MOOD_OPTIONS) {
      expect(PALETTE).toContain(mood.color);
    }
  });

  it('seeds an empty palette and leaves an existing list untouched', async () => {
    const rows: MoodOption[] = [];
    let seq = 0;
    const repo = {
      create(partial: Partial<MoodOption>): MoodOption {
        return { id: 0, sortOrder: 0, ...partial } as MoodOption;
      },
      save(
        entity: MoodOption | MoodOption[],
      ): Promise<MoodOption | MoodOption[]> {
        const list = Array.isArray(entity) ? entity : [entity];
        for (const item of list) {
          if (!item.id) {
            seq += 1;
            item.id = seq;
            rows.push(item);
          }
        }
        return Promise.resolve(entity);
      },
      find(options?: {
        where?: { user?: { id?: number } };
      }): Promise<MoodOption[]> {
        const userId = options?.where?.user?.id;
        return Promise.resolve(
          rows
            .filter((row) => row.user?.id === userId)
            .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
        );
      },
    };
    const service = new MoodOptionService(repo as never);

    const seeded = await service.getAll(4);
    expect(seeded.map((mood) => mood.label)).toEqual(
      DEFAULT_MOOD_OPTIONS.map((mood) => mood.label),
    );

    rows.push({
      id: 50,
      label: 'Joyful',
      emoji: '☀️',
      color: 'amber',
      sortOrder: 0,
      user: { id: 9 },
    } as MoodOption);
    const existing = await service.getAll(9);
    expect(existing.map((mood) => mood.label)).toEqual(['Joyful']);
    expect(rows.filter((row) => row.user?.id === 9)).toHaveLength(1);
  });
});
