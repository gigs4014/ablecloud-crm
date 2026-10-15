import { z } from 'zod';
import { isIsoDate } from './domain/dates';
import { LEAVE_TYPES, type LeaveType } from './domain/leave-policy';

/** API 요청 검증 스키마와 응답 타입. 웹과 API가 함께 사용합니다. */

const isoDate = z.string().refine(isIsoDate, '날짜 형식은 YYYY-MM-DD 입니다.');

export const loginSchema = z.object({
  email: z.string().email('이메일 형식이 아닙니다.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const leaveRequestCreateSchema = z
  .object({
    type: z.enum(LEAVE_TYPES),
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.startDate <= v.endDate, { message: '종료일이 시작일보다 빠릅니다.', path: ['endDate'] });
export type LeaveRequestCreateInput = z.infer<typeof leaveRequestCreateSchema>;

export const leaveDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  comment: z.string().max(500).optional(),
});
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;

export const attendanceCorrectionSchema = z.object({
  workDate: isoDate,
  clockIn: z.string().datetime().optional(),
  clockOut: z.string().datetime().optional(),
  reason: z.string().min(1, '정정 사유를 입력하세요.').max(500),
});
export type AttendanceCorrectionInput = z.infer<typeof attendanceCorrectionSchema>;

export const scheduleSuggestionDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'DISMISS']),
  title: z.string().min(1).max(200).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type ScheduleSuggestionDecisionInput = z.infer<typeof scheduleSuggestionDecisionSchema>;

export type Role = 'ADMIN' | 'MANAGER' | 'MEMBER';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELED';

export interface MeDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  departmentName: string | null;
  tenantName: string;
}

export interface AttendanceDto {
  workDate: string;
  clockIn: string | null;
  clockOut: string | null;
  workedMinutes: number;
  source: string;
}

export interface LeaveBalanceDto {
  periodStart: string;
  periodEnd: string;
  granted: number;
  used: number;
  pending: number;
  remaining: number;
}

export interface LeaveRequestDto {
  id: string;
  requester: { id: string; name: string };
  approver: { id: string; name: string } | null;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
  /** 같은 기간에 휴가가 겹치는 팀원 수 (결재자 화면용) */
  overlappingTeamCount?: number;
}

export interface CalendarEventDto {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  source: string;
}

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ScheduleSuggestionDto {
  id: string;
  sourceLabel: string;
  quote: string;
  title: string;
  startsAt: string;
  endsAt: string;
  participants: string[];
  status: 'PENDING' | 'ACCEPTED' | 'DISMISSED';
}

export interface TeamMemberStatusDto {
  id: string;
  name: string;
  status: 'WORKING' | 'NOT_IN' | 'LEFT' | 'ON_LEAVE';
  detail: string | null;
}

export interface DashboardDto {
  today: string;
  attendance: AttendanceDto | null;
  allowedNetwork: boolean;
  balance: LeaveBalanceDto | null;
  pendingApprovals: number;
  weekWorkedMinutes: number;
  weekDailyMinutes: { date: string; minutes: number }[];
  events: CalendarEventDto[];
  suggestions: ScheduleSuggestionDto[];
  notifications: NotificationDto[];
  team: TeamMemberStatusDto[];
}
