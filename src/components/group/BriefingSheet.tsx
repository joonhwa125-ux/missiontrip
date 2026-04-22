"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  Plane,
  UserRound,
  CalendarDays,
  Clock,
  AlertTriangle,
  Wrench,
  MapPin,
  Activity as ActivityIcon,
  Utensils,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatTime } from "@/lib/utils";
import { BRIEFING_SEPARATOR } from "@/lib/constants";
import { resolveNickname, hasNickname } from "@/lib/nicknames";
import type {
  BriefingData,
  ScheduleGroupInfo,
  ScheduleMemberInfo,
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  groupName: string;
  briefing: BriefingData;
  isFromCache: boolean;
  /** 현재 조장 화면에서 선택된 일차. 이 일차의 정보만 노출. */
  selectedDay: number;
}

type ScheduleSummary = BriefingData["scheduleSummaries"][number];

interface ScheduleBlock {
  schedule: ScheduleSummary;
  groupInfo: ScheduleGroupInfo | null;
  memberInfos: Array<{ info: ScheduleMemberInfo; name: string }>;
}

function isMemberInfoEmpty(info: ScheduleMemberInfo): boolean {
  return (
    !info.excused_reason &&
    !info.activity &&
    !info.menu &&
    !info.note &&
    !info.temp_group_id &&
    !info.temp_role
  );
}

function isGroupInfoEmpty(info: ScheduleGroupInfo): boolean {
  return !info.group_location && !info.note;
}

/** 라벨 chip — 개인 특이사항용 */
function Chip({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warn" | "info" }) {
  const tones = {
    neutral: "bg-stone-100 text-stone-700",
    warn: "bg-amber-100 text-amber-800",
    info: "bg-indigo-100 text-indigo-800",
  } as const;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-stone-500">{label}</span>
      <span className={`rounded-full px-2 py-0.5 font-medium ${tones[tone]}`}>{value}</span>
    </span>
  );
}

/**
 * 공통 섹션 헤더 — 원형 아이콘 + bold 타이틀 + 카운트 pill
 */
function SectionHeader({
  icon,
  title,
  count,
}: {
  icon: React.ReactNode;
  title: string;
  count?: number | string;
}) {
  return (
    <header className="mb-2 flex items-center gap-2">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-stone-900 text-white"
        aria-hidden="true"
      >
        {icon}
      </span>
      <h4 className="text-sm font-bold text-stone-900">
        {title}
        {count !== undefined && (
          <span className="ml-1 font-normal text-stone-400">· {count}</span>
        )}
      </h4>
    </header>
  );
}

/**
 * 항공사별 인원 그룹핑 (삽입 순서 보존)
 */
function groupByAirline(
  entries: Array<{ name: string; airline: string | null }>
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of entries) {
    if (!e.airline) continue;
    const arr = map.get(e.airline) ?? [];
    arr.push(e.name);
    map.set(e.airline, arr);
  }
  return map;
}

/**
 * 항공사 압축 카드 — 전원 동일이면 1줄 요약, 분기면 그룹별 이름.
 * 전원 동일 케이스: 편명·시각을 함께 노출 (Option C 패턴).
 */
function CompactAirlineSection({
  label,
  groups,
  flightInfo,
}: {
  label: string;
  groups: Map<string, string[]>;
  flightInfo?: string;
}) {
  const entries = Array.from(groups.entries());
  if (entries.length === 0) return null;

  const totalCount = entries.reduce((sum, [, names]) => sum + names.length, 0);
  const isAllSame = entries.length === 1;

  if (isAllSame) {
    return (
      <section
        className="flex items-center gap-2.5 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2.5"
        aria-label={label}
      >
        <span
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-sky-700"
          aria-hidden="true"
        >
          <Plane className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-sky-700">
            {label}
          </p>
          <p className="text-sm">
            <span className="font-semibold text-stone-900">전원 {entries[0][0]}</span>
            <span className="ml-1 text-stone-500">
              · {totalCount}명{flightInfo ? ` · ${flightInfo}` : ""}
            </span>
          </p>
        </div>
      </section>
    );
  }

  // 분기 케이스 — 그룹별 나열
  return (
    <section aria-label={label}>
      <SectionHeader
        icon={<Plane className="h-3 w-3" strokeWidth={2.5} />}
        title={label}
        count={`${totalCount}명`}
      />
      <div className="space-y-2.5 pl-0">
        {entries.map(([airline, names]) => (
          <div key={airline} className="rounded-lg bg-sky-50/60 px-3 py-2">
            <p className="mb-1 text-sm">
              <span className="font-semibold text-stone-900">{airline}</span>
              <span className="ml-1 text-stone-500">
                · {names.length}/{totalCount}명
              </span>
            </p>
            <p className="text-xs leading-relaxed text-stone-700">
              {names.join(BRIEFING_SEPARATOR)}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * 여행 역할 — indigo 단일 섹션 (지원 받는 크루).
 * 호칭 있으면 호칭 메인 + LDAP 부제, 없으면 LDAP만.
 * "안내견 동반"은 별도 chip으로, "미배정"은 amber chip으로 강조.
 */
function TripRoleSection({
  roles,
}: {
  roles: Array<{ user_id: string; name: string; trip_role: string | null }>;
}) {
  if (roles.length === 0) return null;

  return (
    <section aria-labelledby="briefing-roles">
      <SectionHeader
        icon={<UserRound className="h-3 w-3" strokeWidth={2.5} />}
        title="여행 역할"
        count={`${roles.length}명`}
      />
      <ul className="space-y-1.5">
        {roles.map((r) => {
          const nickname = resolveNickname(r.name);
          const showLdap = hasNickname(r.name);
          // trip_role 예: "안내견 동반 · 트래블헬퍼 오진우" / "트래블헬퍼 김상규" / "트래블헬퍼 미배정"
          const parts = (r.trip_role ?? "")
            .split(/\s·\s/)
            .map((p) => p.trim())
            .filter(Boolean);

          return (
            <li key={r.user_id} className="rounded-xl bg-indigo-50/70 px-3 py-2">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold text-stone-900">{nickname}</span>
                {showLdap && (
                  <span className="text-xs text-stone-500">{r.name}</span>
                )}
                {parts.map((part, idx) => {
                  if (part === "안내견 동반") {
                    return (
                      <span
                        key={idx}
                        className="rounded-full border border-stone-200 bg-white px-1.5 py-0.5 text-[0.6875rem] font-medium text-stone-600"
                      >
                        🦮 안내견
                      </span>
                    );
                  }
                  return null;
                })}
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[0.6875rem]">
                {parts.map((part, idx) => {
                  if (part === "안내견 동반") return null;
                  if (part === "트래블헬퍼 미배정") {
                    return (
                      <span
                        key={idx}
                        className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800"
                      >
                        ⚠ 트래블헬퍼 미배정
                      </span>
                    );
                  }
                  // "트래블헬퍼 김상규" 형태를 label + value 로 분리
                  const m = /^(트래블헬퍼|공항 도움|공항 보행지원)\s+(.+)$/.exec(part);
                  if (m) {
                    return (
                      <span
                        key={idx}
                        className="rounded-full border border-indigo-100 bg-white px-2 py-0.5 text-indigo-800"
                      >
                        <span className="text-indigo-400">{m[1]}</span> {m[2]}
                      </span>
                    );
                  }
                  return (
                    <span
                      key={idx}
                      className="rounded-full border border-indigo-100 bg-white px-2 py-0.5 text-indigo-800"
                    >
                      {part}
                    </span>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * 공지 파서 — 접두사(#시간:/#안전:/#운영:) 우선, 없으면 키워드 폴백.
 * 섹션은 ` | ` 로 구분된다고 가정. 각 섹션 안의 bullet은 ` · ` 로 구분.
 */
type NoticeCategory = "timeline" | "safety" | "ops";
type NoticeSection = { category: NoticeCategory; items: string[] };

const PREFIX_PATTERN = /^\s*#(시간|안전|운영)\s*[:：]\s*(.*)$/;

function prefixToCategory(prefix: string): NoticeCategory {
  if (prefix === "시간") return "timeline";
  if (prefix === "안전") return "safety";
  return "ops";
}

function splitBullets(text: string): string[] {
  return text
    .split(/(?: · |\n)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function autoClassify(items: string[]): NoticeSection[] {
  const timeline: string[] = [];
  const safety: string[] = [];
  const ops: string[] = [];
  const TIME_RE = /^\d{1,2}:\d{2}/;
  const SAFETY_RE = /(신분증|복지카드|필수|금지|주의|경사|안전|위험|난간)/;
  for (const item of items) {
    if (TIME_RE.test(item)) timeline.push(item);
    else if (SAFETY_RE.test(item)) safety.push(item);
    else ops.push(item);
  }
  const result: NoticeSection[] = [];
  if (timeline.length) result.push({ category: "timeline", items: timeline });
  if (safety.length) result.push({ category: "safety", items: safety });
  if (ops.length) result.push({ category: "ops", items: ops });
  return result;
}

function parseNotice(notice: string): NoticeSection[] {
  if (!notice.trim()) return [];
  // 접두사 기반 분할
  if (/#(시간|안전|운영)\s*[:：]/.test(notice)) {
    const sections = notice.split(/\s*\|\s*/);
    const parsed: NoticeSection[] = [];
    for (const s of sections) {
      const m = PREFIX_PATTERN.exec(s);
      if (m) {
        parsed.push({
          category: prefixToCategory(m[1]),
          items: splitBullets(m[2]),
        });
      } else {
        // 접두사 없는 섹션은 자동 분류
        const items = splitBullets(s);
        parsed.push(...autoClassify(items));
      }
    }
    // 같은 카테고리 병합
    const merged = new Map<NoticeCategory, string[]>();
    for (const sec of parsed) {
      const prev = merged.get(sec.category) ?? [];
      merged.set(sec.category, [...prev, ...sec.items]);
    }
    const order: NoticeCategory[] = ["timeline", "safety", "ops"];
    return order
      .filter((cat) => merged.has(cat) && (merged.get(cat)?.length ?? 0) > 0)
      .map((cat) => ({ category: cat, items: merged.get(cat) ?? [] }));
  }
  // 폴백: 키워드 자동 분류
  return autoClassify(splitBullets(notice));
}

/**
 * 타임라인 아이템 — "HH:MM 내용" 패턴이면 시각을 왼쪽에 tabular로 분리.
 * 시각 패턴 아닌 경우 일반 텍스트로.
 */
function TimelineItem({ text }: { text: string }) {
  const m = /^(\d{1,2}:\d{2})\s*(.*)$/.exec(text);
  if (m) {
    return (
      <li className="flex items-start gap-2">
        <span className="w-10 flex-shrink-0 font-bold tabular-nums text-sky-800">
          {m[1]}
        </span>
        <span className="text-stone-800">{m[2]}</span>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2">
      <span className="w-10 flex-shrink-0 text-stone-400">•</span>
      <span className="text-stone-800">{text}</span>
    </li>
  );
}

/**
 * 공지 블록 — 3-way 분할 렌더. 없으면 null.
 */
function NoticeBlocks({ notice }: { notice: string }) {
  const sections = useMemo(() => parseNotice(notice), [notice]);
  if (sections.length === 0) return null;

  return (
    <div className="space-y-2">
      {sections.map((sec) => {
        if (sec.category === "timeline") {
          return (
            <div
              key="timeline"
              className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2.5"
            >
              <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-sky-700">
                <Clock className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
                타임라인
              </p>
              <ol className="space-y-1.5 text-xs">
                {sec.items.map((item, idx) => (
                  <TimelineItem key={idx} text={item} />
                ))}
              </ol>
            </div>
          );
        }
        if (sec.category === "safety") {
          return (
            <div
              key="safety"
              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5"
            >
              <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-amber-800">
                <AlertTriangle
                  className="h-3 w-3"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
                필수 확인
              </p>
              <ul className="space-y-1.5 text-xs text-amber-900">
                {sec.items.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span
                      className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-500"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        return (
          <div
            key="ops"
            className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5"
          >
            <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-600">
              <Wrench className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
              운영 · 안내
            </p>
            <ul className="space-y-1.5 text-xs text-stone-700">
              {sec.items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span
                    className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-stone-400"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 활동 배정 — Group-by-Activity
 */
function ActivitySection({
  infos,
  userNameMap,
}: {
  infos: ScheduleMemberInfo[];
  userNameMap: BriefingData["userNameMap"];
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string; isActivityLeader: boolean }>>();
    for (const info of infos) {
      if (!info.activity) continue;
      const leaderMatch = /\s*\((조장|조장\s*지원|.+\s*지원)\)\s*$/.exec(info.activity);
      const activityName = leaderMatch
        ? info.activity.slice(0, leaderMatch.index).trim()
        : info.activity.trim();
      const isActivityLeader = !!leaderMatch && leaderMatch[1] === "조장";
      const arr = map.get(activityName) ?? [];
      arr.push({
        id: info.id,
        name: resolveNickname(userNameMap[info.user_id] ?? "참가자"),
        isActivityLeader,
      });
      map.set(activityName, arr);
    }
    map.forEach((arr) => {
      arr.sort((a, b) => {
        if (a.isActivityLeader && !b.isActivityLeader) return -1;
        if (!a.isActivityLeader && b.isActivityLeader) return 1;
        return a.name.localeCompare(b.name, "ko");
      });
    });
    return map;
  }, [infos, userNameMap]);

  const entries = Array.from(groups.entries());
  if (entries.length === 0) return null;
  const totalCount = entries.reduce((sum, [, arr]) => sum + arr.length, 0);

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-600">
        <ActivityIcon className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
        활동 배정 · {totalCount}명
      </p>
      <ul className="space-y-2">
        {entries.map(([activity, members]) => {
          if (members.length === 1) {
            const m = members[0];
            return (
              <li key={activity} className="text-xs leading-relaxed">
                <span className="font-semibold text-stone-900">{activity}</span>
                <span className="text-stone-500">{" · "}1명{" · "}</span>
                <span className="text-stone-800">
                  {m.isActivityLeader && (
                    <>
                      <span aria-hidden="true">⭐ </span>
                      <span className="sr-only">활동 조장 </span>
                    </>
                  )}
                  {m.name}
                </span>
              </li>
            );
          }
          return (
            <li key={activity}>
              <p className="mb-0.5 text-xs">
                <span className="font-semibold text-stone-900">{activity}</span>
                <span className="ml-1 text-stone-500">· {members.length}명</span>
              </p>
              <p className="text-xs leading-relaxed text-stone-700">
                {members.map((m, i) => (
                  <span key={m.id}>
                    {i > 0 && BRIEFING_SEPARATOR}
                    {m.isActivityLeader && (
                      <>
                        <span aria-hidden="true">⭐ </span>
                        <span className="sr-only">활동 조장 </span>
                      </>
                    )}
                    {m.name}
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * 메뉴 배정 — 총량 + 조원별(접힘).
 */
function MenuSection({
  infos,
  userNameMap,
}: {
  infos: ScheduleMemberInfo[];
  userNameMap: BriefingData["userNameMap"];
}) {
  const [expanded, setExpanded] = useState(false);

  const { perPerson, mainCount, drinkCount } = useMemo(() => {
    const perPerson: Array<{ id: string; name: string; main: string; drink: string }> = [];
    const mainCount = new Map<string, number>();
    const drinkCount = new Map<string, number>();

    for (const info of infos) {
      if (!info.menu) continue;
      const parts = info.menu
        .split(BRIEFING_SEPARATOR)
        .map((s) => s.trim())
        .filter(Boolean);
      const main = parts[0] ?? "";
      const drink = parts[1] ?? "";
      perPerson.push({
        id: info.id,
        name: resolveNickname(userNameMap[info.user_id] ?? "참가자"),
        main,
        drink,
      });
      if (main) mainCount.set(main, (mainCount.get(main) ?? 0) + 1);
      if (drink) drinkCount.set(drink, (drinkCount.get(drink) ?? 0) + 1);
    }

    perPerson.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    return { perPerson, mainCount, drinkCount };
  }, [infos, userNameMap]);

  if (perPerson.length === 0) return null;

  const renderCountList = (map: Map<string, number>) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => (
        <li key={name} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-stone-800">{name}</span>
          <span className="text-stone-500">· {n}명</span>
        </li>
      ));

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-600">
        <Utensils className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
        메뉴 배정 · {perPerson.length}명
      </p>
      <div className="space-y-1.5">
        {mainCount.size > 0 && (
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <p className="mb-1 text-[0.6875rem] font-medium text-stone-500">메인</p>
            <ul className="space-y-0.5">{renderCountList(mainCount)}</ul>
          </div>
        )}
        {drinkCount.size > 0 && (
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <p className="mb-1 text-[0.6875rem] font-medium text-stone-500">음료</p>
            <ul className="space-y-0.5">{renderCountList(drinkCount)}</ul>
          </div>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs font-medium text-stone-700 outline-none focus-visible:ring-2 focus-visible:ring-stone-400"
        >
          <span>조원별 배정 ({perPerson.length}명)</span>
          <ChevronDown
            className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden="true"
          />
        </button>
        {expanded && (
          <ul className="space-y-0.5 rounded-lg bg-stone-50 px-3 py-2">
            {perPerson.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline gap-1 text-xs">
                <span className="font-medium text-stone-900">{p.name}</span>
                <span className="text-stone-500">·</span>
                <span className="text-stone-700">
                  {[p.main, p.drink].filter(Boolean).join(" / ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * 개인 특이사항
 */
function SpecialInfoList({
  infos,
  userNameMap,
  groupNameMap,
}: {
  infos: ScheduleMemberInfo[];
  userNameMap: BriefingData["userNameMap"];
  groupNameMap: BriefingData["groupNameMap"];
}) {
  const sorted = useMemo(
    () =>
      [...infos]
        .map((info) => ({
          info,
          name: resolveNickname(userNameMap[info.user_id] ?? "참가자"),
          ldap: userNameMap[info.user_id] ?? "",
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    [infos, userNameMap]
  );
  if (sorted.length === 0) return null;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2.5">
      <p className="mb-2 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-600">
        <Info className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
        개인 특이사항
      </p>
      <ul className="space-y-1.5">
        {sorted.map(({ info, name, ldap }) => (
          <li key={info.id} className="rounded-lg bg-stone-50 px-3 py-2">
            <div className="mb-1 flex flex-wrap items-baseline gap-1.5">
              <span className="text-sm font-medium text-stone-900">{name}</span>
              {hasNickname(ldap) && (
                <span className="text-xs text-stone-500">{ldap}</span>
              )}
              {info.excused_reason && (
                <Chip label="미참여" value={info.excused_reason} />
              )}
              {info.temp_group_id && (
                <Chip
                  label="조이동"
                  value={groupNameMap[info.temp_group_id] ?? "다른 조"}
                  tone="warn"
                />
              )}
              {info.temp_role === "leader" && (
                <Chip label="임시역할" value="조장" tone="warn" />
              )}
            </div>
            {info.note && <p className="text-xs text-stone-600">{info.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BriefingSheet({
  open,
  onClose,
  groupName,
  briefing,
  isFromCache,
  selectedDay,
}: Props) {
  const { hasOutboundFlight, hasReturnFlight } = useMemo(() => {
    const daySchedules = briefing.scheduleSummaries.filter(
      (s) => s.day_number === selectedDay
    );
    return {
      hasOutboundFlight: daySchedules.some((s) => s.airline_leg === "outbound"),
      hasReturnFlight: daySchedules.some((s) => s.airline_leg === "return"),
    };
  }, [briefing.scheduleSummaries, selectedDay]);

  const showTripRole = selectedDay === 1;

  const tripRoles = useMemo(() => {
    if (!showTripRole) return [];
    return briefing.roleAssignments.filter((r) => r.trip_role);
  }, [briefing.roleAssignments, showTripRole]);

  const outboundAirlineGroups = useMemo(
    () =>
      hasOutboundFlight
        ? groupByAirline(
            briefing.roleAssignments.map((r) => ({ name: r.name, airline: r.airline }))
          )
        : new Map<string, string[]>(),
    [briefing.roleAssignments, hasOutboundFlight]
  );

  const returnAirlineGroups = useMemo(
    () =>
      hasReturnFlight
        ? groupByAirline(
            briefing.roleAssignments.map((r) => ({ name: r.name, airline: r.return_airline }))
          )
        : new Map<string, string[]>(),
    [briefing.roleAssignments, hasReturnFlight]
  );

  // 편명·시각 — 해당 일차 비행 일정의 notice에서 "HH:MM ... (TW|7C|...)NNN" 패턴 추출.
  // 같은 bullet 안에 있는 시각만 편명과 연결한다 — `·`(bullet 구분자)·`|`(섹션 구분자)가
  // 사이에 끼면 매칭 중단. 이 제약이 없으면 "08:00 집결 완료 · 10:20 TW709 출발"에서
  // 집결 시각(08:00)이 편명과 매칭되어 잘못 표시된다.
  const { outboundFlightInfo, returnFlightInfo } = useMemo(() => {
    const FLIGHT_RE =
      /(\d{1,2}:\d{2})[^|·]*?(TW|7C|RS|KE|OZ|BX|LJ|ZE|4V)(\d+)/;
    const extract = (leg: "outbound" | "return"): string | undefined => {
      const flights = briefing.scheduleSummaries.filter(
        (s) => s.day_number === selectedDay && s.airline_leg === leg
      );
      for (const s of flights) {
        if (!s.notice) continue;
        const m = FLIGHT_RE.exec(s.notice);
        if (m) return `${m[2]}${m[3]} ${m[1]} 출발`;
      }
      return undefined;
    };
    return {
      outboundFlightInfo: extract("outbound"),
      returnFlightInfo: extract("return"),
    };
  }, [briefing.scheduleSummaries, selectedDay]);

  // 일정별 상세 블록
  const scheduleBlocks: ScheduleBlock[] = useMemo(() => {
    const sgByScheduleId = new Map<string, ScheduleGroupInfo>();
    for (const sgi of briefing.groupInfos) {
      if (!isGroupInfoEmpty(sgi)) sgByScheduleId.set(sgi.schedule_id, sgi);
    }

    const smByScheduleId = new Map<string, ScheduleMemberInfo[]>();
    for (const smi of briefing.memberInfos) {
      if (isMemberInfoEmpty(smi)) continue;
      const arr = smByScheduleId.get(smi.schedule_id) ?? [];
      arr.push(smi);
      smByScheduleId.set(smi.schedule_id, arr);
    }

    return briefing.scheduleSummaries
      .filter((s) => s.day_number === selectedDay)
      .map<ScheduleBlock>((schedule) => ({
        schedule,
        groupInfo: sgByScheduleId.get(schedule.schedule_id) ?? null,
        memberInfos: (smByScheduleId.get(schedule.schedule_id) ?? [])
          .map((info) => ({
            info,
            name: briefing.userNameMap[info.user_id] ?? "참가자",
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "ko")),
      }))
      .filter(
        (block) =>
          !!block.schedule.notice ||
          block.groupInfo !== null ||
          block.memberInfos.length > 0
      );
  }, [briefing, selectedDay]);

  const hasTripRoles = tripRoles.length > 0;
  const hasOutboundAirlines = outboundAirlineGroups.size > 0;
  const hasReturnAirlines = returnAirlineGroups.size > 0;
  const hasDetails = scheduleBlocks.length > 0;
  const hasAnyContent =
    hasTripRoles || hasOutboundAirlines || hasReturnAirlines || hasDetails;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden p-0">
        {/* Dialog 헤더 — DAY 배지 + 타이틀 (bold) */}
        <div className="flex-shrink-0 border-b border-stone-100 px-5 pb-3 pt-4">
          <DialogHeader className="text-left">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-lg bg-stone-900 px-2 py-0.5 text-xs font-bold tracking-wider text-white">
                DAY {selectedDay}
              </span>
              <DialogTitle className="text-base font-bold text-stone-900">
                {groupName} 브리핑
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">
              {groupName} {selectedDay}일차 브리핑 상세
              {isFromCache ? " · 오프라인 캐시 기준" : ""}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-5 pt-3 text-sm">
          {!hasAnyContent && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              이 일차에 등록된 브리핑 항목이 없어요
            </p>
          )}

          {/* 항공 섹션 — 전원 동일이면 압축 카드 */}
          {hasOutboundAirlines && (
            <CompactAirlineSection
              label="가는편 항공"
              groups={outboundAirlineGroups}
              flightInfo={outboundFlightInfo}
            />
          )}

          {hasReturnAirlines && (
            <CompactAirlineSection
              label="오는편 항공"
              groups={returnAirlineGroups}
              flightInfo={returnFlightInfo}
            />
          )}

          {/* 여행 역할 — indigo 단일 섹션 */}
          {hasTripRoles && <TripRoleSection roles={tripRoles} />}

          {/* 일정별 안내 */}
          {hasDetails && (
            <section aria-labelledby="briefing-details">
              <SectionHeader
                icon={<CalendarDays className="h-3 w-3" strokeWidth={2.5} />}
                title="일정별 안내"
                count={`${scheduleBlocks.length}건`}
              />
              <div className="space-y-3">
                {scheduleBlocks.map((block) => {
                  const activityInfos = block.memberInfos
                    .map((m) => m.info)
                    .filter((info) => !!info.activity);
                  const menuInfos = block.memberInfos
                    .map((m) => m.info)
                    .filter((info) => !!info.menu);
                  const specialInfos = block.memberInfos
                    .map((m) => m.info)
                    .filter(
                      (info) =>
                        !!info.excused_reason ||
                        !!info.temp_group_id ||
                        info.temp_role === "leader" ||
                        !!info.note
                    );

                  const timeDisplay = block.schedule.scheduled_time
                    ? formatTime(block.schedule.scheduled_time)
                    : null;

                  return (
                    <article
                      key={block.schedule.schedule_id}
                      className="overflow-hidden rounded-xl border border-stone-200 bg-white"
                    >
                      {/* Article 헤더 — 시각 좌측 크게 + 세로 구분선 + 제목 */}
                      <header className="flex items-center gap-3 border-b border-stone-200 bg-stone-50 px-4 py-3">
                        {timeDisplay ? (
                          <>
                            <div className="flex flex-shrink-0 flex-col items-center leading-none">
                              <span className="text-lg font-bold tabular-nums text-stone-900">
                                {timeDisplay}
                              </span>
                              <span className="mt-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-stone-500">
                                집결
                              </span>
                            </div>
                            <div className="w-px self-stretch bg-stone-200" />
                          </>
                        ) : null}
                        <h5 className="text-sm font-semibold leading-snug text-stone-900">
                          {block.schedule.location ?? block.schedule.title}
                          {block.schedule.location && (
                            <span className="ml-1 text-xs font-normal text-stone-400">
                              {block.schedule.title}
                            </span>
                          )}
                        </h5>
                      </header>

                      <div className="space-y-2 p-3">
                        {/* 공지 3분할 */}
                        {block.schedule.notice && (
                          <NoticeBlocks notice={block.schedule.notice} />
                        )}

                        {/* 조 단위 정보 */}
                        {block.groupInfo && (
                          <div className="space-y-1.5 rounded-lg border border-stone-200 bg-white px-3 py-2.5">
                            <p className="mb-1 flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-stone-600">
                              <MapPin
                                className="h-3 w-3"
                                strokeWidth={2.5}
                                aria-hidden="true"
                              />
                              우리 조
                            </p>
                            {block.groupInfo.group_location && (
                              <div className="flex flex-wrap gap-1">
                                <Chip
                                  label="조 위치"
                                  value={block.groupInfo.group_location}
                                  tone="info"
                                />
                              </div>
                            )}
                            {block.groupInfo.note && (
                              <p className="text-xs text-stone-600">
                                {block.groupInfo.note}
                              </p>
                            )}
                          </div>
                        )}

                        {/* 활동 배정 */}
                        {activityInfos.length > 0 && (
                          <ActivitySection
                            infos={activityInfos}
                            userNameMap={briefing.userNameMap}
                          />
                        )}

                        {/* 메뉴 배정 */}
                        {menuInfos.length > 0 && (
                          <MenuSection
                            infos={menuInfos}
                            userNameMap={briefing.userNameMap}
                          />
                        )}

                        {/* 개인 특이사항 */}
                        {specialInfos.length > 0 && (
                          <SpecialInfoList
                            infos={specialInfos}
                            userNameMap={briefing.userNameMap}
                            groupNameMap={briefing.groupNameMap}
                          />
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
