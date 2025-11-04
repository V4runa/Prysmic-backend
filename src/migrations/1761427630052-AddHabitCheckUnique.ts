import { MigrationInterface, QueryRunner } from "typeorm";

export class AddHabitCheckUnique1761427630052 implements MigrationInterface {
  name = "AddHabitCheckUnique1761427630052";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old index if present
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_35be1df1e1741caca455fbf422"`
    );

    // 1️⃣ Remove duplicate habit_check rows safely
    await queryRunner.query(`
      DELETE FROM "habit_check" hc
      USING (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY "habitId","date"
                 ORDER BY "createdAt" ASC, id ASC
               ) AS rn
        FROM "habit_check"
      ) d
      WHERE hc.id = d.id AND d.rn > 1;
    `);

    // 2️⃣ Add the unique constraint (now safe)
    await queryRunner.query(`
      ALTER TABLE "habit_check"
      ADD CONSTRAINT "UQ_habit_check_habitId_date"
      UNIQUE ("habitId","date");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "habit_check"
      DROP CONSTRAINT IF EXISTS "UQ_habit_check_habitId_date";
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_35be1df1e1741caca455fbf422"
      ON "habit_check" ("date","habitId");
    `);
  }
}
