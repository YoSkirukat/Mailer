const ENVELOPE = {
  body: { x: 4, y: 8, w: 24, h: 15, r: 2 },
  flap: [
    [4, 10.5],
    [16, 19],
    [28, 10.5],
  ] as const,
  stroke: 2.25,
};

function envelopeSvg(stroke: string, background: string): string {
  const { body, flap, stroke: sw } = ENVELOPE;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${background}"/>
  <rect x="${body.x}" y="${body.y}" width="${body.w}" height="${body.h}" rx="${body.r}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M${flap[0][0]} ${flap[0][1]}L${flap[1][0]} ${flap[1][1]}L${flap[2][0]} ${flap[2][1]}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

export const FAVICON_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(envelopeSvg("#ffffff", "#4f8cff"));

function drawEnvelope(
  ctx: CanvasRenderingContext2D,
  stroke: string,
  background: string
) {
  const { body, flap, stroke: lineWidth } = ENVELOPE;

  ctx.fillStyle = background;
  ctx.beginPath();
  ctx.roundRect(0, 0, 32, 32, 7);
  ctx.fill();

  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.roundRect(body.x, body.y, body.w, body.h, body.r);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(flap[0][0], flap[0][1]);
  ctx.lineTo(flap[1][0], flap[1][1]);
  ctx.lineTo(flap[2][0], flap[2][1]);
  ctx.stroke();
}

export function buildFaviconDataUrl(bright: boolean): string {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return FAVICON_DATA_URL;

  drawEnvelope(
    ctx,
    bright ? "#ffffff" : "rgba(255,255,255,0.55)",
    bright ? "#4f8cff" : "#b8d4ff"
  );

  return canvas.toDataURL("image/png");
}

let faviconOn = "";
let faviconOff = "";

export function getFaviconUrls() {
  if (!faviconOn) {
    faviconOn = buildFaviconDataUrl(true);
    faviconOff = buildFaviconDataUrl(false);
  }
  return { on: faviconOn, off: faviconOff };
}
