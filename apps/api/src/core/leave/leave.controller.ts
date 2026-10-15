import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { leaveDecisionSchema, leaveRequestCreateSchema } from '@erm/shared';
import { ClientIp, CurrentUser, Roles, type AuthUser } from '../../common/auth';
import { parseBody } from '../../common/validation';
import { LeaveService } from './leave.service';

@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('balance')
  balance(@CurrentUser() user: AuthUser) {
    return this.leave.balance(user.tenantId, user.userId);
  }

  @Get('requests')
  mine(@CurrentUser() user: AuthUser) {
    return this.leave.listMine(user);
  }

  @Post('requests')
  create(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    return this.leave.create(user, parseBody(leaveRequestCreateSchema, body));
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.leave.cancel(user, id);
  }

  @Roles('MANAGER', 'ADMIN')
  @Get('approvals')
  approvals(@CurrentUser() user: AuthUser) {
    return this.leave.listPendingApprovals(user);
  }

  @Roles('MANAGER', 'ADMIN')
  @Post('requests/:id/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
    @ClientIp() ip?: string,
  ) {
    return this.leave.decide(user, id, parseBody(leaveDecisionSchema, body), ip);
  }
}
