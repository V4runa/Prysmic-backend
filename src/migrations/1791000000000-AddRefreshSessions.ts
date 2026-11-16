import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Server-side refresh sessions. The lookup value is a SHA-256. A rotated row
 * also keeps an encrypted copy of its successor for the short reuse-grace
 * window, so two tabs can refresh together. Deleting the user removes every
 * session.
 */
export class AddRefreshSessions1791000000000 implements MigrationInterface {
  name = 'AddRefreshSessions1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "familyId" character varying(36) NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "rotatedAt" TIMESTAMP WITH TIME ZONE,
        "revokedAt" TIMESTAMP WITH TIME ZONE,
        "successorSeal" text,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_tokenHash" UNIQUE ("tokenHash"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_userId" ON "refresh_tokens" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_familyId" ON "refresh_tokens" ("familyId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
