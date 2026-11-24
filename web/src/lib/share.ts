"use client";

import QRCode from "qrcode";

export async function qrDataUrl(text: string, size = 360) {
  return QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: "#2a2350", light: "#ffffff" } });
}

/** 스토리/이미지 공유용 초대 카드 PNG */
export async function inviteImage(famName: string, code: string, url: string): Promise<Blob | null> {
  try {
    const W = 1080;
    const H = 1920;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d");
    if (!g) return null;
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, "#b9a6ff");
    bg.addColorStop(0.5, "#f6c4ea");
    bg.addColorStop(1, "#bfeee0");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(255,255,255,0.75)";
    roundRect(g, 120, 420, W - 240, 1080, 72);
    g.fill();
    g.fillStyle = "#2a2350";
    g.textAlign = "center";
    g.font = "bold 72px 'Pretendard Variable', Pretendard, sans-serif";
    g.fillText(famName, W / 2, 560);
    g.font = "500 40px 'Pretendard Variable', Pretendard, sans-serif";
    g.fillStyle = "#77708f";
    g.fillText("Pairy 팸에 초대할게요", W / 2, 630);
    const qr = new Image();
    qr.src = await qrDataUrl(url, 520);
    await qr.decode();
    g.drawImage(qr, (W - 520) / 2, 700, 520, 520);
    g.font = "bold 64px 'Pretendard Variable', Pretendard, sans-serif";
    g.fillStyle = "#5b3fe0";
    g.fillText(`PAIRY-${code}`, W / 2, 1340);
    return await new Promise((r) => c.toBlob((b) => r(b), "image/png"));
  } catch {
    return null;
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

type NdefWriter = { write: (msg: { records: { recordType: string; data: string }[] }) => Promise<void> };

export const canWriteNfc = () => typeof window !== "undefined" && "NDEFReader" in window;

/** 안드로이드 크롬: NFC 태그(또는 키링 태그)에 초대 주소 쓰기 */
export async function writeNfcUrl(url: string) {
  const Reader = (window as unknown as { NDEFReader: new () => NdefWriter }).NDEFReader;
  const r = new Reader();
  await r.write({ records: [{ recordType: "url", data: url }] });
}

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
