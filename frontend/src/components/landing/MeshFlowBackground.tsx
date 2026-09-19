"use client";

import React, { useRef, useEffect, useCallback } from "react";

interface GridPoint {
  x: number;
  y: number;
  originX: number;
  originY: number;
  vx: number;
  vy: number;
}

interface MeshFlowProps {
  className?: string;
  gridSpacing?: number;
  dotRadius?: number;
  influenceRadius?: number;
  sigma?: number;
  maxDisplacement?: number;
  damping?: number;
  springStrength?: number;
  attractionStrength?: number;
  dotColor?: string;
  lineColor?: string;
  activeDotColor?: string;
  activeLineColor?: string;
}

export default function MeshFlowBackground({
  className = "",
  gridSpacing = 44,
  dotRadius = 1.2,
  influenceRadius = 160,
  sigma = 85,
  maxDisplacement = 28,
  damping = 0.88,
  springStrength = 0.045,
  attractionStrength = 0.6,
  dotColor = "rgba(255, 255, 255, 0.04)",
  lineColor = "rgba(255, 255, 255, 0.025)",
  activeDotColor = "rgba(6, 182, 212, 0.35)",
  activeLineColor = "rgba(6, 182, 212, 0.12)",
}: MeshFlowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const pointsRef = useRef<GridPoint[]>([]);
  const colsRef = useRef(0);
  const rowsRef = useRef(0);
  const animRef = useRef<number>(0);

  const initGrid = useCallback(
    (width: number, height: number) => {
      const cols = Math.ceil(width / gridSpacing) + 2;
      const rows = Math.ceil(height / gridSpacing) + 2;
      colsRef.current = cols;
      rowsRef.current = rows;

      const points: GridPoint[] = [];
      const offsetX = (width - (cols - 1) * gridSpacing) / 2;
      const offsetY = (height - (rows - 1) * gridSpacing) / 2;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = offsetX + col * gridSpacing;
          const y = offsetY + row * gridSpacing;
          points.push({
            x,
            y,
            originX: x,
            originY: y,
            vx: 0,
            vy: 0,
          });
        }
      }
      pointsRef.current = points;
    },
    [gridSpacing]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initGrid(width, height);
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 };
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    const twoSigmaSquared = 2 * sigma * sigma;
    const influenceRadiusSq = influenceRadius * influenceRadius;

    const animate = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const { width, height } = parent.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);

      const points = pointsRef.current;
      const cols = colsRef.current;
      const rows = rowsRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // Physics update
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const dx = mx - p.originX;
        const dy = my - p.originY;
        const distSq = dx * dx + dy * dy;

        if (distSq < influenceRadiusSq && distSq > 0.01) {
          const gaussian = Math.exp(-distSq / twoSigmaSquared);
          const force = gaussian * attractionStrength;
          p.vx += dx * force * 0.02;
          p.vy += dy * force * 0.02;
        }

        // Spring force back to origin
        const sx = p.originX - p.x;
        const sy = p.originY - p.y;
        p.vx += sx * springStrength;
        p.vy += sy * springStrength;

        // Damping
        p.vx *= damping;
        p.vy *= damping;

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Clamp displacement
        const cdx = p.x - p.originX;
        const cdy = p.y - p.originY;
        const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (cdist > maxDisplacement) {
          const ratio = maxDisplacement / cdist;
          p.x = p.originX + cdx * ratio;
          p.y = p.originY + cdy * ratio;
        }
      }

      // Draw lines
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const idx = row * cols + col;
          const p = points[idx];

          // Proximity factor for color
          const pdx = mx - p.x;
          const pdy = my - p.y;
          const pDistSq = pdx * pdx + pdy * pdy;
          const proximity = Math.max(
            0,
            1 - pDistSq / (influenceRadiusSq * 1.5)
          );

          // Horizontal line
          if (col < cols - 1) {
            const next = points[idx + 1];
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(next.x, next.y);
            ctx.strokeStyle =
              proximity > 0.01
                ? activeLineColor.replace(
                    /[\d.]+\)$/,
                    `${proximity * 0.12})`
                  )
                : lineColor;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }

          // Vertical line
          if (row < rows - 1) {
            const below = points[idx + cols];
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(below.x, below.y);
            ctx.strokeStyle =
              proximity > 0.01
                ? activeLineColor.replace(
                    /[\d.]+\)$/,
                    `${proximity * 0.12})`
                  )
                : lineColor;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      // Draw dots
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const pdx = mx - p.x;
        const pdy = my - p.y;
        const pDistSq = pdx * pdx + pdy * pdy;
        const proximity = Math.max(
          0,
          1 - pDistSq / (influenceRadiusSq * 1.2)
        );

        ctx.beginPath();
        ctx.arc(
          p.x,
          p.y,
          dotRadius + proximity * 1.5,
          0,
          Math.PI * 2
        );
        ctx.fillStyle =
          proximity > 0.01
            ? activeDotColor.replace(
                /[\d.]+\)$/,
                `${0.04 + proximity * 0.35})`
              )
            : dotColor;
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resizeCanvas);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [
    initGrid,
    gridSpacing,
    dotRadius,
    influenceRadius,
    sigma,
    maxDisplacement,
    damping,
    springStrength,
    attractionStrength,
    dotColor,
    lineColor,
    activeDotColor,
    activeLineColor,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-auto z-0 ${className}`}
      style={{ display: "block" }}
    />
  );
}
