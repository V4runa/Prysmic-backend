import { MigrationInterface, QueryRunner } from "typeorm";

export class alignUseridFks1699999999999 implements MigrationInterface {
  name = "alignUseridFks1699999999999";

  public async up(queryRunner: QueryRunner): Promise<void> {

    await queryRunner.query(`ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "userId" integer`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_notes_user') THEN
          ALTER TABLE "notes"
          ADD CONSTRAINT "FK_notes_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM "notes" WHERE "userId" IS NULL) THEN
          ALTER TABLE "notes" ALTER COLUMN "userId" SET NOT NULL;
        END IF;
      END$$;
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_notes_userId" ON "notes" ("userId")`);

    await queryRunner.query(`ALTER TABLE "habit" ADD COLUMN IF NOT EXISTS "userId" integer`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_habit_user') THEN
          ALTER TABLE "habit"
          ADD CONSTRAINT "FK_habit_user"
          FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE;
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM "habit" WHERE "userId" IS NULL) THEN
          ALTER TABLE "habit" ALTER COLUMN "userId" SET NOT NULL;
        END IF;
      END$$;
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_habit_userId" ON "habit" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_habit_userId"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_habit_user') THEN
          ALTER TABLE "habit" DROP CONSTRAINT "FK_habit_user";
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        BEGIN
          ALTER TABLE "habit" ALTER COLUMN "userId" DROP NOT NULL;
        EXCEPTION WHEN undefined_column THEN
          -- ignore
        END;
      END$$;
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notes_userId"`);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'FK_notes_user') THEN
          ALTER TABLE "notes" DROP CONSTRAINT "FK_notes_user";
        END IF;
      END$$;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        BEGIN
          ALTER TABLE "notes" ALTER COLUMN "userId" DROP NOT NULL;
        EXCEPTION WHEN undefined_column THEN
          -- ignore
        END;
      END$$;
    `);
  }
}
