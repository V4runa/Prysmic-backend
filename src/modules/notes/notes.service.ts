import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Note } from "./notes.entity";
import { Tag } from "../tags/tags.entity";
import { UserService } from "../users/user.service";

@Injectable()
export class NotesService {
  constructor(
    @InjectRepository(Note) private notesRepository: Repository<Note>,
    @InjectRepository(Tag) private tagsRepository: Repository<Tag>,
    private userService: UserService, 
  ) {}

  // Create a new note for a user
  async createNote(title: string, content: string, tags: Tag[], userId: number): Promise<Note> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Create the note and associate it with the user
    const note = this.notesRepository.create({
      title,
      content,
      tags,
      user, 
    });

    return this.notesRepository.save(note);
  }

  // Get all notes for a specific user
  async getNotesByUser(userId: number): Promise<Note[]> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.notesRepository.find({
      where: { user },
      relations: ['tags'],  
    });
  }

  // Get all notes
  async getAllNotes(): Promise<Note[]> {
    return this.notesRepository.find({ relations: ['tags'] });
  }

  // Get a single note by ID
  async getNoteById(id: number): Promise<Note> {
    const note = await this.notesRepository.findOne({ where: { id }, relations: ['tags', 'user'] });
    if (!note) {
      throw new NotFoundException('Note not found');
    }
    return note;
  }

  // Update a note
  async updateNote(id: number, noteData: Partial<Note>): Promise<Note> {
    const note = await this.getNoteById(id);
    Object.assign(note, noteData);
    return this.notesRepository.save(note);
  }

  // Delete a note
  async deleteNote(id: number): Promise<void> {
    const result = await this.notesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('Note not found');
    }
  }
}
