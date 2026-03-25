import type {
  ParsedGroup,
  ParsedUser,
  ParsedSchedule,
  ValidationError,
  UserRole,
} from "@/lib/types";
import {
  ALLOWED_EMAIL_DOMAIN,
  NO_LOGIN_EMAIL_DOMAIN,
  MEMBER_EMAIL_PREFIX,
  MIN_DAY_NUMBER,
  MAX_DAY_NUMBER,
  PARTY_MAP,
  SCOPE_MAP,
} from "@/lib/constants";

const ROLE_MAP: Record<string, UserRole> = {
  조원: "member",
  조장: "leader",
  관리자: "admin",
  "관리자 (조장)": "admin_leader",
  "관리자(조장)": "admin_leader",
};

// Google Sheets CSV에 포함될 수 있는 보이지 않는 Unicode 문자 제거
function sanitizeText(text: string): string {
  return text
    .replace(/[\uFEFF\u200B\u200C\u200D\u00A0\u2060]/g, "")
    .normalize("NFC")
    .trim();
}

// Google Sheets URL에서 Sheet ID 추출
export function extractSheetId(url: string): string | null {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// CSV 문자열 → 2D 배열 (RFC 4180 준수 — 따옴표 내 콤마/줄바꿈 처리)
export function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const text = csv.replace(/^\uFEFF/, "").trim();

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // 이스케이프된 따옴표 ("")
          field += '"';
          i++;
        } else {
          // 따옴표 필드 종료
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(field.trim());
        field = "";
      } else if (ch === "\r" || ch === "\n") {
        if (ch === "\r" && text[i + 1] === "\n") i++; // CRLF 처리
        row.push(field.trim());
        field = "";
        if (row.some((c) => c)) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // 마지막 필드/행 처리
  row.push(field.trim());
  if (row.some((c) => c)) rows.push(row);

  return rows;
}

// 참가자 행 검증 — 이름/역할/소속조 필수값 + 역할 매핑
function validateUserRow(
  row: string[],
  rowIndex: number,
  emailSet: Set<string>
): {
  errors: ValidationError[];
  name?: string;
  phone?: string | null;
  role?: UserRole;
  groupName?: string;
  busName?: string | null;
  party?: "advance" | "rear" | null;
  email?: string;
} {
  const errors: ValidationError[] = [];
  const name = sanitizeText(row[0] ?? "");
  const phone = row[1]?.trim() || null;
  const roleRaw = sanitizeText(row[2] ?? "");
  const groupName = sanitizeText(row[3] ?? "");
  const busName = row[4]?.trim() || null;
  const partyRaw = sanitizeText(row[5] ?? "");
  const rowNum = rowIndex + 1;

  if (!name) {
    errors.push({ sheet: "users", row: rowNum, field: "이름", message: "이름이 없어요" });
    return { errors };
  }

  const role = ROLE_MAP[roleRaw] ?? (() => {
    const parenMatch = roleRaw.match(/\((.+)\)/);
    return parenMatch ? ROLE_MAP[parenMatch[1].trim()] : undefined;
  })();
  if (!role) {
    errors.push({ sheet: "users", row: rowNum, field: "역할", message: `역할은 조원/조장/관리자/관리자(조장)만 가능해요 (입력값: "${roleRaw}")` });
    return { errors };
  }

  if (!groupName) {
    errors.push({ sheet: "users", row: rowNum, field: "소속조", message: "소속조가 없어요" });
    return { errors };
  }

  const needsLogin = role !== "member";
  const email = needsLogin
    ? `${name.toLowerCase()}${ALLOWED_EMAIL_DOMAIN}`
    : `${MEMBER_EMAIL_PREFIX}.${name}.${rowIndex}${NO_LOGIN_EMAIL_DOMAIN}`;

  if (emailSet.has(email)) {
    errors.push({ sheet: "users", row: rowNum, field: "이름", message: `${name} 이름이 중복되어 있어요 (이메일 충돌)` });
    return { errors };
  }

  let party: "advance" | "rear" | null = null;
  if (partyRaw) {
    const mapped = PARTY_MAP[partyRaw];
    if (mapped) {
      party = mapped;
    } else {
      errors.push({ sheet: "users", row: rowNum, field: "선후발", message: `선후발은 선발/후발만 가능해요 (입력값: "${partyRaw}")` });
    }
  }

  return { errors, name, phone, role, groupName, busName, party, email };
}

// 일정 행 검증 — 일차 범위 + 일정명 필수 + 대상 매핑
function validateScheduleRow(
  row: string[],
  rowIndex: number
): {
  errors: ValidationError[];
  dayNumber?: number;
  sortOrder?: number;
  location?: string | null;
  title?: string;
  scheduledTime?: string | null;
  scope?: "all" | "advance" | "rear";
} {
  const errors: ValidationError[] = [];
  const rowNum = rowIndex + 1;
  const dayRaw = row[0]?.trim() ?? "";
  const dayNumber = parseInt(dayRaw.replace(/\D/g, ""), 10);
  const sortOrder = parseInt(row[1], 10);
  const location = row[2]?.trim() || null;
  const title = row[3]?.trim();
  const scheduledTime = row[4]?.trim() || null;
  const scopeRaw = sanitizeText(row[5] ?? "");

  if (isNaN(dayNumber) || dayNumber < MIN_DAY_NUMBER || dayNumber > MAX_DAY_NUMBER) {
    errors.push({ sheet: "schedules", row: rowNum, field: "일차", message: `일차는 ${MIN_DAY_NUMBER}~${MAX_DAY_NUMBER}만 가능해요` });
    return { errors };
  }

  if (!title) {
    errors.push({ sheet: "schedules", row: rowNum, field: "일정명", message: "일정명이 없어요" });
    return { errors };
  }

  const scope = scopeRaw ? SCOPE_MAP[scopeRaw] : "all";
  if (!scope) {
    errors.push({ sheet: "schedules", row: rowNum, field: "대상", message: `대상은 전체/선발/후발만 가능해요 (입력값: "${scopeRaw}")` });
    return { errors };
  }

  return { errors, dayNumber, sortOrder: isNaN(sortOrder) ? rowIndex : sortOrder, location, title, scheduledTime, scope };
}

// 참가자 시트 파싱 (6컬럼: 이름, 전화번호, 역할, 소속조, 배정차량, 선후발)
// 이메일은 이름 기반 자동 생성 (조장/관리자: name@도메인, 조원: nologin)
// groups는 소속조 고유값에서 자동 추출, bus_name은 배정차량 열에서 매핑, party는 유저별
export function parseUsersSheet(rows: string[][]): {
  users: ParsedUser[];
  groups: ParsedGroup[];
  errors: ValidationError[];
} {
  const users: ParsedUser[] = [];
  const errors: ValidationError[] = [];
  const emailSet = new Set<string>();
  const groupBusMap = new Map<string, string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const result = validateUserRow(row, i, emailSet);
    errors.push(...result.errors);

    if (!result.name || !result.role || !result.groupName || !result.email) continue;
    // 선후발 에러가 있어도 유저 자체는 추가 (에러는 경고 성격)
    if (result.errors.length > 0 && !result.role) continue;

    emailSet.add(result.email);

    if (!groupBusMap.has(result.groupName)) {
      groupBusMap.set(result.groupName, result.busName ?? result.groupName);
    }

    users.push({
      name: result.name,
      email: result.email,
      phone: result.phone ?? null,
      role: result.role,
      group_name: result.groupName,
      party: result.party ?? null,
    });
  }

  const groups: ParsedGroup[] = Array.from(groupBusMap.entries()).map(([gn, bn]) => ({
    name: gn,
    bus_name: bn,
  }));

  return { users, groups, errors };
}

// 일정 시트 파싱 (6컬럼: 일차, 순서, 장소, 일정명, 예정시각, 대상)
export function parseSchedulesSheet(rows: string[][]): {
  schedules: ParsedSchedule[];
  errors: ValidationError[];
} {
  const schedules: ParsedSchedule[] = [];
  const errors: ValidationError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const result = validateScheduleRow(row, i);
    errors.push(...result.errors);

    if (!result.title || result.dayNumber === undefined || !result.scope) continue;

    schedules.push({
      day_number: result.dayNumber,
      sort_order: result.sortOrder ?? i,
      title: result.title,
      location: result.location ?? null,
      scheduled_time: result.scheduledTime ?? null,
      scope: result.scope,
    });
  }

  return { schedules, errors };
}
