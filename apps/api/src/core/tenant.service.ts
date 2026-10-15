import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, holidays, lte, tenants, users, type Database, type Tenant, type User } from '@erm/db';
import { localDateString } from '@erm/shared';
import { DB } from '../infra/tokens';

/** 여러 서비스가 함께 쓰는 테넌트/사용자 조회 */
@Injectable()
export class TenantService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getTenant(tenantId: string): Promise<Tenant> {
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) throw new NotFoundException('회사 정보를 찾을 수 없습니다.');
    return tenant;
  }

  async getUser(tenantId: string, userId: string): Promise<User> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)));
    if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.');
    return user;
  }

  async today(tenantId: string): Promise<{ tenant: Tenant; today: string }> {
    const tenant = await this.getTenant(tenantId);
    return { tenant, today: localDateString(new Date(), tenant.timezone) };
  }

  async holidaySet(tenantId: string, from: string, to: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ date: holidays.date })
      .from(holidays)
      .where(and(eq(holidays.tenantId, tenantId), gte(holidays.date, from), lte(holidays.date, to)));
    return new Set(rows.map((r) => r.date));
  }
}
