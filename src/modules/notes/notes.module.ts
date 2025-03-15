import { Module } from "@nestjs/common";
import { Note } from "./notes.entity";
import { Tag } from "../tags/tags.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";
import { UserModule } from "../users/user.module";

@Module({
  imports: [TypeOrmModule.forFeature([Note, Tag]), UserModule],
  controllers: [NotesController],
  providers: [NotesService],
})
export class NotesModule {}
