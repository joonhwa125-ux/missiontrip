#!/bin/bash
# Stop hook: Claude가 작업 완료 시 자동 검증
# 무한 루프 방지를 위해 stop_hook_active 확인

INPUT=$(cat)

# jq 없으면 그냥 통과
if ! command -v jq &>/dev/null; then
  exit 0
fi

STOP_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)

# 이미 한 번 실행되었으면 중지 허용 (무한 루프 방지)
if [ "$STOP_ACTIVE" == "true" ]; then
  exit 0
fi

# src/ 디렉토리가 있을 때만 검사
if [ ! -d "src" ]; then
  exit 0
fi

ISSUES=""

# 1. console.log 잔류 체크
CONSOLE_LOGS=$(grep -rn "console\.log" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -5)
if [ -n "$CONSOLE_LOGS" ]; then
  ISSUES+="console.log가 남아있습니다:\n$CONSOLE_LOGS\n\n"
fi

# 2. any 타입 잔류 체크
ANY_TYPES=$(grep -rn ": any\b\|as any\b" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -5)
if [ -n "$ANY_TYPES" ]; then
  ISSUES+="any 타입이 남아있습니다:\n$ANY_TYPES\n\n"
fi

# 3. TODO/FIXME 잔류 체크
TODOS=$(grep -rn "TODO\|FIXME\|HACK\|XXX" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | head -5)
if [ -n "$TODOS" ]; then
  ISSUES+="TODO/FIXME 주석이 남아있습니다:\n$TODOS\n\n"
fi

if [ -n "$ISSUES" ]; then
  echo "작업 완료 전 확인이 필요한 사항이 있습니다:" >&2
  echo -e "$ISSUES" >&2
  echo "위 사항을 정리하고 완료해주세요." >&2
  exit 2
fi

exit 0
