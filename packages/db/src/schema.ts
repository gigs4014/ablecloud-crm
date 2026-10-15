/**
 * DB 스키마 (Drizzle ORM, PostgreSQL)
 *
 * 모든 업무 테이블은 tenant_id를 가집니다. (설치형은 테넌트 1개, SaaS는 여러 개)
 * 서비스 계층에서 항상 tenant_id로 범위를 제한합니다.
 * 날짜(date)는 'YYYY-MM-DD' 문자열, 시각(timestamptz)은 Date로 다룹니다.
 */
import { relations, sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () => uuid('id').primaryKey().defaultRandom();
const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' });
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const days = (name: string) => numeric(name, { precision: 5, scale: 2, mode: 'number' });

export const roleEnum = pgEnum('role', ['ADMIN', 'MANAGER', 'MEMBER']);
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'INACTIVE']);
export const attendanceSourceEnum = pgEnum('attendance_source', ['WEB', 'MOBILE', 'CHAT', 'CORRECTION']);
export const leaveTypeEnum = pgEnum('leave_type', ['ANNUAL', 'HALF_AM', 'HALF_PM', 'QUARTER', 'SICK', 'FAMILY_EVENT']);
export const leaveStatusEnum = pgEnum('leave_status', ['PENDING', 'APPROVED', 'REJECTED', 'CANCELED']);
export const suggestionStatusEnum = pgEnum('suggestion_status', ['PENDING', 'ACCEPTED', 'DISMISSED']);

export interface TenantSettings {
  /** 출근 체크를 허용할 사내 네트워크 대역. 비어 있으면 제한 없음 */
  allowedCidrs?: string[];
  workStart?: string;
  workEnd?: string;
}

export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('Asia/Seoul'),
  settings: jsonb('settings').$type<TenantSettings>().notNull().default({}),
  createdAt: createdAt(),
});

export const departments = pgTable(
  'departments',
  {
    id: id(),
    tenantId: tenantId(),
    name: text('name').notNull(),
    managerId: uuid('manager_id').references((): AnyPgColumn => users.id, { onDelete: 'set null' }),
  },
  (t) => [uniqueIndex('departments_tenant_name_uq').on(t.tenantId, t.name)],
);

export const users = pgTable(
  'users',
  {
    id: id(),
    tenantId: tenantId(),
    departmentId: uuid('department_id').references(() => departments.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('MEMBER'),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    hireDate: date('hire_date', { mode: 'string' }).notNull(),
    /** AES-256-GCM 암호화된 연락처. 평문 저장 금지 */
    phoneEncrypted: text('phone_encrypted'),
    /** 외부 서비스 계정 매핑 { synology: "username" } */
    externalIds: jsonb('external_ids').$type<Record<string, string>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email), index('users_tenant_idx').on(t.tenantId)],
);

export const holidays = pgTable(
  'holidays',
  {
    id: id(),
    tenantId: tenantId(),
    date: date('date', { mode: 'string' }).notNull(),
    name: text('name').notNull(),
  },
  (t) => [uniqueIndex('holidays_tenant_date_uq').on(t.tenantId, t.date)],
);

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workDate: date('work_date', { mode: 'string' }).notNull(),
    clockIn: timestamp('clock_in', { withTimezone: true }),
    clockOut: timestamp('clock_out', { withTimezone: true }),
    clockInIp: text('clock_in_ip'),
    clockOutIp: text('clock_out_ip'),
    source: attendanceSourceEnum('source').notNull().default('WEB'),
    note: text('note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('attendance_user_date_uq').on(t.userId, t.workDate),
    index('attendance_tenant_date_idx').on(t.tenantId, t.workDate),
  ],
);

/** 연차 산정 기간별 발생 일수. 사용 일수는 승인된 휴가에서 계산합니다. */
export const leaveBalances = pgTable(
  'leave_balances',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    granted: days('granted').notNull(),
    /** 관리자 수동 조정 (+/-) */
    adjusted: days('adjusted').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('leave_balances_user_period_uq').on(t.userId, t.periodStart)],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: id(),
    tenantId: tenantId(),
    requesterId: uuid('requester_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    approverId: uuid('approver_id').references(() => users.id, { onDelete: 'set null' }),
    type: leaveTypeEnum('type').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    days: days('days').notNull(),
    reason: text('reason'),
    status: leaveStatusEnum('status').notNull().default('PENDING'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionComment: text('decision_comment'),
    /** 캘린더 어댑터가 돌려준 일정 ID */
    calendarRef: text('calendar_ref'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('leave_requests_tenant_status_idx').on(t.tenantId, t.status),
    index('leave_requests_requester_idx').on(t.requesterId, t.startDate),
  ],
);

/** internal 캘린더 어댑터가 사용하는 자체 일정 저장소 */
export const calendarEvents = pgTable(
  'calendar_events',
  {
    id: id(),
    tenantId: tenantId(),
    /** null이면 회사 전체 일정 */
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    allDay: boolean('all_day').notNull().default(false),
    source: text('source').notNull().default('MANUAL'),
    sourceRef: text('source_ref'),
    createdAt: createdAt(),
  },
  (t) => [index('calendar_events_tenant_starts_idx').on(t.tenantId, t.startsAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_created_idx').on(t.userId, t.createdAt)],
);

/** 대화에서 추출한 일정 후보. 사용자가 확인해야 캘린더에 등록됩니다. */
export const scheduleSuggestions = pgTable(
  'schedule_suggestions',
  {
    id: id(),
    tenantId: tenantId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceLabel: text('source_label').notNull(),
    quote: text('quote').notNull(),
    title: text('title').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    participants: text('participants')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: suggestionStatusEnum('status').notNull().default('PENDING'),
    messageRef: text('message_ref'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('schedule_suggestions_user_status_idx').on(t.userId, t.status)],
);

/** 근태 정정, 휴가 결재, 개인정보 조회 등 기록 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: id(),
    tenantId: tenantId(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    ip: text('ip'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_tenant_created_idx').on(t.tenantId, t.createdAt)],
);

export const usersRelations = relations(users, ({ one }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  tenant: one(tenants, { fields: [users.tenantId], references: [tenants.id] }),
}));

export const departmentsRelations = relations(departments, ({ many }) => ({
  members: many(users),
}));

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type AttendanceRecord = typeof attendanceRecords.$inferSelect;
export type LeaveBalance = typeof leaveBalances.$inferSelect;
export type LeaveRequest = typeof leaveRequests.$inferSelect;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type ScheduleSuggestion = typeof scheduleSuggestions.$inferSelect;
