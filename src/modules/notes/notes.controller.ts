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
  UseInterceptors,
  Req,
  BadRequestException,
  NotFoundException,
  ParseIntPipe,
  ParseBoolPipe,
  DefaultValuePipe,
  ClassSerializerInterceptor,
} from '@nestjs/common';
import { NotesService } from './notes.service';
import { Note } from './notes.entity';
import { TagsService } from '../tags/tags.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateNoteDto } from '../../dtos/create-note.dto';
import { UpdateNoteDto } from '../../dtos/update-note.dto';

type AuthenticatedRequest = { user: { userId: number } };

@Controller('notes')
@UseInterceptors(ClassSerializerInterceptor)
export class NotesController {
  constructor(
    private readonly notesService: NotesService,
    private readonly tagsService: TagsService,
  ) {}

  // Create a new note
  @Post()
  @UseGuards(JwtAuthGuard)
  async createNote(
    @Req() req: AuthenticatedRequest,
    @Body() createNoteDto: CreateNoteDto,
  ): Promise<Note> {
    const { title, content, tagIds = [] } = createNoteDto;
    const userId = req.user.userId;

    const noteTags = await this.tagsService.getTagsByIds(tagIds, userId);

    if (noteTags.length !== tagIds.length) {
      throw new BadRequestException(
        'Some of the provided tag IDs do not exist',
      );
    }

    return this.notesService.createNote(title, content, noteTags, userId);
  }

  // Get all notes for a user (optional limit/offset for pagination).
  // The path id must be the authenticated user. The query always uses the
  // token subject, never a client-supplied id on its own.
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  async getNotesByUser(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('archived', new DefaultValuePipe(false), ParseBoolPipe)
    archived?: boolean,
  ) {
    const authUserId = Number(req.user.userId);
    if (!Number.isInteger(authUserId) || authUserId !== userId) {
      throw new NotFoundException('Note not found');
    }

    return this.notesService.getNotesByUser(authUserId, {
      limit: limit !== undefined ? Number(limit) : undefined,
      offset: offset !== undefined ? Number(offset) : undefined,
      archived: archived === true,
    });
  }

  // Get a single note by ID, only when it belongs to the authenticated user.
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getNoteById(
    @Param('id') id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<Note> {
    return this.notesService.getNoteById(id, req.user.userId);
  }

  // Update a note. Ownership and the new tag set come from the token subject.
  // userId is not a field on UpdateNoteDto, so a body userId is rejected.
  // tagIds is applied only when the body includes it: omitted leaves tags
  // alone, and [] clears them. Title and content are the same — a pin or
  // archive body must not blank the note.
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updateNote(
    @Param('id') id: number,
    @Body() dto: UpdateNoteDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Note> {
    const userId = req.user.userId;
    const patch: {
      title?: string;
      content?: string;
      isPinned?: boolean;
      isArchived?: boolean;
      tags?: Awaited<ReturnType<TagsService['getTagsByIds']>>;
    } = {};

    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.content !== undefined) patch.content = dto.content;
    if (dto.isPinned !== undefined) patch.isPinned = dto.isPinned;
    if (dto.isArchived !== undefined) patch.isArchived = dto.isArchived;

    if (dto.tagIds !== undefined) {
      const noteTags = await this.tagsService.getTagsByIds(dto.tagIds, userId);
      if (noteTags.length !== dto.tagIds.length) {
        throw new BadRequestException(
          'Some of the provided tag IDs do not exist',
        );
      }
      patch.tags = noteTags;
    }

    return this.notesService.updateNote(id, userId, patch);
  }

  // Delete a note only when it belongs to the authenticated user.
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteNote(
    @Param('id') id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<void> {
    return this.notesService.deleteNote(id, req.user.userId);
  }
}
