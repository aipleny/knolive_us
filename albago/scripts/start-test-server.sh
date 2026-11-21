#!/usr/bin/env bash
# ALBAGO 테스트 서버 실행 (Mac·Linux)
# 사용: ./scripts/start-test-server.sh          → 같은 와이파이에서 테스트
#       ./scripts/start-test-server.sh tunnel   → 외부(LTE)·HTTPS 테스트 (cloudflared 필요)
set -e
cd "$(dirname "$0")/.."
PORT="${PORT:-8080}"

# Node.js 22.13 이상 필요 (내장 SQLite 사용)
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 가 없습니다. https://nodejs.org 에서 22 LTS 이상을 설치하세요. (Mac: brew install node)"; exit 1
fi
NODE_OK=$(node -e 'const [a,b]=process.versions.node.split(".").map(Number);console.log(a>22||(a===22&&b>=13)?1:0)')
if [ "$NODE_OK" != "1" ]; then echo "Node.js $(node -v) 는 너무 오래되었습니다. 22.13 이상이 필요합니다."; exit 1; fi

IP=$( (ipconfig getifaddr en0 || ipconfig getifaddr en1 || hostname -I | awk '{print $1}') 2>/dev/null | head -1)
echo ""
echo "  ALBAGO 테스트 서버 (개발 모드: 문자·이메일 대신 인증번호가 이 창에 나옵니다)"
echo "  ─────────────────────────────────────────────"
echo "  이 컴퓨터     : http://localhost:$PORT"
[ -n "$IP" ] && echo "  같은 와이파이 : http://$IP:$PORT   ← 휴대폰·앱의 서버 주소"
echo "  사장님 화면   : /signup 에서 가입 → /owner"
echo "  데이터 폴더   : $(pwd)/data-test   (지우면 처음부터)"
echo ""

export ALBAGO_DEV=1 ALBAGO_DATA="$(pwd)/data-test" PORT
if [ "$1" = "tunnel" ]; then
  if ! command -v cloudflared >/dev/null 2>&1; then echo "cloudflared 가 없습니다. Mac: brew install cloudflared"; exit 1; fi
  export ALBAGO_TRUST_PROXY=1
  node --no-warnings server.js & SERVER=$!
  trap 'kill $SERVER 2>/dev/null' EXIT
  echo "  잠시 뒤 아래에 https://….trycloudflare.com 주소가 나옵니다. 그 주소를 휴대폰·앱에 넣으세요."
  cloudflared tunnel --url "http://localhost:$PORT"
else
  node --no-warnings server.js
fi
