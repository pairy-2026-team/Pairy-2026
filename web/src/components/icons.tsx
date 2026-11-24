// 시안에 쓰인 선 아이콘 (stroke 1.9, round)
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, rest: SVGProps<SVGSVGElement>) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...rest,
});

export const IconHome = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.5H9v5.5H5.5A1.5 1.5 0 0 1 4 19z" />
  </svg>
);
export const IconUsers = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.8 19.5c.6-3.2 3.1-5.2 6.2-5.2s5.6 2 6.2 5.2" />
    <path d="M16 5.3a3.3 3.3 0 0 1 0 6.4M18.2 14.6c1.7.7 2.8 2.3 3.1 4.9" />
  </svg>
);
export const IconNfc = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M7.5 9.5a3.5 3.5 0 0 1 0 5" />
    <path d="M10.5 7.2a7 7 0 0 1 0 9.6" />
    <path d="M13.6 5a10.5 10.5 0 0 1 0 14" />
  </svg>
);
export const IconCard = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <rect x="3.5" y="5" width="17" height="14" rx="3" />
    <path d="M7.5 10h9M7.5 14h5" />
  </svg>
);
export const IconUser = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.8 20c.8-3.6 3.6-5.6 7.2-5.6s6.4 2 7.2 5.6" />
  </svg>
);
export const IconBell = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </svg>
);
export const IconBack = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);
export const IconChevron = ({ size = 20, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="m9.5 6 6 6-6 6" />
  </svg>
);
export const IconClose = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconSend = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M20.5 3.5 10.5 13.5M20.5 3.5 14 20.5l-3.5-7-7-3.5z" />
  </svg>
);
export const IconCopy = ({ size = 22, ...r }: P) => (
  <svg {...base(size, r)}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
  </svg>
);
export const IconLink = ({ size = 22, ...r }: P) => (
  <svg {...base(size, r)}>
    <circle cx="8.5" cy="12" r="4.5" />
    <circle cx="15.5" cy="12" r="4.5" />
  </svg>
);
export const IconChat = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3v-3H5A1.5 1.5 0 0 1 3.5 16V7A1.5 1.5 0 0 1 5 5.5z" />
  </svg>
);
export const IconCamera = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2h5.6l1.4 2h2.3A1.5 1.5 0 0 1 20 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const IconCheck = ({ size = 24, ...r }: P) => (
  <svg {...base(size, { strokeWidth: 2.6, ...r })}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconPulse = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M3 12h4l2.5-6 4.5 12 2.5-6H21" />
  </svg>
);
export const IconPin = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M12 21s6.5-5.7 6.5-11a6.5 6.5 0 0 0-13 0c0 5.3 6.5 11 6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const IconPlus = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconSearch = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </svg>
);
export const IconPhone = ({ size = 22, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />
  </svg>
);

export const IconShield = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M12 3.2 5 6v5.6c0 4.3 2.9 7.7 7 9.2 4.1-1.5 7-4.9 7-9.2V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
export const IconClock = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const IconFoot = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M8.5 3.5c1.9 0 3 1.9 3 4.4 0 2.2-.8 3.6-.8 5.1H6.2c0-1.6-.9-2.9-.9-5.1 0-2.5 1.3-4.4 3.2-4.4z" />
    <path d="M6.3 15.6h4.3v1.1a2.15 2.15 0 0 1-4.3 0z" />
    <path d="M15.5 7.5c1.9 0 3.2 1.9 3.2 4.4 0 2.2-.9 3.5-.9 5.1h-4.5c0-1.5-.8-2.9-.8-5.1 0-2.5 1.1-4.4 3-4.4z" />
    <path d="M13.4 19.6h4.3v.4a2.15 2.15 0 0 1-4.3 0z" />
  </svg>
);
export const IconTarget = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
);
export const IconMinus = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M5 12h14" />
  </svg>
);
export const IconBellRing = ({ size = 24, ...r }: P) => (
  <svg {...base(size, r)}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);

/** 반짝이 ✦ */
export const Sparkle = ({ size = 14, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="white">
    <path d="M12 0c.7 6.3 5.7 11.3 12 12-6.3.7-11.3 5.7-12 12-.7-6.3-5.7-11.3-12-12C6.3 11.3 11.3 6.3 12 0z" />
  </svg>
);

/** Pairy 로고 (날개 + 보라 점). 원본 에셋이 있으면 public/logo.svg 로 교체 */
export const PairyLogo = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 40 40">
    <defs>
      <linearGradient id="pl-w" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" />
        <stop offset="1" stopColor="#E7DDFF" />
      </linearGradient>
      <linearGradient id="pl-d" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#7C5CF0" />
        <stop offset="1" stopColor="#C25BD9" />
      </linearGradient>
    </defs>
    <path d="M19 22C13 23 5 19 4.5 11.5 4.2 7 8 5 11.5 7.5 15.5 10.4 18.4 15.5 19 22z" fill="url(#pl-w)" stroke="#C9B8FF" strokeWidth="1.2" />
    <path d="M21 22c6 1 14-3 14.5-10.5C35.8 7 32 5 28.5 7.5 24.5 10.4 21.6 15.5 21 22z" fill="url(#pl-w)" stroke="#C9B8FF" strokeWidth="1.2" />
    <circle cx="20" cy="25" r="8" fill="url(#pl-d)" />
    <circle cx="20" cy="25" r="3" fill="#fff" />
  </svg>
);
