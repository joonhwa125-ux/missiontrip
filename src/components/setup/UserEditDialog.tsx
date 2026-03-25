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
  phone: string | null;
  role: UserRole;
  group_id: string;
  party: GroupParty | null;
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
  "w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action";

export default function UserEditDialog({ user, groups, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    name: user.name,
    phone: user.phone ?? "",
    role: user.role,
    group_id: user.group_id,
    party: user.party ?? ("" as GroupParty | ""),
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
          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl bg-gray-100 px-4 text-sm font-medium focus-visible:ring-2 focus-visible:ring-main-action"
            >
              취소
            </button>
            <button
              type="submit"
              className="min-h-11 rounded-xl bg-main-action px-4 text-sm font-bold focus-visible:ring-2 focus-visible:ring-main-action"
            >
              저장
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
