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
// ─────────────────────────────────────────────
const SCHEDULES = [
  // ── 1일차 (4/23 목) ──
  [1, 1,  "판교·성수 사옥",     "판교/성수 사옥 셔틀 집결",       "07:00", "선발", "출발", "",       "",       ""],
  [1, 2,  "김포공항 3층",      "김포공항 집결 (본대 티웨이)",     "08:00", "선발", "",    "",       "티웨이", "3층 신분증 확인 후 티켓 배부 · 버스깃발·명찰·무스비 배부"],
  [1, 3,  "김포공항 3층",      "김포공항 집결 (본대 제주항공)",    "10:00", "선발", "",    "",       "제주항공", "두리함께 직원 동행 · 2층 내려갔다 3층 올라와 탑승"],
  [1, 4,  "김포공항 게이트",    "티웨이 TW709 탑승",            "10:20", "선발", "",    "가는편", "티웨이", "탑승 게이트 안에서 조별 자유 · 시간 맞춰 게이트 앞 이동"],
  [1, 5,  "김포공항 게이트",    "제주항공 7C117 탑승",           "11:55", "선발", "",    "가는편", "제주항공", ""],
  [1, 6,  "제주공항 수하물 찾는곳","제주공항 도착 인원체크 (본대 티웨이)","12:00", "선발", "",  "",       "티웨이", "수하물 모두 찾으면 조 단위로 먼저 나가 가이드와 만남 · 1,2조 먼저"],
  [1, 7,  "제주공항 수하물 찾는곳","제주공항 도착 인원체크 (본대 제주항공)","12:30", "선발","",  "",       "제주항공", "제주공항 식당에서 점심 후 14:30 카카오行 버스 · 14:50 A조 투어 합류"],
  [1, 8,  "카카오 스페이스닷원",  "카카오 스페이스닷 집결",        "13:30", "선발", "",    "",       "",       "A조/B조 분리 진행 · 상세 타임라인은 카카오워크 참조"],
  [1, 9,  "판교 배스킨라빈스",    "판교 후발 셔틀 집결",          "13:30", "후발", "출발", "",       "",       ""],
  [1, 10, "김포공항 3층",       "김포공항 집결 (후발)",          "15:00", "후발", "",    "",       "",       "헤더·리무는 16:00 집결"],
  [1, 11, "난타공연장",         "난타공연장 집결",              "16:30", "선발", "",    "",       "",       "7호차 15조부터 역순 입장 · 뒷좌석은 이동 어려운 시각장애 고려"],
  [1, 12, "김포공항 게이트",     "티웨이 TW727 탑승 (후발)",      "17:10", "후발", "",    "가는편", "",       ""],
  [1, 13, "포도원",            "포도원 집결 (본대)",            "18:30", "선발", "",    "",       "",       "장애인화장실 없음 · 수목원으로 이동 필요"],
  [1, 14, "제주공항 수하물 찾는곳","제주공항 도착 인원체크 (후발)",   "19:00", "후발", "",    "",       "",       ""],
  [1, 15, "포도원",            "포도원 집결 (후발)",            "19:30", "후발", "",    "",       "",       "본대와 합류해 저녁식사"],
  [1, 16, "신화월드",          "신화월드 숙소 체크인 (본대)",    "20:30", "선발", "",    "",       "",       "버스에서 방장에게 카드키·조식쿠폰 배부"],
  [1, 17, "신화월드",          "신화월드 숙소 체크인 (후발)",    "21:00", "후발", "",    "",       "",       "버스에서 방장에게 카드키·조식쿠폰 배부"],

  // ── 2일차 (4/24 금) ──
  [2, 1, "신화월드 성화정",      "성화정 집결 (하효마을行)",       "10:40", "전체", "",    "",       "",       ""],
  [2, 2, "하효마을",            "하효마을 집결",                "12:00", "전체", "",    "",       "",       "1~6조·16조·17조: 12:00 식사 시작 / 7~15조: 12:30 식사 시작 · 4명씩 꽉 채워 앉기"],
  [2, 3, "하효마을",            "하효마을 출발 집결",            "13:45", "전체", "",    "",       "",       "13:40~50 집결, 14:00 더클리프行 버스 출발"],
  [2, 4, "더클리프",            "더클리프 출발 집결",            "16:10", "전체", "",    "",       "",       "16:10~20 집결, 16:30 신화월드行 버스 출발 · 더클리프 음료·푸드박스 배부"],
  [2, 5, "신화월드 랜딩볼룸",    "랜딩볼룸 집결 (메인행사)",        "19:00", "전체", "",    "",       "",       "18:00부터 사전행사(인생네컷·포토월) 자유 참여 · 19:00 랜딩볼룸 전체집결 · 조장이 조원 동선 파악"],

  // ── 3일차 (4/25 토) ──
  [3, 1, "신화월드 성화정",      "성화정 집결 (치유의숲行)",       "09:10", "전체", "",    "",       "",       "체크아웃 후 모든 짐 챙겨서 이동"],
  [3, 2, "치유의숲",            "치유의숲 집결",                "10:00", "전체", "",    "",       "",       "조원별 프로그램(해먹/족욕/숲체험) 확인 후 분산 · 근무자는 별도 배치"],
  [3, 3, "중문고등어쌈밥",       "고등어쌈밥 집결",              "12:30", "전체", "",    "",       "",       ""],
  [3, 4, "제주공항 3층",         "제주공항 체크인/티켓발급",       "14:30", "전체", "",    "",       "",       "교통약자는 바로 입구 앞 · 티웨이는 3층 티켓배부, 제주항공은 3층 카운터"],
  [3, 5, "제주공항 게이트",      "에어서울 RS906 탑승 (후발)",     "15:55", "후발", "",    "오는편", "에어서울", ""],
  [3, 6, "제주공항 게이트",      "티웨이 TW726 탑승 (본대)",      "16:25", "선발", "",    "오는편", "티웨이", ""],
  [3, 7, "김포공항 수하물 찾는곳","김포공항 도착 인원체크 (후발)",   "17:00", "후발", "",    "",       "",       ""],
  [3, 8, "김포공항 수하물 찾는곳","김포공항 도착 인원체크 (본대)",   "17:30", "선발", "",    "",       "",       "조별 집결 · 판교아지트 셔틀 집결장소로 조장 인솔 · 개별 이동자는 해산"],
  [3, 9, "김포공항",            "성수/판교 귀가 셔틀 집결",       "18:30", "전체", "귀가", "",       "",       ""],
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
    lines.push(row.map(csvEscape).join(","));
  }
  fs.writeFileSync(OUT_SCHED, lines.join("\n") + "\n", "utf-8");
  const withNotice = SCHEDULES.filter((r) => r[9]).length;
  console.log(`✅ ${OUT_SCHED} (${SCHEDULES.length}개 일정, 공지 ${withNotice}건)`);
}

// ─────────────────────────────────────────────
// member_info.csv — 현재 확정된 미참여만
// 컬럼: 일차, 순서, 이름, 항목, 값
// ─────────────────────────────────────────────
// 확정된 미참여 (사용자 지시 기반):
//   - 1일차 난타공연장 집결 (sort_order=11): yul.9, bart.11, rose.es, kevin.s
//   - 1일차 포도원 집결(본대) (sort_order=13): rose.es, kevin.s
// 그 외는 pending-questions.md에 기록 (사용자 확인 후 추가)

// 확정된 미참여 (사용자 지시 기반)
const STATIC_MEMBER_INFO = [
  // 1일차 난타공연장 미참여
  [1, 11, "yul.9",   "미참여", "숙소 체크·카드키 분류 업무"],
  [1, 11, "bart.11", "미참여", "숙소 체크·카드키 분류 업무"],
  [1, 11, "rose.es", "미참여", "숙소 휴식"],
  [1, 11, "kevin.s", "미참여", "숙소 휴식"],
  // 1일차 포도원(본대) 미참여
  [1, 13, "rose.es", "미참여", "숙소 휴식"],
  [1, 13, "kevin.s", "미참여", "숙소 휴식"],
];

// 몇조 CSV 컬럼 (0-indexed):
//   0=LDAP, 10=더클리프 음료, 11=더클리프 푸드박스, 13=치유의숲 조
// 일정 sort_order (schedules.csv 기준):
//   2일차 4 = 더클리프 출발 집결 (16:10) — 더클리프 체류 시간대의 메뉴 정보 연결
//   3일차 2 = 치유의숲 집결 (10:00) — 개인별 프로그램 조 배정
const DEOCLIFF_ORDER = 4;
const HEALING_ORDER = 2;

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
    const drink = (row[10] || "").trim();
    const foodbox = (row[11] || "").trim();
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
