/**
 * 백그라운드 작업 처리기 (BullMQ)
 *
 * 현재 작업
 * - leave-accrual: 매일 새벽, 전 직원의 연차 발생 일수를 입사일 기준으로 갱신
 *
 * 2차 개발 예정
 * - schedule-extraction: 채팅 메시지에서 일정 후보 추출 (LLM 포트 사용)
 * - mail-sync, search-index: 메일/파일 수집과 통합 검색 색인
 */
import { Queue, Worker } from 'bullmq';
import { createDatabase, eq, leaveBalances, tenants, users } from '@erm/db';
import { currentLeavePeriod, localDateString } from '@erm/shared';

const QUEUE = 'erm-jobs';

function redisConnection() {
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

const { db, pool } = createDatabase();

/** 입사일 기준 연차를 다시 계산해 저장합니다. 여러 번 실행해도 결과가 같습니다. */
async function accrueLeave(): Promise<number> {
  let updated = 0;
  for (const tenant of await db.select().from(tenants)) {
    const today = localDateString(new Date(), tenant.timezone);
    const members = await db.select().from(users).where(eq(users.tenantId, tenant.id));
    for (const u of members.filter((m) => m.status === 'ACTIVE')) {
      const p = currentLeavePeriod(u.hireDate, today);
      await db
        .insert(leaveBalances)
        .values({ tenantId: tenant.id, userId: u.id, periodStart: p.periodStart, periodEnd: p.periodEnd, granted: p.granted })
        .onConflictDoUpdate({
          target: [leaveBalances.userId, leaveBalances.periodStart],
          set: { granted: p.granted, periodEnd: p.periodEnd },
        });
      updated += 1;
    }
  }
  return updated;
}

async function main() {
  const connection = redisConnection();
  const queue = new Queue(QUEUE, { connection });

  // 매일 00:10 (Asia/Seoul) 연차 갱신. 같은 이름으로 다시 등록해도 하나만 유지됩니다.
  await queue.upsertJobScheduler(
    'leave-accrual-daily',
    { pattern: '10 0 * * *', tz: process.env.APP_TIMEZONE || 'Asia/Seoul' },
    { name: 'leave-accrual' },
  );

  const worker = new Worker(
    QUEUE,
    async (job) => {
      switch (job.name) {
        case 'leave-accrual': {
          const count = await accrueLeave();
          return { updated: count };
        }
        default:
          throw new Error(`알 수 없는 작업: ${job.name}`);
      }
    },
    { connection, concurrency: 2 },
  );

  worker.on('completed', (job, result) => console.log(`[worker] ${job.name} 완료`, result));
  worker.on('failed', (job, err) => console.error(`[worker] ${job?.name} 실패: ${err.message}`));
  console.log('[worker] 시작');

  const shutdown = async () => {
    await worker.close();
    await queue.close();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
