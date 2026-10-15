import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { scheduleSuggestionDecisionSchema, zonedTimeToUtc, addDays } from '@erm/shared';
import { CurrentUser, type AuthUser } from '../../common/auth';
import { parseBody } from '../../common/validation';
import { CALENDAR, type CalendarPort } from '../ports';
import { TenantService } from '../tenant.service';
import { ScheduleService } from './schedule.service';

@Controller('schedule')
export class ScheduleController {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly tenants: TenantService,
    @Inject(CALENDAR) private readonly calendar: CalendarPort,
  ) {}

  /** GET /schedule/events?from=2026-10-15&to=2026-10-21 (로컬 날짜, 종료일 포함) */
  @Get('events')
  async events(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    const { tenant, today } = await this.tenants.today(user.tenantId);
    const start = from ?? today;
    const end = to ?? start;
    return this.calendar.listEvents(
      { tenantId: user.tenantId },
      {
        userId: user.userId,
        from: zonedTimeToUtc(start, '00:00', tenant.timezone),
        to: zonedTimeToUtc(addDays(end, 1), '00:00', tenant.timezone),
      },
    );
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthUser) {
    return this.schedule.listPending(user);
  }

  @Post('suggestions/:id/decision')
  @HttpCode(200)
  decide(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    return this.schedule.decide(user, id, parseBody(scheduleSuggestionDecisionSchema, body));
  }
}
