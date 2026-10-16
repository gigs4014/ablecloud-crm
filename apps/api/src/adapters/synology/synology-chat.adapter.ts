import { Injectable, Logger } from '@nestjs/common';
import type { NotificationDto } from '@erm/shared';
import type { MessengerPort, NotifyInput, TenantScope } from '../../core/ports';
import { IntegrationConfigService } from '../integration-config.service';
import { InternalMessengerAdapter } from '../internal/internal-messenger.adapter';

/**
 * 시놀로지 챗 수신 웹훅(Incoming Webhook)으로 메시지를 보냅니다.
 * 형식: application/x-www-form-urlencoded, payload={"text":"..."}
 */
export async function postSynologyChat(url: string, text: string): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ payload: JSON.stringify({ text }) }),
    signal: AbortSignal.timeout(5000),
  });
}

/**
 * 포털 알림함에 저장하고, 시놀로지 챗 채널에도 보냅니다.
 * 개인별 DM은 챗 봇(Chatbot) 연동이 필요해 2차 개발 범위입니다.
 */
@Injectable()
export class SynologyChatMessengerAdapter implements MessengerPort {
  private readonly logger = new Logger(SynologyChatMessengerAdapter.name);

  constructor(
    private readonly internal: InternalMessengerAdapter,
    private readonly integration: IntegrationConfigService,
  ) {}

  async notify(scope: TenantScope, userId: string, input: NotifyInput): Promise<void> {
    await this.internal.notify(scope, userId, input);
    const { synology } = await this.integration.resolve(scope.tenantId);
    if (!synology.chatWebhookUrl) return;
    const text = input.body ? `${input.title}\n${input.body}` : input.title;
    try {
      const res = await postSynologyChat(synology.chatWebhookUrl, text);
      if (!res.ok) this.logger.warn(`시놀로지 챗 전송 실패: HTTP ${res.status}`);
    } catch (e) {
      // 외부 연동 실패가 휴가 결재 같은 핵심 기능을 막지 않도록 기록만 합니다.
      this.logger.warn(`시놀로지 챗 전송 실패: ${(e as Error).message}`);
    }
  }

  listForUser(scope: TenantScope, userId: string, limit: number): Promise<NotificationDto[]> {
    return this.internal.listForUser(scope, userId, limit);
  }

  markRead(scope: TenantScope, userId: string, ids: string[]): Promise<void> {
    return this.internal.markRead(scope, userId, ids);
  }
}
