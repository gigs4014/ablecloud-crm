import { Injectable } from '@nestjs/common';
import type { CalendarEventDto, NotificationDto } from '@erm/shared';
import type { CalendarEventInput, CalendarPort, MessengerPort, NotifyInput, TenantScope } from '../core/ports';
import { IntegrationConfigService } from './integration-config.service';
import { InternalCalendarAdapter } from './internal/internal-calendar.adapter';
import { InternalMessengerAdapter } from './internal/internal-messenger.adapter';
import { SynologyCalendarAdapter } from './synology/synology-calendar.adapter';
import { SynologyChatMessengerAdapter } from './synology/synology-chat.adapter';

/**
 * 회사별 설정(provider)에 따라 호출할 때마다 어댑터를 고릅니다.
 * 관리자가 설정 화면에서 연동을 바꾸면 서버 재시작 없이 바로 적용됩니다.
 */
@Injectable()
export class RoutingCalendarAdapter implements CalendarPort {
  constructor(
    private readonly integration: IntegrationConfigService,
    private readonly internal: InternalCalendarAdapter,
    private readonly synology: SynologyCalendarAdapter,
  ) {}

  private async pick(scope: TenantScope): Promise<CalendarPort> {
    return (await this.integration.resolve(scope.tenantId)).provider === 'synology' ? this.synology : this.internal;
  }

  async createEvent(scope: TenantScope, input: CalendarEventInput): Promise<{ ref: string }> {
    return (await this.pick(scope)).createEvent(scope, input);
  }

  async deleteEvent(scope: TenantScope, ref: string): Promise<void> {
    return (await this.pick(scope)).deleteEvent(scope, ref);
  }

  async listEvents(scope: TenantScope, q: { userId: string; from: Date; to: Date }): Promise<CalendarEventDto[]> {
    return (await this.pick(scope)).listEvents(scope, q);
  }
}

@Injectable()
export class RoutingMessengerAdapter implements MessengerPort {
  constructor(
    private readonly integration: IntegrationConfigService,
    private readonly internal: InternalMessengerAdapter,
    private readonly synology: SynologyChatMessengerAdapter,
  ) {}

  private async pick(scope: TenantScope): Promise<MessengerPort> {
    return (await this.integration.resolve(scope.tenantId)).provider === 'synology' ? this.synology : this.internal;
  }

  async notify(scope: TenantScope, userId: string, input: NotifyInput): Promise<void> {
    return (await this.pick(scope)).notify(scope, userId, input);
  }

  // 알림함 조회와 읽음 처리는 연동 여부와 관계없이 포털 DB를 씁니다.
  listForUser(scope: TenantScope, userId: string, limit: number): Promise<NotificationDto[]> {
    return this.internal.listForUser(scope, userId, limit);
  }

  markRead(scope: TenantScope, userId: string, ids: string[]): Promise<void> {
    return this.internal.markRead(scope, userId, ids);
  }
}
