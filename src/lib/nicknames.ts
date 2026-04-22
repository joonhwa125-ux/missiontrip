/**
 * LDAP(이메일 prefix) → 한글 호칭 매핑.
 *
 * 1회성 미션트립이라 DB 컬럼 추가 없이 코드 상수로 관리.
 * 매뉴얼 p.7 (트래블헬퍼 매칭 현황) + p.20 (배리어프리 객실) 기준.
 * 매핑에 없는 LDAP은 그대로 렌더 (fallback).
 */
export const NICKNAMES: Record<string, string> = {
  // 1조 시각장애크루 (매뉴얼 p.7)
  "jacob.dh": "제이콥",
  "charlie.yh": "찰리",
  // 2조 시각장애크루 (매뉴얼 p.7)
  "conrad.0126": "콘라드",
  "dewey.064": "듀이",
  "kimi.03": "키미",
  // 1조 공항 보행지원 담당 (매뉴얼 p.7 · 별도 섹션은 숨김이나 다른 섹션에서 이름 렌더 시 사용)
  "james.42": "제임스",
  "mia.j": "미아",
  "layla.1004": "레일라",
  // 2조 공항 보행지원 담당
  "joseph.13": "조셉",
  "kai.0725": "카이",
  // 16조 (매뉴얼 p.20 배리어프리 객실)
  "kan.k": "칸",
  "wayne.t": "웨인",
};

/** LDAP → 호칭. 매핑 없으면 원본 LDAP 반환. */
export function resolveNickname(ldapOrName: string): string {
  return NICKNAMES[ldapOrName] ?? ldapOrName;
}

/** 표시용: 호칭이 있으면 "호칭", 없으면 원본 (하나만 반환). 부제 LDAP은 별도로 렌더. */
export function hasNickname(ldapOrName: string): boolean {
  return ldapOrName in NICKNAMES;
}
