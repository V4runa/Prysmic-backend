import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHabitCheckUnique1761427630052 implements MigrationInterface {
  name = 'AddHabitCheckUnique1761427630052'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop any leftover index safely if it exists
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_35be1df1e1741caca455fbf422"`
    );

    // Add the unique constraint to enforce one check per day per habit
    await queryRunner.query(
      `ALTER TABLE "habit_check"
       ADD CONSTRAINT IF NOT EXISTS "UQ_habit_check_habitId_date"
       UNIQUE ("habitId","date")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop the unique constraint if we ever need to roll back
    await queryRunner.query(
      `ALTER TABLE "habit_check"
       DROP CONSTRAINT IF EXISTS "UQ_habit_check_habitId_date"`
    );

    // Optionally recreate the index (no harm)
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_35be1df1e1741caca455fbf422"
       ON "habit_check" ("date", "habitId")`
    );
  }
}
