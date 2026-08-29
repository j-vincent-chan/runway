/**
 * Browser-only SVG → PNG rasterization via native canvas — kept out of
 * changeImage.ts so the SVG builder stays importable in node tests.
 */
export async function svgToPngBlob(
  svg: string,
  width: number,
  height: number,
  scale = 2
): Promise<Blob> {
  const image = new Image();
  image.decoding = "sync";
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not render the distribution image."));
    image.src = url;
  });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not render the distribution image.");
  ctx.scale(scale, scale);
  ctx.drawImage(image, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render the distribution image."));
    }, "image/png");
  });
}
