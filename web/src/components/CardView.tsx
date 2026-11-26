"use client";

// 명함 카드: 04 내 명함 · 03 받은 명함에서 같이 씀

import type { ReactNode } from "react";
import { behanceUrl, instagramUrl, prettyUrl } from "@/lib/format";
import type { Card } from "@/lib/types";
import { Avatar, Glass, Sparkles } from "./ui";

export function CardView({ card, footer }: { card: Card; footer?: ReactNode }) {
  const links = [
    card.instagram && { label: "Instagram", value: `@${card.instagram}`, href: instagramUrl(card.instagram) },
    card.behance && { label: "Behance", value: card.behance, href: behanceUrl(card.behance) },
    card.portfolio_url && { label: "포트폴리오", value: prettyUrl(card.portfolio_url), href: card.portfolio_url },
  ].filter(Boolean) as { label: string; value: string; href: string }[];

  return (
    <Glass className="ring-grad relative flex flex-col items-center px-5 pt-7 pb-5 text-center">
      <Sparkles spots={[{ top: "18px", left: "8%", size: 14 }, { top: "28px", left: "86%", size: 18 }]} />
      <Avatar name={card.nickname} id={card.id} size={96} ring="linear-gradient(135deg,#8B5CF6,#F472B6,#5ED3C3)" />
      <h1 className="mt-4 text-[28px] font-bold">{card.nickname}</h1>
      {card.handle && <p className="mt-0.5 text-[15px] text-sub">@{card.handle}</p>}
      {card.affiliation && (
        <span className="mt-3 rounded-full bg-white/80 px-4 py-1.5 text-[13px] font-bold text-ink-2">{card.affiliation}</span>
      )}
      {card.bio && <p className="mt-4 max-w-[260px] text-[18px] leading-snug font-bold break-keep">{card.bio}</p>}

      {card.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {card.tags.map((t) => (
            <span key={t} className="rounded-full bg-white/80 px-4 py-1.5 text-[14px] font-bold text-ink-2">
              #{t}
            </span>
          ))}
        </div>
      )}

      {links.length > 0 && (
        <div className="mt-5 w-full space-y-2.5">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-full bg-white/75 px-5 py-3.5 text-left transition active:scale-[0.99]"
            >
              <span className="text-[15px] font-bold">{l.label}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[14px] text-ink-2">{l.value}</span>
              <span aria-hidden className="text-[14px] text-sub">↗</span>
            </a>
          ))}
        </div>
      )}
      {footer}
    </Glass>
  );
}
