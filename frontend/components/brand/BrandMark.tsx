"use client";

import Image from "next/image";

type BrandMarkVariant = "logo" | "assistant" | "user" | "input";

interface BrandMarkProps {
  className?: string;
  size?: number;
  variant?: BrandMarkVariant;
}

const variantClass: Record<BrandMarkVariant, string> = {
  logo: "bg-white ring-1 ring-[rgba(0,122,255,0.18)]",
  assistant: "bg-[var(--primary)] text-white",
  user: "border border-[var(--border)] bg-white/90 text-[var(--foreground)]",
  input: "bg-[rgba(0,122,255,0.08)] text-[var(--primary)]",
};

export function BrandMark({
  className = "",
  size = 32,
  variant = "logo",
}: BrandMarkProps) {
  const isTextMark = variant === "assistant" || variant === "user";

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-2xl shadow-sm ${variantClass[variant]} ${className}`}
      style={{ height: size, width: size }}
      aria-hidden="true"
    >
      {isTextMark ? (
        <span className="text-[11px] font-semibold leading-none tracking-normal">
          {variant === "assistant" ? "ZP" : "我"}
        </span>
      ) : (
        <Image
          src="/logo.jpg"
          alt="ZhiPath"
          width={size}
          height={size}
          className="h-full w-full rounded-2xl object-cover"
        />
      )}
    </span>
  );
}
