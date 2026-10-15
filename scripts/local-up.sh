#!/usr/bin/env bash
# 로컬 PC에서 체험용으로 한 번에 실행합니다.
#   ./scripts/local-up.sh          # 예시 데이터 포함 실행
#   ./scripts/local-up.sh --reset  # DB까지 지우고 처음부터 다시
# 운영 배포에는 쓰지 마세요. (.env를 직접 작성하세요)
set -euo pipefail
cd "$(dirname "$0")/.."

if ! docker info >/dev/null 2>&1; then
  echo "Docker가 실행 중이 아닙니다. Docker Desktop을 켠 뒤 다시 실행하세요." >&2
  exit 1
fi

if [[ "${1:-}" == "--reset" ]]; then
  echo "기존 컨테이너와 DB를 지웁니다..."
  docker compose down -v --remove-orphans || true
  rm -f .env
fi

if [[ ! -f .env ]]; then
  echo ".env 생성 (임의 비밀번호, 예시 데이터 포함)"
  DB_PASS=$(openssl rand -hex 16)
  ADMIN_PASS="demo-$(openssl rand -hex 4)"
  sed \
    -e "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=${DB_PASS}#" \
    -e "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://erm:${DB_PASS}@postgres:5432/erm?schema=public#" \
    -e "s#^JWT_SECRET=.*#JWT_SECRET=$(openssl rand -hex 32)#" \
    -e "s#^DATA_ENCRYPTION_KEY=.*#DATA_ENCRYPTION_KEY=$(openssl rand -base64 32)#" \
    -e "s#^SEED_ADMIN_PASSWORD=.*#SEED_ADMIN_PASSWORD=${ADMIN_PASS}#" \
    -e "s#^SEED_DEMO=.*#SEED_DEMO=true#" \
    .env.example > .env
fi

PORT=$(grep -E '^WEB_PORT=' .env | cut -d= -f2)
PORT=${PORT:-3000}
if lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1 && ! docker compose ps --status running 2>/dev/null | grep -q web; then
  echo "${PORT}번 포트를 다른 프로그램이 쓰고 있습니다. .env에 WEB_PORT=3100 처럼 다른 포트를 지정하세요." >&2
  exit 1
fi

echo "이미지 빌드 및 실행 (처음에는 5~10분 걸립니다)..."
docker compose up -d --build

echo "웹 응답 대기..."
for i in $(seq 1 90); do
  if curl -fs "http://localhost:${PORT}/login" >/dev/null 2>&1; then
    ADMIN_PASS=$(grep -E '^SEED_ADMIN_PASSWORD=' .env | cut -d= -f2)
    echo
    echo "=============================================="
    echo " 실행 완료: http://localhost:${PORT}"
    echo " 예시 계정 (비밀번호 모두 같음: ${ADMIN_PASS})"
    echo "   minjun@example.com  직원"
    echo "   doyun@example.com   개발팀장 (결재자)"
    echo "   admin@example.com   관리자"
    echo " 중지: docker compose down"
    echo "=============================================="
    exit 0
  fi
  sleep 2
done

echo "웹이 응답하지 않습니다. 상태와 로그:" >&2
docker compose ps -a
docker compose logs --no-color --tail 40 migrate api web
exit 1
