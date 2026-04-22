import type {
  ParsedGroup,
  ParsedUser,
  ParsedSchedule,
  ParsedGroupInfo,
  ParsedMemberInfo,
  ParsedMemberInfoField,
  ValidationError,
  UserRole,
  ShuttleType,
  AirlineLeg,
} from "@/lib/types";
import {
  ALLOWED_EMAIL_DOMAIN,
  MIN_DAY_NUMBER,
  MAX_DAY_NUMBER,
  PARTY_MAP,
  SCOPE_MAP,
} from "@/lib/constants";
import { normalizeNoticeText } from "@/lib/utils";

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

// Google Sheets URL에서 #gid=숫자 추출
export function extractGid(url: string): string | null {
  const match = url.match(/[#&?]gid=(\d+)/);
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
// 컬럼 순서: 0=이름, 1=전화번호, 2=역할, 3=소속조, 4=배정차량, 5=출발셔틀버스, 6=귀가셔틀버스,
//           7=선후발, 8=항공사(가는편), 9=항공사(오는편), 10=여행역할
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
  shuttleBus?: string | null;
  returnShuttleBus?: string | null;
  party?: "advance" | "rear" | null;
  airline?: string | null;
  returnAirline?: string | null;
  tripRole?: string | null;
  email?: string;
} {
  const errors: ValidationError[] = [];
  const name = sanitizeText(row[0] ?? "");
  const phone = row[1]?.trim() || null;
  const roleRaw = sanitizeText(row[2] ?? "");
  const groupName = sanitizeText(row[3] ?? "");
  const busName = row[4]?.trim() || null;
  const shuttleBus = row[5]?.trim() || null;               // col5: 출발 셔틀버스
  const returnShuttleBus = row[6]?.trim() || null;         // col6: 귀가 셔틀버스
  const partyRaw = sanitizeText(row[7] ?? "");             // col7: 선후발
  const airline = sanitizeText(row[8] ?? "") || null;      // col8: 항공사(가는편)
  const returnAirline = sanitizeText(row[9] ?? "") || null;// col9: 항공사(오는편)
  const tripRole = sanitizeText(row[10] ?? "") || null;    // col10: 여행역할
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

  // 중복 시 전화번호 뒷4자리 → 행 인덱스 순으로 대안 이메일 생성
  const baseEmail = `${name.toLowerCase()}${ALLOWED_EMAIL_DOMAIN}`;
  let email = baseEmail;
  if (emailSet.has(email)) {
    const phoneSuffix = phone ? phone.replace(/\D/g, "").slice(-4) : "";
    const candidate = phoneSuffix ? `${name.toLowerCase()}${phoneSuffix}${ALLOWED_EMAIL_DOMAIN}` : "";
    if (candidate && !emailSet.has(candidate)) {
      email = candidate;
    } else {
      email = `${name.toLowerCase()}${rowNum}${ALLOWED_EMAIL_DOMAIN}`;
    }
  }
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

  return { errors, name, phone, role, groupName, busName, shuttleBus, returnShuttleBus, party, airline, returnAirline, tripRole, email };
}

// 일정 행 검증 — 일차 범위 + 일정명 필수 + 대상 매핑
// 컬럼 순서: 0=일차, 1=순서, 2=장소, 3=일정명, 4=예정시각, 5=대상,
//           6=셔틀여부(출발/귀가/빈칸), 7=항공구간(가는편/오는편/빈칸), 8=항공사 필터, 9=공지
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
  shuttleType?: ShuttleType | null;
  airlineLeg?: AirlineLeg | null;
  airlineFilter?: string | null;
  notice?: string | null;
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
  const shuttleRaw = sanitizeText(row[6] ?? "");
  const airlineLegRaw = sanitizeText(row[7] ?? "");
  const airlineFilter = sanitizeText(row[8] ?? "") || null;
  // 괄호 내부 줄바꿈을 공백으로 정규화 (BriefingSheet에서 bullet split 시 안전)
  const notice = normalizeNoticeText(row[9]?.trim() || null);
  const shuttleNorm = shuttleRaw.toLowerCase();
  let shuttleType: ShuttleType | null = null;
  let shuttleInvalid = false;
  if (["출발", "o", "y", "1", "yes"].includes(shuttleNorm)) {
    shuttleType = "departure";
  } else if (["귀가", "귀"].includes(shuttleNorm)) {
    shuttleType = "return";
  } else if (!["", "-", "n", "0", "no", "x"].includes(shuttleNorm)) {
    shuttleInvalid = true;
  }

  if (shuttleInvalid) {
    errors.push({ sheet: "schedules", row: rowNum, field: "셔틀여부", message: "셔틀여부는 '출발' 또는 '귀가'만 가능해요" });
    return { errors };
  }

  let airlineLeg: AirlineLeg | null = null;
  const airlineLegNorm = airlineLegRaw.toLowerCase();
  if (["가는편", "가는", "outbound", "out"].includes(airlineLegNorm)) {
    airlineLeg = "outbound";
  } else if (["오는편", "오는", "return", "ret"].includes(airlineLegNorm)) {
    airlineLeg = "return";
  } else if (!["", "-"].includes(airlineLegNorm)) {
    errors.push({ sheet: "schedules", row: rowNum, field: "항공구간", message: "항공구간은 '가는편' 또는 '오는편'만 가능해요" });
    return { errors };
  }

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

  return { errors, dayNumber, sortOrder: isNaN(sortOrder) ? rowIndex : sortOrder, location, title, scheduledTime, scope, shuttleType, airlineLeg, airlineFilter, notice };
}

// 참가자 시트 파싱 (11컬럼: 이름, 전화번호, 역할, 소속조, 배정차량, 출발셔틀버스, 귀가셔틀버스,
// 선후발, 항공사(가는편), 항공사(오는편), 여행역할)
// 이메일은 이름 기반 자동 생성 (전원: name@도메인)
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
      shuttle_bus: result.shuttleBus ?? null,
      return_shuttle_bus: result.returnShuttleBus ?? null,
      airline: result.airline ?? null,
      return_airline: result.returnAirline ?? null,
      trip_role: result.tripRole ?? null,
    });
  }

  const groups: ParsedGroup[] = Array.from(groupBusMap.entries()).map(([gn, bn]) => ({
    name: gn,
    bus_name: bn,
  }));

  return { users, groups, errors };
}

// 일정 시트 파싱 (10컬럼: 일차, 순서, 장소, 일정명, 예정시각, 대상, 셔틀여부, 항공구간, 항공사 필터, 공지)
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
      shuttle_type: result.shuttleType ?? null,
      airline_leg: result.airlineLeg ?? null,
      airline_filter: result.airlineFilter ?? null,
      notice: result.notice ?? null,
    });
  }

  return { schedules, errors };
}

// ============================================================================
// v2: 조 브리핑 시트 파싱 (일정×조 메타데이터)
// 컬럼 순서: 0=일차, 1=순서, 2=조, 3=조 위치, 4=메모
// 모든 컬럼이 opt-in — 비어있는 셀은 해당 항목 미지정으로 처리
// 빈 시트(헤더만 또는 전체 빈)도 정상으로 간주 (v2 기능 opt-in)
// ============================================================================
export function parseGroupInfoSheet(rows: string[][]): {
  groupInfos: ParsedGroupInfo[];
  errors: ValidationError[];
} {
  const groupInfos: ParsedGroupInfo[] = [];
  const errors: ValidationError[] = [];
  const seen = new Set<string>();  // "일차-순서-조" 중복 방지

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const rowNum = i + 1;
    const dayRaw = row[0]?.trim() ?? "";
    const dayNumber = parseInt(dayRaw.replace(/\D/g, ""), 10);
    const sortOrderRaw = row[1]?.trim() ?? "";
    const sortOrder = parseInt(sortOrderRaw, 10);
    const groupName = sanitizeText(row[2] ?? "");
    const groupLocation = sanitizeText(row[3] ?? "") || null;
    const note = row[4]?.trim() || null;

    if (isNaN(dayNumber) || dayNumber < MIN_DAY_NUMBER || dayNumber > MAX_DAY_NUMBER) {
      errors.push({ sheet: "group_info", row: rowNum, field: "일차", message: `일차는 ${MIN_DAY_NUMBER}~${MAX_DAY_NUMBER}만 가능해요` });
      continue;
    }
    if (isNaN(sortOrder)) {
      errors.push({ sheet: "group_info", row: rowNum, field: "순서", message: "순서가 숫자가 아니에요" });
      continue;
    }
    if (!groupName) {
      errors.push({ sheet: "group_info", row: rowNum, field: "조", message: "조 이름이 없어요" });
      continue;
    }
    // 모든 메타데이터가 비어있으면 의미 없는 행 — 스킵 (에러 아님)
    if (!groupLocation && !note) continue;

    const key = `${dayNumber}-${sortOrder}-${groupName}`;
    if (seen.has(key)) {
      errors.push({ sheet: "group_info", row: rowNum, field: "조", message: `같은 일정(${dayNumber}-${sortOrder})에 ${groupName} 배정이 중복됐어요` });
      continue;
    }
    seen.add(key);

    groupInfos.push({
      day_number: dayNumber,
      sort_order: sortOrder,
      group_name: groupName,
      group_location: groupLocation,
      note,
    });
  }

  return { groupInfos, errors };
}

// ============================================================================
// v2: 개인 안내 시트 파싱 (일정×사용자 메타데이터)
// 컬럼 순서: 0=일차, 1=순서, 2=이름, 3=항목, 4=값
// 항목: 조이동 / 임시역할 / 미참여 / 활동 / 메뉴 / 메모
// 임시역할 값: '조장' / '조원'만 허용
// 조이동 값: 조 이름 (검증은 setup.ts import 단계에서 — 파서는 문자열 그대로 통과)
// 같은 (일정, 사용자, 항목) 조합은 중복 불가
// 빈 시트도 정상
// ============================================================================
const MEMBER_INFO_FIELDS: readonly ParsedMemberInfoField[] = [
  "조이동",
  "임시역할",
  "미참여",
  "활동",
  "메뉴",
  "메모",
] as const;

const TEMP_ROLE_LABEL_MAP: Record<string, "leader" | "member"> = {
  조장: "leader",
  조원: "member",
  leader: "leader",
  member: "member",
};

export function parseMemberInfoSheet(rows: string[][]): {
  memberInfos: ParsedMemberInfo[];
  errors: ValidationError[];
} {
  const memberInfos: ParsedMemberInfo[] = [];
  const errors: ValidationError[] = [];
  const seen = new Set<string>();  // "일차-순서-이름-항목" 중복 방지

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c)) continue;

    const rowNum = i + 1;
    const dayRaw = row[0]?.trim() ?? "";
    const dayNumber = parseInt(dayRaw.replace(/\D/g, ""), 10);
    const sortOrderRaw = row[1]?.trim() ?? "";
    const sortOrder = parseInt(sortOrderRaw, 10);
    const userName = sanitizeText(row[2] ?? "");
    const fieldRaw = sanitizeText(row[3] ?? "");
    const value = sanitizeText(row[4] ?? "");

    if (isNaN(dayNumber) || dayNumber < MIN_DAY_NUMBER || dayNumber > MAX_DAY_NUMBER) {
      errors.push({ sheet: "member_info", row: rowNum, field: "일차", message: `일차는 ${MIN_DAY_NUMBER}~${MAX_DAY_NUMBER}만 가능해요` });
      continue;
    }
    if (isNaN(sortOrder)) {
      errors.push({ sheet: "member_info", row: rowNum, field: "순서", message: "순서가 숫자가 아니에요" });
      continue;
    }
    if (!userName) {
      errors.push({ sheet: "member_info", row: rowNum, field: "이름", message: "이름이 없어요" });
      continue;
    }
    if (!fieldRaw) {
      errors.push({ sheet: "member_info", row: rowNum, field: "항목", message: "항목이 없어요" });
      continue;
    }
    if (!MEMBER_INFO_FIELDS.includes(fieldRaw as ParsedMemberInfoField)) {
      errors.push({
        sheet: "member_info",
        row: rowNum,
        field: "항목",
        message: `항목은 ${MEMBER_INFO_FIELDS.join("/")} 중 하나여야 해요 (입력값: "${fieldRaw}")`,
      });
      continue;
    }
    if (!value) {
      errors.push({ sheet: "member_info", row: rowNum, field: "값", message: "값이 비어있어요" });
      continue;
    }
    const field = fieldRaw as ParsedMemberInfoField;

    // 임시역할은 '조장'/'조원'만 허용
    if (field === "임시역할" && !TEMP_ROLE_LABEL_MAP[value]) {
      errors.push({
        sheet: "member_info",
        row: rowNum,
        field: "값",
        message: `임시역할은 '조장' 또는 '조원'만 가능해요 (입력값: "${value}")`,
      });
      continue;
    }

    const key = `${dayNumber}-${sortOrder}-${userName}-${field}`;
    if (seen.has(key)) {
      errors.push({
        sheet: "member_info",
        row: rowNum,
        field: "항목",
        message: `같은 일정(${dayNumber}-${sortOrder})의 ${userName}에 대해 '${field}' 배정이 중복됐어요`,
      });
      continue;
    }
    seen.add(key);

    memberInfos.push({
      day_number: dayNumber,
      sort_order: sortOrder,
      user_name: userName,
      field,
      value,
    });
  }

  return { memberInfos, errors };
}

// 내부 import용: '조장' → 'leader' 매핑 헬퍼
export function mapTempRoleLabel(value: string): "leader" | "member" | null {
  return TEMP_ROLE_LABEL_MAP[value] ?? null;
}
