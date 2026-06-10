"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import {
  getLearningProfile,
  listSessions,
  type LearningProfile,
  type SessionSummary,
} from "@/lib/api";
import { LearnerDNAHero } from "./LearnerDNAHero";
import { DimensionMosaic } from "./DimensionMosaic";
import { EvidenceTimeline } from "./EvidenceTimeline";
import { ProfileRadar } from "./ProfileRadar";

/**
 * 学习者画像旗舰页：Hero (DNA) + 维度马赛克 + 雷达 + 证据时间线。
 *
 * 设计原则：
 * 1. 别处没有的"签名感"：基因色带、首字头像、流动光晕。
 * 2. 每条数据都是真实接口拉的，从画像证据链 evidence_log 渲染。
 * 3. 空状态有彩蛋，引导用户去发起对话。
 */
export function LearnerProfileDashboard() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listSessions()
      .then((data) => {
        if (cancelled) return;
        setSessions(data);
        setSelectedSessionId(data[0]?.id || "");
      })
      .catch(() => {
        if (!cancelled) setError("会话加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedSessionId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getLearningProfile(selectedSessionId)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setError("画像加载失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId),
    [sessions, selectedSessionId],
  );

  return (
    <main className="min-h-screen bg-[var(--background)] pb-12 text-[var(--foreground)]">
      <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--surface)] backdrop-blur-2xl">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link
            href="/chat"
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-[12px] text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            <ArrowLeft size={13} />
            返回工作台
          </Link>
          <SessionPicker
            sessions={sessions}
            value={selectedSessionId}
            onChange={setSelectedSessionId}
          />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 pt-6">
        {loading && !profile ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2
              size={20}
              className="animate-spin text-[var(--muted-foreground)]"
            />
          </div>
        ) : error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            {error}
          </p>
        ) : !profile ? (
          <EmptyHero />
        ) : (
          <>
            <LearnerDNAHero
              profile={profile}
              sessionTitle={selectedSession?.title || ""}
            />

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
              <DimensionMosaic profile={profile} />
              <div className="space-y-5">
                <ProfileRadar profile={profile} />
                <EvidenceTimeline profile={profile} />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function SessionPicker({
  sessions,
  value,
  onChange,
}: {
  sessions: SessionSummary[];
  value: string;
  onChange: (id: string) => void;
}) {
  if (!sessions.length) {
    return (
      <span className="text-[12px] text-[var(--muted-foreground)]">尚无会话</span>
    );
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-[var(--border)] bg-[var(--card-solid)] px-3 py-1.5 text-[12px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
    >
      {sessions.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title || s.id.slice(0, 8)}
        </option>
      ))}
    </select>
  );
}

function EmptyHero() {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#070814] p-10 text-center text-white">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.3) 0%, transparent 70%)",
        }}
      />
      <Sparkles
        size={28}
        className="relative mx-auto mb-3 text-violet-300"
      />
      <h2 className="relative text-2xl font-semibold">
        我还不认识你
      </h2>
      <p className="relative mx-auto mt-2 max-w-md text-[13px] leading-6 text-white/65">
        和我聊几句吧。每说一句话，这里就会自动长出一条画像证据。
        没有表单，没有勾选，画像就建立起来了。
      </p>
      <Link
        href="/chat"
        className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-[13px] font-semibold text-[#070814] hover:bg-white/90"
      >
        <Sparkles size={13} />
        去开始第一次对话
      </Link>
    </section>
  );
}
