import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Note } from '../notes/notes.entity';
import { Task } from '../tasks/tasks.entity';
import { Tag } from './tags.entity';
import { UserService } from '../users/user.service';

/** 409 body when DELETE /tags/:id is refused because notes or tasks still use it. */
export const TAG_IN_USE_MESSAGE =
  'This tag is still in use. Remove it from your notes and tasks before deleting it.';

type UsageCounts = { noteCount: number; taskCount: number };

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag) private tagsRepository: Repository<Tag>,
    private userService: UserService,
  ) {}

  // Create a new tag for a user
  async createTag(name: string, color: string, userId: number): Promise<Tag> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingTag = await this.tagsRepository.findOne({
      where: { name, user: { id: userId } },
    });

    if (existingTag) {
      throw new Error('Tag already exists for this user');
    }

    const tag = this.tagsRepository.create({
      name,
      color,
      user,
    });

    return this.tagsRepository.save(tag);
  }

  // Get all tags for a specific user. Usage is two grouped counts (notes, tasks),
  // not one query per tag. Counts are taken from the owning side of each join.
  async getAllTags(userId: number): Promise<Tag[]> {
    const tags = await this.tagsRepository.find({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
    });
    const usage = await this.usageFor(tags.map((tag) => tag.id));
    for (const tag of tags) {
      const counts = usage.get(Number(tag.id)) ?? {
        noteCount: 0,
        taskCount: 0,
      };
      tag.noteCount = counts.noteCount;
      tag.taskCount = counts.taskCount;
    }
    return tags;
  }

  // Get specific tags by ID, scoped to the owning user
  async getTagsByIds(ids: number[], userId: number): Promise<Tag[]> {
    if (ids.length === 0) {
      return [];
    }

    return this.tagsRepository.find({
      where: { id: In(ids), user: { id: userId } },
    });
  }

  // Get a single tag by ID, scoped to user
  async getTagById(id: number, userId: number): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found');
    }

    return tag;
  }

  // Delete a tag (only if it belongs to the user and is unused)
  async deleteTag(id: number, userId: number): Promise<void> {
    const tag = await this.tagsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found or not owned by user');
    }

    const usage = await this.usageFor([id]);
    const counts = usage.get(Number(id)) ?? { noteCount: 0, taskCount: 0 };
    if (counts.noteCount > 0 || counts.taskCount > 0) {
      throw new ConflictException(TAG_IN_USE_MESSAGE);
    }

    await this.tagsRepository.remove(tag);
  }

  // Update a tag
  async updateTag(
    id: number,
    name: string,
    color: string,
    userId: number,
  ): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({
      where: { id, user: { id: userId } },
    });

    if (!tag) {
      throw new NotFoundException('Tag not found or not owned by user');
    }

    tag.name = name;
    tag.color = color;

    return this.tagsRepository.save(tag);
  }

  /**
   * Two grouped counts for the whole id list. Joining both relations from the
   * tag side breaks TypeORM's many-to-many metadata, and a double left join
   * would also multiply rows. The note and task sides own the join tables.
   */
  private async usageFor(ids: number[]): Promise<Map<number, UsageCounts>> {
    const usage = new Map<number, UsageCounts>();
    for (const id of ids) {
      usage.set(Number(id), { noteCount: 0, taskCount: 0 });
    }
    if (ids.length === 0) return usage;

    const [noteRows, taskRows] = await Promise.all([
      this.tagsRepository.manager
        .getRepository(Note)
        .createQueryBuilder('note')
        .innerJoin('note.tags', 'tag')
        .select('tag.id', 'id')
        .addSelect('COUNT(*)', 'count')
        .where('tag.id IN (:...ids)', { ids })
        .groupBy('tag.id')
        .getRawMany<Record<string, unknown>>(),
      this.tagsRepository.manager
        .getRepository(Task)
        .createQueryBuilder('task')
        .innerJoin('task.tags', 'tag')
        .select('tag.id', 'id')
        .addSelect('COUNT(*)', 'count')
        .where('tag.id IN (:...ids)', { ids })
        .groupBy('tag.id')
        .getRawMany<Record<string, unknown>>(),
    ]);

    applyCounts(usage, noteRows, 'noteCount');
    applyCounts(usage, taskRows, 'taskCount');
    return usage;
  }
}

function applyCounts(
  usage: Map<number, UsageCounts>,
  rows: Record<string, unknown>[],
  field: keyof UsageCounts,
): void {
  for (const row of rows) {
    const id = rawNumber(row, ['id', 'tag_id']);
    if (id === undefined) continue;
    const current = usage.get(id) ?? { noteCount: 0, taskCount: 0 };
    current[field] = rawNumber(row, ['count', 'cnt']) ?? 0;
    usage.set(id, current);
  }
}

function rawNumber(
  row: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    const value = row[key];
    if (value == null || value === '') continue;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
