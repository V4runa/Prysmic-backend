import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHabitCheckUnique1761427630052 implements MigrationInterface {
  name = 'AddHabitCheckUnique1761427630052'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop leftover index safely
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_35be1df1e1741caca455fbf422"`
    );

    // Create unique constraint only if it doesn't exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'UQ_habit_check_habitId_date'
        ) THEN
          ALTER TABLE "habit_check"
          ADD CONSTRAINT "UQ_habit_check_habitId_date"
          UNIQUE ("habitId", "date");
        END IF;
      END$$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the constraint if it exists
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'UQ_habit_check_habitId_date'
        ) THEN
          ALTER TABLE "habit_check"
          DROP CONSTRAINT "UQ_habit_check_habitId_date";
        END IF;
      END$$;
    `);

    // Recreate the index if needed
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_35be1df1e1741caca455fbf422"
      ON "habit_check" ("date", "habitId");
    `);
  }
}
