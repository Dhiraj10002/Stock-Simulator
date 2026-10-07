"use client";

import { useEffect, useRef } from "react";

const colors = ["rgb(6,182,212)", "rgb(249,115,22)", "rgb(16,185,129)", "rgb(251,191,36)", "rgb(168,85,247)", "rgb(244,114,182)"];

export default function SpatialCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current, context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const circle = new Path2D();
    circle.arc(0, 0, 1, 0, Math.PI * 2);
    const root = canvas.closest<HTMLElement>(".landing-experience")!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = matchMedia("(max-width: 767px)");
    let width = 0, height = 0, frame = 0, previousTime = 0, offsetX = 0, offsetY = 0;
    const particles = Array.from({ length: 400 }, (_, i) => ({
      x: (Math.random() - 0.5) * 2200, y: (Math.random() - 0.5) * 2200,
      z: Math.random() * 1000 + 1, size: Math.random() * 2.2 + 0.8, color: colors[i % colors.length],
    }));
    const draw = (time: number) => {
      frame = 0;
      if (document.hidden) return;
      if (time - previousTime >= 33 || reduced.matches) {
        const drift = reduced.matches ? 0 : Math.min((time - previousTime) / 33, 2) * 0.85;
        previousTime = time;
        context.resetTransform();
        context.clearRect(0, 0, width, height);
        offsetX += ((Number(root.dataset.pointerX) || 0) * 15 - offsetX) * 0.04;
        offsetY += ((Number(root.dataset.pointerY) || 0) * 15 - offsetY) * 0.04;
        const count = mobile.matches ? 100 : particles.length;
        for (let i = 0; i < count; i++) {
          const particle = particles[i];
          particle.z -= drift;
          if (particle.z <= 0) particle.z = 1000;
          const scale = 400 / particle.z;
          const x = particle.x * scale + width / 2 + offsetX, y = particle.y * scale + height / 2 + offsetY;
          if (x < 0 || x > width || y < 0 || y > height) continue;
          const radius = Math.max(0.65, particle.size * scale * 0.8);
          context.setTransform(radius, 0, 0, radius, x, y);
          context.fillStyle = particle.color;
          context.globalAlpha = Math.min(1, Math.max(0.1, (1 - particle.z / 1000) * 1.3));
          context.fill(circle);
        }
        context.resetTransform();
        context.globalAlpha = 1;
        root.dataset.motionReady = "true";
      }
      if (!reduced.matches) frame = requestAnimationFrame(draw);
    };
    const restart = () => {
      cancelAnimationFrame(frame); frame = 0; previousTime = 0;
      if (!document.hidden) frame = requestAnimationFrame(draw);
    };
    const resize = () => { width = canvas.width = innerWidth; height = canvas.height = innerHeight; restart(); };
    resize();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", restart);
    reduced.addEventListener("change", restart); mobile.addEventListener("change", restart);
    return () => {
      cancelAnimationFrame(frame); delete root.dataset.motionReady;
      window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", restart);
      reduced.removeEventListener("change", restart); mobile.removeEventListener("change", restart);
    };
  }, []);
  return <canvas ref={canvasRef} aria-hidden className="fixed inset-0 pointer-events-none z-0" style={{ opacity: 0.9 }} />;
}
