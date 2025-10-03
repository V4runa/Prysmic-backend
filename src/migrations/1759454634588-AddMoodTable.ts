import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMoodTable1759454634588 implements MigrationInterface {
  name = 'AddMoodTable1759454634588';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mood" (
        "id" SERIAL NOT NULL,
        "emoji" character varying(10) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "userId" integer,
        CONSTRAINT "PK_cd069bf46deedf0ef3a7771f44b" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "mood"
      ADD CONSTRAINT "FK_063b678cbb2c84dfd95dff5da22"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "mood" DROP CONSTRAINT "FK_063b678cbb2c84dfd95dff5da22"
    `);

    await queryRunner.query(`
      DROP TABLE "mood"
    `);
  }
}
