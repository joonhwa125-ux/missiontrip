// 분홍 셀 가설 검증: "제주항공 7C117 11:55 출발 (김포 집결 오전 10시)"
// 몇조 CSV에서 각 항공편별 명단을 추출하고, 이미지에서 보이는 분홍 셀 이름과 대조

import fs from "node:fs";
import path from "node:path";

const HOME = process.env.USERPROFILE || process.env.HOME;
const DL = path.join(HOME, "Downloads");
const SRC_WHICH = path.join(DL, "[인력관리TF] 운영안 - 몇조_.csv");

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

const rows = parseCsv(fs.readFileSync(SRC_WHICH, "utf-8"));

// 그룹핑: 김포→제주 편명별
const byFlight = new Map();
for (let i = 1; i < rows.length; i++) {
  const row = rows[i];
  if (!row || !row[0]) continue;
  const ldap = row[0].trim();
  const airline = (row[7] || "").trim();
  const flight = (row[8] || "").trim();
  const gatheringTime = (row[6] || "").trim();
  const key = `${gatheringTime} / ${airline} ${flight}`;
  if (!byFlight.has(key)) byFlight.set(key, []);
  byFlight.get(key).push(ldap);
}

console.log("## 김포→제주 편명별 분포\n");
for (const [key, list] of byFlight) {
  console.log(`### ${key} (${list.length}명)`);
  console.log(list.join(", "));
  console.log("");
}
