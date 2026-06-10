"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";

/**
 * 浏览器内 Web Speech API 实时语音转文字。
 * 按住说话 → 自动转文字 → 调 onResult(text)。
 *
 * 浏览器兼容性：
 * - Chrome / Edge / 国内 Chromium 内核浏览器都支持 webkitSpeechRecognition。
 * - Safari 桌面版 / Firefox 不支持，组件会自动隐藏，不影响主流程。
 */
interface VoiceInputButtonProps {
  onResult: (text: string) => void;
  onPartial?: (text: string) => void;
  disabled?: boolean;
  lang?: string;
}

type SR = any;

export function VoiceInputButton({
  onResult,
  onPartial,
  disabled,
  lang = "zh-CN",
}: VoiceInputButtonProps) {
  const recognitionRef = useRef<SR | null>(null);
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [hint, setHint] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    setSupported(Boolean(Ctor));
  }, []);

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supported) return;
    const w = window as any;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    const recognition: SR = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalText = "";

    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      const composed = (finalText + interim).trim();
      if (composed) {
        setHint(composed);
        onPartial?.(composed);
      }
    };

    recognition.onerror = (e: any) => {
      const code = e?.error || "unknown";
      const msg =
        code === "not-allowed"
          ? "麦克风权限未授予"
          : code === "no-speech"
            ? "没有听到声音"
            : `识别失败: ${code}`;
      setHint(msg);
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      const out = finalText.trim() || hint.trim();
      if (out) {
        onResult(out);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setListening(true);
    setHint("正在聆听...");
  }, [supported, lang, hint, onPartial, onResult]);

  if (supported === false) {
    return null;
  }

  return (
    <div className="relative inline-flex items-center">
      <button
        type="button"
        disabled={disabled || supported === null}
        onClick={listening ? stop : start}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition ${
          listening
            ? "border-red-300 bg-red-50 text-red-600"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
        }`}
        title={listening ? "停止录音" : "按下说话（Web Speech API）"}
      >
        {supported === null ? (
          <Loader2 size={15} className="animate-spin" />
        ) : listening ? (
          <MicOff size={15} />
        ) : (
          <Mic size={15} />
        )}
      </button>
      {listening && hint ? (
        <span className="ml-2 max-w-[180px] truncate rounded-full bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {hint}
        </span>
      ) : null}
    </div>
  );
}
