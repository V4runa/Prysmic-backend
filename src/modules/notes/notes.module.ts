import { Module, forwardRef } from "@nestjs/common";
import { Note } from "./notes.entity";
import { Tag } from "../tags/tags.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotesController } from "./notes.controller";
import { NotesService } from "./notes.service";
import { UserModule } from "../users/user.module";
import { TagsModule } from "../tags/tags.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Note, Tag]), 
    forwardRef(() => UserModule),
    forwardRef(() => TagsModule)
  ],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
