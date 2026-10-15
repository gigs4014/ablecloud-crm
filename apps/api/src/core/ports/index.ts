/**
 * 포트(Port): 코어가 외부 세계에 기대하는 기능의 "약속"입니다.
 * 코어는 이 인터페이스만 알고, 실제 구현은 adapters/ 아래의 어댑터가 담당합니다.
 * 어떤 어댑터를 쓸지는 adapters/adapters.module.ts에서 INTEGRATION_PROVIDER로 정합니다.
 */
import type { CalendarEventDto, NotificationDto } from '@erm/shared';

export interface TenantScope {
  tenantId: string;
}

// ── 캘린더 ─────────────────────────────────────────────
export interface CalendarEventInput {
  /** null이면 회사 전체 일정 */
  ownerId: string | null;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  /** 종일 일정의 로컬 날짜 범위 (종료일 포함). allDay일 때 필수 */
  dateRange?: { start: string; end: string };
  /** LEAVE, SUGGESTION, MANUAL 등 */
  source: string;
  sourceRef?: string;
}

export interface CalendarPort {
  createEvent(scope: TenantScope, input: CalendarEventInput): Promise<{ ref: string }>;
  deleteEvent(scope: TenantScope, ref: string): Promise<void>;
  /** 사용자에게 보이는 일정 (본인 일정 + 회사 전체 일정) */
  listEvents(scope: TenantScope, query: { userId: string; from: Date; to: Date }): Promise<CalendarEventDto[]>;
}
export const CALENDAR = Symbol('CalendarPort');

// ── 알림/메신저 ────────────────────────────────────────
export interface NotifyInput {
  kind: string;
  title: string;
  body?: string;
  link?: string;
}

export interface MessengerPort {
  notify(scope: TenantScope, userId: string, input: NotifyInput): Promise<void>;
  listForUser(scope: TenantScope, userId: string, limit: number): Promise<NotificationDto[]>;
  markRead(scope: TenantScope, userId: string, ids: string[]): Promise<void>;
}
export const MESSENGER = Symbol('MessengerPort');

// ── 메일 ───────────────────────────────────────────────
export interface MailSummary {
  id: string;
  from: string;
  subject: string;
  receivedAt: string;
  hasAttachments: boolean;
}

export interface MailPort {
  listRecent(scope: TenantScope, userId: string, limit: number): Promise<MailSummary[]>;
}
export const MAIL = Symbol('MailPort');

// ── 파일 저장소 ────────────────────────────────────────
export interface FileSummary {
  id: string;
  name: string;
  path: string;
  modifiedAt: string;
  url?: string;
}

export interface StoragePort {
  search(scope: TenantScope, userId: string, query: string, limit: number): Promise<FileSummary[]>;
}
export const STORAGE = Symbol('StoragePort');

// ── LLM (대화 → 일정 추출) ─────────────────────────────
export interface ExtractedSchedule {
  title: string;
  startsAt: Date;
  endsAt: Date;
  participants: string[];
  confidence: number;
}

export interface LlmPort {
  extractSchedules(text: string, context: { now: Date; timeZone: string }): Promise<ExtractedSchedule[]>;
}
export const LLM = Symbol('LlmPort');
