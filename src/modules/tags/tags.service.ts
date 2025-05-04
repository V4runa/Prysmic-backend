import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.tagsRepository.find({
      where: { user: { id: userId } },
      order: { name: 'ASC' },
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
      relations: ['notes'],
    });

    if (!tag) {
      throw new NotFoundException('Tag not found or not owned by user');
    }

    if (tag.notes.length > 0) {
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
