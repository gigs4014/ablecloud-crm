/** 배포 시 실행하는 마이그레이션. 이미 적용된 것은 건너뜁니다. */
import path from 'node:path';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from './client';

async function main() {
  const { db, pool } = createDatabase();
  const migrationsFolder = path.resolve(__dirname, '../migrations');
  await migrate(db, { migrationsFolder });
  await pool.end();
  console.log('마이그레이션 완료');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
