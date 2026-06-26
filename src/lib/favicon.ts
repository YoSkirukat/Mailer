export const FAVICON_DATA_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">
  <rect x="8.5" y="11" width="15" height="11" rx="2" stroke="#4f8cff" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M8.5 12.75L16 18.25L23.5 12.75" stroke="#4f8cff" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`
  );

export function buildFaviconDataUrl(bright: boolean): string {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return FAVICON_DATA_URL;

  const bg = bright ? "#4f8cff" : "#b8d4ff";
  const stroke = bright ? "#ffffff" : "rgba(255,255,255,0.55)";

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 32, 32);

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.75;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeRect(6.5, 9.5, 19, 13);

  ctx.beginPath();
  ctx.moveTo(6, 11);
  ctx.lineTo(16, 18);
  ctx.lineTo(26, 11);
  ctx.stroke();

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
