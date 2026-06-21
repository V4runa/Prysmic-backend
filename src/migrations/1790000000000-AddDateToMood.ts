import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDateToMood1790000000000 implements MigrationInterface {
  name = 'AddDateToMood1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add as nullable first so we can backfill existing rows safely.
    await queryRunner.query(
      `ALTER TABLE "mood" ADD COLUMN IF NOT EXISTS "date" date`,
    );
    // Backfill from the existing timestamp; best-effort for historical rows.
    await queryRunner.query(
      `UPDATE "mood" SET "date" = "createdAt"::date WHERE "date" IS NULL`,
    );
    // Now enforce NOT NULL; new rows always supply the local day.
    await queryRunner.query(
      `ALTER TABLE "mood" ALTER COLUMN "date" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mood" DROP COLUMN IF EXISTS "date"`);
  }
}
