import type {
  ParsedGroup,
  ParsedUser,
  ParsedSchedule,
  ValidationError,
  UserRole,
} from "@/lib/types";
import {
  ALLOWED_EMAIL_DOMAIN,
  MIN_DAY_NUMBER,
  MAX_DAY_NUMBER,
} from "@/lib/constants";

const VALID_ROLES: UserRole[] = ["member", "leader", "admin"];
const ROLE_MAP: Record<string, UserRole> = {
  조원: "member",
  조장: "leader",
  관리자: "admin",
};

// CSV 문자열 → 2D 배열
export function parseCsv(csv: string): string[][] {
  return csv
    .trim()
    .split("\n")
    .map((row) =>
      row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""))
    );
}

// 조구성 시트 파싱
export function parseGroupsSheet(rows: string[][]): {
  groups: ParsedGroup[];
  errors: ValidationError[];
} {
  const groups: ParsedGroup[] = [];
  const errors: ValidationError[] = [];
  const header = rows[0];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const name = row[0]?.trim();
    const busName = row[1]?.trim() || null;

    if (!name) {
      errors.push({ sheet: "groups", row: i + 1, field: "조이름", message: "조 이름이 없어요" });
      continue;
    }

    groups.push({ name, bus_name: busName });
  }

  return { groups, errors };
}

// 참가자 시트 파싱
export function parseUsersSheet(
  rows: string[][],
  knownGroupNames: Set<string>
): { users: ParsedUser[]; errors: ValidationError[] } {
  const users: ParsedUser[] = [];
  const errors: ValidationError[] = [];
  const emailSet = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const name = row[0]?.trim();
    const email = row[1]?.trim().toLowerCase();
    const phone = row[2]?.trim() || null;
    const roleRaw = row[3]?.trim();
    const groupName = row[4]?.trim();

    // 이메일 형식
    if (!email || !email.includes("@")) {
      errors.push({ sheet: "users", row: i + 1, field: "이메일", message: "이메일 형식이 올바르지 않아요" });
      continue;
    }
    if (!email.endsWith(ALLOWED_EMAIL_DOMAIN)) {
      errors.push({ sheet: "users", row: i + 1, field: "이메일", message: `${ALLOWED_EMAIL_DOMAIN} 도메인만 허용돼요` });
      continue;
    }

    // 이메일 중복
    if (emailSet.has(email)) {
      errors.push({ sheet: "users", row: i + 1, field: "이메일", message: "이메일이 중복되어 있어요" });
      continue;
    }
    emailSet.add(email);

    // 역할값
    const role = ROLE_MAP[roleRaw];
    if (!role) {
      errors.push({ sheet: "users", row: i + 1, field: "역할", message: "역할은 조원/조장/관리자만 가능해요" });
      continue;
    }

    // 소속조 존재
    if (!knownGroupNames.has(groupName)) {
      errors.push({ sheet: "users", row: i + 1, field: "소속조", message: "조구성에 없는 조 이름이에요" });
      continue;
    }

    users.push({ name, email, phone, role, group_name: groupName });
  }

  return { users, errors };
}

// 일정 시트 파싱
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

    if (isNaN(dayNumber) || dayNumber < MIN_DAY_NUMBER || dayNumber > MAX_DAY_NUMBER) {
      errors.push({ sheet: "schedules", row: i + 1, field: "일차", message: `일차는 ${MIN_DAY_NUMBER}~${MAX_DAY_NUMBER}만 가능해요` });
      continue;
    }

    if (!title) {
      errors.push({ sheet: "schedules", row: i + 1, field: "일정명", message: "일정명이 없어요" });
      continue;
    }

    // HH:MM → ISO 변환 (날짜 부분은 미정이라 null 처리)
    let scheduledTime: string | null = null;
    if (scheduledTimeRaw) {
      // 간단한 HH:MM 형식이면 그대로 저장 (DB에서 timestamptz)
      scheduledTime = scheduledTimeRaw;
    }

    schedules.push({
      day_number: dayNumber,
      sort_order: isNaN(sortOrder) ? i : sortOrder,
      title,
      location,
      scheduled_time: scheduledTime,
    });
  }

  return { schedules, errors };
}
