import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  StreamableFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ParseEntityIdPipe } from '../../common/parse-entity-id.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NoteAttachmentsService } from './note-attachments.service';
import { MAX_ATTACHMENT_BYTES } from './note-attachments.constants';

@Controller('notes/:noteId/attachments')
@UseGuards(JwtAuthGuard)
export class NoteAttachmentsController {
  constructor(private readonly attachmentsService: NoteAttachmentsService) {}

  @Get()
  async list(
    @Param('noteId', ParseEntityIdPipe) noteId: number,
    @Req() req: any,
  ) {
    return this.attachmentsService.list(noteId, req.user.userId);
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_ATTACHMENT_BYTES } }),
  )
  async upload(
    @Param('noteId', ParseEntityIdPipe) noteId: number,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded');
    return this.attachmentsService.create(noteId, req.user.userId, file);
  }

  @Get(':attachmentId/raw')
  async raw(
    @Param('noteId', ParseEntityIdPipe) noteId: number,
    @Param('attachmentId', ParseEntityIdPipe) attachmentId: number,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { data, mimeType, filename } = await this.attachmentsService.getBytes(
      noteId,
      attachmentId,
      req.user.userId,
    );

    // Strip anything that could break the header; the frontend fetches these
    // as authenticated blobs, so inline disposition is purely a hint.
    const safeName = filename.replace(/["\r\n]/g, '_');
    res.set({ 'Cache-Control': 'private, max-age=3600' });
    return new StreamableFile(data, {
      type: mimeType,
      disposition: `inline; filename="${safeName}"`,
    });
  }

  @Delete(':attachmentId')
  async remove(
    @Param('noteId', ParseEntityIdPipe) noteId: number,
    @Param('attachmentId', ParseEntityIdPipe) attachmentId: number,
    @Req() req: any,
  ) {
    await this.attachmentsService.remove(noteId, attachmentId, req.user.userId);
    return { success: true };
  }
}
