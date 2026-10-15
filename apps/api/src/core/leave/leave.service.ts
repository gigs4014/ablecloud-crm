import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  alias,
  and,
  asc,
  departments,
  desc,
  eq,
  gte,
  inArray,
  leaveBalances,
  leaveRequests,
  lte,
  ne,
  sql,
  users,
  type Database,
  type LeaveRequest,
  type User,
} from '@erm/db';
import {
  addDays,
  calculateLeaveDays,
  currentLeavePeriod,
  DEDUCTIBLE_LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  zonedTimeToUtc,
  type LeaveBalanceDto,
  type LeaveDecisionInput,
  type LeaveRequestCreateInput,
  type LeaveRequestDto,
  type LeaveType,
} from '@erm/shared';
import type { AuthUser } from '../../common/auth';
import { AuditService } from '../../infra/audit.service';
import { DB } from '../../infra/tokens';
import { CALENDAR, MESSENGER, type CalendarPort, type MessengerPort } from '../ports';
import { TenantService } from '../tenant.service';

const DEDUCTIBLE = [...DEDUCTIBLE_LEAVE_TYPES] as LeaveType[];
const requester = alias(users, 'requester');
const approver = alias(users, 'approver');

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

@Injectable()
export class LeaveService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CALENDAR) private readonly calendar: CalendarPort,
    @Inject(MESSENGER) private readonly messenger: MessengerPort,
    private readonly tenants: TenantService,
    private readonly audit: AuditService,
  ) {}

  // ── 연차 잔여 ───────────────────────────────────────

  /** 입사일 기준 현재 연차 기간을 계산해 저장하고, 사용/대기/잔여 일수를 돌려줍니다. */
  async balance(tenantId: string, userId: string, executor: Database | Tx = this.db): Promise<LeaveBalanceDto> {
    const user = await this.tenants.getUser(tenantId, userId);
    const { today } = await this.tenants.today(tenantId);
    const period = currentLeavePeriod(user.hireDate, today);

    const [row] = await executor
      .insert(leaveBalances)
      .values({ tenantId, userId, periodStart: period.periodStart, periodEnd: period.periodEnd, granted: period.granted })
      .onConflictDoUpdate({
        target: [leaveBalances.userId, leaveBalances.periodStart],
        set: { granted: period.granted, periodEnd: period.periodEnd },
      })
      .returning();

    const sums = await executor
      .select({ status: leaveRequests.status, total: sql<string>`coalesce(sum(${leaveRequests.days}), 0)` })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.tenantId, tenantId),
          eq(leaveRequests.requesterId, userId),
          inArray(leaveRequests.type, DEDUCTIBLE),
          inArray(leaveRequests.status, ['APPROVED', 'PENDING']),
          gte(leaveRequests.startDate, period.periodStart),
          lte(leaveRequests.startDate, period.periodEnd),
        ),
      )
      .groupBy(leaveRequests.status);
    const used = Number(sums.find((s) => s.status === 'APPROVED')?.total ?? 0);
    const pending = Number(sums.find((s) => s.status === 'PENDING')?.total ?? 0);
    const granted = row.granted + row.adjusted;

    return {
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      granted,
      used,
      pending,
      remaining: granted - used,
    };
  }

  // ── 신청 ───────────────────────────────────────────

  async create(user: AuthUser, input: LeaveRequestCreateInput): Promise<LeaveRequestDto> {
    const holidays = await this.tenants.holidaySet(user.tenantId, input.startDate, input.endDate);
    let days: number;
    try {
      days = calculateLeaveDays(input.type, input.startDate, input.endDate, holidays);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    if (days === 0) throw new BadRequestException('선택한 기간에 근무일이 없습니다.');

    const requesterUser = await this.tenants.getUser(user.tenantId, user.userId);
    const approverUser = await this.resolveApprover(requesterUser);

    const created = await this.db.transaction(async (tx) => {
      // 같은 사람이 동시에 여러 건을 신청해 잔여 연차를 초과하지 않도록 사용자 단위로 잠급니다.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${user.userId}))`);

      const overlap = await tx
        .select({ id: leaveRequests.id })
        .from(leaveRequests)
        .where(
          and(
            eq(leaveRequests.requesterId, user.userId),
            inArray(leaveRequests.status, ['PENDING', 'APPROVED']),
            lte(leaveRequests.startDate, input.endDate),
            gte(leaveRequests.endDate, input.startDate),
          ),
        )
        .limit(1);
      if (overlap.length > 0) throw new ConflictException('이미 같은 기간에 신청한 휴가가 있습니다.');

      if (DEDUCTIBLE_LEAVE_TYPES.has(input.type)) {
        const balance = await this.balance(user.tenantId, user.userId, tx);
        const available = balance.remaining - balance.pending;
        if (days > available) {
          throw new BadRequestException(`잔여 연차가 부족합니다. (사용 가능 ${available}일, 신청 ${days}일)`);
        }
      }

      const autoApprove = approverUser === null;
      const [row] = await tx
        .insert(leaveRequests)
        .values({
          tenantId: user.tenantId,
          requesterId: user.userId,
          approverId: approverUser?.id ?? null,
          type: input.type,
          startDate: input.startDate,
          endDate: input.endDate,
          days,
          reason: input.reason ?? null,
          status: autoApprove ? 'APPROVED' : 'PENDING',
          decidedAt: autoApprove ? new Date() : null,
          decisionComment: autoApprove ? '결재자가 없어 자동 승인' : null,
        })
        .returning();
      return row;
    });

    if (created.status === 'APPROVED') {
      await this.afterApproved(created, requesterUser);
    } else if (approverUser) {
      await this.messenger.notify({ tenantId: user.tenantId }, approverUser.id, {
        kind: 'APPROVAL',
        title: `${requesterUser.name}님 휴가 신청`,
        body: `${this.describe(created)} · 결재가 필요합니다`,
        link: '/leave',
      });
    }
    return this.getDto(user.tenantId, created.id);
  }

  /** 결재자: 부서장 → (본인이 부서장이거나 부서장이 없으면) 관리자. 아무도 없으면 null(자동 승인) */
  private async resolveApprover(requesterUser: User): Promise<User | null> {
    if (requesterUser.departmentId) {
      const [dept] = await this.db
        .select({ managerId: departments.managerId })
        .from(departments)
        .where(eq(departments.id, requesterUser.departmentId));
      if (dept?.managerId && dept.managerId !== requesterUser.id) {
        const [manager] = await this.db
          .select()
          .from(users)
          .where(and(eq(users.id, dept.managerId), eq(users.status, 'ACTIVE')));
        if (manager) return manager;
      }
    }
    const [admin] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.tenantId, requesterUser.tenantId),
          eq(users.role, 'ADMIN'),
          eq(users.status, 'ACTIVE'),
          ne(users.id, requesterUser.id),
        ),
      )
      .orderBy(asc(users.createdAt))
      .limit(1);
    return admin ?? null;
  }

  // ── 결재 ───────────────────────────────────────────

  async decide(actor: AuthUser, id: string, input: LeaveDecisionInput, ip?: string): Promise<LeaveRequestDto> {
    const existing = await this.getRow(actor.tenantId, id);
    if (existing.approverId !== actor.userId && actor.role !== 'ADMIN') {
      throw new ForbiddenException('이 휴가의 결재자가 아닙니다.');
    }
    if (existing.requesterId === actor.userId) throw new ForbiddenException('본인 휴가는 결재할 수 없습니다.');

    const status = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const [updated] = await this.db
      .update(leaveRequests)
      .set({ status, decidedAt: new Date(), decisionComment: input.comment ?? null, approverId: actor.userId })
      .where(and(eq(leaveRequests.id, id), eq(leaveRequests.status, 'PENDING')))
      .returning();
    if (!updated) throw new ConflictException('이미 처리된 휴가입니다.');

    await this.audit.record({
      tenantId: actor.tenantId,
      actorId: actor.userId,
      action: status === 'APPROVED' ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
      targetType: 'leave_request',
      targetId: id,
      before: { status: existing.status },
      after: { status, comment: input.comment ?? null },
      ip,
    });

    const requesterUser = await this.tenants.getUser(actor.tenantId, updated.requesterId);
    if (status === 'APPROVED') {
      await this.afterApproved(updated, requesterUser);
    } else {
      await this.messenger.notify({ tenantId: actor.tenantId }, updated.requesterId, {
        kind: 'APPROVAL',
        title: '휴가가 반려되었습니다',
        body: [this.describe(updated), input.comment].filter(Boolean).join(' · '),
        link: '/leave',
      });
    }
    return this.getDto(actor.tenantId, id);
  }

  /** 승인 후 처리: 회사 캘린더 등록 + 신청자 알림 */
  private async afterApproved(request: LeaveRequest, requesterUser: User): Promise<void> {
    const scope = { tenantId: request.tenantId };
    const { tenant } = await this.tenants.today(request.tenantId);
    const label = LEAVE_TYPE_LABEL[request.type];
    const partial =
      request.type === 'HALF_AM' ? ['09:00', '14:00'] : request.type === 'HALF_PM' ? ['14:00', '18:00'] : null;

    const event = await this.calendar.createEvent(scope, {
      ownerId: null,
      title: `${requesterUser.name} ${label}`,
      startsAt: zonedTimeToUtc(request.startDate, partial?.[0] ?? '00:00', tenant.timezone),
      endsAt: partial
        ? zonedTimeToUtc(request.endDate, partial[1], tenant.timezone)
        : zonedTimeToUtc(addDays(request.endDate, 1), '00:00', tenant.timezone),
      allDay: !partial,
      dateRange: { start: request.startDate, end: request.endDate },
      source: 'LEAVE',
      sourceRef: request.id,
    });
    await this.db.update(leaveRequests).set({ calendarRef: event.ref }).where(eq(leaveRequests.id, request.id));
    await this.messenger.notify(scope, request.requesterId, {
      kind: 'APPROVAL',
      title: '휴가가 승인되었습니다',
      body: `${this.describe(request)} · 캘린더에 등록됨`,
      link: '/leave',
    });
  }

  // ── 취소 ───────────────────────────────────────────

  async cancel(user: AuthUser, id: string): Promise<LeaveRequestDto> {
    const existing = await this.getRow(user.tenantId, id);
    if (existing.requesterId !== user.userId) throw new ForbiddenException('본인 휴가만 취소할 수 있습니다.');
    const { today } = await this.tenants.today(user.tenantId);
    if (existing.status === 'APPROVED' && existing.startDate <= today) {
      throw new BadRequestException('이미 시작된 휴가는 관리자에게 정정을 요청하세요.');
    }
    if (existing.status !== 'PENDING' && existing.status !== 'APPROVED') {
      throw new ConflictException('취소할 수 없는 상태입니다.');
    }
    await this.db.update(leaveRequests).set({ status: 'CANCELED' }).where(eq(leaveRequests.id, id));
    if (existing.calendarRef) await this.calendar.deleteEvent({ tenantId: user.tenantId }, existing.calendarRef);
    if (existing.approverId && existing.status === 'PENDING') {
      await this.messenger.notify({ tenantId: user.tenantId }, existing.approverId, {
        kind: 'APPROVAL',
        title: '휴가 신청이 취소되었습니다',
        body: this.describe(existing),
        link: '/leave',
      });
    }
    return this.getDto(user.tenantId, id);
  }

  // ── 조회 ───────────────────────────────────────────

  async listMine(user: AuthUser, limit = 20): Promise<LeaveRequestDto[]> {
    return this.query(user.tenantId, eq(leaveRequests.requesterId, user.userId), limit);
  }

  /** 내가 결재할 대기 건 (관리자는 전체 대기 건) */
  async listPendingApprovals(user: AuthUser): Promise<LeaveRequestDto[]> {
    const scope = user.role === 'ADMIN' ? undefined : eq(leaveRequests.approverId, user.userId);
    const rows = await this.query(
      user.tenantId,
      and(eq(leaveRequests.status, 'PENDING'), scope, ne(leaveRequests.requesterId, user.userId)),
      100,
      'asc',
    );
    for (const r of rows) r.overlappingTeamCount = await this.countTeamOverlap(user.tenantId, r);
    return rows;
  }

  async countPendingApprovals(user: AuthUser): Promise<number> {
    return (await this.listPendingApprovals(user)).length;
  }

  private async countTeamOverlap(tenantId: string, r: LeaveRequestDto): Promise<number> {
    const requesterUser = await this.tenants.getUser(tenantId, r.requester.id);
    if (!requesterUser.departmentId) return 0;
    const [row] = await this.db
      .select({ count: sql<number>`count(distinct ${leaveRequests.requesterId})::int` })
      .from(leaveRequests)
      .innerJoin(users, eq(users.id, leaveRequests.requesterId))
      .where(
        and(
          eq(leaveRequests.tenantId, tenantId),
          eq(users.departmentId, requesterUser.departmentId),
          ne(leaveRequests.requesterId, r.requester.id),
          inArray(leaveRequests.status, ['PENDING', 'APPROVED']),
          lte(leaveRequests.startDate, r.endDate),
          gte(leaveRequests.endDate, r.startDate),
        ),
      );
    return row?.count ?? 0;
  }

  private async getRow(tenantId: string, id: string): Promise<LeaveRequest> {
    const [row] = await this.db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.id, id)));
    if (!row) throw new NotFoundException('휴가 신청을 찾을 수 없습니다.');
    return row;
  }

  private async getDto(tenantId: string, id: string): Promise<LeaveRequestDto> {
    const [dto] = await this.query(tenantId, eq(leaveRequests.id, id), 1);
    if (!dto) throw new NotFoundException('휴가 신청을 찾을 수 없습니다.');
    return dto;
  }

  private async query(
    tenantId: string,
    where: ReturnType<typeof and>,
    limit: number,
    order: 'asc' | 'desc' = 'desc',
  ): Promise<LeaveRequestDto[]> {
    const rows = await this.db
      .select({
        r: leaveRequests,
        requesterName: requester.name,
        approverName: approver.name,
      })
      .from(leaveRequests)
      .innerJoin(requester, eq(requester.id, leaveRequests.requesterId))
      .leftJoin(approver, eq(approver.id, leaveRequests.approverId))
      .where(and(eq(leaveRequests.tenantId, tenantId), where))
      .orderBy(order === 'asc' ? asc(leaveRequests.startDate) : desc(leaveRequests.startDate))
      .limit(limit);
    return rows.map(({ r, requesterName, approverName }) => ({
      id: r.id,
      requester: { id: r.requesterId, name: requesterName },
      approver: r.approverId && approverName ? { id: r.approverId, name: approverName } : null,
      type: r.type,
      startDate: r.startDate,
      endDate: r.endDate,
      days: r.days,
      reason: r.reason,
      status: r.status,
      decidedAt: r.decidedAt?.toISOString() ?? null,
      decisionComment: r.decisionComment,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  private describe(r: Pick<LeaveRequest, 'type' | 'startDate' | 'endDate' | 'days'>): string {
    const range = r.startDate === r.endDate ? r.startDate : `${r.startDate} ~ ${r.endDate}`;
    return `${LEAVE_TYPE_LABEL[r.type]} ${range} (${r.days}일)`;
  }
}
