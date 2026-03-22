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
} from "@/lib/constants";

const ROLE_MAP: Record<string, UserRole> = {
  조원: "member",
  조장: "leader",
  관리자: "admin",
};

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
  const text = csv.trim();

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

// 참가자 시트 파싱 (4컬럼: 이름, 전화번호, 역할, 소속조)
// 이메일은 이름 기반 자동 생성 (조장/관리자: name@도메인, 조원: nologin)
// groups는 소속조 고유값에서 자동 추출
export function parseUsersSheet(rows: string[][]): {
  users: ParsedUser[];
  groups: ParsedGroup[];
  errors: ValidationError[];
} {
  const users: ParsedUser[] = [];
  const errors: ValidationError[] = [];
  const emailSet = new Set<string>();
  const groupNameSet = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const name = row[0]?.trim();
    const phone = row[1]?.trim() || null;
    const roleRaw = row[2]?.trim();
    const groupName = row[3]?.trim();

    // 이름 필수
    if (!name) {
      errors.push({
        sheet: "users",
        row: i + 1,
        field: "이름",
        message: "이름이 없어요",
      });
      continue;
    }

    // 역할값
    const role = ROLE_MAP[roleRaw];
    if (!role) {
      errors.push({
        sheet: "users",
        row: i + 1,
        field: "역할",
        message: "역할은 조원/조장/관리자만 가능해요",
      });
      continue;
    }

    // 소속조 필수
    if (!groupName) {
      errors.push({
        sheet: "users",
        row: i + 1,
        field: "소속조",
        message: "소속조가 없어요",
      });
      continue;
    }

    // 이메일 자동 생성: 조장/관리자 → name@도메인, 조원 → nologin
    const email = (role === "leader" || role === "admin")
      ? `${name.toLowerCase()}${ALLOWED_EMAIL_DOMAIN}`
      : `${MEMBER_EMAIL_PREFIX}.${name}.${i}${NO_LOGIN_EMAIL_DOMAIN}`;

    // 이메일 중복 검사
    if (emailSet.has(email)) {
      errors.push({
        sheet: "users",
        row: i + 1,
        field: "이름",
        message: `${name} 이름이 중복되어 있어요 (이메일 충돌)`,
      });
      continue;
    }
    emailSet.add(email);

    // 소속조 수집
    groupNameSet.add(groupName);

    users.push({ name, email, phone, role, group_name: groupName });
  }

  // 소속조 고유값 → ParsedGroup[] (name = bus_name)
  const groups: ParsedGroup[] = Array.from(groupNameSet).map((gn) => ({
    name: gn,
    bus_name: gn,
  }));

  return { users, groups, errors };
}

// 일정 시트 파싱 (5컬럼: 일차, 순서, 일정명, 장소, 예정시각)
export function parseSchedulesSheet(rows: string[][]): {
  schedules: ParsedSchedule[];
  errors: ValidationError[];
} {
  const schedules: ParsedSchedule[] = [];
  const errors: ValidationError[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const dayNumber = parseInt(row[0], 10);
    const sortOrder = parseInt(row[1], 10);
    const title = row[2]?.trim();
    const location = row[3]?.trim() || null;
    const scheduledTimeRaw = row[4]?.trim() || null;

    if (
      isNaN(dayNumber) ||
      dayNumber < MIN_DAY_NUMBER ||
      dayNumber > MAX_DAY_NUMBER
    ) {
      errors.push({
        sheet: "schedules",
        row: i + 1,
        field: "일차",
        message: `일차는 ${MIN_DAY_NUMBER}~${MAX_DAY_NUMBER}만 가능해요`,
      });
      continue;
    }

    if (!title) {
      errors.push({
        sheet: "schedules",
        row: i + 1,
        field: "일정명",
        message: "일정명이 없어요",
      });
      continue;
    }

    schedules.push({
      day_number: dayNumber,
      sort_order: isNaN(sortOrder) ? i : sortOrder,
      title,
      location,
      scheduled_time: scheduledTimeRaw,
    });
  }

  return { schedules, errors };
}
