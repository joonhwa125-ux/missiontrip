// 3개 원본 CSV를 파싱하여 users.csv를 생성하는 스크립트
// 입력:
//   - [인력관리TF] 운영안 - ★조편성 수정.csv    → 조 편성 (역할·소속조·차량)
//   - [인력관리TF] 운영안 - 몇조_.csv              → 항공편 정보
//   - [인력관리TF] 운영안 - 성수_판교→김포 (1).csv → 출발 셔틀 + 선후발
//   - [인력관리TF] 운영안 - 김포→성수_판교 (1).csv → 귀가 셔틀
// 출력: data/converted/users.csv + data/converted/verification-report.md

import fs from "node:fs";
import path from "node:path";

const HOME = process.env.USERPROFILE || process.env.HOME;
const DL = path.join(HOME, "Downloads");
const SRC_GROUP = path.join(DL, "[인력관리TF] 운영안 - ★조편성 수정.csv");
const SRC_WHICH = path.join(DL, "[인력관리TF] 운영안 - 몇조_.csv");
const SRC_DEP = path.join(DL, "[인력관리TF] 운영안 - 성수_판교→김포 (1).csv");
const SRC_RET = path.join(DL, "[인력관리TF] 운영안 - 김포→성수_판교 (1).csv");

const OUT_DIR = path.resolve("data/converted");
const OUT_CSV = path.join(OUT_DIR, "users.csv");
const OUT_REPORT = path.join(OUT_DIR, "verification-report.md");

// ─────────────────────────────────────────────
// CSV 파서 (RFC 4180 준수)
// ─────────────────────────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const t = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (inQuotes) {
      if (ch === '"') {
        if (t[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && t[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else { field += ch; }
    }
  }
  row.push(field);
  if (row.some(c => c !== "")) rows.push(row);
  return rows;
}

function readCsv(p) {
  return parseCsv(fs.readFileSync(p, "utf-8"));
}

// ─────────────────────────────────────────────
// 1. 조편성 CSV 파싱 — section 1 (rows 1-37)
// ─────────────────────────────────────────────
// 컬럼 구조:
// Col 0: 라벨 / Col 1-18: 차량별 조원 / Col 19+: 비고
// Row 8 (index): 차장 / Row 9: 조 / Row 10: 조인원 / Row 11: 조장 / Row 12~: 조원
// Row 28~37: 외부 지원 인력 (이미 CSV에 "가이드", "트래블헬퍼1" 등으로 표기됨)

const GROUP_META = [
  // [csvColIndex, 소속조, 배정차량]
  [1,  "16조", "8호차 갈매기"],
  [2,  "17조", "9호차 돌고래"],
  [3,  "1조",  "1호차 돌하르방"],
  [4,  "2조",  "1호차 돌하르방"],
  [5,  "3조",  "2호차 조랑말"],
  [6,  "4조",  "2호차 조랑말"],
  [7,  "5조",  "3호차 해녀"],
  [8,  "6조",  "3호차 해녀"],
  [9,  "7조",  "4호차 흑돼지"],
  [10, "8조",  "4호차 흑돼지"],
  [11, "9조",  "5호차 유채꽃"],
  [12, "10조", "5호차 유채꽃"],
  [13, "11조", "6호차 감귤"],
  [14, "12조", "6호차 감귤"],
  [15, "13조", "7호차 동백꽃"],
  [16, "14조", "7호차 동백꽃"],
  [17, "15조", "7호차 동백꽃"],
  [18, "선발조", "선발차량"],
];

const KAKAO_EXCLUDE = new Set(["카카오 레이나", "카카오 지아나", "카카오 해리"]);

function parseGroupSheet() {
  const rows = readCsv(SRC_GROUP);
  // Section 1 rows: index 0~36 (1~37 in user view)
  // row 10 (idx 10) = 조장 / row 11~27 (idx 11~27) = 조원들

  const result = new Map(); // LDAP/한글이름 → {name, groupName, busName, role, isLeader, isAdmin}
  const groupLeaderMap = new Map(); // groupName → leader LDAP

  // 조장 행 = index 10 (csv line 11)
  const leaderRow = rows[10];
  // 조원 행 = index 11~26 (csv line 12~27)
  // 6조(17명) = 조장 1 + 조원 16 → index 11~26이 최대. index 27(line 28)은 "가이드" 시작
  const memberRowsStart = 11;
  const memberRowsEnd = 26;

  for (const [colIdx, groupName, busName] of GROUP_META) {
    // 조장
    const leader = (leaderRow[colIdx] || "").trim();
    if (leader) {
      groupLeaderMap.set(groupName, leader);
      result.set(leader, {
        name: leader, groupName, busName, isLeader: true, isAdmin: false,
      });
    }
    // 조원
    for (let r = memberRowsStart; r <= memberRowsEnd; r++) {
      const row = rows[r];
      if (!row) continue;
      const name = (row[colIdx] || "").trim();
      if (!name) continue;
      if (KAKAO_EXCLUDE.has(name)) continue;  // 카카오 3명 제외
      if (result.has(name)) continue;  // 조장은 이미 추가됨
      result.set(name, {
        name, groupName, busName, isLeader: false, isAdmin: false,
      });
    }
  }

  // 외부 지원 인력 (rows 27~36 = 가이드, 트래블헬퍼 등)
  // 각 차량의 첫 번째 조에 배정
  const EXT_ASSIGN = {
    3:  "1조",   // 1호차 → 1조
    5:  "3조",   // 2호차 → 3조
    7:  "5조",   // 3호차 → 5조
    9:  "7조",   // 4호차 → 7조
    11: "9조",   // 5호차 → 9조
    13: "11조",  // 6호차 → 11조
    15: "13조",  // 7호차 → 13조
  };
  const BUS_OF_COL = Object.fromEntries(GROUP_META.map(([c, g, b]) => [c, b]));
  const BUS_PREFIX_OF_COL = {
    3: "1호차", 5: "2호차", 7: "3호차", 9: "4호차",
    11: "5호차", 13: "6호차", 15: "7호차",
  };

  for (let r = 27; r <= 36; r++) {
    const row = rows[r];
    if (!row) continue;
    for (const colIdx of Object.keys(EXT_ASSIGN).map(Number)) {
      const raw = (row[colIdx] || "").trim();
      if (!raw) continue;
      // 이름 유일화: 차량 접두어 추가
      const prefixed = `${BUS_PREFIX_OF_COL[colIdx]} ${raw}`;
      if (result.has(prefixed)) continue;
      result.set(prefixed, {
        name: prefixed,
        groupName: EXT_ASSIGN[colIdx],
        busName: BUS_OF_COL[colIdx],
        isLeader: false,
        isAdmin: false,
        isExternal: true,
      });
    }
  }

  return { users: result, groupLeaders: groupLeaderMap };
}

// ─────────────────────────────────────────────
// 2. 몇조 CSV 파싱 — 항공편 정보 수집
// ─────────────────────────────────────────────
// Col 0=LDAP, 1=호칭, 2=본명, 3=버스, 4=기본조, 5=조장, 6=김포집결시간,
// 7=김포→제주 항공사, 8=편명, 9=출발시간, 10=음료, 11=푸드박스,
// 12=치유의숲 프로그램, 13=치유의숲 조, 14=제주→김포 항공사, 15=편명, 16=출발시간

function parseWhichGroupSheet() {
  const rows = readCsv(SRC_WHICH);
  const map = new Map();  // LDAP/한글이름 → {airline, returnAirline, nickname, realName}
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => !c)) continue;
    const ldap = (row[0] || "").trim();
    if (!ldap) continue;
    const airlineRaw = (row[7] || "").trim();
    const returnAirlineRaw = (row[14] || "").trim();
    map.set(ldap, {
      nickname: (row[1] || "").trim(),
      realName: (row[2] || "").trim(),
      airline: airlineRaw === "-" ? "" : airlineRaw,
      returnAirline: (returnAirlineRaw === "-" || returnAirlineRaw === "#N/A") ? "" : returnAirlineRaw,
      gatheringTime: (row[6] || "").trim(),
    });
  }
  return map;
}

// ─────────────────────────────────────────────
// 3. 셔틀 CSV 파싱 — 출발/귀가 셔틀 + 선후발
// ─────────────────────────────────────────────
// 성수_판교→김포 CSV: 5번째 행(idx 4)의 "N명" 표시로 그룹 헤더, 6번째 행(idx 5)이 컬럼 헤더
// 4개 그룹: 성수→김포(col3) / 판교 오전1(col7) / 판교 오전2(col11) / 판교 오후(col15)

const DEP_SHUTTLES = [
  { col: 3,  label: "성수 출발" },
  { col: 7,  label: "판교 출발 1" },
  { col: 11, label: "판교 출발 2" },
  { col: 15, label: "판교 출발 오후", isRear: true },
];

const RET_SHUTTLES = [
  { col: 3,  label: "성수 귀가" },
  { col: 7,  label: "판교 귀가 1" },
  { col: 11, label: "성수 귀가 2" },
];

function parseShuttleSheet(file, groups, startRow) {
  // startRow: 첫 LDAP 데이터가 있는 row index
  //   성수_판교→김포 CSV: line 7 (index 6) 부터 — 헤더 복잡(line 1 집결장소, line 5 그룹명, line 6 컬럼헤더)
  //   김포→성수_판교 CSV: line 4 (index 3) 부터 — 헤더 간단(line 2 그룹명, line 3 컬럼헤더)
  const rows = readCsv(file);
  const map = new Map();  // LDAP → label
  for (const { col, label } of groups) {
    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const ldap = (row[col] || "").trim();
      if (!ldap) continue;
      map.set(ldap, label);
    }
  }
  return map;
}

function parseDepShuttle() {
  // 성수_판교→김포 CSV: 첫 LDAP 데이터는 line 7 (index 6)
  const rows = readCsv(SRC_DEP);
  const depMap = new Map();
  const rearSet = new Set();
  for (const { col, label, isRear } of DEP_SHUTTLES) {
    for (let r = 6; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const ldap = (row[col] || "").trim();
      if (!ldap) continue;
      depMap.set(ldap, label);
      if (isRear) rearSet.add(ldap);
    }
  }
  // 셔틀 CSV에 없지만 비행기 기준 후발인 예외자 수동 추가
  // (사용자 확인: 포도원 이미지의 후발 19명 = 몇조 CSV 티웨이 TW727 17:10)
  // limu.9287, heather.seo는 자차로 김포 직행 → 셔틀 명단 없음. 선후발은 비행기 기준 후발
  const REAR_EXCEPTIONS_NO_SHUTTLE = ["limu.9287", "heather.seo"];
  for (const name of REAR_EXCEPTIONS_NO_SHUTTLE) rearSet.add(name);
  return { depMap, rearSet };
}

// ─────────────────────────────────────────────
// 4. 조립 — users.csv 생성
// ─────────────────────────────────────────────

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function main() {
  console.log("1. 조편성 CSV 파싱...");
  const { users: userMap } = parseGroupSheet();
  console.log(`   → ${userMap.size}명 수집`);

  console.log("2. 몇조 CSV 파싱 (항공편)...");
  const whichMap = parseWhichGroupSheet();
  console.log(`   → ${whichMap.size}명 항공편 정보 수집`);

  console.log("3. 출발 셔틀 CSV 파싱...");
  const { depMap, rearSet } = parseDepShuttle();
  console.log(`   → ${depMap.size}명 배정 (후발 ${rearSet.size}명)`);

  console.log("4. 귀가 셔틀 CSV 파싱...");
  const retMap = parseShuttleSheet(SRC_RET, RET_SHUTTLES, 3);
  console.log(`   → ${retMap.size}명 배정`);

  // 관리자 지정 — liam.j = 관리자(조장), yul.9 = 관리자
  if (userMap.has("liam.j")) userMap.get("liam.j").isAdmin = true;
  if (userMap.has("yul.9")) {
    const u = userMap.get("yul.9");
    u.isAdmin = true;
    // yul.9는 5조 소속이지만 조장 아님 → isLeader=false로 유지
  }

  // 누락 경고 대상 수집
  const missingInWhich = [];   // 조편성에 있지만 몇조 CSV에 없는 사람
  const newInReturn = [];      // 귀가 셔틀에만 있고 조편성에 없는 사람 (예: lauren.123)

  // 5. users.csv 생성
  const header = [
    "이름", "전화번호", "역할", "소속조", "배정차량",
    "출발셔틀버스", "귀가셔틀버스", "선후발",
    "항공사(가는편)", "항공사(오는편)", "여행역할"
  ];
  const lines = [header.map(csvEscape).join(",")];

  const sortedUsers = [...userMap.values()].sort((a, b) => {
    // 조별 정렬: 1조,2조,...,15조,16조,17조,선발조
    const order = (g) => {
      if (g === "선발조") return 999;
      const n = parseInt(g, 10);
      return n;
    };
    const oa = order(a.groupName), ob = order(b.groupName);
    if (oa !== ob) return oa - ob;
    // 같은 조 내: 조장 먼저
    if (a.isLeader && !b.isLeader) return -1;
    if (!a.isLeader && b.isLeader) return 1;
    // 그 다음 관리자
    if (a.isAdmin && !b.isAdmin) return -1;
    if (!a.isAdmin && b.isAdmin) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const u of sortedUsers) {
    const role =
      u.isAdmin && u.isLeader ? "관리자(조장)" :
      u.isAdmin ? "관리자" :
      u.isLeader ? "조장" : "조원";

    const which = whichMap.get(u.name);
    if (!which && !u.isExternal) missingInWhich.push(u.name);

    const depShuttle = depMap.get(u.name) || "";
    const retShuttle = retMap.get(u.name) || "";
    const party = rearSet.has(u.name) ? "후발" : (depShuttle || retShuttle || !u.isExternal && which) ? "선발" : "";
    // party 규칙: 후발 셔틀에 있으면 후발, 그 외 몇조 CSV에 있거나 셔틀 배정이 있으면 선발, 외부인/미정은 빈칸

    const row = [
      u.name,
      "", // 전화번호 (사용자 지시: 빈값)
      role,
      u.groupName,
      u.busName || "",
      depShuttle,
      retShuttle,
      party,
      which?.airline || "",
      which?.returnAirline || "",
      "", // 여행역할 (보류)
    ];
    lines.push(row.map(csvEscape).join(","));
  }

  // 귀가 셔틀에만 있고 조편성에 없는 사람 감지
  for (const [ldap] of retMap) {
    if (!userMap.has(ldap)) newInReturn.push(ldap);
  }

  fs.writeFileSync(OUT_CSV, lines.join("\n") + "\n", "utf-8");
  console.log(`\n✅ ${OUT_CSV} 작성 완료 (${sortedUsers.length}행)`);

  // 검증 메타정보 반환
  return {
    sortedUsers,
    userMap,
    whichMap,
    depMap,
    retMap,
    rearSet,
    missingInWhich,
    newInReturn,
  };
}

// ─────────────────────────────────────────────
// 자가검증 리포트
// ─────────────────────────────────────────────

function buildReport(meta) {
  const { sortedUsers, userMap, whichMap, depMap, retMap, rearSet, missingInWhich, newInReturn } = meta;

  // 조별 인원 카운트
  const groupCount = {};
  for (const u of sortedUsers) {
    groupCount[u.groupName] = (groupCount[u.groupName] || 0) + 1;
  }

  // 조편성 CSV 기준 조인원 (검증 대조)
  const EXPECTED = {
    "16조": 3, "17조": 3,
    "1조": 14, "2조": 14, "3조": 14, "4조": 13,
    "5조": 14, "6조": 17, "7조": 15, "8조": 12,
    "9조": 12, "10조": 12, "11조": 15, "12조": 14,
    "13조": 10, "14조": 10, "15조": 11,
    "선발조": 4,
  };
  const EXT_COUNT = {
    "1조": 5, "3조": 3, "5조": 1, "7조": 10,
    "9조": 1, "11조": 2, "13조": 1,
  };

  let mismatchLines = [];
  for (const g of Object.keys(EXPECTED)) {
    let expected = EXPECTED[g];
    if (g === "8조") expected -= 3;  // 카카오 3명 제외
    expected += (EXT_COUNT[g] || 0);
    const actual = groupCount[g] || 0;
    const ok = expected === actual;
    mismatchLines.push(`| ${g} | ${EXPECTED[g]}${g === "8조" ? " (카카오 3명 제외 9)" : ""} | ${EXT_COUNT[g] || 0} | ${expected} | ${actual} | ${ok ? "✅" : "❌"} |`);
  }

  // 후발 17명 검증
  const expectedRear = new Set([
    "ria.21","jerry.sy","daisy.0420","bri.22","elio.93","finn.0727","mello.12",
    "noah.k","rivo.l","selene.l","ari.901","crystal.xu","el.y","jasmine.m",
    "jemma.k","sandy.33","yoni.k"
  ]);
  const rearDiff = [];
  for (const n of expectedRear) if (!rearSet.has(n)) rearDiff.push(`후발 예상인데 누락: ${n}`);
  for (const n of rearSet) if (!expectedRear.has(n)) rearDiff.push(`후발 추가된 인원: ${n}`);

  const totalActual = sortedUsers.length;
  const rearActual = [...rearSet].length;
  const selActual = sortedUsers.filter(u => {
    const p = rearSet.has(u.name) ? "후발" :
      (depMap.get(u.name) || retMap.get(u.name) || (!u.isExternal && whichMap.has(u.name))) ? "선발" : "";
    return p === "선발";
  }).length;
  const partyBlank = totalActual - rearActual - selActual;

  const lines = [];
  lines.push("# users.csv 자가검증 리포트");
  lines.push("");
  lines.push(`생성 시각: ${new Date().toISOString()}`);
  lines.push(`출력 파일: \`data/converted/users.csv\``);
  lines.push(`총 행 수: **${totalActual}명**`);
  lines.push("");
  lines.push("## 1. 조별 인원 검증");
  lines.push("");
  lines.push("| 조 | 조편성 조인원 | 외부 지원 | 예상 총합 | 실제 | 일치 |");
  lines.push("|---|---|---|---|---|---|");
  mismatchLines.forEach(l => lines.push(l));
  lines.push("");
  lines.push(`총계: 카카오 3명 제외 204 + 외부 23 = **227명 예상**, 실제 **${totalActual}명**`);
  lines.push("");

  lines.push("## 2. 선후발 검증");
  lines.push("");
  lines.push(`- 후발 예상: 17명 / 실제: ${rearActual}명`);
  if (rearDiff.length) {
    lines.push("- ❌ **불일치:**");
    rearDiff.forEach(d => lines.push(`  - ${d}`));
  } else {
    lines.push("- ✅ **완벽 일치** (셔틀 CSV 오후 명단 ↔ 몇조 CSV 오후 3시 집결자)");
  }
  lines.push(`- 선발: ${selActual}명`);
  lines.push(`- 빈칸(판별 불가): ${partyBlank}명`);
  lines.push("");

  lines.push("## 3. 교차 참조 이슈");
  lines.push("");
  if (missingInWhich.length) {
    lines.push(`### ⚠ 조편성에 있으나 몇조 CSV에 없음 (항공편 정보 누락, ${missingInWhich.length}명)`);
    missingInWhich.forEach(n => lines.push(`- ${n}`));
    lines.push("");
  }
  if (newInReturn.length) {
    lines.push(`### ⚠ 귀가 셔틀에만 있고 조편성에 없음 (${newInReturn.length}명)`);
    newInReturn.forEach(n => lines.push(`- \`${n}\` — **추가 확인 필요** (소속조·차량 미상)`));
    lines.push("");
  }

  // 셔틀 미배정자
  const noShuttle = sortedUsers.filter(u => !depMap.has(u.name) && !retMap.has(u.name) && !u.isExternal);
  lines.push(`### 셔틀 미배정자 (자차/개별이동 추정): ${noShuttle.length}명`);
  lines.push("");

  // 선발 STAFF 중 셔틀 없는 사람
  const staffNoShuttle = sortedUsers.filter(u => u.groupName === "선발조" && !depMap.has(u.name));
  lines.push(`### 선발조 중 출발 셔틀 미배정: ${staffNoShuttle.length}명`);
  staffNoShuttle.forEach(u => lines.push(`- ${u.name}`));
  lines.push("");

  lines.push("## 4. 빈칸(UNCERTAIN) 필드 통계");
  lines.push("");
  const blankStats = {};
  const cols = ["전화번호", "출발셔틀버스", "귀가셔틀버스", "선후발", "항공사(가는편)", "항공사(오는편)", "여행역할"];
  for (const c of cols) blankStats[c] = 0;
  for (const u of sortedUsers) {
    if (true) blankStats["전화번호"]++;  // 전부 빈값
    if (!depMap.has(u.name)) blankStats["출발셔틀버스"]++;
    if (!retMap.has(u.name)) blankStats["귀가셔틀버스"]++;
    const party = rearSet.has(u.name) ? "후발" :
      (depMap.get(u.name) || retMap.get(u.name) || (!u.isExternal && whichMap.has(u.name))) ? "선발" : "";
    if (!party) blankStats["선후발"]++;
    const w = whichMap.get(u.name);
    if (!w?.airline) blankStats["항공사(가는편)"]++;
    if (!w?.returnAirline) blankStats["항공사(오는편)"]++;
    blankStats["여행역할"]++;
  }
  lines.push("| 컬럼 | 빈칸 수 | 사유 |");
  lines.push("|---|---|---|");
  lines.push(`| 전화번호 | ${blankStats["전화번호"]} | 사용자 지시로 전원 빈값 |`);
  lines.push(`| 출발셔틀버스 | ${blankStats["출발셔틀버스"]} | 셔틀 CSV 미등재자 (자차/개별이동) |`);
  lines.push(`| 귀가셔틀버스 | ${blankStats["귀가셔틀버스"]} | 셔틀 CSV 미등재자 |`);
  lines.push(`| 선후발 | ${blankStats["선후발"]} | 몇조 CSV·셔틀 CSV 모두에 없는 외부 인력 23명 등 |`);
  lines.push(`| 항공사(가는편) | ${blankStats["항공사(가는편)"]} | 몇조 CSV 미등재 또는 '-' |`);
  lines.push(`| 항공사(오는편) | ${blankStats["항공사(오는편)"]} | 몇조 CSV 미등재 또는 '#N/A' |`);
  lines.push(`| 여행역할 | ${blankStats["여행역할"]} | 보류 지시 (추후 다른 탭에서 수집) |`);
  lines.push("");

  lines.push("## 5. 역할 분포");
  lines.push("");
  const roleCount = { "관리자(조장)": 0, "관리자": 0, "조장": 0, "조원": 0 };
  for (const u of sortedUsers) {
    const r = u.isAdmin && u.isLeader ? "관리자(조장)" :
              u.isAdmin ? "관리자" :
              u.isLeader ? "조장" : "조원";
    roleCount[r]++;
  }
  for (const [r, n] of Object.entries(roleCount)) lines.push(`- ${r}: ${n}명`);
  lines.push("");

  lines.push("## 6. 작업 가정 (추측 없음 기준 재확인)");
  lines.push("");
  lines.push("- ✅ 소속조 표기: `1조`~`15조`, `16조`, `17조`, `선발조` (번호만)");
  lines.push("- ✅ 배정차량 표기: `N호차 현수막` (예: `4호차 흑돼지`)");
  lines.push("- ✅ 역할: 조편성 CSV 행 11 조장 목록 기반 + 사용자 명시 (liam.j=관리자(조장), yul.9=관리자)");
  lines.push("- ✅ 후발 기준: 1일차 김포공항행 판교 오후 셔틀 17명 (사용자 명시 기준)");
  lines.push("- ✅ 외부 23명 배정: 각 차량 첫 번째 조 (1호차→1조, 2호차→3조, 3호차→5조, 4호차→7조, 5호차→9조, 6호차→11조, 7호차→13조)");
  lines.push("- ✅ 이름 포맷: LDAP 영문 그대로. 한글 이름(앨빈 지원인·신시아 지원인·데미안 지원인·조태현사진작가)은 몇조 CSV 표기 그대로");
  lines.push("- ✅ 카카오 레이나/지아나/해리 3명 제외 (사용자 지시)");
  lines.push("- ✅ 전화번호 전원 빈값 (사용자 지시)");
  lines.push("- ✅ 여행역할 전원 빈값 (보류, 추후 다른 탭)");
  lines.push("");

  fs.writeFileSync(OUT_REPORT, lines.join("\n"), "utf-8");
  console.log(`✅ ${OUT_REPORT} 작성 완료`);
}

const meta = main();
buildReport(meta);
