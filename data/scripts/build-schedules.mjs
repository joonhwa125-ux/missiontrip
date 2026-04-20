// 1~3일차 CSV와 전체타임테이블을 기반으로 schedules.csv + member_info.csv 생성
// 출력:
//   - data/converted/schedules.csv
//   - data/converted/member_info.csv  (미참여 + 더클리프 메뉴 + 치유의숲 활동)

import fs from "node:fs";
import path from "node:path";

const HOME = process.env.USERPROFILE || process.env.HOME;
const DL = path.join(HOME, "Downloads");
const SRC_WHICH = path.join(DL, "[인력관리TF] 운영안 - 몇조_.csv");

const OUT_DIR = path.resolve("data/converted");
const OUT_SCHED = path.join(OUT_DIR, "schedules.csv");
const OUT_MEMBER_INFO = path.join(OUT_DIR, "member_info.csv");

// 몇조 CSV 파서 (RFC 4180)
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') { if (t[i+1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && t[i+1] === "\n") i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else field += ch;
    }
  }
  row.push(field);
  if (row.some(c => c !== "")) rows.push(row);
  return rows;
}

// ─────────────────────────────────────────────
// schedules.csv
// 컬럼: 일차, 순서, 장소, 일정명, 예정시각, 대상, 셔틀여부, 항공구간, 항공사 필터, 공지
//
// 항공사 필터: users.airline / users.return_airline 부분 매칭(includes).
// 공지: 일정별 공통 안내. 모든 조장에게 동일 노출.
//
// ⚠ 예정시각 컬럼은 "YYYY-MM-DD HH:MM" 절대 날짜 형식으로 출력한다.
//   시각만("HH:MM") 쓰면 setup.ts의 parseKSTTime이 "임포트 당일"을 기본값으로 써서
//   DB에 잘못된 날짜가 저장되는 문제 발생 (2026-04-20 사건 — docs/decisions.md).
//   다음 트립 때는 TRIP_DAYS만 수정하면 됨.
// ─────────────────────────────────────────────
const TRIP_DAYS = {
  1: "2026-04-23", // 목 — 출발
  2: "2026-04-24", // 금
  3: "2026-04-25", // 토 — 복귀
};

const SCHEDULES = [
  // ── 1일차 (4/23 목) ──
  // 명찰 기준 재작업:
  //   - 김포공항 게이트 탑승 3건(TW709/7C117/TW727) 삭제 — 집결에서 1회 체크로 통합
  //   - 김포공항 집결 본대 티웨이/제주항공 통합 — 08:00 활성화, 4시간 여유로 양 항공편 모두 체크 가능
  //   - 제주공항 도착 본대 티웨이/제주항공 통합 — 30분 차이, 다음 일정(카카오 13:30)까지 1시간 여유
  //   - 포도원(후발) 삭제 — 공항 도착(후발) 체크 후 단일 버스 30분 이동, 중간 체류 없음 (B2형 통합)
  // 항공편 정보(편명·시각)는 집결 일정의 airline_leg + notice로 이관 → 브리핑 AirlineSection에 표시
  [1, 1,  "판교·성수 사옥",     "판교/성수 사옥 셔틀 집결",       "07:00", "선발", "출발", "",       "",       ""],
  [1, 2,  "김포공항 3층",      "김포공항 집결 (본대)",          "08:00", "선발", "",    "가는편", "",       "티웨이 TW709 10:20 출발 · 제주항공 7C117 11:55 출발 · 티웨이 탑승자 08:00 집결 / 제주항공 탑승자 10:00 집결 · 3층 신분증 확인 후 티켓 배부 · 버스깃발·명찰·무스비 배부"],
  [1, 3,  "제주공항 수하물 찾는곳","제주공항 도착 인원체크 (본대)", "12:00", "선발", "",    "",       "",       "티웨이 12:00 도착 → 조 단위로 먼저 나가 가이드와 만남 (1,2조 먼저) · 제주항공 12:30 도착 → 공항 식당에서 점심 후 14:30 카카오行 버스 · 14:50 A조 투어 합류"],
  [1, 4,  "카카오 스페이스닷원",  "카카오 스페이스닷 집결",        "13:30", "선발", "",    "",       "",       "A조/B조 분리 진행 · 상세 타임라인은 카카오워크 참조"],
  [1, 5,  "판교 배스킨라빈스",    "판교 후발 셔틀 집결",          "13:30", "후발", "출발", "",       "",       ""],
  [1, 6,  "김포공항 3층",       "김포공항 집결 (후발)",          "15:00", "후발", "",    "가는편", "티웨이", "티웨이 TW727 17:10 출발 · 헤더·리무는 16:00 집결"],
  [1, 7,  "난타공연장",         "난타공연장 집결",              "16:30", "선발", "",    "",       "",       "7호차 15조부터 역순 입장 · 뒷좌석은 이동 어려운 시각장애 고려"],
  [1, 8,  "포도원",            "포도원 집결 (본대)",            "18:30", "선발", "",    "",       "",       "장애인화장실 없음 · 수목원으로 이동 필요"],
  [1, 9,  "제주공항 수하물 찾는곳","제주공항 도착 인원체크 (후발)",   "19:00", "후발", "",    "",       "",       "19:30 포도원 도착 후 본대와 저녁식사 합류 · 버스 하차 시 조장은 조원 인원 재확인"],
  [1, 10, "신화월드",          "신화월드 숙소 체크인 (본대)",    "20:30", "선발", "",    "",       "",       "버스에서 방장에게 카드키·조식쿠폰 배부"],
  [1, 11, "신화월드",          "신화월드 숙소 체크인 (후발)",    "21:00", "후발", "",    "",       "",       "버스에서 방장에게 카드키·조식쿠폰 배부"],

  // ── 2일차 (4/24 금) ──
  // 하효마을 집결(도착) 삭제 — 성화정 출발 체크 후 단일 버스 80분 이동, 중간 정차 없음 (A형 통합)
  // 도착 후 식사 시각 안내·도착 재확인 문구는 성화정 카드 notice로 이관
  [2, 1, "신화월드 성화정",      "성화정 집결 (하효마을行)",       "10:40", "전체", "",    "",       "",       "10:40 성화정 앞 집결, 11:00 버스 출발 · 12:00 하효마을 도착 후 조장은 조원 인원 재확인 (잔치체험 시작) · 1~6조·16조·17조 12:00 식사 시작 / 7~15조 12:30 식사 시작 · 4명씩 꽉 채워 앉기"],
  [2, 2, "하효마을",            "하효마을 출발 집결",            "13:45", "전체", "",    "",       "",       "13:40~50 집결, 14:00 더클리프行 버스 출발"],
  [2, 3, "더클리프",            "더클리프 출발 집결",            "16:10", "전체", "",    "",       "",       "16:10~20 집결, 16:30 신화월드行 버스 출발 · 더클리프 음료·푸드박스 배부"],
  // 메인행사 집결 19:00 → 19:15 (명찰: 19:30 메인행사 시작 · 15분 마진)
  [2, 4, "신화월드 랜딩볼룸",    "랜딩볼룸 집결 (메인행사)",        "19:15", "전체", "",    "",       "",       "18:00부터 사전행사(인생네컷·포토월) 자유 참여 · 19:15 랜딩볼룸 전체집결 · 19:30 메인행사 '모두의 축제' 시작 · 조장이 조원 동선 파악"],

  // ── 3일차 (4/25 토) ──
  // 명찰 기준 재작업: 제주공항 게이트 탑승 2건(RS906/TW726) 삭제 — 14:30 제주공항 체크인/티켓발급에서 1회 체크로 통합
  // 치유의숲 집결(도착) 삭제 — 성화정 출발 체크 후 단일 버스 30분 이동 (A형 통합)
  // 도착 후 활동 배정·도착 재확인 문구는 성화정 카드 notice로 이관
  [3, 1, "신화월드 성화정",      "성화정 집결 (치유의숲行)",       "09:10", "전체", "",    "",       "",       "09:10 성화정 앞 집결 (모든 짐 챙겨 이동), 09:30 버스 출발 · 10:00 치유의숲 도착 후 조장은 조원 인원 재확인 · 조원별 프로그램(해먹/족욕/숲체험) 확인 후 분산 · 근무자는 별도 배치 · 체크아웃 완료 확인"],
  [3, 2, "중문고등어쌈밥",       "고등어쌈밥 집결",              "12:30", "전체", "",    "",       "",       ""],
  [3, 3, "제주공항 3층",         "제주공항 체크인/티켓발급",       "14:30", "전체", "",    "오는편", "",       "본대 티웨이 TW726 16:25 출발 · 후발 에어서울 RS906 15:55 출발 · 교통약자는 바로 입구 앞 · 3층 티켓 배부"],
  [3, 4, "김포공항 수하물 찾는곳","김포공항 도착 인원체크 (후발)",   "17:00", "후발", "",    "",       "",       ""],
  [3, 5, "김포공항 수하물 찾는곳","김포공항 도착 인원체크 (본대)",   "17:30", "선발", "",    "",       "",       "조별 집결 · 판교아지트 셔틀 집결장소로 조장 인솔 · 개별 이동자는 해산"],
  [3, 6, "김포공항",            "성수/판교 귀가 셔틀 집결",       "18:30", "전체", "귀가", "",       "",       ""],
];

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function writeSchedules() {
  const header = ["일차","순서","장소","일정명","예정시각","대상","셔틀여부","항공구간","항공사 필터","공지"];
  const lines = [header.map(csvEscape).join(",")];
  for (const row of SCHEDULES) {
    const [day, order, loc, title, time, scope, shuttle, leg, airline, notice] = row;
    const date = TRIP_DAYS[day];
    if (!date) throw new Error(`TRIP_DAYS에 ${day}일차 매핑이 없습니다`);
    // 절대 날짜 병합 — parseKSTTime의 fullDate 패턴과 매칭
    const absoluteTime = `${date} ${time}`;
    lines.push([day, order, loc, title, absoluteTime, scope, shuttle, leg, airline, notice].map(csvEscape).join(","));
  }
  fs.writeFileSync(OUT_SCHED, lines.join("\n") + "\n", "utf-8");
  const withNotice = SCHEDULES.filter((r) => r[9]).length;
  console.log(`✅ ${OUT_SCHED} (${SCHEDULES.length}개 일정, 공지 ${withNotice}건, 기간 ${TRIP_DAYS[1]} ~ ${TRIP_DAYS[3]})`);
}

// ─────────────────────────────────────────────
// member_info.csv — 현재 확정된 미참여만
// 컬럼: 일차, 순서, 이름, 항목, 값
// ─────────────────────────────────────────────
// 확정된 미참여 (사용자 지시 기반):
//   - 1일차 난타공연장 집결 (sort_order=7): yul.9, bart.11, rose.es, kevin.s
//   - 1일차 포도원 집결(본대) (sort_order=8): rose.es, kevin.s
// 그 외는 pending-questions.md에 기록 (사용자 확인 후 추가)

// 확정된 미참여 (사용자 지시 기반)
const STATIC_MEMBER_INFO = [
  // 1일차 난타공연장 미참여
  [1, 7, "yul.9",   "미참여", "숙소 체크·카드키 분류 업무"],
  [1, 7, "bart.11", "미참여", "숙소 체크·카드키 분류 업무"],
  [1, 7, "rose.es", "미참여", "숙소 휴식"],
  [1, 7, "kevin.s", "미참여", "숙소 휴식"],
  // 1일차 포도원(본대) 미참여
  [1, 8, "rose.es", "미참여", "숙소 휴식"],
  [1, 8, "kevin.s", "미참여", "숙소 휴식"],
];

// 몇조 CSV 컬럼 (0-indexed):
//   0=LDAP, 10=더클리프 음료, 11=더클리프 푸드박스, 13=치유의숲 조
// 일정 sort_order (schedules.csv 기준):
//   2일차 3 = 더클리프 출발 집결 (16:10) — 더클리프 체류 시간대의 메뉴 정보 연결 (하효마을 통합으로 재번호 4→3)
//   3일차 1 = 성화정 집결 (치유의숲行) (09:10) — 치유의숲 통합으로 출발 카드에 활동 배정 이관 (기존 3,2 → 3,1)
const DEOCLIFF_ORDER = 3;
const HEALING_ORDER = 1;

// 괄호 내용 제거 — 예: "디저트세트(케이크 등)" → "디저트세트", "코로나(맥주)" → "코로나"
function stripParens(s) {
  return s.replace(/\s*\([^)]*\)/g, "").trim();
}

function buildMemberInfoFromWhichGroup() {
  const extra = [];
  if (!fs.existsSync(SRC_WHICH)) {
    console.log(`⚠  ${SRC_WHICH} 없음 — 메뉴/활동 스킵`);
    return extra;
  }
  const rows = parseCsv(fs.readFileSync(SRC_WHICH, "utf-8"));
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || !row[0]) continue;
    const ldap = row[0].trim();
    if (!ldap) continue;

    // 더클리프 메뉴 — 음료·푸드박스 둘 다 있으면 ' · '로 결합, 하나만 있으면 그 값만
    // 괄호 부가설명 제거 — "디저트세트(케이크 등)" → "디저트세트"
    const drink = stripParens((row[10] || "").trim());
    const foodbox = stripParens((row[11] || "").trim());
    const validDrink = drink && drink !== "-";
    const validFood = foodbox && foodbox !== "-";
    if (validDrink && validFood) {
      extra.push([2, DEOCLIFF_ORDER, ldap, "메뉴", `${drink} · ${foodbox}`]);
    } else if (validDrink) {
      extra.push([2, DEOCLIFF_ORDER, ldap, "메뉴", drink]);
    } else if (validFood) {
      extra.push([2, DEOCLIFF_ORDER, ldap, "메뉴", foodbox]);
    }

    // 치유의숲 활동 — 조 배정값 그대로 (예: "해먹 1조", "족욕 2조 (조장)", "해먹 STAFF (제니퍼 지원)")
    const healing = (row[13] || "").trim();
    if (healing && healing !== "-") {
      extra.push([3, HEALING_ORDER, ldap, "활동", healing]);
    }
  }
  return extra;
}

function writeMemberInfo() {
  const dynamic = buildMemberInfoFromWhichGroup();
  const all = [...STATIC_MEMBER_INFO, ...dynamic];
  const header = ["일차","순서","이름","항목","값"];
  const lines = [header.map(csvEscape).join(",")];
  for (const row of all) {
    lines.push(row.map(csvEscape).join(","));
  }
  fs.writeFileSync(OUT_MEMBER_INFO, lines.join("\n") + "\n", "utf-8");
  console.log(`✅ ${OUT_MEMBER_INFO} (${all.length}개 개인 안내: 미참여 ${STATIC_MEMBER_INFO.length} + 메뉴/활동 ${dynamic.length})`);

  // 자가검증
  const byField = {};
  for (const r of all) byField[r[3]] = (byField[r[3]] || 0) + 1;
  for (const [k, n] of Object.entries(byField)) console.log(`  - ${k}: ${n}행`);
}

writeSchedules();
writeMemberInfo();
console.log("\n완료. schedules.csv 자가검증:");
console.log(`- 1일차: ${SCHEDULES.filter(r=>r[0]===1).length}개`);
console.log(`- 2일차: ${SCHEDULES.filter(r=>r[0]===2).length}개`);
console.log(`- 3일차: ${SCHEDULES.filter(r=>r[0]===3).length}개`);
console.log(`- 셔틀 일정(shuttle): ${SCHEDULES.filter(r=>r[6]).length}개`);
console.log(`- 항공 일정(airline): ${SCHEDULES.filter(r=>r[7]).length}개`);
console.log(`- 선발 대상: ${SCHEDULES.filter(r=>r[5]==="선발").length}개`);
console.log(`- 후발 대상: ${SCHEDULES.filter(r=>r[5]==="후발").length}개`);
console.log(`- 전체 대상: ${SCHEDULES.filter(r=>r[5]==="전체").length}개`);
