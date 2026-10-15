import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { attendanceCorrectionSchema, type AttendanceDto } from '@erm/shared';
import { ClientIp, CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { parseBody } from '../../common/validation';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('today')
  async today(@CurrentUser() user: AuthUser, @ClientIp() ip?: string) {
    return {
      record: await this.attendance.today(user),
      allowedNetwork: await this.attendance.isAllowedNetwork(user.tenantId, ip),
    };
  }

  @Post('clock-in')
  @HttpCode(200)
  clockIn(@CurrentUser() user: AuthUser, @ClientIp() ip?: string): Promise<AttendanceDto> {
    return this.attendance.clockIn(user, ip);
  }

  @Post('clock-out')
  @HttpCode(200)
  clockOut(@CurrentUser() user: AuthUser, @ClientIp() ip?: string): Promise<AttendanceDto> {
    return this.attendance.clockOut(user, ip);
  }

  /** GET /attendance?month=2026-10&userId=... (userId는 팀장/관리자만) */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('month') month: string, @Query('userId') userId?: string) {
    return this.attendance.listMonth(user, month, userId);
  }

  @Roles('ADMIN')
  @Put('users/:userId')
  correct(
    @CurrentUser() user: AuthUser,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: unknown,
    @ClientIp() ip?: string,
  ): Promise<AttendanceDto> {
    return this.attendance.correct(user, userId, parseBody(attendanceCorrectionSchema, body), ip);
  }
}
