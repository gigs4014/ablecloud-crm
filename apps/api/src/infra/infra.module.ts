import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { createDatabase, type Pool } from '@erm/db';
import { APP_CONFIG, type AppConfig } from '../config';
import { AuditService } from './audit.service';
import { CryptoService } from './crypto.service';
import { DB } from './tokens';

const DB_POOL = Symbol('DB_POOL');

@Global()
@Module({})
export class InfraModule implements OnApplicationShutdown {
  static forRoot(config: AppConfig) {
    const { db, pool } = createDatabase(config.databaseUrl);
    return {
      module: InfraModule,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: DB, useValue: db },
        { provide: DB_POOL, useValue: pool },
        CryptoService,
        AuditService,
      ],
      exports: [APP_CONFIG, DB, CryptoService, AuditService],
    };
  }

  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end();
  }
}
