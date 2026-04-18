"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { UserRole, GroupParty } from "@/lib/types";

type SetupUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  group_id: string;
  party: GroupParty | null;
  shuttle_bus: string | null;
  return_shuttle_bus: string | null;
  airline: string | null;
  return_airline: string | null;
  trip_role: string | null;
};

type SetupGroup = { id: string; name: string };

interface Props {
  user: SetupUser;
  groups: SetupGroup[];
  onSave: (data: {
    name: string;
    phone: string | null;
    role: UserRole;
    group_id: string;
    party: GroupParty | null;
    shuttle_bus: string | null;
    return_shuttle_bus: string | null;
    airline: string | null;
    return_airline: string | null;
    trip_role: string | null;
  }) => void;
  onClose: () => void;
}

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "member", label: "조원" },
  { value: "leader", label: "조장" },
  { value: "admin", label: "관리자" },
  { value: "admin_leader", label: "관리자(조장)" },
];

const PARTY_OPTIONS: { value: GroupParty | ""; label: string }[] = [
  { value: "", label: "미배정" },
  { value: "advance", label: "선발" },
  { value: "rear", label: "후발" },
];

const INPUT_CLASS =
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm";

export default function UserEditDialog({ user, groups, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone ?? "",
    role: user.role,
    group_id: user.group_id,
    party: user.party ?? ("" as GroupParty | ""),
    shuttle_bus: user.shuttle_bus ?? "",
    return_shuttle_bus: user.return_shuttle_bus ?? "",
    airline: user.airline ?? "",
    return_airline: user.return_airline ?? "",
    trip_role: user.trip_role ?? "",
  });

  const set = useCallback(
    <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
      setForm((prev) => ({ ...prev, [k]: v })),
    []
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      role: form.role,
      group_id: form.group_id,
      party: (form.party as GroupParty) || null,
      shuttle_bus: form.shuttle_bus.trim() || null,
      return_shuttle_bus: form.return_shuttle_bus.trim() || null,
      airline: form.airline.trim() || null,
      return_airline: form.return_airline.trim() || null,
      trip_role: form.trip_role.trim() || null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>참가자 수정</DialogTitle>
          <DialogDescription className="sr-only">참가자 정보를 수정해요</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 py-1">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              이름 <span aria-hidden="true">*</span>
            </label>
            <input
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className={INPUT_CLASS}
              aria-label="이름"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">전화번호</label>
            <input
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="010-0000-0000"
              className={INPUT_CLASS}
              aria-label="전화번호"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">역할</label>
              <select
                value={form.role}
                onChange={(e) => set("role", e.target.value as UserRole)}
                className={INPUT_CLASS}
                aria-label="역할"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">구분</label>
              <select
                value={form.party}
                onChange={(e) => set("party", e.target.value as GroupParty | "")}
                className={INPUT_CLASS}
                aria-label="구분"
              >
                {PARTY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">조편성</label>
            <select
              value={form.group_id}
              onChange={(e) => set("group_id", e.target.value)}
              className={INPUT_CLASS}
              aria-label="조편성"
            >
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">출발 셔틀버스</label>
            <input
              value={form.shuttle_bus}
              onChange={(e) => set("shuttle_bus", e.target.value)}
              placeholder="예: 판교 오전1 (없으면 비워두세요)"
              className={INPUT_CLASS}
              aria-label="출발 셔틀버스"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">귀가 셔틀버스</label>
            <input
              value={form.return_shuttle_bus}
              onChange={(e) => set("return_shuttle_bus", e.target.value)}
              placeholder="예: 성수1 (없으면 비워두세요)"
              className={INPUT_CLASS}
              aria-label="귀가 셔틀버스"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">항공사(가는편)</label>
              <input
                value={form.airline}
                onChange={(e) => set("airline", e.target.value)}
                placeholder="제주 / 티웨이 / 현지 합류"
                className={INPUT_CLASS}
                aria-label="가는편 항공사"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">항공사(오는편)</label>
              <input
                value={form.return_airline}
                onChange={(e) => set("return_airline", e.target.value)}
                placeholder="제주 / 티웨이 / 현지 합류"
                className={INPUT_CLASS}
                aria-label="오는편 항공사"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">여행 역할</label>
            <input
              value={form.trip_role}
              onChange={(e) => set("trip_role", e.target.value)}
              placeholder="예: 키 수령, 가이드 (없으면 비워두세요)"
              className={INPUT_CLASS}
              aria-label="여행 역할"
            />
          </div>
          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium"
            >
              취소
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-main-action px-4 text-sm font-bold"
            >
              저장
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
