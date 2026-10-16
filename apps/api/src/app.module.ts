import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AdaptersModule } from './adapters/adapters.module';
import { AuthGuard } from './common/auth';
import { loadConfig } from './config';
import { CoreModule } from './core/core.module';
import { InfraModule } from './infra/infra.module';

const config = loadConfig();

@Module({
  imports: [
    InfraModule.forRoot(config),
    AdaptersModule,
    JwtModule.register({ global: true, secret: config.jwtSecret }),
    CoreModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
