"use client";

// 16 영수증 -> PNG (이미지로 저장 · 친구에게 자랑)
// 화면 DOM을 캡처하는 라이브러리 없이 canvas 에 직접 그림 (화면과 같은 Receipt 값을 씀)

import { barcodeBars, type Receipt } from "@/lib/receipt";

const FONT = "'Pretendard Variable', Pretendard, sans-serif";
const W = 720;
const PAD = 56;
const INK = "#2a2350";
const SUB = "#8a8499";
const PAPER = "#fbf9f4";

export async function receiptImage(r: Receipt): Promise<Blob | null> {
  try {
    await document.fonts?.ready;
    const lines = r.usage.length + r.points.length + r.usage.filter((l) => l.note).length + r.points.filter((l) => l.note).length;
    const H = 980 + lines * 44;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return null;

    // 배경 + 종이
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#b9a6ff");
    bg.addColorStop(1, "#f6c4ea");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = PAPER;
    g.fillRect(28, 28, W - 56, H - 56);

    let y = 110;
    const center = (text: string, font: string, color = INK) => {
      g.font = font;
      g.fillStyle = color;
      g.textAlign = "center";
      g.fillText(text, W / 2, y);
    };
    const row = (label: string, value: string, bold = false) => {
      g.font = `${bold ? 700 : 500} 26px ${FONT}`;
      g.fillStyle = INK;
      g.textAlign = "left";
      g.fillText(label, PAD, y);
      g.textAlign = "right";
      g.fillText(value, W - PAD, y);
      // 점선 리더
      const lw = g.measureText(value).width;
      g.textAlign = "left";
      const start = PAD + g.measureText(label).width + 12;
      g.fillStyle = "#c9c4d4";
      for (let x = start; x < W - PAD - lw - 12; x += 8) g.fillRect(x, y - 8, 3, 3);
    };
    const note = (text: string) => {
      y += 30;
      g.font = `500 20px ${FONT}`;
      g.fillStyle = SUB;
      g.textAlign = "left";
      g.fillText(text, PAD + 14, y);
    };
    const dash = () => {
      y += 28;
      g.fillStyle = "#b9b3c6";
      for (let x = PAD; x < W - PAD; x += 14) g.fillRect(x, y, 7, 2);
      y += 44;
    };

    center("갓생 영수증", `800 56px ${FONT}`);
    y += 36;
    center("GODSAENG MART", `600 20px ${FONT}`, SUB);
    y += 36;
    center(`키링 #${r.keyringId} · 누적 매칭 ${r.meetTotal}회`, `500 22px ${FONT}`, SUB);
    y += 32;
    center(`${r.printedAt} · No.${r.receiptNo}`, `500 22px ${FONT}`, SUB);
    dash();

    for (const l of r.usage) {
      row(l.label, l.value);
      if (l.note) note(l.note);
      y += 44;
    }
    y -= 44;
    dash();

    g.font = `500 20px ${FONT}`;
    g.fillStyle = SUB;
    g.textAlign = "left";
    g.fillText(`목표 ${r.goal.toLocaleString("ko-KR")}보`, PAD, y);
    y += 20;
    const blocks = 24;
    const filled = Math.min(blocks, Math.round((r.rate / 100) * blocks));
    const bw = (W - PAD * 2) / blocks;
    for (let i = 0; i < blocks; i++) {
      g.fillStyle = i < filled ? INK : "#e4e0ea";
      g.fillRect(PAD + i * bw + 1, y, bw - 3, 22);
    }
    y += 64;
    row("달성률", `${r.rate}%`);
    dash();

    for (const l of r.points) {
      row(l.label, l.value);
      if (l.note) note(l.note);
      y += 44;
    }
    y -= 20;
    g.fillStyle = INK;
    g.fillRect(PAD, y, W - PAD * 2, 3);
    g.fillRect(PAD, y + 8, W - PAD * 2, 3);
    y += 76;
    g.font = `800 26px ${FONT}`;
    g.textAlign = "left";
    g.fillText("합계", PAD, y);
    g.font = `800 56px ${FONT}`;
    g.textAlign = "right";
    g.fillText(`${r.total.toLocaleString("ko-KR")}P`, W - PAD, y + 6);

    // 도장
    g.save();
    g.translate(W / 2 - 40, y - 12);
    g.rotate(-0.2);
    g.strokeStyle = r.achieved ? "#c2408f" : "#8a8499";
    g.fillStyle = g.strokeStyle;
    g.lineWidth = 4;
    g.strokeRect(-92, -40, 184, 76);
    g.font = `800 32px ${FONT}`;
    g.textAlign = "center";
    g.fillText(r.achieved ? "결제완료" : "적립중", 0, 4);
    g.font = `700 16px ${FONT}`;
    g.fillText(`GOAL ${r.rate}%`, 0, 28);
    g.restore();

    y += 40;
    dash();
    center(r.achieved ? "✦ 오늘 갓생 완료 ✦" : "✦ 오늘도 갓생 적립 중 ✦", `800 24px ${FONT}`);
    dash();

    // 바코드
    const bars = barcodeBars(r.barcode);
    const unit = (W - PAD * 2 - 40) / bars.reduce((s, [b, gap]) => s + b + gap, 0);
    let x = PAD + 20;
    g.fillStyle = INK;
    for (const [b, gap] of bars) {
      g.fillRect(x, y - 20, b * unit, 90);
      x += (b + gap) * unit;
    }
    y += 104;
    center(r.barcode, `600 22px ${FONT}`);
    y += 60;
    center("이미 걸은 걸음은 교환 · 환불되지 않습니다.", `500 20px ${FONT}`, SUB);
    y += 30;
    center("영수증은 오늘 자정까지 유효합니다.", `500 20px ${FONT}`, SUB);

    return await new Promise((res) => c.toBlob((b) => res(b), "image/png"));
  } catch {
    return null;
  }
}
