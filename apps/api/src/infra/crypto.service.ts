import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../config';

/**
 * 개인정보 컬럼 암호화 (AES-256-GCM).
 * 저장 형식: v1:<iv base64>:<tag base64>:<암호문 base64>
 * 키는 DATA_ENCRYPTION_KEY(32바이트 base64)로만 주입하고, DB 백업과 분리해 보관합니다.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    if (!config.dataEncryptionKey) {
      this.key = null;
      return;
    }
    const key = Buffer.from(config.dataEncryptionKey, 'base64');
    if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY는 32바이트를 base64로 인코딩한 값이어야 합니다.');
    this.key = key;
  }

  private requireKey(): Buffer {
    if (!this.key) throw new Error('DATA_ENCRYPTION_KEY가 설정되지 않아 개인정보를 저장할 수 없습니다.');
    return this.key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.requireKey(), iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
  }

  decrypt(stored: string): string {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== 'v1') throw new Error('지원하지 않는 암호화 형식입니다.');
    const decipher = createDecipheriv('aes-256-gcm', this.requireKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  }
}
