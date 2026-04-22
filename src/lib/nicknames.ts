/**
 * LDAP(이메일 prefix) → 한글 호칭 매핑.
 *
 * 1회성 미션트립이라 DB 컬럼 추가 없이 코드 상수로 관리.
 * 우선순위:
 *  1. 매뉴얼 p.7 (트래블헬퍼 매칭 현황) · p.20 (배리어프리 객실) 명시 이름
 *  2. LDAP prefix 자연 음역 (best-effort)
 *
 * 매핑에 없는 LDAP은 그대로 렌더 (fallback).
 * 오타·전달 오류 발견 시 이 파일만 수정 → 배포.
 */
export const NICKNAMES: Record<string, string> = {
  // ── 1조 (19명, 1호차 돌하르방) ──
  "max.0420": "맥스", // 조장
  "charlie.yh": "찰리", // 매뉴얼 p.7
  "eden.m": "에덴",
  "hazel.j": "헤이즐",
  "hiro.3": "히로",
  "jacob.dh": "제이콥", // 매뉴얼 p.7
  "james.42": "제임스", // 매뉴얼 p.7
  "jennifer.00": "제니퍼",
  "layla.1004": "레일라", // 매뉴얼 p.7
  "mia.j": "미아", // 매뉴얼 p.7
  "patrick.35": "패트릭", // 매뉴얼 p.20
  "polar.09": "폴라",
  "rhea.l": "리아",
  "wendy.112": "웬디",
  // 외부 지원인력 (1호차 가이드/트래블헬퍼1~4) — 이미 한글 텍스트라 매핑 불필요

  // ── 2조 (14명, 1호차 돌하르방) ──
  "liam.j": "리암", // 조장(관리자)
  "amara.w": "아마라",
  "conrad.0126": "콘라드", // 매뉴얼 p.7
  "deli.ce": "델리",
  "dewey.064": "듀이", // 매뉴얼 p.7, p.20
  "joseph.13": "조셉", // 매뉴얼 p.7
  "kai.0725": "카이", // 매뉴얼 p.7
  "kayla.k": "케일라",
  "kimi.03": "키미", // 매뉴얼 p.7
  "lowell.0704": "로웰",
  "mari.gold": "마리",
  "mindy.b": "민디",
  "teo.0615": "테오", // 매뉴얼 p.20
  "world.wide": "월드",

  // ── 16조 (3명, 8호차 갈매기 · 칸조) ──
  "kan.k": "칸", // 조장 · 매뉴얼 p.20
  "jetty.0130": "제티",
  "wayne.t": "웨인", // 매뉴얼 p.20
};

/** LDAP → 호칭. 매핑 없으면 원본 반환. */
export function resolveNickname(ldapOrName: string): string {
  return NICKNAMES[ldapOrName] ?? ldapOrName;
}

/** 호칭 매핑 존재 여부 — 부제 LDAP 렌더 조건부 표시용 */
export function hasNickname(ldapOrName: string): boolean {
  return ldapOrName in NICKNAMES;
}
