"use client";

export function CompSparkline({
  values,
  width = 108,
  height = 36,
  rising,
}: {
  values: number[];
  width?: number;
  height?: number;
  rising?: boolean | null;
}) {
  if (values.length === 0) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padX = 3;
  const padY = 4;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const points = values.map((v, i) => {
    const x = padX + (values.length === 1 ? innerW / 2 : (i / (values.length - 1)) * innerW);
    const y = padY + innerH - ((v - min) / span) * innerH;
    return { x, y };
  });
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const last = points[points.length - 1]!;
  const area = `${padX},${padY + innerH} ${line} ${last.x},${padY + innerH}`;
  const stroke =
    rising === true ? "#0f766e" : rising === false ? "#b42318" : "#0c2340";
  const fill =
    rising === true ? "rgba(15,118,110,0.16)" : rising === false ? "rgba(180,35,24,0.14)" : "rgba(12,35,64,0.12)";

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block shrink-0"
      aria-hidden
    >
      <line
        x1={padX}
        x2={width - padX}
        y1={padY + innerH}
        y2={padY + innerH}
        stroke="#e2e8f0"
        strokeWidth={1}
      />
      <polygon points={area} fill={fill} />
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last.x} cy={last.y} r={2.25} fill={stroke} />
    </svg>
  );
}
