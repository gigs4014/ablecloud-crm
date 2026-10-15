import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, attendanceRecords, eq, gte, lte, type AttendanceRecord, type Database } from '@erm/db';
import {
  addDays,
  addMonths,
  isAllowedNetwork,
  normalizeIp,
  workedMinutes,
  type AttendanceCorrectionInput,
  type AttendanceDto,
} from '@erm/shared';
import type { AuthUser } from '../../common/auth';
import { AuditService } from '../../infra/audit.service';
import { DB } from '../../infra/tokens';
import { TenantService } from '../tenant.service';

export function toAttendanceDto(r: AttendanceRecord, now = new Date()): AttendanceDto {
  return {
    workDate: r.workDate,
    clockIn: r.clockIn?.toISOString() ?? null,
    clockOut: r.clockOut?.toISOString() ?? null,
    workedMinutes: workedMinutes(r.clockIn, r.clockOut, now),
    source: r.source,
  };
}

@Injectable()
export class AttendanceService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  /** 사내 네트워크에서 접속했는지 (허용 대역이 없으면 항상 true) */
  async isAllowedNetwork(tenantId: string, ip: string | undefined): Promise<boolean> {
    const tenant = await this.tenants.getTenant(tenantId);
    return isAllowedNetwork(ip, tenant.settings.allowedCidrs ?? []);
  }

  private async findRecord(user: AuthUser, workDate: string): Promise<AttendanceRecord | undefined> {
    const [row] = await this.db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, user.tenantId),
          eq(attendanceRecords.userId, user.userId),
          eq(attendanceRecords.workDate, workDate),
        ),
      );
    return row;
  }

  async today(user: AuthUser): Promise<AttendanceDto | null> {
    const { today } = await this.tenants.today(user.tenantId);
    const row = await this.findRecord(user, today);
    return row ? toAttendanceDto(row) : null;
  }

  async clockIn(user: AuthUser, ip: string | undefined, source: 'WEB' | 'MOBILE' = 'WEB'): Promise<AttendanceDto> {
    if (!(await this.isAllowedNetwork(user.tenantId, ip))) {
      throw new ForbiddenException('사내 네트워크에서만 출근할 수 있습니다.');
    }
    const { today } = await this.tenants.today(user.tenantId);
    const existing = await this.findRecord(user, today);
    if (existing?.clockIn) throw new ConflictException('오늘은 이미 출근했습니다.');

    const [row] = await this.db
      .insert(attendanceRecords)
      .values({
        tenantId: user.tenantId,
        userId: user.userId,
        workDate: today,
        clockIn: new Date(),
        clockInIp: ip ? normalizeIp(ip) : null,
        source,
      })
      .onConflictDoUpdate({
        target: [attendanceRecords.userId, attendanceRecords.workDate],
        set: { clockIn: new Date(), clockInIp: ip ? normalizeIp(ip) : null, source },
      })
      .returning();
    return toAttendanceDto(row);
  }

  async clockOut(user: AuthUser, ip: string | undefined): Promise<AttendanceDto> {
    if (!(await this.isAllowedNetwork(user.tenantId, ip))) {
      throw new ForbiddenException('사내 네트워크에서만 퇴근할 수 있습니다.');
    }
    const { today } = await this.tenants.today(user.tenantId);
    // 자정을 넘겨 퇴근하는 경우 전날 기록을 닫습니다.
    const record = (await this.findRecord(user, today)) ?? (await this.findRecord(user, addDays(today, -1)));
    if (!record?.clockIn) throw new BadRequestException('출근 기록이 없습니다.');
    if (record.clockOut) throw new ConflictException('이미 퇴근했습니다.');

    const [row] = await this.db
      .update(attendanceRecords)
      .set({ clockOut: new Date(), clockOutIp: ip ? normalizeIp(ip) : null })
      .where(eq(attendanceRecords.id, record.id))
      .returning();
    return toAttendanceDto(row);
  }

  /** month: 'YYYY-MM' */
  async listMonth(user: AuthUser, month: string, targetUserId?: string): Promise<AttendanceDto[]> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('month 형식은 YYYY-MM 입니다.');
    const userId = targetUserId ?? user.userId;
    if (userId !== user.userId && user.role === 'MEMBER') throw new ForbiddenException('권한이 없습니다.');
    const from = `${month}-01`;
    const to = addDays(addMonths(from, 1), -1);
    const rows = await this.db
      .select()
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.tenantId, user.tenantId),
          eq(attendanceRecords.userId, userId),
          gte(attendanceRecords.workDate, from),
          lte(attendanceRecords.workDate, to),
        ),
      )
      .orderBy(asc(attendanceRecords.workDate));
    return rows.map((r) => toAttendanceDto(r));
  }

  /** 관리자 근태 정정. 변경 전후를 감사 로그에 남깁니다. */
  async correct(
    actor: AuthUser,
    userId: string,
    input: AttendanceCorrectionInput,
    ip: string | undefined,
  ): Promise<AttendanceDto> {
    await this.tenants.getUser(actor.tenantId, userId);
    const before = await this.findRecord({ ...actor, userId }, input.workDate);
    const values = {
      clockIn: input.clockIn ? new Date(input.clockIn) : (before?.clockIn ?? null),
      clockOut: input.clockOut ? new Date(input.clockOut) : (before?.clockOut ?? null),
      source: 'CORRECTION' as const,
      note: input.reason,
    };
    const [row] = await this.db
      .insert(attendanceRecords)
      .values({ tenantId: actor.tenantId, userId, workDate: input.workDate, ...values })
      .onConflictDoUpdate({ target: [attendanceRecords.userId, attendanceRecords.workDate], set: values })
      .returning();
    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: 'ATTENDANCE_CORRECT',
      targetType: 'attendance',
      targetId: row.id,
      before: before ? toAttendanceDto(before) : null,
      after: { ...toAttendanceDto(row), reason: input.reason },
      ip,
    });
    return toAttendanceDto(row);
  }
}
