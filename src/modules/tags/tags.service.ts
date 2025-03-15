import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Tag } from "./tags.entity";


@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag) private tagsRepository: Repository<Tag>,
  ) {}

  // Create a new tag
async createTag(name: string): Promise<Tag> {
  const existingTag = await this.tagsRepository.findOne({ where: { name } });
  if (existingTag) {
    throw new Error('Tag already exists');
  }
  const tag = this.tagsRepository.create({ name });
  return this.tagsRepository.save(tag);
}

  // Get all tags
  async getAllTags(): Promise<Tag[]> {
    return this.tagsRepository.find();
  }

  // Get a single tag by ID 
  async getTagById(id: number): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    return tag;
  }

  // Delete a tag
  async deleteTag(id: number): Promise<void> {
    const tag = await this.tagsRepository.findOne({ where: { id }, relations: ['notes'] });
    if (!tag) {
      throw new NotFoundException('Tag not found');
    }
    if (tag.notes.length > 0) {
      throw new Error('Cannot delete tag as it is associated with notes');
    }
    await this.tagsRepository.remove(tag);
  }
}
