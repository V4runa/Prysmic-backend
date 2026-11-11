import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Task } from './tasks.entity';
import { CreateTaskDto } from '../../dtos/create-task.dto';
import { UpdateTaskDto } from '../../dtos/update-task.dto';
import { User } from '../users/user.entity';
import { Tag } from '../tags/tags.entity';
import { Note } from '../notes/notes.entity';

type OriginNoteSummary = { id: number; title: string };

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

    @InjectRepository(Note)
    private readonly noteRepo: Repository<Note>,
  ) {}

  async create(userId: number, dto: CreateTaskDto, tags: Tag[]): Promise<Task> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');

    const origin = await this.requireOwnedOrigin(userId, dto.originNoteId);
    const task = this.taskRepo.create({
      ...withoutTagIds(dto),
      user,
      userId,
      tags,
      originNoteId: origin?.id ?? null,
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
    return this.withOrigins(userId, tasks);
  }

  async findOne(userId: number, id: number): Promise<Task> {
    return this.withOrigin(userId, await this.loadOwned(userId, id));
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
    return this.withOrigin(userId, await this.taskRepo.save(task));
  }

  async unarchive(userId: number, id: number): Promise<Task> {
    const task = await this.loadOwned(userId, id);
    task.isArchived = false;
    task.archivedAt = null;
    return this.withOrigin(userId, await this.taskRepo.save(task));
  }

  async markComplete(userId: number, id: number): Promise<Task> {
    const task = await this.loadOwned(userId, id);
    task.isComplete = true;
    task.completedAt = new Date();
    return this.withOrigin(userId, await this.taskRepo.save(task));
  }

  async markIncomplete(userId: number, id: number): Promise<Task> {
    const task = await this.loadOwned(userId, id);
    task.isComplete = false;
    task.completedAt = null;
    return this.withOrigin(userId, await this.taskRepo.save(task));
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

  /**
   * A missing note and a note owned by someone else both 404 with the same
   * message, so the response does not reveal that the other note exists.
   * Null and omitted both mean "no source note".
   */
  private async requireOwnedOrigin(
    userId: number,
    originNoteId?: number | null,
  ): Promise<OriginNoteSummary | null> {
    if (originNoteId == null) return null;
    const origins = await this.lookupOwnedOrigins(userId, [originNoteId]);
    const origin = origins.get(originNoteId);
    if (!origin) throw new NotFoundException('Note not found');
    return origin;
  }

  /** Titles for source notes that still exist and belong to this user. */
  private async lookupOwnedOrigins(
    userId: number,
    originNoteIds: Array<number | null | undefined>,
  ): Promise<Map<number, OriginNoteSummary>> {
    const ids = [
      ...new Set(
        originNoteIds.filter((id): id is number => typeof id === 'number'),
      ),
    ];
    const summaries = new Map<number, OriginNoteSummary>();
    if (ids.length === 0) return summaries;

    const notes = await this.noteRepo.find({
      where: { id: In(ids), userId },
      select: { id: true, title: true },
    });
    for (const note of notes) {
      summaries.set(note.id, { id: note.id, title: note.title });
    }
    return summaries;
  }

  private async withOrigins(userId: number, tasks: Task[]): Promise<Task[]> {
    const origins = await this.lookupOwnedOrigins(
      userId,
      tasks.map((task) => task.originNoteId),
    );
    return tasks.map((task) => this.shape(task, this.originFor(task, origins)));
  }

  private async withOrigin(userId: number, task: Task): Promise<Task> {
    const origins = await this.lookupOwnedOrigins(userId, [task.originNoteId]);
    return this.shape(task, this.originFor(task, origins));
  }

  private originFor(
    task: Task,
    origins: Map<number, OriginNoteSummary>,
  ): OriginNoteSummary | null {
    if (task.originNoteId == null) return null;
    return origins.get(task.originNoteId) ?? null;
  }

  private shape(task: Task, origin: OriginNoteSummary | null): Task {
    const view = {
      ...task,
      originNoteId: task.originNoteId ?? null,
      originNote: origin ? { id: origin.id, title: origin.title } : null,
    };
    delete (view as Partial<Task>).user;
    return view as Task;
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
