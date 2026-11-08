import { Controller, Get, Header, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExportService } from './export.service';
import type { AccountExport } from './export.types';

type AuthenticatedRequest = { user: { userId: number } };

@Controller('export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('Pragma', 'no-cache')
  @Header('Vary', 'Authorization')
  async download(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountExport> {
    const snapshot = await this.exportService.build(Number(req.user.userId));
    const day = snapshot.exportedAt.slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="prysmic-export-${day}.json"`,
    );
    return snapshot;
  }
}
