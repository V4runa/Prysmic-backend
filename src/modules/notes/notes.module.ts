import { Module, forwardRef } from "@nestjs/common";
import { Note } from "./notes.entity";
import { NoteAttachment } from "./note-attachment.entity";
import { Tag } from "../tags/tags.entity";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotesController } from "./notes.controller";
import { NoteAttachmentsController } from "./note-attachments.controller";
import { NotesService } from "./notes.service";
import { NoteAttachmentsService } from "./note-attachments.service";
import { UserModule } from "../users/user.module";
import { TagsModule } from "../tags/tags.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Note, NoteAttachment, Tag]), 
    forwardRef(() => UserModule),
    forwardRef(() => TagsModule)
  ],
  controllers: [NotesController, NoteAttachmentsController],
  providers: [NotesService, NoteAttachmentsService],
  exports: [NotesService],
})
export class NotesModule {}
