import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NoteAttachment } from './note-attachment.entity';
import { Note } from './notes.entity';
import {
  MAX_ATTACHMENTS_PER_NOTE,
  MAX_ATTACHMENT_BYTES,
  resolveAllowedMime,
} from './note-attachments.constants';

/** Public-facing attachment shape (never includes the raw bytes). */
export interface AttachmentMeta {
  id: number;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}

/** Raw bytes plus the headers needed to serve them. */
export interface AttachmentBytes {
  filename: string;
  mimeType: string;
  data: Buffer;
}

@Injectable()
export class NoteAttachmentsService {
  constructor(
    @InjectRepository(NoteAttachment)
    private readonly attachmentsRepository: Repository<NoteAttachment>,
    @InjectRepository(Note)
    private readonly notesRepository: Repository<Note>,
  ) {}

  private toMeta(a: NoteAttachment): AttachmentMeta {
    return {
      id: a.id,
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
    };
  }

  // Confirms the note exists AND belongs to the requesting user. Throws a
  // 404 (not 403) so we never reveal that someone else's note id exists.
  private async assertNoteOwned(noteId: number, userId: number): Promise<Note> {
    const note = await this.notesRepository.findOne({ where: { id: noteId } });
    if (!note || note.userId !== userId) {
      throw new NotFoundException('Note not found');
    }
    return note;
  }

  async list(noteId: number, userId: number): Promise<AttachmentMeta[]> {
    await this.assertNoteOwned(noteId, userId);
    const rows = await this.attachmentsRepository.find({
      where: { noteId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((a) => this.toMeta(a));
  }

  async create(
    noteId: number,
    userId: number,
    file: Express.Multer.File,
  ): Promise<AttachmentMeta> {
    await this.assertNoteOwned(noteId, userId);

    if (!file || !file.buffer?.length) {
      throw new BadRequestException('No file was uploaded');
    }

    const mimeType = resolveAllowedMime(file.mimetype, file.originalname);
    if (!mimeType) {
      throw new BadRequestException(
        'Unsupported file type. Allowed: images, PDF, and text files.',
      );
    }

    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new BadRequestException('File exceeds the 10 MB limit');
    }

    const count = await this.attachmentsRepository.count({ where: { noteId } });
    if (count >= MAX_ATTACHMENTS_PER_NOTE) {
      throw new BadRequestException(
        `This note already has the maximum of ${MAX_ATTACHMENTS_PER_NOTE} attachments`,
      );
    }

    const attachment = this.attachmentsRepository.create({
      noteId,
      userId,
      filename: file.originalname,
      mimeType,
      size: file.size,
      data: file.buffer,
    });

    const saved = await this.attachmentsRepository.save(attachment);
    return this.toMeta(saved);
  }

  async getBytes(
    noteId: number,
    attachmentId: number,
    userId: number,
  ): Promise<AttachmentBytes> {
    await this.assertNoteOwned(noteId, userId);
    const row = await this.attachmentsRepository
      .createQueryBuilder('a')
      .addSelect('a.data')
      .where('a.id = :attachmentId', { attachmentId })
      .andWhere('a.noteId = :noteId', { noteId })
      .getOne();

    if (!row) {
      throw new NotFoundException('Attachment not found');
    }
    return { filename: row.filename, mimeType: row.mimeType, data: row.data };
  }

  async remove(
    noteId: number,
    attachmentId: number,
    userId: number,
  ): Promise<void> {
    await this.assertNoteOwned(noteId, userId);
    const result = await this.attachmentsRepository.delete({
      id: attachmentId,
      noteId,
    });
    if (!result.affected) {
      throw new NotFoundException('Attachment not found');
    }
  }
}
