import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Task, TaskPriority } from './tasks.entity';
import { CreateTaskDto } from '../../dtos/create-task.dto';
import { UpdateTaskDto } from '../../dtos/update-task.dto';
import { User } from '../users/user.entity';

@Injectable()
export class TaskService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepo: Repository<Task>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(userId: number, dto: CreateTaskDto): Promise<Task> {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new NotFoundException('User not found');
  
    const task = this.taskRepo.create(dto); 
    task.user = user;
    return this.taskRepo.save(task);
  }

  async findAll(
    userId: number,
    filters: {
      archived?: boolean;
      complete?: boolean;
      priority?: number;
      sortBy?: string;
      order?: 'asc' | 'desc';
      search?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<Task[]> {
    const query = this.taskRepo
      .createQueryBuilder('task')
      .where('task.userId = :userId', { userId }); 
  
    if (filters.archived !== undefined) {
      query.andWhere('task.isArchived = :archived', { archived: filters.archived });
    }
  
    if (filters.complete !== undefined) {
      query.andWhere('task.isComplete = :complete', { complete: filters.complete });
    }
  
    if (filters.priority !== undefined) {
      query.andWhere('task.priority = :priority', { priority: filters.priority });
    }
  
    if (filters.search) {
      query.andWhere('task.title ILIKE :search', { search: `%${filters.search}%` });
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
  
    return query.getMany();
  }
  

  async findOne(userId: number, id: number): Promise<Task> {
    const task = await this.taskRepo.findOne({ where: { id }, relations: ['user'] });
    if (!task) throw new NotFoundException('Task not found');
    if (task.user.id !== userId) throw new ForbiddenException();
    return task;
  }

  async update(userId: number, id: number, dto: UpdateTaskDto): Promise<Task> {
    const task = await this.findOne(userId, id);
    Object.assign(task, dto);
    return this.taskRepo.save(task);
  }

  async remove(userId: number, id: number): Promise<void> {
    const task = await this.findOne(userId, id);
    await this.taskRepo.remove(task);
  }

  async archive(userId: number, id: number): Promise<Task> {
    const task = await this.findOne(userId, id);
    task.isArchived = true;
    task.archivedAt = new Date();
    return this.taskRepo.save(task);
  }

  async unarchive(userId: number, id: number): Promise<Task> {
    const task = await this.findOne(userId, id);
    task.isArchived = false;
    task.archivedAt = null;
    return this.taskRepo.save(task);
  }

  async markComplete(userId: number, id: number): Promise<Task> {
    const task = await this.findOne(userId, id);
    task.isComplete = true;
    task.completedAt = new Date();
    return this.taskRepo.save(task);
  }

  async markIncomplete(userId: number, id: number): Promise<Task> {
    const task = await this.findOne(userId, id);
    task.isComplete = false;
    task.completedAt = null;
    return this.taskRepo.save(task);
  }
}
