"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState, type CSSProperties, type ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { avatarGradient, initial } from "@/lib/format";
import { IconBack, Sparkle } from "./icons";

/** 클래스 합치기. 뒤에 온 클래스가 앞의 같은 속성을 덮어씀 */
export function cx(...c: (string | false | null | undefined)[]) {
  return twMerge(c.filter(Boolean).join(" "));
}

// ---------- 헤더 ----------
export function TopBar({
  title,
  back,
  backStyle = "plain",
  right,
  className,
}: {
  title?: ReactNode;
  back?: string | true;
  backStyle?: "plain" | "circle";
  right?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <header className={cx("pt-safe sticky top-0 z-20", className)}>
      <div className="relative flex h-16 items-center px-4">
        {back && (
          <button
            aria-label="뒤로"
            onClick={() => (back === true ? router.back() : router.push(back))}
            className={cx(
              "relative z-10 flex items-center justify-center text-ink",
              backStyle === "circle" ? "glass size-11 rounded-full" : "size-10 -ml-1",
            )}
          >
            <IconBack size={backStyle === "circle" ? 22 : 24} />
          </button>
        )}
        {title && (
          <h1 className="pointer-events-none absolute inset-x-16 text-center text-[18px] font-bold text-ink">{title}</h1>
        )}
        <div className="relative z-10 ml-auto">{right}</div>
      </div>
    </header>
  );
}

// ---------- 버튼 ----------
type BtnVariant = "primary" | "danger" | "glass" | "mint" | "ghost" | "white";
type BtnProps = {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: BtnVariant;
  size?: "lg" | "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  type?: "button" | "submit";
};
export function Button({
  children,
  onClick,
  href,
  variant = "primary",
  size = "lg",
  disabled,
  loading,
  className,
  type = "button",
}: BtnProps) {
  const cls = cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-bold transition active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100",
    size === "lg" && "h-14 w-full text-[17px]",
    size === "md" && "h-11 px-5 text-[15px]",
    size === "sm" && "h-9 px-4 text-[14px]",
    variant === "primary" && "grad-primary text-white shadow-[0_10px_24px_-10px_rgba(91,63,224,0.7)]",
    variant === "danger" && "grad-danger text-white shadow-[0_10px_24px_-10px_rgba(229,64,93,0.6)]",
    variant === "glass" && "glass text-ink",
    variant === "mint" && "glass-mint text-violet",
    variant === "ghost" && "bg-transparent text-sub",
    variant === "white" && "bg-white text-violet shadow-sm",
    className,
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} className={cls}>
      {loading ? <Spinner light={variant === "primary" || variant === "danger"} /> : children}
    </button>
  );
}

export function Spinner({ light, className }: { light?: boolean; className?: string }) {
  return (
    <span
      className={cx(
        "inline-block size-5 animate-spin rounded-full border-[2.5px]",
        light ? "border-white/40 border-t-white" : "border-violet/20 border-t-violet",
        className,
      )}
    />
  );
}

export function Glass({
  children,
  className,
  href,
  style,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  style?: CSSProperties;
}) {
  const cls = cx("glass block rounded-[28px] p-5", className);
  return href ? (
    <Link href={href} className={cx(cls, "transition active:scale-[0.99]")} style={style}>
      {children}
    </Link>
  ) : (
    <section className={cls} style={style}>
      {children}
    </section>
  );
}

// ---------- 아바타 ----------
export function Avatar({
  name,
  id,
  size = 44,
  ring,
  badge,
  className,
}: {
  name: string;
  id?: string;
  size?: number;
  /** 상태 링 색 (예: 초록=정상, 주황=주의, 빨강=긴급) */
  ring?: string;
  badge?: ReactNode;
  className?: string;
}) {
  const inner = (
    <span
      className="flex size-full items-center justify-center rounded-full font-bold text-white"
      style={{ background: avatarGradient(id ?? name), fontSize: size * 0.4 }}
    >
      {initial(name)}
    </span>
  );
  return (
    <span className={cx("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {ring ? (
        <span className="flex size-full rounded-full p-[3px]" style={{ background: ring }}>
          <span className="flex size-full rounded-full bg-white p-[2px]">{inner}</span>
        </span>
      ) : (
        inner
      )}
      {badge && <span className="absolute -top-1 -right-1">{badge}</span>}
    </span>
  );
}

export function AvatarStack({
  people,
  size = 40,
  max = 4,
  extra,
}: {
  people: { user_id: string; nickname: string }[];
  size?: number;
  max?: number;
  extra?: number;
}) {
  const more = extra ?? Math.max(0, people.length - max);
  return (
    <div className="flex items-center">
      {people.slice(0, max).map((p, i) => (
        <span key={p.user_id} className="rounded-full ring-2 ring-white" style={{ marginLeft: i ? -size * 0.28 : 0 }}>
          <Avatar name={p.nickname} id={p.user_id} size={size} />
        </span>
      ))}
      {more > 0 && (
        <span
          className="flex items-center justify-center rounded-full bg-white font-bold text-violet ring-2 ring-white"
          style={{ width: size, height: size, marginLeft: -size * 0.28, fontSize: size * 0.33 }}
        >
          +{more}
        </span>
      )}
    </div>
  );
}

export function IconBubble({ children, size = 44, className }: { children: ReactNode; size?: number; className?: string }) {
  return (
    <span
      className={cx("grad-primary flex shrink-0 items-center justify-center rounded-full text-white", className)}
      style={{ width: size, height: size }}
    >
      {children}
    </span>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-bold", className)}>
      {children}
    </span>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "h-10 shrink-0 rounded-full px-4 text-[15px] font-bold transition",
        active ? "grad-primary text-white shadow-[0_6px_16px_-8px_rgba(91,63,224,0.8)]" : "glass text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[30px] w-[52px] shrink-0 rounded-full transition disabled:opacity-40",
        checked ? "grad-primary" : "bg-white/70 ring-1 ring-black/5",
      )}
    >
      <span
        className={cx(
          "absolute top-[3px] left-0 size-6 rounded-full shadow transition-transform",
          checked ? "translate-x-[25px] bg-white" : "translate-x-[3px] bg-[#c9c3dc]",
        )}
      />
    </button>
  );
}

/** 페이지 곳곳의 반짝이 장식 */
export function Sparkles({ spots }: { spots: { top: string; left: string; size?: number; delay?: number }[] }) {
  return (
    <>
      {spots.map((s, i) => (
        <span
          key={i}
          className="animate-twinkle pointer-events-none absolute"
          style={{ top: s.top, left: s.left, animationDelay: `${s.delay ?? i * 0.4}s` }}
        >
          <Sparkle size={s.size ?? 14} />
        </span>
      ))}
    </>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-20 text-center">
      <p className="text-[15px] text-sub">{message}</p>
      {onRetry && (
        <Button size="md" variant="glass" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-24">
      <Spinner />
    </div>
  );
}

export function Empty({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="glass flex flex-col items-center gap-2 rounded-[28px] px-6 py-10 text-center">
      <p className="text-[16px] font-bold">{title}</p>
      {desc && <p className="text-[14px] text-sub">{desc}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

// ---------- 바텀 시트 / 확인창 ----------
export function Sheet({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-gradient-to-b from-[#5b3fe0]/55 to-[#9b3ad6]/45"
      onClick={onClose}
    >
      <div
        className={cx(
          "pb-safe animate-slide-up w-full max-w-[430px] rounded-t-[32px] bg-[#f7f4fd]/95 px-5 pt-3 backdrop-blur-xl",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-11 rounded-full bg-[#d6cff0]" />
        {children}
      </div>
    </div>
  );
}

export function ConfirmSheet({
  open,
  title,
  desc,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  desc?: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose}>
      <h3 className="text-[20px] font-bold">{title}</h3>
      {desc && <p className="mt-2 text-[15px] leading-relaxed text-sub">{desc}</p>}
      <div className="mt-6 flex gap-2 pb-2">
        <Button variant="glass" onClick={onClose} className="flex-1">
          취소
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading} className="flex-1">
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}

// ---------- 토스트 ----------
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; key: number } | null>(null);
  const show = useCallback((text: string) => {
    const key = Date.now();
    setMsg({ text, key });
    setTimeout(() => setMsg((m) => (m?.key === key ? null : m)), 2200);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="pointer-events-none fixed inset-x-0 bottom-32 z-[60] flex justify-center px-6">
          <div key={msg.key} className="animate-slide-up rounded-full bg-ink/90 px-5 py-3 text-[14px] font-semibold text-white">
            {msg.text}
          </div>
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
