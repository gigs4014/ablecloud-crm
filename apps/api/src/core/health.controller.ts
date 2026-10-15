import { Controller, Get, Inject } from '@nestjs/common';
import { sql, type Database } from '@erm/db';
import { Public } from '../common/auth';
import { DB } from '../infra/tokens';

@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  @Public()
  @Get()
  async health() {
    await this.db.execute(sql`select 1`);
    return { status: 'ok' };
  }
}
