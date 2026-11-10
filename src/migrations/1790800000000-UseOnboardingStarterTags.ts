import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Puts the unused starter tags on the sample rows that still match the seed.
 *
 * Gratitude is added to "A thought worth keeping" after that note's opening
 * line changes from "an idea" to "a good moment". The rest of the note stays.
 * Someday is added to "An idea I'm still working on" and to "Forge your
 * first Contract". Reflections and Ideas stay where they are.
 *
 * A row is changed only when its copy still matches and its tags are still
 * the seeded set. The tag being added must still have its seeded name and
 * color on that same user. Any other edit — copy, an extra tag, a removed
 * tag, a renamed tag, or a recolored tag — leaves that row alone. Tag rows
 * are not created or deleted. Pins, priority, completion, and timestamps are
 * not written.
 *
 * Rolling back removes those links and restores the previous sentence only
 * when the row still matches that result exactly.
 */

export const starterTag = {
  reflections: { name: 'Reflections', color: 'cyan' },
  ideas: { name: 'Ideas', color: 'violet' },
  gratitude: { name: 'Gratitude', color: 'emerald' },
  someday: { name: 'Someday', color: 'amber' },
} as const;

type TagSeed = { name: string; color: string };

export const gratitudeSampleNote = {
  title: 'A thought worth keeping',
  from:
    'When an idea feels worth keeping, write it down here so you can ' +
    'find it later.\n\nTry it now: edit this note, or tag it ' +
    'differently. These samples are yours to change or delete.',
  to:
    'When a good moment feels worth keeping, write it down here so you can ' +
    'find it later.\n\nTry it now: edit this note, or tag it ' +
    'differently. These samples are yours to change or delete.',
};

export const somedaySampleNote = {
  title: "An idea I'm still working on",
  content:
    "You don't need a finished thought to start a note. Write the " +
    'idea down as it is.\n\nThis note is tagged Ideas — open the Tag ' +
    'Codex to see how tags help you find notes later.',
};

export const somedaySampleTask = {
  title: 'Forge your first Contract',
  description:
    'Head to Contracts and commit to one small thing, daily. Watch ' +
    'the streak grow.',
};

export class UseOnboardingStarterTags1790800000000
  implements MigrationInterface
{
  name = 'UseOnboardingStarterTags1790800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(...linkGratitudeNote('up'));
    await queryRunner.query(...linkSomedayNote('up'));
    await queryRunner.query(...linkSomedayTask('up'));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(...linkSomedayTask('down'));
    await queryRunner.query(...linkSomedayNote('down'));
    await queryRunner.query(...linkGratitudeNote('down'));
  }
}

class Params {
  readonly values: unknown[] = [];

  add(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function statement(sql: string, params: Params): [string, unknown[]] {
  return [sql, params.values];
}

function noteHasExactTags(
  params: Params,
  noteAlias: string,
  tags: readonly TagSeed[],
): string {
  const pairs = tags
    .map((tag) => `(${params.add(tag.name)}, ${params.add(tag.color)})`)
    .join(', ');
  const count = String(tags.length);
  return `(
    (SELECT COUNT(*)::int FROM "note_tags" owned_link
      WHERE owned_link."notesId" = ${noteAlias}.id) = ${count}
    AND (SELECT COUNT(*)::int FROM "note_tags" owned_link
      INNER JOIN "tags" owned ON owned.id = owned_link."tagsId"
      WHERE owned_link."notesId" = ${noteAlias}.id
        AND owned."userId" = ${noteAlias}."userId"
        AND (owned.name, owned.color) IN (${pairs})) = ${count}
  )`;
}

function linkGratitudeNote(direction: 'up' | 'down'): [string, unknown[]] {
  const params = new Params();
  if (direction === 'up') {
    const next = params.add(gratitudeSampleNote.to);
    const title = params.add(gratitudeSampleNote.title);
    const previous = params.add(gratitudeSampleNote.from);
    const exact = noteHasExactTags(params, 'n', [starterTag.reflections]);
    const tagName = params.add(starterTag.gratitude.name);
    const tagColor = params.add(starterTag.gratitude.color);
    return statement(
      `WITH rewritten AS (
         UPDATE "notes" n
         SET "content" = ${next}
         WHERE n."title" = ${title}
           AND n."content" = ${previous}
           AND ${exact}
           AND EXISTS (
             SELECT 1 FROM "tags" starter
             WHERE starter."userId" = n."userId"
               AND starter.name = ${tagName}
               AND starter.color = ${tagColor}
           )
         RETURNING n.id, n."userId"
       )
       INSERT INTO "note_tags" ("notesId", "tagsId")
       SELECT rewritten.id, starter.id
       FROM rewritten
       INNER JOIN "tags" starter
         ON starter."userId" = rewritten."userId"
        AND starter.name = ${tagName}
        AND starter.color = ${tagColor}`,
      params,
    );
  }

  const previous = params.add(gratitudeSampleNote.from);
  const title = params.add(gratitudeSampleNote.title);
  const next = params.add(gratitudeSampleNote.to);
  const tagName = params.add(starterTag.gratitude.name);
  const tagColor = params.add(starterTag.gratitude.color);
  const exact = noteHasExactTags(params, 'n', [
    starterTag.reflections,
    starterTag.gratitude,
  ]);
  return statement(
    `WITH unlinked AS (
       DELETE FROM "note_tags" link
       USING "notes" n, "tags" starter
       WHERE link."notesId" = n.id
         AND link."tagsId" = starter.id
         AND n."title" = ${title}
         AND n."content" = ${next}
         AND starter.name = ${tagName}
         AND starter.color = ${tagColor}
         AND starter."userId" = n."userId"
         AND ${exact}
       RETURNING n.id
     )
     UPDATE "notes" n
     SET "content" = ${previous}
     FROM unlinked
     WHERE n.id = unlinked.id`,
    params,
  );
}

function linkSomedayNote(direction: 'up' | 'down'): [string, unknown[]] {
  const params = new Params();
  const title = params.add(somedaySampleNote.title);
  const content = params.add(somedaySampleNote.content);
  const tagName = params.add(starterTag.someday.name);
  const tagColor = params.add(starterTag.someday.color);
  const required =
    direction === 'up'
      ? [starterTag.ideas]
      : [starterTag.ideas, starterTag.someday];
  const exact = noteHasExactTags(params, 'n', required);

  if (direction === 'up') {
    return statement(
      `INSERT INTO "note_tags" ("notesId", "tagsId")
       SELECT n.id, starter.id
       FROM "notes" n
       INNER JOIN "tags" starter
         ON starter."userId" = n."userId"
        AND starter.name = ${tagName}
        AND starter.color = ${tagColor}
       WHERE n."title" = ${title}
         AND n."content" = ${content}
         AND ${exact}
         AND NOT EXISTS (
           SELECT 1 FROM "note_tags" already
           WHERE already."notesId" = n.id
             AND already."tagsId" = starter.id
         )`,
      params,
    );
  }

  return statement(
    `DELETE FROM "note_tags" link
     USING "notes" n, "tags" starter
     WHERE link."notesId" = n.id
       AND link."tagsId" = starter.id
       AND n."title" = ${title}
       AND n."content" = ${content}
       AND starter.name = ${tagName}
       AND starter.color = ${tagColor}
       AND starter."userId" = n."userId"
       AND ${exact}`,
    params,
  );
}

function linkSomedayTask(direction: 'up' | 'down'): [string, unknown[]] {
  const params = new Params();
  const title = params.add(somedaySampleTask.title);
  const description = params.add(somedaySampleTask.description);
  const tagName = params.add(starterTag.someday.name);
  const tagColor = params.add(starterTag.someday.color);

  if (direction === 'up') {
    return statement(
      `INSERT INTO "task_tags" ("taskId", "tagsId")
       SELECT item.id, starter.id
       FROM "task" item
       INNER JOIN "tags" starter
         ON starter."userId" = item."userId"
        AND starter.name = ${tagName}
        AND starter.color = ${tagColor}
       WHERE item."title" = ${title}
         AND item."description" = ${description}
         AND NOT EXISTS (
           SELECT 1 FROM "task_tags" existing
           WHERE existing."taskId" = item.id
         )`,
      params,
    );
  }

  return statement(
    `DELETE FROM "task_tags" link
     USING "task" item, "tags" starter
     WHERE link."taskId" = item.id
       AND link."tagsId" = starter.id
       AND item."title" = ${title}
       AND item."description" = ${description}
       AND starter.name = ${tagName}
       AND starter.color = ${tagColor}
       AND starter."userId" = item."userId"
       AND (
         SELECT COUNT(*)::int FROM "task_tags" existing
         WHERE existing."taskId" = item.id
       ) = 1`,
    params,
  );
}
