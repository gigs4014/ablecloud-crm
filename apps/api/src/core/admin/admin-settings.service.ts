import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq, tenants, type Database, type TenantSettings } from '@erm/db';
import {
  normalizeIp,
  type AdminSettingsDto,
  type AdminSettingsUpdateInput,
  type IntegrationTestResultDto,
} from '@erm/shared';
import type { AuthUser } from '../../common/auth';
import { IntegrationConfigService } from '../../adapters/integration-config.service';
import { caldavAuthHeader } from '../../adapters/synology/synology-calendar.adapter';
import { postSynologyChat } from '../../adapters/synology/synology-chat.adapter';
import { AuditService } from '../../infra/audit.service';
import { CryptoService } from '../../infra/crypto.service';
import { DB } from '../../infra/tokens';
import { TenantService } from '../tenant.service';

function describeFetchError(e: unknown): string {
  const err = e as Error & { cause?: { code?: string } };
  if (err.name === 'TimeoutError') return '응답이 없습니다(시간 초과). 주소와 포트, 방화벽을 확인하세요.';
  const code = err.cause?.code;
  if (code === 'ENOTFOUND') return '주소를 찾을 수 없습니다. 도메인 이름을 확인하세요.';
  if (code === 'ECONNREFUSED') return '연결이 거부되었습니다. 포트 번호와 서비스 실행 여부를 확인하세요.';
  if ((code && code.startsWith('ERR_TLS')) || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'SELF_SIGNED_CERT_IN_CHAIN')
    return 'HTTPS 인증서를 신뢰할 수 없습니다. 정식 인증서를 쓰거나 내부망 주소(http)를 사용하세요.';
  return `연결하지 못했습니다: ${err.message}`;
}

/** 관리자 설정: 출근 허용 네트워크, 외부 연동(시놀로지) */
@Injectable()
export class AdminSettingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly tenants: TenantService,
    private readonly integration: IntegrationConfigService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  async get(user: AuthUser, ip?: string): Promise<AdminSettingsDto> {
    const tenant = await this.tenants.getTenant(user.tenantId);
    const resolved = await this.integration.resolve(user.tenantId);
    return {
      allowedCidrs: tenant.settings.allowedCidrs ?? [],
      currentIp: ip ? normalizeIp(ip) : null,
      integration: {
        provider: resolved.provider,
        fromEnvironment: resolved.fromEnvironment,
        synology: {
          chatWebhookUrl: resolved.synology.chatWebhookUrl ?? '',
          caldavUrl: resolved.synology.caldavUrl ?? '',
          caldavUsername: resolved.synology.caldavUsername ?? '',
          caldavPasswordSet: Boolean(resolved.synology.caldavPassword),
        },
      },
      encryptionReady: this.crypto.ready,
    };
  }

  async update(user: AuthUser, input: AdminSettingsUpdateInput, ip?: string): Promise<AdminSettingsDto> {
    const tenant = await this.tenants.getTenant(user.tenantId);
    const before = tenant.settings;
    const next: TenantSettings = { ...before };

    if (input.allowedCidrs) {
      // 출퇴근 버튼에만 적용되고 로그인은 막지 않습니다. (IP 하나만 적으면 /32로 저장)
      next.allowedCidrs = [...new Set(input.allowedCidrs.map((c) => (c.includes('/') ? c : `${c}/32`)))];
    }

    if (input.integration) {
      const prev = before.integration?.synology ?? {};
      // 처음 저장할 때는 환경 변수에 있던 비밀번호를 이어받습니다.
      const current = await this.integration.resolve(user.tenantId);
      const s = input.integration.synology ?? {};
      let caldavPasswordEncrypted = prev.caldavPasswordEncrypted ?? null;
      if (s.caldavPassword !== undefined) {
        if (s.caldavPassword === '') {
          caldavPasswordEncrypted = null;
        } else {
          if (!this.crypto.ready) {
            throw new BadRequestException('서버에 DATA_ENCRYPTION_KEY가 없어 비밀번호를 저장할 수 없습니다. .env에 설정한 뒤 다시 시도하세요.');
          }
          caldavPasswordEncrypted = this.crypto.encrypt(s.caldavPassword);
        }
      } else if (!before.integration && current.synology.caldavPassword && this.crypto.ready) {
        caldavPasswordEncrypted = this.crypto.encrypt(current.synology.caldavPassword);
      }
      next.integration = {
        provider: input.integration.provider,
        synology: {
          chatWebhookUrl: s.chatWebhookUrl ?? prev.chatWebhookUrl ?? current.synology.chatWebhookUrl ?? null,
          caldavUrl: s.caldavUrl ?? prev.caldavUrl ?? current.synology.caldavUrl ?? null,
          caldavUsername: s.caldavUsername ?? prev.caldavUsername ?? current.synology.caldavUsername ?? null,
          caldavPasswordEncrypted,
        },
      };
    }

    await this.db.update(tenants).set({ settings: next }).where(eq(tenants.id, user.tenantId));
    await this.audit.record({
      tenantId: user.tenantId,
      actorId: user.userId,
      action: 'SETTINGS_UPDATE',
      targetType: 'tenant',
      targetId: user.tenantId,
      before: this.redact(before),
      after: this.redact(next),
      ip,
    });
    return this.get(user, ip);
  }

  /** 저장된 설정으로 실제 연결을 시험합니다. */
  async test(user: AuthUser, target: 'chat' | 'calendar'): Promise<IntegrationTestResultDto> {
    const { synology } = await this.integration.resolve(user.tenantId);

    if (target === 'chat') {
      if (!synology.chatWebhookUrl) return { ok: false, message: '챗 웹훅 주소를 먼저 저장하세요.' };
      try {
        const res = await postSynologyChat(synology.chatWebhookUrl, '[포털] 연결 테스트 메시지입니다.');
        const body = await res.text().catch(() => '');
        // 시놀로지 챗은 실패해도 200과 {"success":false}를 돌려줄 수 있습니다.
        if (res.ok && !/"success"\s*:\s*false/.test(body)) {
          return { ok: true, message: '테스트 메시지를 보냈습니다. 챗 채널에서 확인하세요.' };
        }
        return { ok: false, message: `챗 서버가 요청을 거부했습니다 (HTTP ${res.status}). 웹훅 주소가 맞는지 확인하세요.` };
      } catch (e) {
        return { ok: false, message: describeFetchError(e) };
      }
    }

    if (!synology.caldavUrl) return { ok: false, message: 'CalDAV 주소를 먼저 저장하세요.' };
    if (!synology.caldavUsername || !synology.caldavPassword) {
      return { ok: false, message: 'CalDAV 계정과 비밀번호를 먼저 저장하세요.' };
    }
    try {
      const res = await fetch(synology.caldavUrl, {
        method: 'PROPFIND',
        headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8', ...caldavAuthHeader(synology) },
        body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>',
        signal: AbortSignal.timeout(8000),
      });
      if (res.status === 207 || res.ok) {
        const xml = await res.text();
        const isCalendar = /calendar/i.test(xml);
        const name = /<[^>]*displayname[^>]*>([^<]+)</i.exec(xml)?.[1];
        return isCalendar
          ? { ok: true, message: `캘린더에 연결했습니다${name ? `: ${name}` : ''}.` }
          : { ok: false, message: '연결은 됐지만 캘린더 주소가 아닌 것 같습니다. 캘린더별 CalDAV 주소를 넣어 주세요.' };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, message: '계정 또는 비밀번호가 맞지 않습니다.' };
      if (res.status === 404) return { ok: false, message: '캘린더 주소를 찾을 수 없습니다. 주소를 다시 확인하세요.' };
      return { ok: false, message: `CalDAV 서버 응답: HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, message: describeFetchError(e) };
    }
  }

  /** 감사 로그에 비밀 값이 남지 않도록 가립니다. */
  private redact(settings: TenantSettings): unknown {
    const s = settings.integration?.synology;
    if (!s) return settings;
    return {
      ...settings,
      integration: {
        ...settings.integration,
        synology: {
          ...s,
          chatWebhookUrl: s.chatWebhookUrl ? '(설정됨)' : null,
          caldavPasswordEncrypted: s.caldavPasswordEncrypted ? '(설정됨)' : null,
        },
      },
    };
  }
}
