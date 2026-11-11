import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Note } from './notes.entity';
import { Tag } from '../tags/tags.entity';
import { Habit } from '../habits/habit.entity';
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
    @InjectRepository(Habit) private habitRepository: Repository<Habit>,
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
    return this.withOriginatedContracts(this.present(saved), userId);
  }

  // Get notes for a specific user. Pinned notes come first, then newest.
  // Archived notes are omitted unless `archived` is true, which returns only
  // archived notes. limit/offset are optional; when omitted the filtered set
  // is returned in full (callers that page client-side keep working).
  async getNotesByUser(
    userId: number,
    options: { limit?: number; offset?: number; archived?: boolean } = {},
  ): Promise<Note[]> {
    const qb = this.notesRepository
      .createQueryBuilder('note')
      .leftJoinAndSelect('note.tags', 'tags')
      .loadRelationCountAndMap('note.attachmentCount', 'note.attachments')
      .where('note.userId = :userId', { userId })
      .andWhere('note.isArchived = :archived', {
        archived: options.archived === true,
      })
      .orderBy('note.isPinned', 'DESC')
      .addOrderBy('note.createdAt', 'DESC');

    if (options.limit !== undefined) qb.take(options.limit);
    if (options.offset !== undefined) qb.skip(options.offset);

    const notes = await qb.getMany();
    for (const note of notes) {
      note.content = truncateNotePreview(note.content);
    }
    await this.attachOriginatedContracts(notes, userId);
    return notes;
  }

  // Get a single note by ID for its owner.
  // A missing id and someone else's id both 404 with the same message so the
  // response does not reveal that the other note exists. The user relation is
  // not loaded: that row includes the password hash.
  async getNoteById(id: number, userId: number): Promise<Note> {
    const note = await this.findOwnedNote(id, userId);
    return this.withOriginatedContracts(note, userId);
  }

  // Update fields the caller is allowed to change. userId is taken from the
  // authenticated owner already checked above and is never copied from input.
  // Absent fields stay as they are: a pin/archive update must not wipe the
  // title, the body, or the tags.
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
    const note = await this.findOwnedNote(id, userId);
    if (noteData.title !== undefined) note.title = noteData.title;
    if (noteData.content !== undefined) note.content = noteData.content;
    if (noteData.isPinned !== undefined) note.isPinned = noteData.isPinned;
    if (noteData.isArchived !== undefined)
      note.isArchived = noteData.isArchived;
    if (noteData.tags !== undefined) note.tags = noteData.tags;
    const saved = await this.notesRepository.save(note);
    return this.withOriginatedContracts(this.present(saved), userId);
  }

  // Delete a note only when the id and owner match.
  async deleteNote(id: number, userId: number): Promise<void> {
    const result = await this.notesRepository.delete({ id, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Note not found');
    }
  }

  private async findOwnedNote(id: number, userId: number): Promise<Note> {
    const note = await this.notesRepository.findOne({
      where: { id, userId },
      relations: ['tags'],
    });
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    return this.present(note);
  }

  private async withOriginatedContracts(
    note: Note,
    userId: number,
  ): Promise<Note> {
    await this.attachOriginatedContracts([note], userId);
    return note;
  }

  /**
   * One query for the page. Only active habits owned by the same user, and
   * only id plus the habit name (exposed as title). Inactive habits are the
   * soft-deleted contracts and are left off the link-back list.
   */
  private async attachOriginatedContracts(
    notes: Note[],
    userId: number,
  ): Promise<void> {
    if (notes.length === 0) return;
    const habits = await this.habitRepository.find({
      where: {
        userId,
        isActive: true,
        originNoteId: In(notes.map((note) => note.id)),
      },
      select: { id: true, name: true, originNoteId: true },
      order: { id: 'ASC' },
    });
    const byNote = new Map<number, { id: number; title: string }[]>();
    for (const habit of habits) {
      if (habit.originNoteId == null) continue;
      const list = byNote.get(habit.originNoteId) ?? [];
      list.push({ id: habit.id, title: habit.name });
      byNote.set(habit.originNoteId, list);
    }
    for (const note of notes) {
      note.originatedContracts = byNote.get(note.id) ?? [];
    }
  }

  private present(note: Note): Note {
    if (note && 'user' in note) {
      delete (note as Partial<Note>).user;
    }
    return note;
  }
}
