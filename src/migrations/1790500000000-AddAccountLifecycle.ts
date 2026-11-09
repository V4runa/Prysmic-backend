import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountLifecycle1790500000000 implements MigrationInterface {
  name = 'AddAccountLifecycle1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "emailVerified" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "sessionVersion" integer NOT NULL DEFAULT 0`,
    );
    // Accounts that already exist were created before confirmation existed.
    // Mark them verified so they are not locked out. No other column is touched.
    await queryRunner.query(`UPDATE "users" SET "emailVerified" = true`);

    await queryRunner.query(`
      CREATE TABLE "auth_tokens" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "purpose" character varying NOT NULL,
        "tokenHash" character varying(64) NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "usedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_auth_tokens_tokenHash" UNIQUE ("tokenHash"),
        CONSTRAINT "FK_auth_tokens_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_auth_tokens_user_purpose" ON "auth_tokens" ("userId", "purpose")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "auth_tokens"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "sessionVersion"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emailVerified"`);
  }
}
