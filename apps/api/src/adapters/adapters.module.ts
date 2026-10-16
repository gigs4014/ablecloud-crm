import { Global, Module } from '@nestjs/common';
import { CALENDAR, LLM, MAIL, MESSENGER, STORAGE } from '../core/ports';
import { IntegrationConfigService } from './integration-config.service';
import { InternalCalendarAdapter } from './internal/internal-calendar.adapter';
import { InternalMessengerAdapter } from './internal/internal-messenger.adapter';
import { NoopLlmAdapter, NoopMailAdapter, NoopStorageAdapter } from './internal/noop.adapters';
import { RoutingCalendarAdapter, RoutingMessengerAdapter } from './routing.adapters';
import { SynologyCalendarAdapter } from './synology/synology-calendar.adapter';
import { SynologyChatMessengerAdapter } from './synology/synology-chat.adapter';

/**
 * 포트에 연결할 어댑터를 등록하는 곳입니다.
 * 캘린더·메신저는 회사별 설정(관리자 화면)에 따라 호출 시점에 internal/synology 중 하나로 연결됩니다.
 * 새 연동(Google, Microsoft 등)은 adapters/<이름>/ 에 구현하고 routing.adapters.ts에 분기를 추가합니다.
 * 코어(core/) 코드는 바꿀 필요가 없습니다.
 */
@Global()
@Module({
  providers: [
    IntegrationConfigService,
    InternalCalendarAdapter,
    InternalMessengerAdapter,
    SynologyCalendarAdapter,
    SynologyChatMessengerAdapter,
    { provide: CALENDAR, useClass: RoutingCalendarAdapter },
    { provide: MESSENGER, useClass: RoutingMessengerAdapter },
    { provide: MAIL, useClass: NoopMailAdapter },
    { provide: STORAGE, useClass: NoopStorageAdapter },
    { provide: LLM, useClass: NoopLlmAdapter },
  ],
  exports: [CALENDAR, MESSENGER, MAIL, STORAGE, LLM, IntegrationConfigService],
})
export class AdaptersModule {}
