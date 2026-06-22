import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the per-user `mood_options` palette (custom moods) and snapshots a
 * `color` token onto mood entries. Also widens the mood snapshot columns so
 * custom labels/emoji fit. Written idempotently so it is safe to run on boot.
 */
export class AddMoodOptions1790100000000 implements MigrationInterface {
  name = 'AddMoodOptions1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mood_options" (
        "id" SERIAL NOT NULL,
        "label" character varying(40) NOT NULL,
        "emoji" character varying(16) NOT NULL,
        "color" character varying(24) NOT NULL,
        "sortOrder" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer,
        CONSTRAINT "PK_mood_options_id" PRIMARY KEY ("id")
      )
    `);

    // Foreign key to users (idempotent: ignore if it already exists).
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TABLE "mood_options"
        ADD CONSTRAINT "FK_mood_options_user"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // One mood name per user.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_mood_options_user_label"
      ON "mood_options" ("userId", "label")
    `);

    // Snapshot color on entries; widen emoji/label snapshots for custom moods.
    await queryRunner.query(
      `ALTER TABLE "mood" ADD COLUMN IF NOT EXISTS "color" character varying(24)`,
    );
    await queryRunner.query(
      `ALTER TABLE "mood" ALTER COLUMN "emoji" TYPE character varying(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE "mood" ALTER COLUMN "moodType" TYPE character varying(40)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mood" DROP COLUMN IF EXISTS "color"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_mood_options_user_label"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "mood_options"`);
  }
}
