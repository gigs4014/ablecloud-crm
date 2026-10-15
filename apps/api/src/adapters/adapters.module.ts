import { Global, Module, type Provider } from '@nestjs/common';
import type { IntegrationProvider } from '../config';
import { CALENDAR, LLM, MAIL, MESSENGER, STORAGE } from '../core/ports';
import { InternalCalendarAdapter } from './internal/internal-calendar.adapter';
import { InternalMessengerAdapter } from './internal/internal-messenger.adapter';
import { NoopLlmAdapter, NoopMailAdapter, NoopStorageAdapter } from './internal/noop.adapters';
import { SynologyCalendarAdapter } from './synology/synology-calendar.adapter';
import { SynologyChatMessengerAdapter } from './synology/synology-chat.adapter';

/**
 * 어떤 어댑터를 포트에 연결할지 정하는 곳입니다.
 * 새 연동(Google, Microsoft 등)을 추가할 때는 adapters/<이름>/ 에 구현하고 여기에 분기만 추가합니다.
 * 코어(core/) 코드는 바꿀 필요가 없습니다.
 */
@Global()
@Module({})
export class AdaptersModule {
  static forProvider(provider: IntegrationProvider) {
    const bindings: Provider[] =
      provider === 'synology'
        ? [
            { provide: CALENDAR, useExisting: SynologyCalendarAdapter },
            { provide: MESSENGER, useExisting: SynologyChatMessengerAdapter },
          ]
        : [
            { provide: CALENDAR, useExisting: InternalCalendarAdapter },
            { provide: MESSENGER, useExisting: InternalMessengerAdapter },
          ];

    return {
      module: AdaptersModule,
      providers: [
        InternalCalendarAdapter,
        InternalMessengerAdapter,
        SynologyCalendarAdapter,
        SynologyChatMessengerAdapter,
        ...bindings,
        { provide: MAIL, useClass: NoopMailAdapter },
        { provide: STORAGE, useClass: NoopStorageAdapter },
        { provide: LLM, useClass: NoopLlmAdapter },
      ],
      exports: [CALENDAR, MESSENGER, MAIL, STORAGE, LLM],
    };
  }
}
