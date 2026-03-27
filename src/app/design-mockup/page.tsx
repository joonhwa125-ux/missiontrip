"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// 체크 아이콘 컴포넌트
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

// 전화 아이콘
function PhoneIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  );
}

export default function DesignMockupPage() {
  const [activeSection, setActiveSection] = useState<"dashboard" | "modal" | "checkin" | "data">("dashboard");

  return (
    <div className="min-h-screen bg-app-bg">
      {/* 헤더 */}
      <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-lg px-4 py-3">
          <h1 className="text-lg font-bold text-stone-900">UX/UI 개선 목업</h1>
          <p className="text-sm text-stone-500">Before/After 비교</p>
        </div>
      </header>

      {/* 섹션 탭 */}
      <div className="sticky top-[60px] z-40 border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-lg">
          <div className="flex overflow-x-auto scrollbar-none">
            {[
              { id: "dashboard", label: "대시보드" },
              { id: "modal", label: "현황 모달" },
              { id: "checkin", label: "체크인" },
              { id: "data", label: "데이터 관리" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id as typeof activeSection)}
                className={cn(
                  "flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                  activeSection === tab.id
                    ? "border-stone-900 text-stone-900"
                    : "border-transparent text-stone-500 hover:text-stone-700"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-lg px-4 py-6 space-y-8">
        {/* 대시보드 섹션 */}
        {activeSection === "dashboard" && (
          <div className="space-y-6">
            <SectionHeader title="일정 카드 - 진행중" />
            
            {/* 개선된 진행중 카드 */}
            <div className="rounded-2xl ring-2 ring-main-action bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  진행중
                </span>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                  집결 12:30
                </span>
              </div>
              
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-lg font-bold text-stone-900">제주공항</p>
                  <p className="text-sm text-stone-500">0번 게이트</p>
                </div>
                <button className="flex-shrink-0 min-h-11 min-w-16 rounded-xl bg-stone-100 px-4 text-sm font-medium text-stone-600">
                  종료
                </button>
              </div>

              <div className="mt-4 flex items-baseline justify-between">
                <p className="text-sm text-stone-600">전체 진행률 6%</p>
                <p className="text-sm font-semibold text-stone-800">1/18조</p>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-100">
                <div className="h-full rounded-full bg-progress-bar transition-all w-[6%]" />
              </div>

              <button className="mt-3 w-full min-h-11 rounded-xl border border-stone-200 bg-stone-50 px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-100">
                현황 보기 &gt;
              </button>
            </div>

            <SectionHeader title="일정 카드 - 예정" />
            
            {/* 개선된 예정 카드 */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 transition-shadow hover:shadow-sm">
              <div className="mb-3 flex items-center gap-1.5 flex-wrap">
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                  예정
                </span>
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                  집결 14:30
                </span>
              </div>
              
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-base font-semibold text-stone-800">늘봄식당</p>
                  <p className="text-sm text-stone-500">주차장</p>
                </div>
                <button className="flex-shrink-0 min-h-11 min-w-16 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50">
                  시작
                </button>
              </div>
            </div>

            <SectionHeader title="일정 카드 - 완료" />
            
            {/* 개선된 완료 카드 */}
            <div className="rounded-2xl border border-stone-200 bg-stone-50/80 p-4">
              <div className="mb-3 flex items-center gap-1.5 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                  <CheckIcon className="h-3 w-3" />
                  완료
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
                  집결 10:00
                </span>
              </div>
              
              <div>
                <p className="font-semibold text-stone-600">김포공항</p>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <p className="text-sm text-stone-500">0번 게이트</p>
                  <p className="flex items-center gap-1 text-sm font-medium text-emerald-600">
                    <CheckIcon className="h-3.5 w-3.5" />
                    18/18조
                  </p>
                </div>
              </div>

              <button className="mt-3 w-full min-h-11 rounded-xl border border-stone-200 bg-white/60 px-4 text-sm font-medium text-stone-500 transition-colors hover:bg-white">
                현황 보기 &gt;
              </button>
            </div>
          </div>
        )}

        {/* 현황 모달 섹션 */}
        {activeSection === "modal" && (
          <div className="space-y-6">
            <SectionHeader title="제주공항 현황 모달" />
            
            <div className="rounded-2xl bg-white p-4 shadow-lg">
              {/* 모달 헤더 */}
              <div className="text-center mb-4 pb-4 border-b border-stone-100">
                <h2 className="text-lg font-bold text-stone-900">제주공항 현황</h2>
                <p className="text-sm text-stone-500 mt-1">전체 13/212명 확인</p>
              </div>

              {/* 버스 섹션 */}
              <div className="mb-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-700">
                  <span className="h-1 w-1 rounded-full bg-stone-400" />
                  버스1 (접근성)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* 시작전 그룹 카드 */}
                  <div className="rounded-2xl border border-stone-200 bg-white p-4 hover:shadow-sm transition-all">
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                      시작전
                    </span>
                    <p className="mt-1.5 text-base font-bold text-stone-800">접근성1</p>
                    <p className="text-sm text-stone-500">max.0420</p>
                    <div className="mt-2 h-2 rounded-full bg-stone-100">
                      <div className="h-full w-0 rounded-full bg-progress-bar" />
                    </div>
                    <p className="mt-1.5 text-sm text-stone-600">
                      <span className="font-semibold">0</span> / 20명
                    </p>
                  </div>

                  {/* 보고완료 그룹 카드 */}
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 transition-all">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                      보고완료
                    </span>
                    <p className="mt-1.5 text-base font-bold text-stone-800">접근성2</p>
                    <p className="text-sm text-stone-500">liam.j</p>
                    <div className="mt-2 h-2 rounded-full bg-stone-100">
                      <div className="h-full w-full rounded-full bg-emerald-500" />
                    </div>
                    <p className="mt-1.5 text-sm text-stone-600">
                      <span className="font-semibold">13</span> / 13명
                    </p>
                  </div>
                </div>
              </div>

              {/* 버스2 섹션 */}
              <div className="mb-5">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-stone-700">
                  <span className="h-1 w-1 rounded-full bg-stone-400" />
                  버스2 (AI품질운영)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                      시작전
                    </span>
                    <p className="mt-1.5 text-base font-bold text-stone-800">AI품질운영1</p>
                    <p className="text-sm text-stone-500">kate.yj</p>
                    <div className="mt-2 h-2 rounded-full bg-stone-100">
                      <div className="h-full w-0 rounded-full bg-progress-bar" />
                    </div>
                    <p className="mt-1.5 text-sm text-stone-600">
                      <span className="font-semibold">0</span> / 22명
                    </p>
                  </div>
                  <div className="rounded-2xl border border-stone-200 bg-white p-4">
                    <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">
                      시작전
                    </span>
                    <p className="mt-1.5 text-base font-bold text-stone-800">AI품질운영2</p>
                    <p className="text-sm text-stone-500">dandel.m</p>
                    <div className="mt-2 h-2 rounded-full bg-stone-100">
                      <div className="h-full w-0 rounded-full bg-progress-bar" />
                    </div>
                    <p className="mt-1.5 text-sm text-stone-600">
                      <span className="font-semibold">0</span> / 11명
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 체크인 섹션 */}
        {activeSection === "checkin" && (
          <div className="space-y-6">
            <SectionHeader title="체크인 화면 - 아바타 버블" />
            
            {/* 아바타 버블 행 */}
            <div className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex gap-2.5 overflow-x-auto pb-3">
                {["ama", "del", "haz", "jam", "jos", "kai", "kay"].map((name, i) => {
                  const isChecked = i < 5;
                  return (
                    <div key={name} className="relative flex-shrink-0">
                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-full text-[0.625rem] font-bold transition-all",
                          isChecked
                            ? "bg-main-action text-stone-900 shadow-sm"
                            : "border-2 border-dashed border-stone-300 bg-stone-50 text-stone-600"
                        )}
                      >
                        {name}
                      </div>
                      {isChecked && (
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 shadow-sm">
                          <CheckIcon className="h-3 w-3 text-white" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-sm font-semibold text-stone-600">
                12 / 13명 탑승 완료
              </p>
            </div>

            <SectionHeader title="멤버 카드 - 확인 전" />
            
            {/* 확인 전 멤버 카드 */}
            <div className="flex min-h-[4.75rem] items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-stone-900">amara.w</p>
                <p className="text-sm mt-0.5 text-stone-500">확인 전</p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <button className="min-h-11 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
                  불참
                </button>
                <button className="min-h-11 min-w-[5rem] rounded-xl bg-main-action px-4 text-sm font-bold text-stone-900 shadow-sm transition-all hover:brightness-105">
                  왔수다!
                </button>
              </div>
            </div>

            <SectionHeader title="멤버 카드 - 탑승 완료" />
            
            {/* 탑승 완료 멤버 카드 */}
            <div className="flex min-h-[4.75rem] items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold text-stone-600">deli.ce</p>
                <p className="text-sm mt-0.5 text-emerald-600 font-medium">04:40 탑승 완료</p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <button className="min-h-11 min-w-16 rounded-xl border border-stone-300 bg-white px-4 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
                  취소
                </button>
              </div>
            </div>

            <SectionHeader title="전원 완료 축하 화면" />
            
            {/* 전원 완료 화면 */}
            <div className="rounded-2xl bg-white overflow-hidden shadow-sm">
              <div className="flex flex-col items-center px-6 py-10 text-center bg-gradient-to-b from-emerald-50/50 to-transparent">
                <div className="mb-5 text-7xl">
                  🎉
                </div>
                <h2 className="mb-2 text-2xl font-bold text-stone-900">접근성2 전원 탑승 완료!</h2>
                <p className="text-stone-600">보고 완료! 수고하셨어요.</p>
              </div>
              
              {/* 보고 완료 버튼 */}
              <div className="px-4 pb-4">
                <button className="flex w-full items-center justify-center gap-2 min-h-12 rounded-xl bg-emerald-50 py-4 text-base font-semibold text-emerald-600">
                  <CheckIcon className="h-5 w-5" />
                  보고 완료!
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 데이터 관리 섹션 */}
        {activeSection === "data" && (
          <div className="space-y-6">
            <SectionHeader title="세그먼트 탭" />
            
            {/* 세그먼트 컨트롤 */}
            <div className="flex gap-1 rounded-xl bg-stone-100 p-1">
              <button className="min-h-11 flex-1 rounded-lg bg-white font-bold text-stone-900 shadow-sm text-sm">
                일정 (16개)
              </button>
              <button className="min-h-11 flex-1 rounded-lg text-stone-500 hover:text-stone-700 text-sm font-medium">
                참가자 (237명)
              </button>
            </div>

            <SectionHeader title="데이터 테이블" />
            
            {/* 테이블 */}
            <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 border-b border-stone-200">
                  <tr className="text-xs font-semibold text-stone-600">
                    <th className="px-3 py-3 text-left">일정</th>
                    <th className="px-3 py-3 text-center">순서</th>
                    <th className="px-3 py-3 text-left">장소</th>
                    <th className="px-3 py-3 text-left">집결지</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {[
                    { day: "1일", order: 1, place: "김포공항", location: "0번 게이트" },
                    { day: "1일", order: 2, place: "제주공항", location: "0번 게이트" },
                    { day: "1일", order: 3, place: "늘봄식당", location: "주차장" },
                    { day: "1일", order: 4, place: "카카오스페이스닷원", location: "주차장" },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-stone-50/50 transition-colors">
                      <td className="px-3 py-3 font-medium text-stone-700">{row.day}</td>
                      <td className="px-3 py-3 text-center text-stone-500">{row.order}</td>
                      <td className="px-3 py-3 text-stone-700 font-medium">{row.place}</td>
                      <td className="px-3 py-3 text-stone-600">{row.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <SectionHeader title="일정 추가 모달 (폼)" />
            
            {/* 일정 추가 폼 */}
            <div className="rounded-2xl bg-white p-5 shadow-lg">
              <h2 className="text-center text-lg font-bold text-stone-900 mb-5">일정 추가</h2>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="px-1 text-sm font-medium text-stone-700">
                    일정명 <span className="text-red-500">*</span>
                  </label>
                  <input
                    placeholder="예: 늘봄식당, 제주공항"
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="px-1 text-sm font-medium text-stone-700">
                    집결지 <span className="text-stone-400 font-normal">(선택)</span>
                  </label>
                  <input
                    placeholder="예: 주차장, 0번 게이트"
                    className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base placeholder:text-stone-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-main-action"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="px-1 text-sm font-medium text-stone-700">일차</label>
                    <select className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base">
                      <option>1일차</option>
                      <option>2일차</option>
                      <option>3일차</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="px-1 text-sm font-medium text-stone-700">적용 대상</label>
                    <select className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3.5 text-base">
                      <option>전체</option>
                      <option>선발</option>
                      <option>후발</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <button className="w-full min-h-12 rounded-xl bg-main-action text-base font-bold text-stone-900 shadow-sm transition-all hover:brightness-105">
                    추가
                  </button>
                  <button className="w-full min-h-12 rounded-xl border border-stone-200 bg-white text-base font-medium text-stone-600 transition-colors hover:bg-stone-50">
                    취소
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 디자인 시스템 컬러 팔레트 */}
        <div className="mt-12 pt-8 border-t border-stone-200">
          <h2 className="text-lg font-bold text-stone-900 mb-4">색상 팔레트</h2>
          <div className="grid grid-cols-2 gap-3">
            <ColorSwatch name="Primary (CTA)" color="#FEE500" textDark />
            <ColorSwatch name="Success/Complete" color="#059669" />
            <ColorSwatch name="Progress Bar" color="#0ACF83" />
            <ColorSwatch name="App Background" color="#F5F3EF" textDark />
            <ColorSwatch name="Neutral 100" color="#F5F5F4" textDark />
            <ColorSwatch name="Neutral 600" color="#57534E" />
          </div>
        </div>

        {/* 상태 뱃지 */}
        <div className="pt-6">
          <h2 className="text-lg font-bold text-stone-900 mb-4">상태 뱃지 시스템</h2>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-600">
              시작전
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              진행중
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600">
              <CheckIcon className="h-3 w-3" />
              보고완료
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600">
              <CheckIcon className="h-3 w-3" />
              완료
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2 pt-4">
      <div className="h-px flex-1 bg-stone-200" />
      <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">{title}</h3>
      <div className="h-px flex-1 bg-stone-200" />
    </div>
  );
}

function ColorSwatch({ name, color, textDark }: { name: string; color: string; textDark?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden border border-stone-200">
      <div 
        className={cn("h-16 flex items-end p-2", textDark ? "text-stone-900" : "text-white")}
        style={{ backgroundColor: color }}
      >
        <span className="text-xs font-mono">{color}</span>
      </div>
      <div className="bg-white px-3 py-2">
        <p className="text-xs font-medium text-stone-700">{name}</p>
      </div>
    </div>
  );
}
