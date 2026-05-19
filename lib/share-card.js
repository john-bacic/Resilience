/**
 * Client-side renderer for the "I just finished N days" completion share card.
 *
 * Renders a 1080x1920 portrait PNG via <canvas>, then hands the blob to the
 * Web Share API (with file fallback to download). Stays fully client-side so:
 *   1) no diary content ever leaves the device,
 *   2) zero serverless cost,
 *   3) it works offline (PWA-friendly).
 *
 * Public API:
 *   renderCompletionShareBlob({ completion, breakdown, url }) -> Promise<Blob>
 *   shareOrDownloadBlob(blob, fileName) -> Promise<"shared" | "downloaded" | "cancelled" | "error">
 */

const W = 1080;
const H = 1920;
const PADDING = 80;
const SYSTEM_FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "Inter", sans-serif`;

const STOIC_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 33" width="29" height="33" fill="none">
<path fill="currentColor" d="M19.4532 15.354C19.3348 15.4178 19.3131 15.4802 19.342 15.6107C19.4677 16.1605 19.5933 16.7132 19.7002 17.2702C19.8446 18.0534 19.2669 18.7628 18.484 18.7628C15.8409 18.7671 13.1962 18.7628 10.5531 18.7628C9.57381 18.7628 9.1954 17.8867 9.31095 17.2441C9.41494 16.6798 9.54349 16.1155 9.66194 15.5513C9.66916 15.5034 9.64316 15.4251 9.60706 15.399C9.37451 15.2423 9.1261 15.1059 8.8892 14.9464C7.38417 13.9542 6.27491 12.6211 5.62488 10.943C4.85646 8.96013 4.98215 6.98454 5.86464 5.061C6.33404 4.04705 6.99991 3.17527 7.83476 2.43259C9.25025 1.17062 10.8896 0.37861 12.763 0.0928638C13.0288 0.0522485 13.3032 0.0333906 13.5733 0.00728229C13.5733 2.93962e-05 15.5434 -0.0144758 15.8987 0.0406441C16.0691 0.066754 16.2425 0.0885129 16.4129 0.121875C18.7528 0.567205 20.7129 1.67395 22.2147 3.54223C23.2431 4.8158 23.8006 6.28956 23.8742 7.92745C23.9479 9.49113 23.5449 10.946 22.7202 12.2762C21.9027 13.5947 20.7905 14.5927 19.4559 15.3542L19.4532 15.354ZM10.8117 7.24825C9.67354 7.26711 8.7737 8.18097 8.77084 9.35443C8.76651 10.5352 9.68802 11.4302 10.8969 11.4418C12.0134 11.449 12.9826 10.4423 12.9378 9.3588C12.9898 8.33037 12.1275 7.23083 10.8117 7.24971V7.24825ZM18.103 7.24825C16.9677 7.26711 16.0693 8.18097 16.0693 9.35734C16.065 10.5381 16.9865 11.4287 18.1954 11.4403C19.3119 11.4476 20.2768 10.4409 20.2334 9.35734C20.2854 8.32892 19.4275 7.22938 18.103 7.24825Z"/>
<path fill="currentColor" d="M0.645509 28.4554C1.06011 28.244 1.47899 28.0385 1.89359 27.8315C2.76006 27.3968 3.62369 26.9577 4.49019 26.5216C6.20165 25.6626 7.91605 24.8066 9.63173 23.9476C9.66473 23.9284 9.69485 23.9018 9.73789 23.8722C9.56574 23.7894 9.41511 23.7214 9.26447 23.6445C6.85581 22.4336 4.45009 21.2183 2.03999 20.0075C1.55222 19.7621 1.06304 19.5196 0.578144 19.2654C0.0789242 19.0081 -0.152047 18.3753 0.107601 17.8505C0.411732 17.234 0.724463 16.616 1.00709 15.9876C1.23519 15.4805 1.85205 15.1627 2.48327 15.4923C3.30527 15.9241 4.14022 16.3395 4.9737 16.7564C6.24761 17.3922 7.52296 18.0205 8.79681 18.6607C10.6445 19.5877 12.4911 20.5191 14.3429 21.4432C14.4132 21.4772 14.5266 21.4772 14.5997 21.4432C15.0071 21.2539 15.4074 21.0529 15.8119 20.8533C17.2996 20.1111 18.783 19.3659 20.2707 18.6237C22.1844 17.6657 24.0938 16.7091 26.0075 15.7511C26.2313 15.6417 26.4522 15.5204 26.6832 15.4288C27.171 15.2395 27.6716 15.4095 27.9169 15.8871C28.2583 16.545 28.5782 17.2192 28.8939 17.8933C29.0732 18.2763 29.0258 18.6548 28.7475 18.9608C28.5897 19.1308 28.3803 19.2669 28.1708 19.3733C25.2443 20.8459 22.3165 22.311 19.3898 23.7792C19.3382 23.8058 19.2908 23.8354 19.2105 23.8783C19.298 23.9241 19.3496 23.9537 19.4013 23.9803C19.8675 24.2109 20.3338 24.4342 20.8 24.6693C22.9562 25.7515 25.1152 26.8382 27.2713 27.9249C27.6386 28.1097 28.0058 28.2915 28.3731 28.4852C28.9426 28.7839 29.1262 29.3028 28.8795 29.9046C28.825 30.0376 28.7618 30.1662 28.7001 30.2949C28.4434 30.8242 28.2009 31.3653 27.9212 31.8813C27.6529 32.3692 27.1608 32.5244 26.6544 32.3204C26.544 32.2745 26.4378 32.2213 26.3316 32.1696C25.0276 31.5191 23.7279 30.8641 22.428 30.2121C21.025 29.5084 19.6191 28.8076 18.216 28.1082C17.0296 27.5139 15.8432 26.9195 14.661 26.3178C14.5433 26.2572 14.4515 26.2572 14.3339 26.3178C13.5664 26.7081 12.7945 27.0896 12.027 27.4754C10.7417 28.123 9.45627 28.778 8.17089 29.4211C6.26864 30.3747 4.36645 31.3284 2.46408 32.279C2.25893 32.381 2.04517 32.4461 1.80991 32.3928C1.46129 32.313 1.20021 32.1208 1.0381 31.7911C0.725352 31.1583 0.416918 30.5226 0.115648 29.8868C0.056829 29.7656 0.0195322 29.6222 0.0166615 29.4891C-0.00198823 28.9939 0.251933 28.6642 0.666516 28.4527L0.645509 28.4554Z"/>
</svg>`;

/** Replace `currentColor` in the brand SVG with an explicit hex for canvas. */
function brandMarkSvg(color) {
  return STOIC_MARK_SVG.replace(/currentColor/g, color);
}

/** Decode an SVG string to a same-size HTMLImageElement (no network). */
async function svgToImage(svgString) {
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });
    }
    return img;
  } finally {
    // Defer revoke so the image stays valid until drawImage runs.
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/** Greedy word-wrap; returns up to `maxLines` of text, truncating with an ellipsis. */
function wrapText(ctx, text, maxWidth, maxLines = 8) {
  const words = String(text).trim().split(/\s+/);
  const lines = [];
  let current = "";
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && current) {
    let last = lines[maxLines - 1];
    while (ctx.measureText(`${last}…`).width > maxWidth && last.length > 1) {
      last = last.slice(0, -1);
    }
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

function drawTextBlock(ctx, text, x, y, maxWidth, lineHeight, font, color, opts = {}) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = opts.align || "left";
  const maxLines = opts.maxLines ?? 8;
  const lines = wrapText(ctx, text, maxWidth, maxLines);
  lines.forEach((line, i) => {
    ctx.fillText(line, x, y + (i + 1) * lineHeight);
  });
  return y + lines.length * lineHeight;
}

function programLengthLabel(n) {
  const map = { 7: "7-day", 30: "30-day", 90: "90-day", 180: "180-day", 365: "365-day" };
  return map[n] || `${n}-day`;
}

function safeArr(a) {
  return Array.isArray(a) ? a : [];
}

export async function renderCompletionShareBlob({ completion, breakdown, url }) {
  if (typeof document === "undefined") {
    throw new Error("renderCompletionShareBlob must run in a browser");
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  // -------- 1. Background --------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#ecfdf5"); // emerald-50
  bg.addColorStop(0.45, "#ffffff");
  bg.addColorStop(1, "#fffbeb"); // amber-50
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Inner frame
  ctx.strokeStyle = "rgba(16,185,129,0.22)";
  ctx.lineWidth = 4;
  roundedRect(ctx, 32, 32, W - 64, H - 64, 56);
  ctx.stroke();

  // -------- 2. Brand row --------
  const brandTop = 110;
  try {
    const mark = await svgToImage(brandMarkSvg("#0f172a"));
    const markH = 78;
    const markW = (markH / 33) * 29;
    ctx.drawImage(mark, PADDING, brandTop, markW, markH);
    ctx.font = `700 48px ${SYSTEM_FONT}`;
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText("STOIC AF", PADDING + markW + 24, brandTop + 38);
    ctx.font = `400 26px ${SYSTEM_FONT}`;
    ctx.fillStyle = "#64748b";
    ctx.fillText(
      `${programLengthLabel(completion.programLength)} resilience`,
      PADDING + markW + 24,
      brandTop + 72
    );
  } catch {
    // SVG decode failed — render the wordmark only, still ship the card.
    ctx.font = `700 56px ${SYSTEM_FONT}`;
    ctx.fillStyle = "#0f172a";
    ctx.fillText("STOIC AF", PADDING, brandTop + 56);
  }

  // -------- 3. Eyebrow chip --------
  const chipY = 280;
  const chipText = "YOU JUST FINISHED";
  ctx.font = `700 22px ${SYSTEM_FONT}`;
  const chipW = ctx.measureText(chipText).width + 60;
  const chipX = (W - chipW) / 2;
  ctx.fillStyle = "rgba(16,185,129,0.14)";
  roundedRect(ctx, chipX, chipY, chipW, 50, 25);
  ctx.fill();
  ctx.strokeStyle = "rgba(5,150,105,0.55)";
  ctx.lineWidth = 2;
  roundedRect(ctx, chipX, chipY, chipW, 50, 25);
  ctx.stroke();
  ctx.fillStyle = "#047857"; // emerald-700
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(chipText, W / 2, chipY + 27);

  // -------- 4. Big number (baseline low enough that glyph ascender clears the chip) --------
  const bigY = 630;
  ctx.font = `800 360px ${SYSTEM_FONT}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  const grad = ctx.createLinearGradient(0, bigY - 280, 0, bigY);
  grad.addColorStop(0, "#065f46"); // emerald-800
  grad.addColorStop(1, "#10b981"); // emerald-500
  ctx.fillStyle = grad;
  ctx.fillText(String(completion.programLength), W / 2, bigY);

  ctx.font = `500 46px ${SYSTEM_FONT}`;
  ctx.fillStyle = "#0f172a";
  ctx.fillText("days of emotional armor.", W / 2, bigY + 80);

  // -------- 5. Amber takeaway card --------
  const takeY = 790;
  const takeH = 320;
  const takeX = PADDING;
  const takeW = W - PADDING * 2;
  const takeR = 36;
  const takeBg = ctx.createLinearGradient(0, takeY, 0, takeY + takeH);
  takeBg.addColorStop(0, "#fef3c7"); // amber-100
  takeBg.addColorStop(1, "#fff7ed");
  ctx.fillStyle = takeBg;
  roundedRect(ctx, takeX, takeY, takeW, takeH, takeR);
  ctx.fill();
  // Left accent: clip to card so the strip follows rounded corners (no “floating” bar)
  ctx.save();
  roundedRect(ctx, takeX, takeY, takeW, takeH, takeR);
  ctx.clip();
  ctx.fillStyle = "#f59e0b"; // amber-500
  ctx.fillRect(takeX, takeY, 14, takeH);
  ctx.restore();
  // Ring outline
  ctx.strokeStyle = "rgba(245,158,11,0.55)";
  ctx.lineWidth = 4;
  roundedRect(ctx, takeX, takeY, takeW, takeH, takeR);
  ctx.stroke();
  // Eyebrow
  ctx.font = `700 22px ${SYSTEM_FONT}`;
  ctx.fillStyle = "#92400e";
  ctx.textAlign = "left";
  ctx.fillText("★  YOUR TAKEAWAY", takeX + 40, takeY + 56);
  // Body — prefer AI overview, fall back to top lesson or a generic line
  const takeawayText =
    String(completion.overview || "").trim() ||
    safeArr(breakdown?.topLessons)[0]?.[0] ||
    `I built ${completion.programLength} days of evidence that I'm not run by my reactions.`;
  ctx.font = `600 38px ${SYSTEM_FONT}`;
  drawTextBlock(
    ctx,
    takeawayText,
    takeX + 40,
    takeY + 80,
    takeW - 80,
    50,
    `600 38px ${SYSTEM_FONT}`,
    "#451a03",
    { maxLines: 4 }
  );

  // -------- 6. Patterns block --------
  const patY = 1160;
  ctx.font = `700 24px ${SYSTEM_FONT}`;
  ctx.fillStyle = "#047857";
  ctx.textAlign = "left";
  ctx.fillText("PATTERNS THE AI SAW", PADDING, patY);

  const patterns = safeArr(completion.patterns).slice(0, 3);
  let patCursorY = patY + 28;
  if (patterns.length === 0) {
    ctx.font = `500 28px ${SYSTEM_FONT}`;
    ctx.fillStyle = "#475569";
    drawTextBlock(
      ctx,
      "Daily practice, journal, mood pulse, AI weekly read — the system that compounds.",
      PADDING,
      patCursorY,
      W - PADDING * 2,
      38,
      `500 28px ${SYSTEM_FONT}`,
      "#475569",
      { maxLines: 3 }
    );
    patCursorY += 38 * 3;
  } else {
    for (const p of patterns) {
      const text = String(p || "").trim();
      if (!text) continue;
      // Bullet dot
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.arc(PADDING + 8, patCursorY + 30, 7, 0, Math.PI * 2);
      ctx.fill();
      const after = drawTextBlock(
        ctx,
        text,
        PADDING + 32,
        patCursorY,
        W - PADDING * 2 - 32,
        38,
        `500 28px ${SYSTEM_FONT}`,
        "#1e293b",
        { maxLines: 3 }
      );
      patCursorY = after + 14;
      if (patCursorY > 1500) break;
    }
  }

  // -------- 6b. Feelings named (affect labels) --------
  // Surfaced as a single line because they're the highest-signal pattern per
  // Lieberman 2007 — the recurring word(s) the user kept landing on.
  const feelings = safeArr(breakdown?.topFeelings)
    .map(([word]) => String(word || "").trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 4);
  if (feelings.length > 0) {
    const feelY = Math.min(patCursorY + 12, 1520);
    ctx.font = `700 22px ${SYSTEM_FONT}`;
    ctx.fillStyle = "#9f1239"; // rose-800
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("FEELINGS YOU NAMED", PADDING, feelY);
    ctx.font = `600 28px ${SYSTEM_FONT}`;
    ctx.fillStyle = "#1e293b";
    drawTextBlock(
      ctx,
      feelings.join("  ·  "),
      PADDING,
      feelY + 4,
      W - PADDING * 2,
      40,
      `600 28px ${SYSTEM_FONT}`,
      "#1e293b",
      { maxLines: 1 }
    );
  }

  // -------- 7. Stat tiles --------
  const statY = 1570;
  const tileH = 130;
  const gap = 24;
  const tileW = (W - PADDING * 2 - gap * 2) / 3;

  const entries = breakdown?.entryCount ?? completion?.diaryCount ?? 0;
  const distinct = breakdown?.distinctDays ?? 0;
  const moodAvg =
    breakdown?.moodDeltas?.avgDelta != null
      ? `${breakdown.moodDeltas.avgDelta >= 0 ? "+" : ""}${breakdown.moodDeltas.avgDelta.toFixed(1)}`
      : "—";

  const tiles = [
    { label: "ENTRIES", value: String(entries) },
    { label: "LOGGED DAYS", value: String(distinct) },
    { label: "AVG MOOD SHIFT", value: moodAvg }
  ];

  tiles.forEach((tile, i) => {
    const x = PADDING + i * (tileW + gap);
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    roundedRect(ctx, x, statY, tileW, tileH, 24);
    ctx.fill();
    ctx.strokeStyle = "rgba(16,185,129,0.32)";
    ctx.lineWidth = 2;
    roundedRect(ctx, x, statY, tileW, tileH, 24);
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = `700 52px ${SYSTEM_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(tile.value, x + tileW / 2, statY + 70);
    ctx.font = `600 18px ${SYSTEM_FONT}`;
    ctx.fillStyle = "#64748b";
    ctx.fillText(tile.label, x + tileW / 2, statY + 104);
  });

  // -------- 8. Footer / CTA --------
  const footY = H - 175;
  ctx.font = `600 30px ${SYSTEM_FONT}`;
  ctx.fillStyle = "#0f172a";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  drawTextBlock(
    ctx,
    "How to never be affected by anything or anyone.",
    W / 2,
    footY,
    W - PADDING * 2,
    44,
    `600 30px ${SYSTEM_FONT}`,
    "#0f172a",
    { align: "center", maxLines: 2 }
  );

  const cleanUrl = String(url || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (cleanUrl) {
    ctx.font = `500 26px ${SYSTEM_FONT}`;
    ctx.fillStyle = "#047857";
    ctx.fillText(cleanUrl, W / 2, footY + 110);
  }

  // -------- Export --------
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("canvas.toBlob returned null"));
      },
      "image/png",
      0.95
    );
  });
}

/**
 * Try Web Share API with a file; fall back to triggering a download.
 * Resolves to a status string the UI can use for toast copy.
 */
export async function shareOrDownloadBlob(blob, fileName) {
  if (typeof navigator === "undefined") return "error";
  const file = new File([blob], fileName, { type: blob.type || "image/png" });
  const canShareFiles =
    typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  if (canShareFiles && typeof navigator.share === "function") {
    try {
      await navigator.share({ files: [file], title: "STOIC AF" });
      return "shared";
    } catch (err) {
      if (err && (err.name === "AbortError" || /abort/i.test(String(err.message)))) {
        return "cancelled";
      }
      // fall through to download
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return "downloaded";
  } catch {
    return "error";
  }
}
