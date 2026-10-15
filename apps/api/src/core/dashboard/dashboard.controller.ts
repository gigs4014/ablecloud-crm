import { Body, Controller, Get, HttpCode, Inject, Post } from '@nestjs/common';
import {
  and,
  asc,
  attendanceRecords,
  eq,
  gte,
  inArray,
  leaveRequests,
  lte,
  users,
  type Database,
} from '@erm/db';
import {
  addDays,
  dayOfWeek,
  LEAVE_TYPE_LABEL,
  localTimeString,
  workedMinutes,
  zonedTimeToUtc,
  type DashboardDto,
  type TeamMemberStatusDto,
} from '@erm/shared';
import { z } from 'zod';
import { ClientIp, CurrentUser, type AuthUser } from '../../common/auth';
import { parseBody } from '../../common/validation';
import { DB } from '../../infra/tokens';
import { AttendanceService, toAttendanceDto } from '../attendance/attendance.service';
import { LeaveService } from '../leave/leave.service';
import { CALENDAR, MESSENGER, type CalendarPort, type MessengerPort } from '../ports';
import { ScheduleService } from '../schedule/schedule.service';
import { TenantService } from '../tenant.service';

const markReadSchema = z.object({ ids: z.array(z.string().uuid()).default([]) });

/** 홈 화면 한 번에 그리기 위한 요약 API */
@Controller()
export class DashboardController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CALENDAR) private readonly calendar: CalendarPort,
    @Inject(MESSENGER) private readonly messenger: MessengerPort,
    private readonly tenants: TenantService,
    private readonly attendance: AttendanceService,
    private readonly leave: LeaveService,
    private readonly schedule: ScheduleService,
  ) {}

  @Get('dashboard')
  async dashboard(@CurrentUser() user: AuthUser, @ClientIp() ip?: string): Promise<DashboardDto> {
    const { tenant, today } = await this.tenants.today(user.tenantId);
    const scope = { tenantId: user.tenantId };

    // 이번 주 월~금
    const monday = addDays(today, -((dayOfWeek(today) + 6) % 7));
    const friday = addDays(monday, 4);
    const weekRows = await this.db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, user.tenantId),
          eq(attendanceRecords.userId, user.userId),
          gte(attendanceRecords.workDate, monday),
          lte(attendanceRecords.workDate, friday),
        ),
      );
    const now = new Date();
    const weekDailyMinutes = [0, 1, 2, 3, 4].map((i) => {
      const date = addDays(monday, i);
      const row = weekRows.find((r) => r.workDate === date);
      return { date, minutes: row ? workedMinutes(row.clockIn, row.clockOut, now) : 0 };
    });
    const todayRow = weekRows.find((r) => r.workDate === today);

    const [balance, pendingApprovals, events, suggestions, notifications, allowedNetwork, team] = await Promise.all([
      this.leave.balance(user.tenantId, user.userId),
      user.role === 'MEMBER' ? Promise.resolve(0) : this.leave.countPendingApprovals(user),
      this.calendar.listEvents(scope, {
        userId: user.userId,
        from: zonedTimeToUtc(today, '00:00', tenant.timezone),
        to: zonedTimeToUtc(addDays(today, 1), '00:00', tenant.timezone),
      }),
      this.schedule.listPending(user),
      this.messenger.listForUser(scope, user.userId, 8),
      this.attendance.isAllowedNetwork(user.tenantId, ip),
      this.teamStatus(user.tenantId, today, tenant.timezone),
    ]);

    return {
      today,
      attendance: todayRow ? toAttendanceDto(todayRow, now) : null,
      allowedNetwork,
      balance,
      pendingApprovals,
      weekWorkedMinutes: weekDailyMinutes.reduce((s, d) => s + d.minutes, 0),
      weekDailyMinutes,
      events,
      suggestions,
      notifications,
      team,
    };
  }

  @Post('notifications/read')
  @HttpCode(204)
  async markRead(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<void> {
    const { ids } = parseBody(markReadSchema, body ?? {});
    await this.messenger.markRead({ tenantId: user.tenantId }, user.userId, ids);
  }

  private async teamStatus(tenantId: string, today: string, timeZone: string): Promise<TeamMemberStatusDto[]> {
    const [members, records, leaves] = await Promise.all([
      this.db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.status, 'ACTIVE')))
        .orderBy(asc(users.name)),
      this.db
        .select()
        .from(attendanceRecords)
        .where(and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.workDate, today))),
      this.db
        .select({ requesterId: leaveRequests.requesterId, type: leaveRequests.type })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.tenantId, tenantId),
            inArray(leaveRequests.status, ['APPROVED']),
            lte(leaveRequests.startDate, today),
            gte(leaveRequests.endDate, today),
          ),
        ),
    ]);

    return members.map((m) => {
      const leave = leaves.find((l) => l.requesterId === m.id);
      const rec = records.find((r) => r.userId === m.id);
      if (leave && !(rec?.clockIn && !rec.clockOut)) {
        return { id: m.id, name: m.name, status: 'ON_LEAVE', detail: LEAVE_TYPE_LABEL[leave.type] };
      }
      if (rec?.clockIn && !rec.clockOut) {
        return { id: m.id, name: m.name, status: 'WORKING', detail: localTimeString(rec.clockIn, timeZone) };
      }
      if (rec?.clockOut) {
        return { id: m.id, name: m.name, status: 'LEFT', detail: localTimeString(rec.clockOut, timeZone) };
      }
      return { id: m.id, name: m.name, status: 'NOT_IN', detail: null };
    });
  }
}
