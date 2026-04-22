// 조 브리핑 group_info.csv 생성 (조 단위 일정별 메타데이터)
// 컬럼: 일차, 순서, 조, 조 위치, 메모
//
// 현재 확정분만 포함:
//   - 1일차 제주공항 도착 본대 (sort_order=3) — 18조 A/B 구분 (카카오 삭제로 4→3 이관, 도착 시점에 미리 예고)
//   - 1일차 포도원 본대 (sort_order=7) — 18조 좌석 영역 (카카오 삭제로 8→7 재매핑)
//   - 2일차 성화정 집결 (sort_order=1) — 17조 식사 시각 구분 (하효마을 통합으로 2→1 재매핑, 선발조 제외)
//
// 보류: 포도원 후발 좌석, 고등어쌈밥 특별 배치, 선발조 하효마을 식사 시각

import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("data/converted");
const OUT_CSV = path.join(OUT_DIR, "group_info.csv");

// 조 목록 (카카오 A/B 분류 포함)
const B_GROUPS = ["1조", "2조", "3조", "4조", "5조", "6조", "16조", "17조"]; // 나중 식사
const A_GROUPS = ["7조", "8조", "9조", "10조", "11조", "12조", "13조", "14조", "15조", "선발조"]; // 먼저 식사

// 포도원 좌석 영역
const PODOWON_1F_80 = ["1조", "2조", "3조", "4조", "5조", "16조", "17조"];
const PODOWON_1F_40 = ["6조", "7조"];
const PODOWON_2F_100 = ["8조", "9조", "10조", "11조", "12조", "13조", "14조", "15조", "선발조"];

// 하효마을 식사 시작 시각 (선발조 제외)
const HAHYO_12_00 = ["1조", "2조", "3조", "4조", "5조", "6조", "16조", "17조"];
const HAHYO_12_30 = ["7조", "8조", "9조", "10조", "11조", "12조", "13조", "14조", "15조"];

// 일정 sort_order (schedules.csv와 동기)
const CAKAO_ORDER = 3;    // 1일차 제주공항 도착(본대) — 카카오 삭제로 A/B조 안내를 도착 카드로 이관 (4→3)
const PODOWON_MAIN = 7;   // 1일차 포도원 집결 (본대) — 카카오 삭제로 8→7 재매핑
const HAHYO_ORDER = 1;    // 2일차 성화정 집결 (하효마을 통합으로 2→1 이관) — 식사 시각 조별 안내

const rows = [];

// ─── 1일차 카카오 집결 ───
for (const g of B_GROUPS) {
  rows.push([1, CAKAO_ORDER, g, "", "B조 · 14:50 점심 · 기업소개 먼저"]);
}
for (const g of A_GROUPS) {
  rows.push([1, CAKAO_ORDER, g, "", "A조 · 14:10 점심 · 오피스투어 먼저"]);
}

// ─── 1일차 포도원 본대 ───
for (const g of PODOWON_1F_80) rows.push([1, PODOWON_MAIN, g, "1층 80명석", ""]);
for (const g of PODOWON_1F_40) rows.push([1, PODOWON_MAIN, g, "1층 40명석", ""]);
for (const g of PODOWON_2F_100) rows.push([1, PODOWON_MAIN, g, "2층 100명석", ""]);

// ─── 2일차 하효마을 집결 ───
for (const g of HAHYO_12_00) rows.push([2, HAHYO_ORDER, g, "", "12:00 식사 시작"]);
for (const g of HAHYO_12_30) rows.push([2, HAHYO_ORDER, g, "", "12:30 식사 시작"]);

function csvEscape(v) {
  if (v == null) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const header = ["일차", "순서", "조", "조 위치", "메모"];
const lines = [header.map(csvEscape).join(",")];
for (const row of rows) {
  lines.push(row.map(csvEscape).join(","));
}

fs.writeFileSync(OUT_CSV, lines.join("\n") + "\n", "utf-8");
console.log(`✅ ${OUT_CSV} (${rows.length}행)`);

// 자가검증
console.log("\n자가검증:");
const byOrder = {};
for (const r of rows) {
  const key = `${r[0]}일차 순서${r[1]}`;
  byOrder[key] = (byOrder[key] || 0) + 1;
}
for (const [k, n] of Object.entries(byOrder)) {
  console.log(`  - ${k}: ${n}행`);
}

const allGroups = new Set(rows.map(r => r[2]));
console.log(`  - 참여 조 수: ${allGroups.size}개 (${[...allGroups].sort().join(", ")})`);
