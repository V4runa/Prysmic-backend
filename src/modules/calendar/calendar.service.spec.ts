import { FindOperator } from 'typeorm';
import { CalendarService } from './calendar.service';
import { CalendarTaskItem } from './calendar.types';

/**
 * In-memory stand-in for the task repository. `find` honors the criteria the
 * service passes (user, archive, completion, and inclusive timestamp bounds),
 * so a missing userId filter shows up as another user's task in the feed.
 * The other calendar sources are empty; this file only covers task placement.
 */

const USER_ID = 101;
const OTHER_USER_ID = 202;

const FROM = '2026-11-10';
const TO = '2026-11-12';

type StoredTask = {
  id: number;
  userId: number;
  title: string;
  priority: number;
  isComplete: boolean;
  isArchived: boolean;
  dueDate: Date | null;
  completedAt: Date | null;
};

type TaskClause = {
  userId?: number;
  isArchived?: boolean;
  isComplete?: boolean;
  dueDate?: FindOperator<Date>;
  completedAt?: FindOperator<Date>;
};

function at(iso: string): Date {
  return new Date(iso);
}

function inBetween(value: Date | null, operator: FindOperator<Date>): boolean {
  if (operator.type !== 'between') {
    throw new Error(`unexpected operator ${operator.type}`);
  }
  const bounds = operator.value as unknown;
  if (!Array.isArray(bounds) || bounds.length !== 2) {
    throw new Error('between operator is missing its bounds');
  }
  const [from, to] = bounds as [Date, Date];
  if (!(value instanceof Date)) return false;
  const time = value.getTime();
  return time >= from.getTime() && time <= to.getTime();
}

function matches(task: StoredTask, clause: TaskClause): boolean {
  if (clause.userId !== undefined && task.userId !== clause.userId)
    return false;
  if (
    clause.isArchived !== undefined &&
    task.isArchived !== clause.isArchived
  ) {
    return false;
  }
  if (
    clause.isComplete !== undefined &&
    task.isComplete !== clause.isComplete
  ) {
    return false;
  }
  if (
    clause.dueDate !== undefined &&
    !inBetween(task.dueDate, clause.dueDate)
  ) {
    return false;
  }
  if (
    clause.completedAt !== undefined &&
    !inBetween(task.completedAt, clause.completedAt)
  ) {
    return false;
  }
  return true;
}

function tasksFor(where: TaskClause | TaskClause[] | undefined): StoredTask[] {
  const clauses = Array.isArray(where) ? where : where ? [where] : [{}];
  const seen = new Set<number>();
  const found: StoredTask[] = [];
  for (const task of tasks) {
    if (!clauses.some((clause) => matches(task, clause))) continue;
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    found.push({ ...task });
  }
  return found;
}

const tasks: StoredTask[] = [
  {
    id: 1,
    userId: USER_ID,
    title: 'Finished with no due date',
    priority: 2,
    isComplete: true,
    isArchived: false,
    dueDate: null,
    completedAt: at('2026-11-10T16:00:00.000Z'),
  },
  {
    id: 2,
    userId: USER_ID,
    title: 'Due and finished the same day',
    priority: 3,
    isComplete: true,
    isArchived: false,
    dueDate: at('2026-11-10T00:00:00.000Z'),
    completedAt: at('2026-11-10T18:30:00.000Z'),
  },
  {
    id: 3,
    userId: USER_ID,
    title: 'Due one day, finished another',
    priority: 1,
    isComplete: true,
    isArchived: false,
    dueDate: at('2026-11-10T00:00:00.000Z'),
    completedAt: at('2026-11-12T15:00:00.000Z'),
  },
  {
    id: 4,
    userId: USER_ID,
    title: 'Still open',
    priority: 2,
    isComplete: false,
    isArchived: false,
    dueDate: at('2026-11-11T00:00:00.000Z'),
    completedAt: null,
  },
  {
    id: 5,
    userId: USER_ID,
    title: 'Done, but the completion time was never stored',
    priority: 2,
    isComplete: true,
    isArchived: false,
    dueDate: at('2026-11-11T00:00:00.000Z'),
    completedAt: null,
  },
  {
    id: 6,
    userId: USER_ID,
    title: 'Done with no due date and no completion time',
    priority: 2,
    isComplete: true,
    isArchived: false,
    dueDate: null,
    completedAt: null,
  },
  {
    id: 7,
    userId: USER_ID,
    title: 'Reopened, stale completion timestamp',
    priority: 2,
    isComplete: false,
    isArchived: false,
    dueDate: null,
    completedAt: at('2026-11-11T12:00:00.000Z'),
  },
  {
    id: 8,
    userId: USER_ID,
    title: 'Archived and finished in range',
    priority: 2,
    isComplete: true,
    isArchived: true,
    dueDate: at('2026-11-11T00:00:00.000Z'),
    completedAt: at('2026-11-11T12:00:00.000Z'),
  },
  {
    id: 9,
    userId: OTHER_USER_ID,
    title: 'Someone else finished this',
    priority: 3,
    isComplete: true,
    isArchived: false,
    dueDate: null,
    completedAt: at('2026-11-11T09:00:00.000Z'),
  },
  {
    id: 10,
    userId: OTHER_USER_ID,
    title: 'Someone else is due in range',
    priority: 3,
    isComplete: false,
    isArchived: false,
    dueDate: at('2026-11-11T00:00:00.000Z'),
    completedAt: null,
  },
  {
    id: 11,
    userId: USER_ID,
    title: 'Finished outside the window',
    priority: 2,
    isComplete: true,
    isArchived: false,
    dueDate: null,
    completedAt: at('2026-11-08T12:00:00.000Z'),
  },
  {
    id: 12,
    userId: USER_ID,
    title: 'Due in range, finished well outside it',
    priority: 2,
    isComplete: true,
    isArchived: false,
    dueDate: at('2026-11-12T00:00:00.000Z'),
    completedAt: at('2026-12-01T12:00:00.000Z'),
  },
  {
    id: 13,
    userId: USER_ID,
    title: 'Finished in range, due date is elsewhere',
    priority: 2,
    isComplete: true,
    isArchived: false,
    dueDate: at('2026-11-01T00:00:00.000Z'),
    completedAt: at('2026-11-11T08:00:00.000Z'),
  },
  {
    id: 14,
    userId: USER_ID,
    title: 'Finished on the widened day before the range',
    priority: 2,
    isComplete: true,
    isArchived: false,
    dueDate: null,
    completedAt: at('2026-11-09T12:00:00.000Z'),
  },
];

function chainableQuery() {
  const builder = {
    where: () => builder,
    andWhere: () => builder,
    getMany: () => Promise.resolve([]),
  };
  return builder;
}

function service(): CalendarService {
  return new CalendarService(
    { createQueryBuilder: () => chainableQuery() } as never,
    {
      find: (options?: { where?: TaskClause | TaskClause[] }) =>
        Promise.resolve(tasksFor(options?.where)),
    } as never,
    { find: () => Promise.resolve([]) } as never,
    { find: () => Promise.resolve([]) } as never,
    { find: () => Promise.resolve([]) } as never,
    { find: () => Promise.resolve([]) } as never,
  );
}

function taskItems(items: { source: string }[]): CalendarTaskItem[] {
  return items.filter(
    (item): item is CalendarTaskItem => item.source === 'task',
  );
}

function byId(items: CalendarTaskItem[], id: number): CalendarTaskItem[] {
  return items.filter((item) => item.id === id);
}

describe('CalendarService task feed', () => {
  it('includes a task completed in range with no due date, on that completion', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const rows = byId(taskItems(feed.items), 1);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      source: 'task',
      id: 1,
      title: 'Finished with no due date',
      priority: 2,
      isComplete: true,
      dueDate: '2026-11-10T16:00:00.000Z',
      completedAt: '2026-11-10T16:00:00.000Z',
      calendarReason: 'completed',
    });
  });

  it('returns one row when a task is due and completed on the same day', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const rows = byId(taskItems(feed.items), 2);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 2,
      isComplete: true,
      dueDate: '2026-11-10T00:00:00.000Z',
      completedAt: '2026-11-10T18:30:00.000Z',
      calendarReason: 'both',
    });
  });

  it('returns one row when the due day and the completion day both fall in range', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const rows = byId(taskItems(feed.items), 3);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 3,
      isComplete: true,
      dueDate: '2026-11-10T00:00:00.000Z',
      completedAt: '2026-11-12T15:00:00.000Z',
      calendarReason: 'both',
    });
  });

  it('keeps an open task on its due day and does not invent a completion', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const rows = byId(taskItems(feed.items), 4);

    expect(rows).toEqual([
      {
        source: 'task',
        id: 4,
        title: 'Still open',
        priority: 2,
        isComplete: false,
        dueDate: '2026-11-11T00:00:00.000Z',
        completedAt: null,
        calendarReason: 'due',
      },
    ]);
  });

  it('does not invent a completion day when completedAt was never stored', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const items = taskItems(feed.items);

    expect(byId(items, 5)).toEqual([
      expect.objectContaining({
        id: 5,
        isComplete: true,
        dueDate: '2026-11-11T00:00:00.000Z',
        completedAt: null,
        calendarReason: 'due',
      }),
    ]);
    expect(byId(items, 6)).toEqual([]);
  });

  it('excludes other users, archived tasks, reopened tasks, and completions outside the window', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const ids = taskItems(feed.items).map((item) => item.id);

    expect(ids).not.toContain(7);
    expect(ids).not.toContain(8);
    expect(ids).not.toContain(9);
    expect(ids).not.toContain(10);
    expect(ids).not.toContain(11);
    expect(ids.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 12, 13, 14]);
  });

  it('keeps the real due date when only the completion falls in the window', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const rows = byId(taskItems(feed.items), 13);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dueDate: '2026-11-01T00:00:00.000Z',
      completedAt: '2026-11-11T08:00:00.000Z',
      calendarReason: 'completed',
      isComplete: true,
    });
  });

  it('uses the same one-day widened window for completions as for due dates', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const rows = byId(taskItems(feed.items), 14);

    expect(rows).toHaveLength(1);
    expect(rows[0].calendarReason).toBe('completed');
    expect(rows[0].completedAt).toBe('2026-11-09T12:00:00.000Z');
  });

  it('reports a completion outside the window without a second row', async () => {
    const feed = await service().getFeed(USER_ID, FROM, TO);
    const rows = byId(taskItems(feed.items), 12);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      dueDate: '2026-11-12T00:00:00.000Z',
      completedAt: '2026-12-01T12:00:00.000Z',
      calendarReason: 'due',
      isComplete: true,
    });
  });
});
