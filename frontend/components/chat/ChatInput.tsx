"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Square, type LucideIcon } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { VoiceInputButton } from "@/components/voice/VoiceInputButton";

export interface CapabilityOption {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

interface ChatInputProps {
  onSend: (message: string, capability: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  capabilities: CapabilityOption[];
  selectedCapability: CapabilityOption;
  onSelectCapability: (capability: CapabilityOption) => void;
}

export function ChatInput({
  onSend,
  onCancel,
  disabled,
  capabilities,
  selectedCapability,
  onSelectCapability,
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, selectedCapability.id);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
    }
  };

  return (
    <div className="shrink-0 border-t border-[var(--border)] bg-white/55 px-3 py-3 backdrop-blur-xl md:px-6 md:py-4">
      <div className="mx-auto max-w-4xl rounded-[22px] border border-[var(--border)] bg-white/90 p-2 shadow-[var(--shadow-soft)]">
        <div className="hide-scrollbar mb-2 flex gap-1 overflow-x-auto rounded-2xl bg-[var(--muted)] p-1">
          {capabilities.map((capability) => {
            const active = selectedCapability.id === capability.id;
            return (
              <button
                key={capability.id}
                type="button"
                onClick={() => onSelectCapability(capability)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-medium transition active:scale-95 ${
                  active
                    ? "bg-white text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:bg-white/70 hover:text-[var(--foreground)]"
                }`}
                title={capability.description}
              >
                <capability.icon size={14} />
                {capability.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-end gap-2">
          <BrandMark variant="input" size={36} className="hidden sm:inline-flex" />
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={`向 ${selectedCapability.label} 输入学习目标、题目或资源需求...`}
            disabled={disabled}
            rows={1}
            className="min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[14px] leading-6 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-foreground)] disabled:opacity-60"
          />
          <VoiceInputButton
            disabled={disabled}
            onPartial={(text) => setValue(text)}
            onResult={(text) => {
              if (!text.trim() || disabled) return;
              onSend(text.trim(), selectedCapability.id);
              setValue("");
              if (textareaRef.current) textareaRef.current.style.height = "auto";
            }}
          />
          {disabled ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white transition hover:bg-red-600"
              aria-label="停止生成"
              title="停止生成"
            >
              <Square size={15} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!value.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--primary)] text-white transition hover:bg-[var(--primary-dark)] disabled:cursor-not-allowed disabled:bg-[var(--muted)] disabled:text-[var(--muted-foreground)]"
              aria-label="发送"
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>
      </div>
      <div className="mx-auto mt-2 flex max-w-4xl items-center justify-between px-1 text-[11px] text-[var(--muted-foreground)]">
        <span>Enter 发送，Shift + Enter 换行</span>
        <span className="hidden sm:inline">保持上下文，持续调整学习计划</span>
      </div>
    </div>
  );
}
