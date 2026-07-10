import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBackfilledToMood1790400000000 implements MigrationInterface {
  name = 'AddBackfilledToMood1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing entries were all logged organically, so they default to false.
    await queryRunner.query(
      `ALTER TABLE "mood" ADD COLUMN IF NOT EXISTS "backfilled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "mood" DROP COLUMN IF EXISTS "backfilled"`,
    );
  }
}
