#!/bin/bash
# 미션트립 PRD 위반 자동 검사 스크립트
# Hook에서 PostToolUse(Edit/Write) 시 자동 실행
# stdin으로 JSON 입력을 받아 file_path 추출

# stdin에서 JSON 읽기
INPUT=$(cat)

# jq가 있으면 JSON에서 file_path 추출, 없으면 $1 폴백
if command -v jq &>/dev/null && [ -n "$INPUT" ]; then
  FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
fi

# 폴백: 환경변수나 인자
if [ -z "$FILE" ]; then
  FILE="${CLAUDE_FILE_PATH:-$1}"
fi

# 파일 경로 없으면 종료
if [ -z "$FILE" ]; then
  exit 0
fi

# .ts/.tsx/.css 파일만 검사
if [[ ! "$FILE" =~ \.(ts|tsx|css)$ ]]; then
  exit 0
fi

# 파일이 존재하지 않으면 종료
if [ ! -f "$FILE" ]; then
  exit 0
fi

VIOLATIONS=""

# === 1. Ad-hoc 방지: PRD 절대 금지 패턴 ===

# line-through 금지
if grep -qn "line-through" "$FILE" 2>/dev/null; then
  VIOLATIONS+="[PRD 위반] text-decoration: line-through 사용 금지 (완료 카드는 배경색만 변경)\n"
fi

# 보고 버튼 disabled 금지
if grep -qn "disabled.*보고\|disabled.*report\|보고.*disabled\|report.*disabled" "$FILE" 2>/dev/null; then
  VIOLATIONS+="[PRD 위반] 보고 버튼 disabled 금지 (KWCAG 2.5.5)\n"
fi

# 공지 배너에 FEE500 사용 금지 (notice/공지 컨텍스트)
if grep -qn "notice.*FEE500\|FEE500.*notice\|공지.*FEE500\|FEE500.*공지\|banner.*FEE500\|FEE500.*banner" "$FILE" 2>/dev/null; then
  VIOLATIONS+="[PRD 위반] 공지 배너에 #FEE500(노란색) 사용 금지 — #E6F1FB(파란색) 사용\n"
fi

# 오프라인 배너 상단 배치 금지
if grep -qn "offline.*top-0\|offline.*top:.*0\|오프라인.*top-0" "$FILE" 2>/dev/null; then
  VIOLATIONS+="[PRD 위반] 오프라인 배너 상단 배치 금지 — position: fixed; bottom: 0 사용\n"
fi

# Polling 패턴 금지
if grep -qn "setInterval.*fetch\|setInterval.*supabase\|polling\|poll(" "$FILE" 2>/dev/null; then
  VIOLATIONS+="[PRD 위반] Polling 금지 — Supabase Realtime broadcast 사용\n"
fi

# === 2. KWCAG 2.2 접근성 검사 ===

# 이미지/아이콘에 aria-label 누락 체크
if grep -n "<img " "$FILE" 2>/dev/null | grep -qv "alt=" 2>/dev/null; then
  VIOLATIONS+="[KWCAG 1.1.1] <img>에 alt 속성 누락\n"
fi

# 터치 타겟 크기 체크 (button/a에 w-/h- 없이 작은 크기)
if grep -n "onClick\|button" "$FILE" 2>/dev/null | grep -qi "w-4\|w-5\|w-6\|h-4\|h-5\|h-6\|w-8\|h-8" 2>/dev/null; then
  VIOLATIONS+="[KWCAG 2.5.5] 터치 타겟 44x44px 미만 의심 — min-w-11/min-h-11 이상 권장\n"
fi

# 색상만으로 상태 구분 (color-only 패턴)
if grep -n "bg-red\|bg-green\|bg-yellow" "$FILE" 2>/dev/null | grep -qv "aria-label\|text-\|label\|badge\|Badge" 2>/dev/null; then
  VIOLATIONS+="[KWCAG 1.3.3] 색상만으로 상태 구분 의심 — 텍스트/아이콘 병기 필요\n"
fi

# focus-visible 제거 패턴
if grep -n "outline-none\|focus:outline-none" "$FILE" 2>/dev/null | grep -qv "focus-visible" 2>/dev/null; then
  VIOLATIONS+="[KWCAG 2.4.3] outline-none 사용 시 focus-visible 대체 필수\n"
fi

# px 단위 폰트 크기 (rem 사용해야 함)
if grep -qn "font-size:.*px\|text-\[.*px\]" "$FILE" 2>/dev/null; then
  VIOLATIONS+="[KWCAG 1.4.4] font-size에 px 사용 — rem 단위 사용 필요\n"
fi

# === 3. 클린코드 기본 검사 ===

# any 타입 사용
if grep -qn ": any\b\|as any\b" "$FILE" 2>/dev/null; then
  VIOLATIONS+="[클린코드] any 타입 사용 — 구체적 타입 정의 필요\n"
fi

# console.log 잔류
if grep -qn "console\.log" "$FILE" 2>/dev/null; then
  VIOLATIONS+="[클린코드] console.log 잔류 — 제거 필요\n"
fi

# === 결과 출력 ===
if [ -n "$VIOLATIONS" ]; then
  echo "============================================"
  echo "  자동 검증 결과: 위반 사항 발견"
  echo "  파일: $FILE"
  echo "============================================"
  echo -e "$VIOLATIONS"
  echo "============================================"
  exit 2  # exit 2 = Claude에게 피드백으로 전달
fi

exit 0
