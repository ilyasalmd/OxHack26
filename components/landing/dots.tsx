"use client";
import { useEffect, useRef } from "react";

/**
 * A quiet field of dots behind the sign-in screens. Near the pointer the dots ease away and grow,
 * then spring back; with no pointer (phones) they breathe in a slow wave. Canvas, one draw per
 * frame, nothing allocated in the loop. Reduced motion gets a still grid.
 */
export function DotField({ spacing = 26, color = "rgba(0,0,0,0.26)", className = "" }: { spacing?: number; color?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = matchMedia("(pointer: fine)").matches;

    let w = 0, h = 0, dpr = 1;
    let bx = new Float32Array(0), by = new Float32Array(0), ox = new Float32Array(0), oy = new Float32Array(0), vx = new Float32Array(0), vy = new Float32Array(0);
    let n = 0;
    const pointer = { x: -1e4, y: -1e4, on: false };
    let raf = 0;
    let t0 = performance.now();

    function layout() {
      const r = parent!.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cols = Math.ceil(w / spacing) + 1, rows = Math.ceil(h / spacing) + 1;
      n = cols * rows;
      bx = new Float32Array(n); by = new Float32Array(n);
      ox = new Float32Array(n); oy = new Float32Array(n);
      vx = new Float32Array(n); vy = new Float32Array(n);
      // Offset every other row so the grid reads as a texture, not graph paper.
      let i = 0;
      for (let r2 = 0; r2 < rows; r2++) for (let c = 0; c < cols; c++, i++) {
        bx[i] = c * spacing + (r2 % 2 ? spacing / 2 : 0) + (w % spacing) / 2 - spacing / 2;
        by[i] = r2 * spacing + (h % spacing) / 2 - spacing / 2;
      }
      if (still) draw(0);
    }

    const R = 140, PUSH = 22, K = 0.085, DAMP = 0.78;
    function draw(now: number) {
      const t = (now - t0) / 1000;
      ctx!.clearRect(0, 0, w, h);
      ctx!.fillStyle = color;
      for (let i = 0; i < n; i++) {
        let s = 1;
        if (!still) {
          // Pointer: push away with a soft falloff, and grow a little.
          const dx = bx[i] + ox[i] - pointer.x, dy = by[i] + oy[i] - pointer.y;
          const d2 = dx * dx + dy * dy;
          let tx = 0, ty = 0;
          if (pointer.on && d2 < R * R) {
            const d = Math.sqrt(d2) || 1;
            const f = (1 - d / R) ** 2;
            tx = (dx / d) * f * PUSH;
            ty = (dy / d) * f * PUSH;
            s += f * 1.6;
          }
          // No pointer to play with: a slow breath across the field.
          if (!pointer.on) ty += Math.sin(t * 0.9 + bx[i] * 0.012 + by[i] * 0.008) * 1.6;
          vx[i] = (vx[i] + (tx - ox[i]) * K) * DAMP;
          vy[i] = (vy[i] + (ty - oy[i]) * K) * DAMP;
          ox[i] += vx[i];
          oy[i] += vy[i];
        }
        const x = bx[i] + ox[i], y = by[i] + oy[i];
        ctx!.beginPath();
        ctx!.arc(x, y, 1.5 * s, 0, 6.2832);
        ctx!.fill();
      }
    }
    function loop(now: number) {
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    const move = (e: PointerEvent) => {
      const r = parent!.getBoundingClientRect();
      pointer.x = e.clientX - r.left;
      pointer.y = e.clientY - r.top;
      pointer.on = finePointer || e.pointerType === "touch";
    };
    const leave = () => { pointer.on = false; pointer.x = pointer.y = -1e4; };
    const ro = new ResizeObserver(layout);
    ro.observe(parent);
    layout();
    if (!still) {
      window.addEventListener("pointermove", move, { passive: true });
      window.addEventListener("pointerdown", move, { passive: true });
      window.addEventListener("pointerup", leave);
      window.addEventListener("pointercancel", leave);
      document.addEventListener("pointerleave", leave);
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerdown", move);
      window.removeEventListener("pointerup", leave);
      window.removeEventListener("pointercancel", leave);
      document.removeEventListener("pointerleave", leave);
    };
  }, [spacing, color]);

  return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 ${className}`} />;
}
