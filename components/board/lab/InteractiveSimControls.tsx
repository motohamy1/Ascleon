"use client";

import React, { useMemo, useState } from "react";
import { Sliders, RotateCcw } from "lucide-react";
import { LabParamControl, LabSceneDescriptor } from "@/types/lesson-board";
import { sampleSimCurves } from "@/lib/board/rig-solver";

interface InteractiveSimChartProps {
  scene: Extract<LabSceneDescriptor, { tier: "interactive-sim" }>;
  paramValues: Record<string, number>;
  onParamChange: (name: string, val: number) => void;
  onResetParams: () => void;
}

export function InteractiveSimChart({
  scene,
  paramValues,
  onParamChange,
  onResetParams,
}: InteractiveSimChartProps) {
  const [hoverX, setHoverX] = useState<number | null>(null);

  const sampled = useMemo(
    () => sampleSimCurves(scene.curves, scene.xRange, paramValues, 80),
    [scene.curves, scene.xRange, paramValues]
  );

  const W = 540;
  const H = 290;
  const padL = 56;
  const padR = 20;
  const padT = 22;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const [xMin, xMax] = scene.xRange;
  const [yMin, yMax] = scene.yRange;
  const xSpan = Math.max(0.001, xMax - xMin);
  const ySpan = Math.max(0.001, yMax - yMin);

  const mapX = (x: number) => padL + ((x - xMin) / xSpan) * plotW;
  const mapY = (y: number) =>
    padT + plotH - Math.max(0, Math.min(1, (y - yMin) / ySpan)) * plotH;

  const hoverPointInfo = useMemo(() => {
    if (hoverX === null || sampled.length === 0) return null;
    const pts = sampled[0].points;
    let best = pts[0];
    let bestDist = Infinity;
    for (const p of pts) {
      const d = Math.abs(p.x - hoverX);
      if (d < bestDist) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }, [hoverX, sampled]);

  return (
    <div className="flex flex-col h-full w-full bg-[#FCFBF8] text-[#18181B]">
      {/* Chart Header */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-1.5 bg-white">
        <div className="min-w-0">
          <div className="truncate font-sans text-xs font-black text-[#18181B]">
            {scene.title}
          </div>
          <div className="font-mono text-[9.5px] font-bold text-slate-500">
            Computed live by Ascleon Engine — not guessed by AI
          </div>
        </div>
        <button
          type="button"
          onClick={onResetParams}
          title="Reset simulation sliders"
          className="cursor-pointer flex items-center gap-1 rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 font-mono text-[9.5px] font-bold hover:bg-[#ff4c00]/15"
        >
          <RotateCcw className="size-2.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Live SVG Plot */}
      <div className="relative flex-1 min-h-[160px] p-2 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-full max-h-[280px] select-none"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const relX = ((e.clientX - rect.left) / rect.width) * W;
            const worldX = xMin + ((relX - padL) / plotW) * xSpan;
            if (worldX >= xMin && worldX <= xMax) setHoverX(worldX);
            else setHoverX(null);
          }}
          onMouseLeave={() => setHoverX(null)}
        >
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const gy = padT + plotH * (1 - t);
            const val = yMin + ySpan * t;
            return (
              <g key={`yg-${t}`}>
                <line
                  x1={padL}
                  y1={gy}
                  x2={W - padR}
                  y2={gy}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                <text
                  x={padL - 8}
                  y={gy + 3}
                  textAnchor="end"
                  fontSize="10"
                  fontFamily="monospace"
                  fill="#64748B"
                >
                  {Math.round(val)}
                </text>
              </g>
            );
          })}

          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const gx = padL + plotW * t;
            const val = xMin + xSpan * t;
            return (
              <g key={`xg-${t}`}>
                <line
                  x1={gx}
                  y1={padT}
                  x2={gx}
                  y2={padT + plotH}
                  stroke="#E2E8F0"
                  strokeWidth={1}
                />
                <text
                  x={gx}
                  y={padT + plotH + 15}
                  textAnchor="middle"
                  fontSize="10"
                  fontFamily="monospace"
                  fill="#64748B"
                >
                  {Number(val.toFixed(1))}
                </text>
              </g>
            );
          })}

          {/* Axes */}
          <line
            x1={padL}
            y1={padT}
            x2={padL}
            y2={padT + plotH}
            stroke="#18181B"
            strokeWidth={2}
          />
          <line
            x1={padL}
            y1={padT + plotH}
            x2={W - padR}
            y2={padT + plotH}
            stroke="#18181B"
            strokeWidth={2}
          />

          {/* Axis Labels */}
          <text
            x={padL + plotW / 2}
            y={H - 6}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#334155"
          >
            {scene.xLabel}
          </text>
          <text
            x={14}
            y={padT + plotH / 2}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill="#334155"
            transform={`rotate(-90, 14, ${padT + plotH / 2})`}
          >
            {scene.yLabel}
          </text>

          {/* Plotted Curves */}
          {sampled.map((curve, idx) => {
            const d = curve.points
              .map(
                (pt, i) =>
                  `${i === 0 ? "M" : "L"} ${mapX(pt.x).toFixed(1)} ${mapY(pt.y).toFixed(1)}`
              )
              .join(" ");
            return (
              <path
                key={curve.label}
                d={d}
                fill="none"
                stroke={curve.color}
                strokeWidth={idx === 0 ? 3.2 : 2.2}
                strokeDasharray={idx > 0 ? "6 5" : undefined}
                strokeLinecap="round"
              />
            );
          })}

          {/* Hover Crosshair */}
          {hoverPointInfo && (
            <g>
              <line
                x1={mapX(hoverPointInfo.x)}
                y1={padT}
                x2={mapX(hoverPointInfo.x)}
                y2={padT + plotH}
                stroke="#FF4C00"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
              <circle
                cx={mapX(hoverPointInfo.x)}
                cy={mapY(hoverPointInfo.y)}
                r={5}
                fill="#FF4C00"
                stroke="#FFFFFF"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {/* Legend & Live Readout */}
        <div className="pointer-events-none absolute top-3 right-3 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-2xs">
          {sampled.map((c) => (
            <div key={c.label} className="flex items-center gap-1.5 text-[10px] font-bold">
              <span
                className="inline-block w-3 h-1 rounded-full"
                style={{ backgroundColor: c.color }}
              />
              <span>{c.label}</span>
            </div>
          ))}
          {hoverPointInfo && (
            <div className="border-t border-slate-200 pt-1 font-mono text-[10px] font-black text-[#FF4C00]">
              x={hoverPointInfo.x.toFixed(1)} → y={hoverPointInfo.y.toFixed(1)}
            </div>
          )}
        </div>
      </div>

      {/* Parameter Sliders */}
      {scene.params.length > 0 && (
        <SimSliderBar
          controls={scene.params}
          values={paramValues}
          onChange={onParamChange}
          note={scene.readoutLabel}
        />
      )}
    </div>
  );
}

export function SimSliderBar({
  controls,
  values,
  onChange,
  note,
}: {
  controls: LabParamControl[];
  values: Record<string, number>;
  onChange: (name: string, val: number) => void;
  note?: string;
}) {
  return (
    <div className="border-t border-black/15 bg-[#FCFBF8] px-3 py-2 space-y-1.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        {controls.map((ctrl) => {
          const val = values[ctrl.name] ?? ctrl.value;
          return (
            <label key={ctrl.name} className="flex flex-col gap-0.5 text-[10px]">
              <div className="flex items-center justify-between gap-2 font-bold text-zinc-700">
                <span className="flex items-center gap-1 truncate">
                  <Sliders className="size-2.5 text-[#ff4c00] shrink-0" />
                  <span className="truncate">{ctrl.label}</span>
                </span>
                <span className="font-mono font-black text-[#18181B] shrink-0">
                  {Number(val.toFixed(2))}
                  {ctrl.unit || ""}
                </span>
              </div>
              <input
                type="range"
                min={ctrl.min}
                max={ctrl.max}
                step={ctrl.step ?? (ctrl.max - ctrl.min) / 25}
                value={val}
                onChange={(e) => onChange(ctrl.name, Number(e.target.value))}
                className="w-full accent-[#ff4c00] cursor-pointer h-1.5 rounded-full focus:outline-none focus-visible:!shadow-none focus-visible:!outline-2 focus-visible:!outline-[#ff4c00] focus-visible:outline-offset-2"
              />
            </label>
          );
        })}
      </div>
      {note && (
        <div className="font-mono text-[9.5px] font-semibold text-zinc-500 truncate">
          {note}
        </div>
      )}
    </div>
  );
}
