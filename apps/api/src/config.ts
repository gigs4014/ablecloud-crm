/** 환경 변수. 필수 값이 없으면 시작 단계에서 바로 실패시킵니다. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`환경 변수 ${name}이(가) 필요합니다.`);
  return value;
}

export type IntegrationProvider = 'internal' | 'synology';

export interface AppConfig {
  port: number;
  databaseUrl: string;
  redisUrl: string | undefined;
  jwtSecret: string;
  dataEncryptionKey: string | undefined;
  cookieSecure: boolean;
  integrationProvider: IntegrationProvider;
  synology: {
    chatWebhookUrl: string | undefined;
    caldavUrl: string | undefined;
    caldavUsername: string | undefined;
    caldavPassword: string | undefined;
  };
}

export function loadConfig(): AppConfig {
  const jwtSecret = required('JWT_SECRET');
  if (jwtSecret.length < 32) throw new Error('JWT_SECRET은 32자 이상이어야 합니다.');
  const provider = (process.env.INTEGRATION_PROVIDER || 'internal') as IntegrationProvider;
  if (provider !== 'internal' && provider !== 'synology') {
    throw new Error(`알 수 없는 INTEGRATION_PROVIDER: ${provider}`);
  }
  return {
    port: Number(process.env.PORT || 4000),
    databaseUrl: required('DATABASE_URL'),
    redisUrl: process.env.REDIS_URL || undefined,
    jwtSecret,
    dataEncryptionKey: process.env.DATA_ENCRYPTION_KEY || undefined,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    integrationProvider: provider,
    synology: {
      chatWebhookUrl: process.env.SYNOLOGY_CHAT_WEBHOOK_URL || undefined,
      caldavUrl: process.env.SYNOLOGY_CALDAV_URL || undefined,
      caldavUsername: process.env.SYNOLOGY_CALDAV_USERNAME || undefined,
      caldavPassword: process.env.SYNOLOGY_CALDAV_PASSWORD || undefined,
    },
  };
}

export const APP_CONFIG = Symbol('APP_CONFIG');
