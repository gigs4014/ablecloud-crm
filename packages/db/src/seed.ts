/**
 * 초기 데이터. 여러 번 실행해도 안전합니다(이미 있으면 건너뜀).
 * - 첫 테넌트와 관리자 계정 생성
 * - SEED_DEMO=true 이면 화면 확인용 예시 직원/데이터 추가 (운영에서는 사용하지 마세요)
 */
import bcrypt from 'bcryptjs';
import { asc, eq } from 'drizzle-orm';
import { addDays, currentLeavePeriod, localDateString } from '@erm/shared';
import { createDatabase, type Database } from './client';
import {
  attendanceRecords,
  calendarEvents,
  departments,
  leaveBalances,
  leaveRequests,
  notifications,
  scheduleSuggestions,
  tenants,
  users,
} from './schema';

async function ensureBalance(db: Database, tenantId: string, userId: string, hireDate: string, today: string) {
  const period = currentLeavePeriod(hireDate, today);
  await db
    .insert(leaveBalances)
    .values({ tenantId, userId, periodStart: period.periodStart, periodEnd: period.periodEnd, granted: period.granted })
    .onConflictDoUpdate({
      target: [leaveBalances.userId, leaveBalances.periodStart],
      set: { granted: period.granted, periodEnd: period.periodEnd },
    });
}

async function main() {
  const { db, pool } = createDatabase();
  const tenantName = process.env.SEED_TENANT_NAME || '우리회사';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@example.com').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const timezone = process.env.APP_TIMEZONE || 'Asia/Seoul';

  let [tenant] = await db.select().from(tenants).orderBy(asc(tenants.createdAt)).limit(1);
  if (!tenant) {
    [tenant] = await db
      .insert(tenants)
      .values({ name: tenantName, timezone, settings: { allowedCidrs: [], workStart: '09:00', workEnd: '18:00' } })
      .returning();
    console.log(`테넌트 생성: ${tenant.name}`);
  }
  const today = localDateString(new Date(), tenant.timezone);

  const [existingAdmin] = await db.select().from(users).where(eq(users.email, adminEmail));
  if (!existingAdmin) {
    if (!adminPassword || adminPassword.length < 8) {
      throw new Error('SEED_ADMIN_PASSWORD를 8자 이상으로 설정하세요.');
    }
    const [admin] = await db
      .insert(users)
      .values({
        tenantId: tenant.id,
        email: adminEmail,
        name: '관리자',
        role: 'ADMIN',
        hireDate: today,
        passwordHash: await bcrypt.hash(adminPassword, 12),
      })
      .returning();
    await ensureBalance(db, tenant.id, admin.id, today, today);
    console.log(`관리자 계정 생성: ${adminEmail}`);
  }

  if (process.env.SEED_DEMO === 'true') {
    await seedDemo(db, tenant.id, today, adminPassword || 'demo-password');
  }
  await pool.end();
}

async function seedDemo(db: Database, tenantId: string, today: string, password: string) {
  const [exists] = await db.select().from(users).where(eq(users.email, 'minjun@example.com'));
  if (exists) {
    console.log('예시 데이터가 이미 있습니다.');
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const [dev] = await db.insert(departments).values({ tenantId, name: '개발팀' }).returning();
  const [sales] = await db.insert(departments).values({ tenantId, name: '영업팀' }).returning();

  const people = [
    { email: 'doyun@example.com', name: '이도윤', role: 'MANAGER', dept: dev.id, hire: '2021-04-01' },
    { email: 'minjun@example.com', name: '김민준', role: 'MEMBER', dept: dev.id, hire: '2023-03-02' },
    { email: 'yujin@example.com', name: '최유진', role: 'MEMBER', dept: dev.id, hire: '2024-07-15' },
    { email: 'seoyeon@example.com', name: '이서연', role: 'MEMBER', dept: dev.id, hire: '2026-03-02' },
    { email: 'jihoon@example.com', name: '박지훈', role: 'MANAGER', dept: sales.id, hire: '2019-09-02' },
    { email: 'haeun@example.com', name: '정하은', role: 'MEMBER', dept: sales.id, hire: '2022-11-01' },
  ] as const;

  const ids: Record<string, string> = {};
  for (const p of people) {
    const [u] = await db
      .insert(users)
      .values({ tenantId, email: p.email, name: p.name, role: p.role, departmentId: p.dept, hireDate: p.hire, passwordHash })
      .returning();
    ids[p.email] = u.id;
    await ensureBalance(db, tenantId, u.id, p.hire, today);
  }
  await db.update(departments).set({ managerId: ids['doyun@example.com'] }).where(eq(departments.id, dev.id));
  await db.update(departments).set({ managerId: ids['jihoon@example.com'] }).where(eq(departments.id, sales.id));

  const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+09:00`);
  await db.insert(attendanceRecords).values(
    (
      [
        ['doyun@example.com', '08:40'],
        ['jihoon@example.com', '08:51'],
        ['yujin@example.com', '09:15'],
      ] as const
    ).map(([email, time]) => ({ tenantId, userId: ids[email], workDate: today, clockIn: at(today, time) })),
  );

  const nextWeek = addDays(today, 8);
  await db.insert(leaveRequests).values([
    {
      tenantId,
      requesterId: ids['seoyeon@example.com'],
      approverId: ids['doyun@example.com'],
      type: 'ANNUAL',
      startDate: today,
      endDate: today,
      days: 1,
      status: 'APPROVED',
      decidedAt: new Date(),
    },
    {
      tenantId,
      requesterId: ids['yujin@example.com'],
      approverId: ids['doyun@example.com'],
      type: 'ANNUAL',
      startDate: nextWeek,
      endDate: nextWeek,
      days: 1,
      reason: '개인 일정',
    },
  ]);

  const minjun = ids['minjun@example.com'];
  await db.insert(calendarEvents).values([
    { tenantId, ownerId: null, title: '주간 개발 회의', startsAt: at(today, '10:00'), endsAt: at(today, '11:00') },
    { tenantId, ownerId: minjun, title: '고객사 기술 미팅', startsAt: at(today, '14:00'), endsAt: at(today, '15:00'), source: 'SUGGESTION' },
  ]);
  const tomorrow = addDays(today, 1);
  await db.insert(scheduleSuggestions).values({
    tenantId,
    userId: minjun,
    sourceLabel: '#개발팀 · 이도윤',
    quote: '내일 오후 3시에 배포 리허설 하죠. 민준님, 유진님 참석 부탁드려요',
    title: '배포 리허설',
    startsAt: at(tomorrow, '15:00'),
    endsAt: at(tomorrow, '16:00'),
    participants: ['이도윤', '김민준', '최유진'],
  });
  await db.insert(notifications).values([
    { tenantId, userId: minjun, kind: 'MAIL', title: '견적서 회신 요청 (박지훈)', body: '첨부 2개' },
    { tenantId, userId: minjun, kind: 'FILE', title: '제안서_v3.docx 수정됨', body: '공유 폴더 · 영업팀' },
  ]);
  console.log('예시 데이터 생성 완료. 예시 계정 비밀번호는 SEED_ADMIN_PASSWORD와 같습니다.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
