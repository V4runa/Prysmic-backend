import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Tag } from './tags.entity';
import { UserService } from '../users/user.service';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag) private tagsRepository: Repository<Tag>,
    private userService: UserService
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

  // Get all tags for a specific user
  async getAllTags(userId: number): Promise<Tag[]> {
    return this.tagsRepository.find({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
    });
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

    const linkedNotesCount = await this.tagsRepository
      .createQueryBuilder('tag')
      .innerJoin('tag.notes', 'note')
      .where('tag.id = :id', { id })
      .getCount();

    if (linkedNotesCount > 0) {
      throw new Error('Cannot delete tag as it is associated with notes');
    }

    await this.tagsRepository.remove(tag);
  }

  // Update a tag
  async updateTag(id: number, name: string, color: string, userId: number): Promise<Tag> {
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
  
}
