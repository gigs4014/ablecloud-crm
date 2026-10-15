import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
export type { Pool };

export function createDatabase(url = process.env.DATABASE_URL): { db: Database; pool: Pool } {
  if (!url) throw new Error('DATABASE_URL이 설정되지 않았습니다.');
  const pool = new Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}
