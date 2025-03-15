import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialMigration1742014225316 implements MigrationInterface {
    name = 'InitialMigration1742014225316'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "tags" ("id" SERIAL NOT NULL, "name" character varying NOT NULL, CONSTRAINT "UQ_d90243459a697eadb8ad56e9092" UNIQUE ("name"), CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "notes" ("id" SERIAL NOT NULL, "title" character varying NOT NULL, "content" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isPinned" boolean NOT NULL DEFAULT false, "isArchived" boolean NOT NULL DEFAULT false, CONSTRAINT "PK_af6206538ea96c4e77e9f400c3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "note_tags" ("tagsId" integer NOT NULL, "notesId" integer NOT NULL, CONSTRAINT "PK_887b9dafa0f1b3f51393444ec02" PRIMARY KEY ("tagsId", "notesId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_993c9e3195b19f2928a42cf113" ON "note_tags" ("tagsId") `);
        await queryRunner.query(`CREATE INDEX "IDX_48eb33cd7ddfa7ca9c5dbaff6b" ON "note_tags" ("notesId") `);
        await queryRunner.query(`ALTER TABLE "note_tags" ADD CONSTRAINT "FK_993c9e3195b19f2928a42cf113b" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "note_tags" ADD CONSTRAINT "FK_48eb33cd7ddfa7ca9c5dbaff6b5" FOREIGN KEY ("notesId") REFERENCES "notes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "note_tags" DROP CONSTRAINT "FK_48eb33cd7ddfa7ca9c5dbaff6b5"`);
        await queryRunner.query(`ALTER TABLE "note_tags" DROP CONSTRAINT "FK_993c9e3195b19f2928a42cf113b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_48eb33cd7ddfa7ca9c5dbaff6b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_993c9e3195b19f2928a42cf113"`);
        await queryRunner.query(`DROP TABLE "note_tags"`);
        await queryRunner.query(`DROP TABLE "notes"`);
        await queryRunner.query(`DROP TABLE "tags"`);
    }
} 