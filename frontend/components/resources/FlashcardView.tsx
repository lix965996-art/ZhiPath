"use client";

import { useMemo, useState } from "react";
import type { LearningResourcePackage } from "@/lib/api";

type CardRating = "again" | "partial" | "known";

function analysisLabel(difficulty?: string) {
  if (difficulty === "hard") return "综合";
  if (difficulty === "medium") return "常考";
  return "基础";
}

function buildFlashcardAnalysis(card: { front: string; back: string; difficulty?: string }, topic: string) {
  const text = `${card.front} ${card.back}`;
  if (/遍历|前序|中序|后序|层序/.test(text)) {
    return {
      exam: "常以给定遍历序列还原二叉树，或判断访问序列是否合法。",
      trap: "先确定根结点，再递归划分左右子树，不要只背访问口诀。",
    };
  }
  if (/完全二叉树|满二叉树/.test(text)) {
    return {
      exam: "常考结点编号、叶子数量、最后一层位置和存储空间利用率。",
      trap: "满二叉树一定是完全二叉树，完全二叉树不一定是满二叉树。",
    };
  }
  if (/二叉搜索树|BST/.test(text)) {
    return {
      exam: "常结合中序遍历有序性、查找路径和插入删除过程考查。",
      trap: "BST 的限制作用于整棵左/右子树，不是只比较左右孩子。",
    };
  }
  if (/度|叶子|节点|结点/.test(text)) {
    return {
      exam: "常考 n0 = n2 + 1、边数 = 结点数 - 1、度数统计。",
      trap: "结点的度是孩子数，树的度是所有结点度的最大值。",
    };
  }
  if (/Cache|cache|映射|主存|块|行/.test(text)) {
    return {
      exam: "常考地址划分、行号/组号计算、命中判断和映射方式对比。",
      trap: "分清主存块号、Cache 行号、组号和块内地址。",
    };
  }
  return {
    exam: `${topic || "408"} 通常考定义边界、适用条件和反例判断。`,
    trap: "不要只背定义，还要记住不适用的情况。",
  };
}

function ratingLabel(rating?: CardRating) {
  if (rating === "again") return "生疏";
  if (rating === "partial") return "模糊";
  if (rating === "known") return "掌握";
  return "未作答";
}

function ratingClass(rating?: CardRating) {
  if (rating === "again") return "text-[#ff3b30]";
  if (rating === "partial") return "text-[#ff9500]";
  if (rating === "known") return "text-[#34c759]";
  return "text-[#8e8e93]";
}

export function FlashcardView({ pkg }: { pkg: LearningResourcePackage }) {
  const cards = useMemo(() => pkg.resources.flashcards?.cards ?? [], [pkg.resources.flashcards?.cards]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ratings, setRatings] = useState<Record<number, CardRating>>({});
  const [showDeck, setShowDeck] = useState(false);
  const [motion, setMotion] = useState<"next" | "prev">("next");
  const [motionKey, setMotionKey] = useState(0);

  const stats = useMemo(() => {
    const values = Object.values(ratings);
    return {
      done: values.length,
      again: values.filter((item) => item === "again").length,
      partial: values.filter((item) => item === "partial").length,
      known: values.filter((item) => item === "known").length,
    };
  }, [ratings]);

  const nextReviewIndex = useMemo(() => {
    if (!cards.length) return -1;
    return cards.findIndex((_, index) => ratings[index] === "again" || ratings[index] === "partial");
  }, [cards, ratings]);

  const deckPreview = useMemo(() => {
    if (!cards.length) return [];
    return cards.map((card, index) => ({ card, index })).slice(Math.max(0, idx - 2), idx + 4);
  }, [cards, idx]);

  if (!cards.length) return <EmptyHint label="闪卡" />;

  const card = cards[idx];
  const analysis = buildFlashcardAnalysis(card, pkg.topic);
  const progress = (stats.done / cards.length) * 100;
  const currentRating = ratings[idx];

  const goTo = (nextIdx: number) => {
    const normalized = (nextIdx + cards.length) % cards.length;
    setMotion(normalized < idx ? "prev" : "next");
    setMotionKey((value) => value + 1);
    setIdx(normalized);
    setRevealed(false);
  };

  const rate = (rating: CardRating) => {
    setRatings((prev) => ({ ...prev, [idx]: rating }));
    goTo(idx + 1);
  };

  const resetRound = () => {
    setIdx(0);
    setRevealed(false);
    setRatings({});
    setMotion("prev");
    setMotionKey((value) => value + 1);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <style>{`
        @keyframes lf-card-next {
          from { opacity: 0; transform: translateX(18px) scale(0.985); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes lf-card-prev {
          from { opacity: 0; transform: translateX(-18px) scale(0.985); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
      `}</style>
      <section className="rounded-[24px] border border-[#d1d1d6] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <header className="border-b border-[#e5e5ea] px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1c1c1e]">记忆卡</h3>
                <span className={`text-[13px] font-medium ${ratingClass(currentRating)}`}>
                  {ratingLabel(currentRating)}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-[#6e6e73]">
                {idx + 1}/{cards.length} · 掌握 {stats.known} · 模糊 {stats.partial} · 生疏 {stats.again}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (nextReviewIndex >= 0) goTo(nextReviewIndex);
                }}
                disabled={nextReviewIndex < 0}
                className="rounded-full border border-[#d1d1d6] bg-white px-4 py-2 text-[13px] font-medium text-[#1c1c1e] transition hover:bg-[#f2f2f7] disabled:cursor-not-allowed disabled:text-[#c7c7cc]"
              >
                复盘
              </button>
              <button
                type="button"
                onClick={() => setShowDeck((value) => !value)}
                className="rounded-full border border-[#d1d1d6] bg-white px-4 py-2 text-[13px] font-medium text-[#1c1c1e] transition hover:bg-[#f2f2f7]"
              >
                {showDeck ? "收起" : "卡组"}
              </button>
            </div>
          </div>

          <div className="mt-5 h-1 rounded-full bg-[#f2f2f7]">
            <div className="h-full rounded-full bg-[#1c1c1e] transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>

          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
            {cards.map((_, index) => {
              const rating = ratings[index];
              const active = index === idx;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => goTo(index)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    active ? "w-8" : "w-2.5"
                  } ${
                    rating === "known"
                      ? "bg-[#34c759]"
                      : rating === "partial"
                        ? "bg-[#ff9500]"
                        : rating === "again"
                          ? "bg-[#ff3b30]"
                          : active
                            ? "bg-[#1c1c1e]"
                            : "bg-[#d1d1d6]"
                  }`}
                  aria-label={`第 ${index + 1} 张`}
                />
              );
            })}
          </div>

          {showDeck ? (
            <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
              {deckPreview.map(({ card: item, index }) => (
                <button
                  key={`${item.front}-${index}`}
                  type="button"
                  onClick={() => goTo(index)}
                  className={`min-w-[156px] rounded-[16px] border px-3 py-3 text-left transition ${
                    index === idx
                      ? "border-[#1c1c1e] bg-[#1c1c1e] text-white"
                      : "border-[#d1d1d6] bg-white text-[#1c1c1e] hover:bg-[#f2f2f7]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 text-[11px] opacity-70">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <span>{ratingLabel(ratings[index])}</span>
                  </span>
                  <span className="mt-2 line-clamp-2 block text-[13px] font-medium leading-5">{item.front}</span>
                </button>
              ))}
            </div>
          ) : null}
        </header>

        <div className="px-6 py-7">
          <div className="relative mx-auto min-h-[420px] max-w-[820px]">
            <div className="absolute inset-x-10 top-6 h-[360px] rounded-[28px] border border-[#e5e5ea] bg-[#fafafa]" />
            <div className="absolute inset-x-5 top-3 h-[380px] rounded-[30px] border border-[#e5e5ea] bg-white" />

            <button
              key={`${idx}-${motionKey}`}
              type="button"
              onClick={() => setRevealed((value) => !value)}
              className="group absolute inset-x-0 top-0 block h-[400px] w-full rounded-[32px] text-left outline-none transition-transform duration-200 active:scale-[0.985]"
              style={{
                perspective: "1400px",
                animation: `${motion === "next" ? "lf-card-next" : "lf-card-prev"} 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both`,
              }}
            >
              <div
                className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
                style={{ transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                <div className="absolute inset-0 rounded-[32px] border border-[#d1d1d6] bg-white px-8 py-7 shadow-[0_18px_42px_rgba(0,0,0,0.08)] [backface-visibility:hidden]">
                  <div className="mb-8 flex items-center justify-between gap-4">
                    <span className="text-[13px] font-medium text-[#007aff]">{analysisLabel(card.difficulty)}</span>
                    <span className="text-[13px] text-[#8e8e93]">轻点翻面</span>
                  </div>

                  <div className="flex min-h-[270px] flex-col justify-center">
                    <p className="text-[14px] font-medium text-[#6e6e73]">问题</p>
                    <h2 className="mt-5 max-w-[780px] text-[31px] font-semibold leading-[1.35] tracking-[-0.02em] text-[#1c1c1e]">
                      {card.front}
                    </h2>
                    <p className="mt-8 text-[14px] leading-6 text-[#6e6e73]">先在心里说出答案，再翻卡核对。</p>
                  </div>
                </div>

                <div
                  className="absolute inset-0 rounded-[32px] border border-[#d1d1d6] bg-white px-8 py-7 shadow-[0_18px_42px_rgba(0,0,0,0.08)] [backface-visibility:hidden]"
                  style={{ transform: "rotateY(180deg)" }}
                >
                  <div className="mb-8 flex items-center justify-between gap-4">
                    <span className="text-[13px] font-medium text-[#007aff]">答案</span>
                    <span className="text-[13px] text-[#8e8e93]">轻点回到问题</span>
                  </div>

                  <div className="grid min-h-[270px] gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(230px,0.8fr)]">
                    <div className="flex flex-col justify-center">
                      <p className="text-[14px] font-medium text-[#6e6e73]">参考答案</p>
                      <p className="mt-4 text-[22px] font-semibold leading-9 tracking-[-0.01em] text-[#1c1c1e]">
                        {card.back}
                      </p>
                    </div>
                    <div className="flex flex-col justify-center divide-y divide-[#e5e5ea] rounded-[18px] border border-[#e5e5ea]">
                      <MiniNote title="考法" content={analysis.exam} />
                      <MiniNote title="易错点" content={analysis.trap} />
                    </div>
                  </div>
                </div>
              </div>
            </button>
          </div>

          <footer className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goTo(idx - 1)}
                className="rounded-full border border-[#d1d1d6] bg-white px-4 py-2.5 text-[14px] font-medium text-[#1c1c1e] transition hover:bg-[#f2f2f7]"
              >
                上一张
              </button>
              <button
                type="button"
                onClick={() => goTo(idx + 1)}
                className="rounded-full border border-[#d1d1d6] bg-white px-4 py-2.5 text-[14px] font-medium text-[#1c1c1e] transition hover:bg-[#f2f2f7]"
              >
                下一张
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={resetRound}
                className="rounded-full border border-[#d1d1d6] bg-white px-4 py-2.5 text-[14px] font-medium text-[#1c1c1e] transition hover:bg-[#f2f2f7]"
              >
                重来
              </button>
              <button
                type="button"
                onClick={() => rate("again")}
                className="rounded-full border border-[#ffcccb] bg-white px-4 py-2.5 text-[14px] font-medium text-[#ff3b30] transition hover:bg-[#fff2f2]"
              >
                生疏
              </button>
              <button
                type="button"
                onClick={() => rate("partial")}
                className="rounded-full border border-[#ffd59a] bg-white px-4 py-2.5 text-[14px] font-medium text-[#bf6a00] transition hover:bg-[#fff7e8]"
              >
                模糊
              </button>
              <button
                type="button"
                onClick={() => rate("known")}
                className="rounded-full bg-[#007aff] px-4 py-2.5 text-[14px] font-semibold text-white transition hover:bg-[#006ee6]"
              >
                掌握
              </button>
            </div>
          </footer>
        </div>
      </section>
    </div>
  );
}

function MiniNote({ title, content }: { title: string; content: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-[13px] font-semibold text-[#1c1c1e]">{title}</p>
      <p className="mt-1 text-[13px] leading-6 text-[#6e6e73]">{content}</p>
    </div>
  );
}

function EmptyHint({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[24px] border border-[#d1d1d6] bg-white px-6 py-16 text-center shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <p className="text-[14px] font-medium text-[#1c1c1e]">
        {label ? `${label}暂未生成` : "选择上方的资源类型开始学习"}
      </p>
    </div>
  );
}
