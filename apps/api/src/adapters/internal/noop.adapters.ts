import { Injectable } from '@nestjs/common';
import type { ExtractedSchedule, FileSummary, LlmPort, MailPort, MailSummary, StoragePort } from '../../core/ports';

/** 메일 연동을 쓰지 않을 때 */
@Injectable()
export class NoopMailAdapter implements MailPort {
  async listRecent(): Promise<MailSummary[]> {
    return [];
  }
}

/** 파일 저장소 연동을 쓰지 않을 때 */
@Injectable()
export class NoopStorageAdapter implements StoragePort {
  async search(): Promise<FileSummary[]> {
    return [];
  }
}

/** LLM을 쓰지 않을 때. 2차 개발에서 Claude API / Ollama 어댑터로 교체합니다. */
@Injectable()
export class NoopLlmAdapter implements LlmPort {
  async extractSchedules(): Promise<ExtractedSchedule[]> {
    return [];
  }
}
