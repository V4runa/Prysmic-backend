import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Task } from './tasks.entity';
import { CreateTaskDto } from '../../dtos/create-task.dto';
import { UpdateTaskDto } from '../../dtos/update-task.dto';
import { User } from '../users/user.entity';
import { Tag } from '../tags/tags.entity';

export type TaskListFilters = {
  archived?: boolean;
  complete?: boolean;
  priority?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  search?: string;
  limit?: number;
  offset?: number;
  /** When set, only tasks that include this tag. Each task still includes all of its tags. */
  tagId?: number;
};

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(userId: number, dto: CreateTaskDto, tags: Tag[]): Promise<Task> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const task = this.taskRepo.create({
      ...withoutTagIds(dto),
      user,
      userId,
      tags,
    });
    const saved = await this.taskRepo.save(task);
    return this.findOne(userId, saved.id);
  }

  async findAll(userId: number, filters: TaskListFilters): Promise<Task[]> {
    // `tags` is only the payload. Filtering uses a second join so a task that
    // also has other tags still returns those tags.
    const query = this.taskRepo
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.tags', 'tags')
      .where('task.userId = :userId', { userId });

    if (filters.archived !== undefined) {
      query.andWhere('task.isArchived = :archived', {
        archived: filters.archived,
      });
    }

    if (filters.complete !== undefined) {
      query.andWhere('task.isComplete = :complete', {
        complete: filters.complete,
      });
    }

    if (filters.priority !== undefined) {
      query.andWhere('task.priority = :priority', {
        priority: filters.priority,
      });
    }

    if (filters.search) {
      query.andWhere('task.title ILIKE :search', {
        search: `%${filters.search}%`,
      });
    }

    if (filters.tagId !== undefined) {
      query.innerJoin('task.tags', 'filterTag', 'filterTag.id = :tagId', {
        tagId: filters.tagId,
      });
    }

    if (filters.sortBy) {
      const order = (filters.order ?? 'asc').toUpperCase() as 'ASC' | 'DESC';
      query.orderBy(`task.${filters.sortBy}`, order);
    }

    if (filters.limit !== undefined) {
      query.take(filters.limit);
    }

    if (filters.offset !== undefined) {
      query.skip(filters.offset);
    }

    const tasks = await query.getMany();
    return tasks.map((task) => this.present(task));
  }

  async findOne(userId: number, id: number): Promise<Task> {
    return this.present(await this.loadOwned(userId, id));
  }

  async update(
    userId: number,
    id: number,
    dto: UpdateTaskDto,
    tags?: Tag[],
  ): Promise<Task> {
    const task = await this.loadOwned(userId, id);
    Object.assign(task, withoutTagIds(dto));
    if (tags !== undefined) task.tags = tags;
    await this.taskRepo.save(task);
    return this.findOne(userId, id);
  }

  async remove(userId: number, id: number): Promise<void> {
    const task = await this.loadOwned(userId, id);
    await this.taskRepo.remove(task);
  }

  async archive(userId: number, id: number): Promise<Task> {
    const task = await this.loadOwned(userId, id);
    task.isArchived = true;
    task.archivedAt = new Date();
    return this.present(await this.taskRepo.save(task));
  }

  async unarchive(userId: number, id: number): Promise<Task> {
    const task = await this.loadOwned(userId, id);
    task.isArchived = false;
    task.archivedAt = null;
    return this.present(await this.taskRepo.save(task));
  }

  async markComplete(userId: number, id: number): Promise<Task> {
    const task = await this.loadOwned(userId, id);
    task.isComplete = true;
    task.completedAt = new Date();
    return this.present(await this.taskRepo.save(task));
  }

  async markIncomplete(userId: number, id: number): Promise<Task> {
    const task = await this.loadOwned(userId, id);
    task.isComplete = false;
    task.completedAt = null;
    return this.present(await this.taskRepo.save(task));
  }

  private async loadOwned(userId: number, id: number): Promise<Task> {
    const task = await this.taskRepo.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!task) throw new NotFoundException('Task not found');
    if (task.userId !== userId) throw new ForbiddenException();
    return task;
  }

  private present(task: Task): Task {
    if (task && 'user' in task) {
      delete (task as Partial<Task>).user;
    }
    return task;
  }
}

function withoutTagIds<T extends { tagIds?: number[] }>(
  dto: T,
): Partial<Omit<T, 'tagIds'>> {
  // ES2023 class fields make every omitted DTO property an own `undefined`.
  // Copying those would wipe title and the other columns on a partial update.
  const { tagIds, ...rest } = dto;
  void tagIds;
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) fields[key] = value;
  }
  return fields as Partial<Omit<T, 'tagIds'>>;
}
