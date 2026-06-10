import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restores the notes/habit userId indexes that were dropped by
 * AddNoteToMood1760130960439 and never re-added, and adds indexes on the
 * other frequently filtered userId columns (task, mood) plus composites for
 * the hottest ordered list queries. Without these, list endpoints fall back
 * to sequential scans as data grows.
 */
export class AddUserIdIndexes1780963200000 implements MigrationInterface {
  name = 'AddUserIdIndexes1780963200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_notes_userId" ON "notes" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_habit_userId" ON "habit" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_habit_userId_isActive" ON "habit" ("userId", "isActive")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_task_userId" ON "task" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mood_userId" ON "mood" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mood_userId_createdAt" ON "mood" ("userId", "createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_mood_userId_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_mood_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_task_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_habit_userId_isActive"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_habit_userId"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."idx_notes_userId"`);
  }
}
