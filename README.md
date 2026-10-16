# [제품명] 사내 통합 포털

출퇴근, 휴가·결재, 일정, 그리고 메일·채팅·파일 연동을 한 화면에서 쓰는 사내 포털입니다.
시놀로지 같은 기존 사내 서비스는 그대로 두고, 그 위에 **연동 레이어**로 붙도록 설계했습니다.

## 1차 개발 범위

| 기능 | 상태 |
|---|---|
| 로그인 (자체 계정, httpOnly 쿠키 세션) | 완료 |
| 출퇴근 (사내 네트워크 확인, 자정 넘김 퇴근, 법정 휴게시간 반영) | 완료 |
| 휴가 신청 (연차·반차·반반차·병가·경조사, 주말·공휴일 제외, 잔여 연차 검증) | 완료 |
| 연차 자동 계산 (입사일 기준, 근로기준법 제60조) + 매일 자동 갱신 | 완료 |
| 결재 (부서장 → 관리자 순 결재선, 같은 기간 팀 부재 인원 표시, 감사 로그) | 완료 |
| 승인된 휴가 회사 캘린더 자동 등록 | 완료 |
| 대화에서 찾은 일정 후보 확인/등록 화면 | 완료 (후보 생성은 2차) |
| 홈 대시보드, 팀 현황, 알림 | 완료 |
| 관리자 설정 화면: 시놀로지 챗·캘린더 연동(연결 테스트 포함), 출근 허용 네트워크 | 완료, 실제 NAS 연결 검증 필요 |

## 구조

```
apps/
  api/        NestJS API 서버
    src/core/       비즈니스 로직 (외부 시스템을 모름)
      ports/          외부 연동 인터페이스: 캘린더, 메신저, 메일, 파일, LLM
      attendance/     출퇴근
      leave/          휴가·연차·결재
      schedule/       일정, 대화에서 찾은 일정 후보
      dashboard/      홈 화면 요약
    src/adapters/   외부 연동 구현
      internal/       자체 DB만 쓰는 기본 구현
      synology/       시놀로지 챗(웹훅), 캘린더(CalDAV)
  web/        Next.js 웹 (모바일 반응형, PWA)
  worker/     백그라운드 작업 (BullMQ): 연차 자동 갱신
packages/
  db/         DB 스키마와 마이그레이션 (Drizzle ORM, PostgreSQL)
  shared/     웹·API 공용: 요청 검증 스키마, 연차·근무시간 계산 규칙
```

### 코어와 어댑터

코어는 `core/ports`의 인터페이스만 알고, 실제 연동은 어댑터가 담당합니다.
어떤 어댑터를 쓸지는 `INTEGRATION_PROVIDER` 환경 변수로 정합니다.

```ts
// core/ports: 코어가 필요한 기능의 약속
interface CalendarPort { createEvent(...); deleteEvent(...); listEvents(...); }

// adapters/: 실제 구현
class InternalCalendarAdapter implements CalendarPort { /* 자체 DB */ }
class SynologyCalendarAdapter implements CalendarPort { /* 자체 DB + CalDAV */ }
```

새 연동(Google, Microsoft 등)은 `adapters/<이름>/`에 구현하고 `adapters/adapters.module.ts`에 분기만 추가하면 됩니다. 코어 코드는 바꾸지 않습니다.

## 실행 (Docker Compose)

```bash
cp .env.example .env
# .env에서 비밀번호, JWT_SECRET, DATA_ENCRYPTION_KEY, SEED_ADMIN_PASSWORD를 꼭 바꾸세요.
#   openssl rand -base64 48   # JWT_SECRET
#   openssl rand -base64 32   # DATA_ENCRYPTION_KEY
docker compose up -d --build
```

`http://localhost:3000` 에서 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`로 로그인합니다.
화면을 예시 데이터로 먼저 보고 싶으면 `.env`에서 `SEED_DEMO=true`로 처음 실행하세요. (예시 계정 비밀번호는 관리자 비밀번호와 같습니다. 운영에서는 쓰지 마세요.)

| 컨테이너 | 역할 |
|---|---|
| `web` | 웹 화면, `/api/*` 요청을 API로 전달 (외부에 노출되는 유일한 포트) |
| `api` | API 서버 |
| `worker` | 백그라운드 작업 |
| `migrate` | DB 마이그레이션과 초기 관리자 생성 후 종료 |
| `postgres`, `redis` | DB, 작업 큐 |

네이티브 바이너리가 없어서 x86, ARM(일부 NAS 포함) 모두 같은 Dockerfile로 빌드됩니다.

## 로컬 개발

Node 22, pnpm 10, PostgreSQL, Redis가 필요합니다.

```bash
pnpm install
cp .env.example .env    # DATABASE_URL, REDIS_URL을 로컬 주소로 수정
pnpm build              # 공용 패키지 빌드
pnpm db:migrate         # 마이그레이션
SEED_DEMO=true pnpm db:seed
pnpm dev                # web :3000, api :4000, worker
pnpm test               # 연차·근무시간·네트워크 규칙, CalDAV 변환 테스트
```

DB 스키마를 바꾼 뒤에는 `pnpm db:generate`로 마이그레이션 파일을 만들고 커밋합니다.

## 운영 시 알아둘 것

- **사내 네트워크 출근 제한**: 관리자 **설정 → 출근 허용 네트워크**에 사내 IP 대역(예: `192.168.10.0/24`)을 넣으면 그 대역에서만 출퇴근할 수 있습니다. 비어 있으면 제한하지 않습니다. 실제 접속 IP를 알려면 `web` 앞에 리버스 프록시(DSM 리버스 프록시, Nginx 등)를 두고 `X-Forwarded-For`를 넘겨야 합니다. `api` 포트는 외부에 열지 마세요.
- **개인정보 암호화 키**: `DATA_ENCRYPTION_KEY`를 잃어버리면 암호화된 개인정보를 복구할 수 없습니다. DB 백업과 따로 안전하게 보관하세요.
- **HTTPS**: 운영에서는 HTTPS 뒤에 두고 `COOKIE_SECURE=true`로 설정하세요.
- **연차 규칙**: 입사일 기준, 출근율 80% 이상을 가정합니다. 회계연도 기준 운영이나 연차 촉진 제도는 `packages/shared/src/domain/leave-policy.ts`에서 조정합니다. 세부 기준은 노무 담당자 확인을 권장합니다.
- **공휴일**: `holidays` 테이블에 등록된 날은 휴가 일수에서 빠집니다. 관리 화면은 2차 범위이며, 그 전에는 DB에 직접 넣어야 합니다.
- **백업**: `pg_dump`로 정기 백업하고, NAS라면 Hyper Backup 등으로 한 번 더 보관하세요.

## 시놀로지 연동 (선택)

관리자 계정으로 로그인한 뒤 **설정** 메뉴에서 연결합니다. 저장하면 서버 재시작 없이 바로 적용되고, 각 항목 옆의 테스트 버튼으로 연결을 확인할 수 있습니다.

| 항목 | 어디서 찾나요 | 연결하면 |
|---|---|---|
| 챗 수신 웹훅 주소 | 시놀로지 챗 → 프로필 → 통합 → 수신 웹훅 → 만들기 | 휴가 신청·승인·반려 알림이 그 채널로도 갑니다 |
| CalDAV 주소, 계정, 비밀번호 | Synology Calendar → 회사 캘린더 메뉴 → CalDAV 계정 | 승인된 휴가와 등록한 일정이 시놀로지 캘린더에도 들어갑니다 |

- DSM 버전에 따라 메뉴 이름이 조금 다를 수 있습니다.
- CalDAV 계정은 회사 캘린더에 쓰기 권한이 있는 **연동 전용 DSM 계정**을 만들어 쓰는 것을 권장합니다.
- 비밀번호는 `DATA_ENCRYPTION_KEY`로 암호화해 저장합니다. 이 키가 없으면 비밀번호를 저장할 수 없습니다.
- 외부 연동이 실패해도 포털 기능은 멈추지 않고 로그만 남깁니다.
- 설정 화면에서 아무것도 저장하지 않았다면 `.env`의 `INTEGRATION_PROVIDER`, `SYNOLOGY_*` 값을 씁니다. (자동 설치용)

같은 **설정** 화면에서 **출근 허용 네트워크**(사내 IP 대역)도 관리합니다.

## 다음 단계 (2차)

- 대화 → 일정 추출: 챗 봇/웹훅으로 메시지 수집 → `LlmPort`(Claude API 또는 로컬 Ollama)로 추출 → 일정 후보 생성
- SSO: OIDC(Keycloak, 시놀로지 SSO 등) 로그인 어댑터
- 메일(IMAP) 요약, 드라이브 검색, 통합 검색
- 관리자 화면 확장: 직원·부서·결재선·공휴일·근무 정책 관리, 근태 정정 화면
- 멀티 테넌트 강화: PostgreSQL Row-Level Security
