import React, { useEffect, useRef } from 'react';
import { SkinOption } from '../types/game';

interface SkinPreviewCanvasProps {
  skin: SkinOption;
  size?: number;
  animate?: boolean;
}

export const SkinPreviewCanvas: React.FC<SkinPreviewCanvasProps> = ({
  skin,
  size = 80,
  animate = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      ctx.clearRect(0, 0, size, size);

      const t = animate ? Date.now() * 0.003 : 0;
      const center = size / 2;
      const segmentCount = 6;
      const headRadius = size * 0.16;

      // Draw subtle glow
      ctx.save();
      ctx.fillStyle = skin.glowColor;
      ctx.beginPath();
      ctx.arc(center, center, size * 0.38, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // S-curve positions
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < segmentCount; i++) {
        const angle = t * 1.5 + (i * 0.6);
        const wave = Math.sin(angle) * (size * 0.14);
        const x = center + (i - 1.5) * (headRadius * 0.7);
        const y = center + wave;
        pts.push({ x, y });
      }

      // Draw body segments (from tail to neck)
      for (let i = pts.length - 1; i >= 1; i--) {
        const pt = pts[i];
        const segR = headRadius * (0.65 + 0.35 * (1 - i / segmentCount));
        const color = skin.bodyColors[i % skin.bodyColors.length];

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, segR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(pt.x - segR * 0.3, pt.y - segR * 0.3, segR * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw Head (Segment 0)
      const head = pts[0];
      ctx.fillStyle = skin.headColor;
      ctx.beginPath();
      ctx.arc(head.x, head.y, headRadius, 0, Math.PI * 2);
      ctx.fill();

      // Eyes (High-Definition Expressive 3D Eyes with dual sparkle)
      const eyeR = headRadius * 0.40;
      const eyeOffsetSide = headRadius * 0.52;
      const eyeOffsetForward = -headRadius * 0.15;
      const eyePositions = [
        { x: head.x + eyeOffsetForward, y: head.y - eyeOffsetSide },
        { x: head.x + eyeOffsetForward, y: head.y + eyeOffsetSide },
      ];

      eyePositions.forEach((pos) => {
        ctx.save();
        ctx.translate(pos.x, pos.y);

        // 1. Dark rim
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        ctx.arc(0, 0, eyeR + 1, 0, Math.PI * 2);
        ctx.fill();

        // 2. Pearlescent Sclera
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, eyeR, 0, Math.PI * 2);
        ctx.fill();

        // 3. Colored Iris
        const irisR = eyeR * 0.70;
        ctx.fillStyle = skin.eyeColor || '#0ea5e9';
        ctx.beginPath();
        ctx.arc(-eyeR * 0.15, 0, irisR, 0, Math.PI * 2);
        ctx.fill();

        // 4. Obsidian Pupil
        const pupilR = irisR * 0.52;
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.arc(-eyeR * 0.15, 0, pupilR, 0, Math.PI * 2);
        ctx.fill();

        // 5. Dual Sparkles
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-eyeR * 0.15 - pupilR * 0.35, -pupilR * 0.35, pupilR * 0.42, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.arc(-eyeR * 0.15 + pupilR * 0.3, pupilR * 0.3, pupilR * 0.22, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      });

      if (animate) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [skin, size, animate]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="block pointer-events-none drop-shadow-md"
    />
  );
};
