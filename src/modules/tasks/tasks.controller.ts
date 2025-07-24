import {
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

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TaskController {
  constructor(private readonly taskService: TaskService) {}

  @Post()
  create(@Req() req: Request, @Body() dto: CreateTaskDto) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.create(userId, dto);
  }

  @Get()
  findAll(
    @Req() req: Request,
    @Query('archived', new DefaultValuePipe(false), ParseBoolPipe) archived: boolean,
    @Query('complete') complete: boolean,
    @Query('priority') priority: number,
    @Query('sortBy') sortBy: string,
    @Query('order') order: 'asc' | 'desc' = 'asc',
    @Query('search') search: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
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
    });
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.findOne(userId, id);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTaskDto,
  ) {
    const userId = (req.user as { userId: number }).userId;
    return this.taskService.update(userId, id, dto);
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
}
