import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { Note } from './notes.entity';
import { TagsService } from '../tags/tags.service';
import { Tag } from '../tags/tags.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateNoteDto } from '../../dtos/create-note.dto';

@Controller('notes')
export class NotesController {
  constructor(
    private readonly notesService: NotesService,
    private readonly tagsService: TagsService,
  ) {}

  // Create a new note
  @Post()
  @UseGuards(JwtAuthGuard)
  async createNote(
    @Req() req: any,
    @Body() createNoteDto: CreateNoteDto,
  ): Promise<Note> {
    const { title, content, tagIds = [] } = createNoteDto;
    const userId = req.user.userId;

    const noteTags = await this.tagsService.getTagsByIds(tagIds, userId);

    if (noteTags.length !== tagIds.length) {
      throw new BadRequestException('Some of the provided tag IDs do not exist');
    }

    return this.notesService.createNote(title, content, noteTags, userId);
  }

  // Get all notes for a user (optional limit/offset for pagination)
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  async getNotesByUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.notesService.getNotesByUser(userId, {
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
    });
  }

  // Get a single note by ID
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getNoteById(@Param('id') id: number): Promise<Note> {
    return this.notesService.getNoteById(id);
  }

  // Update a note
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateNote(
    @Param('id') id: number,
    @Body() noteData: Partial<Note>,
    @Body('tagIds') tagIds: number[],
    @Req() req: any,
  ): Promise<Note> {
    const userId = req.user.userId;

    const noteTags = await this.tagsService.getTagsByIds(tagIds ?? [], userId);

    if (noteTags.length !== (tagIds?.length ?? 0)) {
      throw new BadRequestException('Some of the provided tag IDs do not exist');
    }

    return this.notesService.updateNote(id, { ...noteData, tags: noteTags });
  }

  // Delete a note
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteNote(@Param('id') id: number): Promise<void> {
    return this.notesService.deleteNote(id);
  }
}
