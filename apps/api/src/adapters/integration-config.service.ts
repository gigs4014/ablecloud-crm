import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, tenants, type Database } from '@erm/db';
import { APP_CONFIG, type AppConfig, type IntegrationProvider } from '../config';
import { CryptoService } from '../infra/crypto.service';
import { DB } from '../infra/tokens';

export interface SynologyRuntimeConfig {
  chatWebhookUrl?: string;
  caldavUrl?: string;
  caldavUsername?: string;
  caldavPassword?: string;
}

export interface ResolvedIntegration {
  provider: IntegrationProvider;
  synology: SynologyRuntimeConfig;
  /** 관리자 화면에서 저장한 값이 없어 환경 변수 값을 쓰는 중 */
  fromEnvironment: boolean;
}

const blankToUndefined = (v: string | null | undefined) => (v ? v : undefined);

/**
 * 회사(테넌트)별 외부 연동 설정을 읽습니다.
 * 관리자 화면에서 저장한 값이 우선이고, 없으면 서버 환경 변수(.env) 값을 씁니다.
 */
@Injectable()
export class IntegrationConfigService {
  private readonly logger = new Logger(IntegrationConfigService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly crypto: CryptoService,
  ) {}

  async resolve(tenantId: string): Promise<ResolvedIntegration> {
    const [tenant] = await this.db.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId));
    const saved = tenant?.settings.integration;

    if (!saved) {
      return {
        provider: this.config.integrationProvider,
        synology: {
          chatWebhookUrl: this.config.synology.chatWebhookUrl,
          caldavUrl: this.config.synology.caldavUrl,
          caldavUsername: this.config.synology.caldavUsername,
          caldavPassword: this.config.synology.caldavPassword,
        },
        fromEnvironment: true,
      };
    }

    let caldavPassword: string | undefined;
    if (saved.synology?.caldavPasswordEncrypted) {
      try {
        caldavPassword = this.crypto.decrypt(saved.synology.caldavPasswordEncrypted);
      } catch (e) {
        this.logger.error(`CalDAV 비밀번호를 복호화하지 못했습니다. 암호화 키가 바뀌었는지 확인하세요: ${(e as Error).message}`);
      }
    }
    return {
      provider: saved.provider ?? 'internal',
      synology: {
        chatWebhookUrl: blankToUndefined(saved.synology?.chatWebhookUrl),
        caldavUrl: blankToUndefined(saved.synology?.caldavUrl),
        caldavUsername: blankToUndefined(saved.synology?.caldavUsername),
        caldavPassword,
      },
      fromEnvironment: false,
    };
  }
}
