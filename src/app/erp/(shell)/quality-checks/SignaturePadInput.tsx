"use client";

import { useRef, useState } from "react";

type SignaturePadInputProps = {
  value: string;
  onChange: (value: string) => void;
};

export function SignaturePadInput({ value, onChange }: SignaturePadInputProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  function getContext() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
    return ctx;
  }

  function pointForEvent(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function saveSignature() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getContext();
    if (!ctx) return;
    const point = pointForEvent(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setDrawing(true);
    setHasDrawn(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const ctx = getContext();
    if (!ctx) return;
    const point = pointForEvent(e);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDrawing(false);
    saveSignature();
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onChange("");
  }

  return (
    <div className="space-y-3">
      {value && !hasDrawn ? (
        <div className="rounded-md border border-gray-200 bg-white p-3">
          <p className="mb-2 text-xs font-medium text-gray-600">Current signature</p>
          <img src={value} alt="Supervisor signature" className="max-h-28 max-w-full rounded bg-white object-contain" />
        </div>
      ) : null}
      <canvas
        ref={canvasRef}
        width={900}
        height={260}
        className="h-40 w-full touch-none rounded-md border border-gray-300 bg-white"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrawing(false)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={clearSignature}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-pink-300"
        >
          Clear signature
        </button>
        <p className="text-xs text-gray-500">Sign with a mouse, trackpad, stylus, or finger.</p>
      </div>
    </div>
  );
}
