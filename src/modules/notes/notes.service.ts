import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Note } from './notes.entity';
import { Tag } from '../tags/tags.entity';
import { UserService } from '../users/user.service';

// Notes are stored as HTML and can grow large. The list view only renders a
// short text preview, so we ship a trimmed body instead of the full note to
// keep the payload (and the cross-network transfer to the browser) small. The
// single-note endpoint still returns the complete content.
const NOTE_PREVIEW_LIMIT = 600;
function truncateNotePreview(content: string | null | undefined): string {
  if (!content) return '';
  if (content.length <= NOTE_PREVIEW_LIMIT) return content;
  // Drop any dangling partial tag left by the cut so the client's HTML
  // stripper doesn't choke on `<div` with no closing bracket.
  return content.slice(0, NOTE_PREVIEW_LIMIT).replace(/<[^>]*$/, '');
}

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note) private notesRepository: Repository<Note>,
    @InjectRepository(Tag) private tagsRepository: Repository<Tag>,
    private userService: UserService,
  ) {}

  // Create a new note for a user
  async createNote(
    title: string,
    content: string,
    tags: Tag[],
    userId: number,
  ): Promise<Note> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const note = this.notesRepository.create({
      title,
      content,
      tags,
      user,
      userId,
    });

    const saved = await this.notesRepository.save(note);
    return this.present(saved);
  }

  // Get notes for a specific user, newest first.
  // limit/offset are optional; when omitted all notes are returned
  // (preserves existing behaviour for callers that page client-side).
  async getNotesByUser(
    userId: number,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Note[]> {
    const qb = this.notesRepository
      .createQueryBuilder('note')
      .leftJoinAndSelect('note.tags', 'tags')
      .loadRelationCountAndMap('note.attachmentCount', 'note.attachments')
      .where('note.userId = :userId', { userId })
      .orderBy('note.createdAt', 'DESC');

    if (options.limit !== undefined) qb.take(options.limit);
    if (options.offset !== undefined) qb.skip(options.offset);

    const notes = await qb.getMany();
    for (const note of notes) {
      note.content = truncateNotePreview(note.content);
    }
    return notes;
  }

  // Get a single note by ID for its owner.
  // A missing id and someone else's id both 404 with the same message so the
  // response does not reveal that the other note exists. The user relation is
  // not loaded: that row includes the password hash.
  async getNoteById(id: number, userId: number): Promise<Note> {
    const note = await this.notesRepository.findOne({
      where: { id, userId },
      relations: ['tags'],
    });
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    return this.present(note);
  }

  // Update fields the caller is allowed to change. userId is taken from the
  // authenticated owner already checked above and is never copied from input.
  async updateNote(
    id: number,
    userId: number,
    noteData: {
      title?: string;
      content?: string;
      isPinned?: boolean;
      isArchived?: boolean;
      tags?: Tag[];
    },
  ): Promise<Note> {
    const note = await this.getNoteById(id, userId);
    if (noteData.title !== undefined) note.title = noteData.title;
    if (noteData.content !== undefined) note.content = noteData.content;
    if (noteData.isPinned !== undefined) note.isPinned = noteData.isPinned;
    if (noteData.isArchived !== undefined)
      note.isArchived = noteData.isArchived;
    if (noteData.tags !== undefined) note.tags = noteData.tags;
    const saved = await this.notesRepository.save(note);
    return this.present(saved);
  }

  // Delete a note only when the id and owner match.
  async deleteNote(id: number, userId: number): Promise<void> {
    const result = await this.notesRepository.delete({ id, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Note not found');
    }
  }

  private present(note: Note): Note {
    if (note && 'user' in note) {
      delete (note as Partial<Note>).user;
    }
    return note;
  }
}
