import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  Put,
} from "@nestjs/common";
import { TagsService } from "./tags.service";
import { Tag } from "./tags.entity";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Request } from "express";

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  // Create a new tag
  @Post()
  @UseGuards(JwtAuthGuard)
  async createTag(
    @Body('name') name: string,
    @Body('color') color: string,
    @Req() req: Request
  ): Promise<Tag> {
    const userId = (req.user as any)?.userId;
    if (!userId) throw new BadRequestException('Missing userId from token');
    return this.tagsService.createTag(name, color, userId);
  }

  // Get all tags for the logged-in user
  @Get()
  @UseGuards(JwtAuthGuard)
  async getAllTags(@Req() req: Request): Promise<Tag[]> {
    const userId = (req.user as any)?.userId;
    if (!userId) throw new BadRequestException('Missing userId from token');
    return this.tagsService.getAllTags(userId);
  }

  // Get a specific tag by ID (must be owned by the user)
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getTagById(
    @Param('id') id: number,
    @Req() req: Request
  ): Promise<Tag> {
    const userId = (req.user as any)?.userId;
    if (!userId) throw new BadRequestException('Missing userId from token');
    return this.tagsService.getTagById(id, userId);
  }

  // Delete a tag if it belongs to the user and isn't used
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteTag(
    @Param('id') id: number,
    @Req() req: Request
  ): Promise<void> {
    const userId = (req.user as any)?.userId;
    if (!userId) throw new BadRequestException('Missing userId from token');
    return this.tagsService.deleteTag(id, userId);
  }

  @Put(':id')
@UseGuards(JwtAuthGuard)
async updateTag(
  @Param('id') id: number,
  @Body('name') name: string,
  @Body('color') color: string,
  @Req() req: Request
): Promise<Tag> {
  const userId = (req.user as any)?.userId;
  if (!userId) throw new BadRequestException('Missing userId from token');
  return this.tagsService.updateTag(id, name, color, userId);
}
}
