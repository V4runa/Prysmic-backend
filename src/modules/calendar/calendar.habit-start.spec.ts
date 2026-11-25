import { CalendarService } from './calendar.service';
import { CalendarHabitItem } from './calendar.types';
import { HabitFrequency } from '../../enums/habit-frequency.enum';

// 2026-11-25 01:30 UTC is 2026-11-24 20:30 in New York, after UTC midnight.
const CREATED_AT = new Date('2026-11-25T01:30:00.000Z');
const DAY = '2026-11-24';

function chainableQuery() {
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    getMany: () => Promise.resolve([]),
  };
  return builder;
}

function service(frequency: HabitFrequency) {
  return new CalendarService(
    { createQueryBuilder: () => chainableQuery() } as never,
    { find: () => Promise.resolve([]) } as never,
    {
      find: () =>
        Promise.resolve([
          {
            id: 7,
            userId: 101,
            name: 'Evening pages',
            color: 'amber',
            icon: 'flame',
            frequency,
            isActive: true,
            createdAt: CREATED_AT,
          },
        ]),
    } as never,
    { find: () => Promise.resolve([]) } as never,
    { find: () => Promise.resolve([]) } as never,
    { find: () => Promise.resolve([]) } as never,
  );
}

function habitDates(items: { source: string; date?: string }[]): string[] {
  return items
    .filter((item): item is CalendarHabitItem => item.source === 'habit')
    .map((item) => item.date);
}

describe('CalendarService daily habit start day', () => {
  it('includes an evening New York creation on that local day when tz is set', async () => {
    const feed = await service(HabitFrequency.DAILY).getFeed(
      101,
      DAY,
      DAY,
      'America/New_York',
    );

    expect(habitDates(feed.items)).toEqual([DAY]);
  });

  it('keeps the UTC creation day when no timezone is given', async () => {
    const feed = await service(HabitFrequency.DAILY).getFeed(101, DAY, DAY);

    expect(habitDates(feed.items)).toEqual([]);
  });

  it('still omits a weekly habit that has no check-in', async () => {
    const withZone = await service(HabitFrequency.WEEKLY).getFeed(
      101,
      DAY,
      '2026-11-25',
      'America/New_York',
    );
    const withoutZone = await service(HabitFrequency.WEEKLY).getFeed(
      101,
      DAY,
      '2026-11-25',
    );

    expect(habitDates(withZone.items)).toEqual([]);
    expect(habitDates(withoutZone.items)).toEqual([]);
  });
});
