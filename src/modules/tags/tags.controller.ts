import { Controller, Get, Post, Delete, Body, Param } from "@nestjs/common";
import { TagsService } from "./tags.service";
import { Tag } from "./tags.entity";


@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  // Create a new tag
  @Post()
  async createTag(@Body('name') name: string): Promise<Tag> {
    return this.tagsService.createTag(name);  
  }

  // Get all tags
  @Get()
  async getAllTags(): Promise<Tag[]> {
    return this.tagsService.getAllTags();
  }

  // Get a single tag by ID
  @Get(':id')
  async getTagById(@Param('id') id: number): Promise<Tag> {
    return this.tagsService.getTagById(id);
  }

  // Delete a tag
  @Delete(':id')
  async deleteTag(@Param('id') id: number): Promise<void> {
    return this.tagsService.deleteTag(id);
  }
} 
