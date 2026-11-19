import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * First-run tour marker. Null means the tour has not been seen, which is what
 * a new signup gets. Every account that already exists is marked seen so the
 * tour does not auto-play for them. No other column or row is changed.
 */
export class AddTourSeenAt1791100000000 implements MigrationInterface {
  name = 'AddTourSeenAt1791100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "tourSeenAt" TIMESTAMP`);
    await queryRunner.query(`UPDATE "users" SET "tourSeenAt" = now()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "tourSeenAt"`);
  }
}
