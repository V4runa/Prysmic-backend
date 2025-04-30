import { MigrationInterface, QueryRunner } from "typeorm";

export class AddColorToTags1745978793483 implements MigrationInterface {
    name = 'AddColorToTags1745978793483'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "note_tags" DROP CONSTRAINT "FK_993c9e3195b19f2928a42cf113b"`);
        await queryRunner.query(`ALTER TABLE "note_tags" DROP CONSTRAINT "FK_48eb33cd7ddfa7ca9c5dbaff6b5"`);
        await queryRunner.query(`ALTER TABLE "tags" ADD "color" character varying`);
        await queryRunner.query(`ALTER TABLE "note_tags" ADD CONSTRAINT "FK_48eb33cd7ddfa7ca9c5dbaff6b5" FOREIGN KEY ("notesId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "note_tags" ADD CONSTRAINT "FK_993c9e3195b19f2928a42cf113b" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "note_tags" DROP CONSTRAINT "FK_993c9e3195b19f2928a42cf113b"`);
        await queryRunner.query(`ALTER TABLE "note_tags" DROP CONSTRAINT "FK_48eb33cd7ddfa7ca9c5dbaff6b5"`);
        await queryRunner.query(`ALTER TABLE "tags" DROP COLUMN "color"`);
        await queryRunner.query(`ALTER TABLE "note_tags" ADD CONSTRAINT "FK_48eb33cd7ddfa7ca9c5dbaff6b5" FOREIGN KEY ("notesId") REFERENCES "notes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "note_tags" ADD CONSTRAINT "FK_993c9e3195b19f2928a42cf113b" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }

}
