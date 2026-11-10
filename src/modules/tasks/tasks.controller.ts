import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  ParseBoolPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { TaskService } from './tasks.service';
import { CreateTaskDto } from '../../dtos/create-task.dto';
import { UpdateTaskDto } from '../../dtos/update-task.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';
import { TagsService } from '../tags/tags.service';
import { Tag } from '../tags/tags.entity';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(
    private readonly taskService: TaskService,
    private readonly tagsService: TagsService,
  ) {}

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateTaskDto) {
    const userId = (req.user as { userId: number }).userId;
    const tags = await this.ownedTags(dto.tagIds ?? [], userId);
    return this.taskService.create(userId, dto, tags);
  }

  @Get()
  findAll(
    @Req() req: Request,
    @Query('archived', new DefaultValuePipe(false), ParseBoolPipe)
    archived: boolean,
    @Query('complete') complete: boolean,
    @Query('priority') priority: number,
    @Query('sortBy') sortBy: string,
    @Query('order') order: 'asc' | 'desc' = 'asc',
    @Query('search') search: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('tagId', new ParseIntPipe({ optional: true })) tagId?: number,
  ) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.findAll(userId, {
      archived,
      complete,
      priority,
      sortBy,
      order,
      search,
      limit,
      offset,
      tagId,
    });
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.findOne(userId, id);
  }

  @Patch(':id')
  async update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ) {
    const userId = (req.user as { userId: number }).userId;
    // Omitted tagIds leaves the current set. null and [] both clear it.
    const tags =
      dto.tagIds === undefined
        ? undefined
        : await this.ownedTags(dto.tagIds ?? [], userId);
    return this.taskService.update(userId, id, dto, tags);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.remove(userId, id);
  }

  @Post(':id/archive')
  archive(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.archive(userId, id);
  }

  @Post(':id/unarchive')
  unarchive(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.unarchive(userId, id);
  }

  @Post(':id/complete')
  complete(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.markComplete(userId, id);
  }

  @Post(':id/uncomplete')
  uncomplete(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.markIncomplete(userId, id);
  }

  // Same rule as notes: every id must be a tag this user owns. A shorter
  // result means an unknown id or someone else's id. Duplicates fail too,
  // because the lookup returns each tag once.
  private async ownedTags(tagIds: number[], userId: number): Promise<Tag[]> {
    const found = await this.tagsService.getTagsByIds(tagIds, userId);
    if (found.length !== tagIds.length) {
      throw new BadRequestException(
        'Some of the provided tag IDs do not exist',
      );
    }
    const byId = new Map(found.map((tag) => [tag.id, tag]));
    return tagIds.map((id) => {
      const tag = byId.get(id);
      if (!tag) {
        throw new BadRequestException(
          'Some of the provided tag IDs do not exist',
        );
      }
      return tag;
    });
  }
}
