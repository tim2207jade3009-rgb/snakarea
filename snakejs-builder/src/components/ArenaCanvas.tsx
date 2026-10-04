import React, { useRef, useEffect, useCallback } from 'react';
import { Snake, FoodOrb } from '../types/game';
import { ARENA_RADIUS } from '../hooks/useSnakeArena';

interface ArenaCanvasProps {
  snakesRef: React.MutableRefObject<Snake[]>;
  orbsRef: React.MutableRefObject<FoodOrb[]>;
  playerSnakeRef: React.MutableRefObject<Snake | null>;
  onPointerMove: (x: number, y: number, width: number, height: number) => void;
  onSetBoosting: (boosting: boolean) => void;
  fireAuraActive: boolean;
  shieldActive?: boolean;
  frostActive?: boolean;
}

const ArenaCanvasComponent: React.FC<ArenaCanvasProps> = ({
  snakesRef,
  orbsRef,
  playerSnakeRef,
  onPointerMove,
  onSetBoosting,
  fireAuraActive,
  shieldActive,
  frostActive,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMouseDownRef = useRef(false);
  const isSpaceDownRef = useRef(false);
  const shakeRef = useRef(0);

  // Helper to sync overall boost state
  const updateBoostState = useCallback(() => {
    const shouldBoost = isMouseDownRef.current || isSpaceDownRef.current;
    if (shouldBoost && !isMouseDownRef.current && playerSnakeRef.current) {
        // Just started boosting
        shakeRef.current = Math.max(shakeRef.current, 1.5);
    }
    onSetBoosting(shouldBoost);
  }, [onSetBoosting]);

  // Handle fatal collisions and boosts for screenshake
  useEffect(() => {
    const player = playerSnakeRef.current;
    if (player?.dead) {
       shakeRef.current = 15; // Big shake on death
    } else if (player?.isBoosting) {
       shakeRef.current = Math.max(shakeRef.current, 0.8); // Subtle continuous shake while boosting
    }
  }, [playerSnakeRef.current?.dead, playerSnakeRef.current?.isBoosting]);

  // Resize handler with multi-pass orientation change support
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const w = window.innerWidth || document.documentElement.clientWidth;
      const h = window.innerHeight || document.documentElement.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      handleResize();
      setTimeout(handleResize, 100);
      setTimeout(handleResize, 300);
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  // Mouse, Keyboard & Touch events for reliable steering & boost
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointerMove = (e: PointerEvent) => {
      onPointerMove(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    };

    const handlePointerDown = (e: PointerEvent) => {
      // Only trigger boost via mouse click on desktop.
      // On touch devices, steering should not trigger click-to-boost to avoid getting stuck.
      if (e.pointerType === 'mouse') {
        if (e.button === 0 || e.button === 2) {
          isMouseDownRef.current = true;
          updateBoostState();
        }
      } else {
        // Direct steering
        onPointerMove(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        isMouseDownRef.current = false;
        updateBoostState();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isSpaceDownRef.current) {
        isSpaceDownRef.current = true;
        updateBoostState();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpaceDownRef.current = false;
        updateBoostState();
      }
    };

    const handleWindowBlur = () => {
      isMouseDownRef.current = false;
      isSpaceDownRef.current = false;
      updateBoostState();
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);

    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);

      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [onPointerMove, updateBoostState]);

  // Main Render Loop (60 FPS)
  const render = useCallback(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const player = playerSnakeRef.current;
      const snakes = snakesRef.current;
      const orbs = orbsRef.current;

      // Camera origin centered on player with finite number guarantees
      const camX = player && Number.isFinite(player.x) ? player.x : 0;
      const camY = player && Number.isFinite(player.y) ? player.y : 0;

      // Zoom scale: smooth camera zoom based on mass, fully guarded against NaN/Infinity
      const rawMass = player ? player.mass : 40;
      const safePlayerMass = Number.isFinite(rawMass) && rawMass > 1 ? rawMass : 40;
      const zoom = Math.min(1.4, Math.max(0.42, 1.08 - Math.pow(safePlayerMass, 0.32) * 0.038));

      ctx.save();
      ctx.clearRect(0, 0, width, height);

      // Dark sleek arena background
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, width, height);

      // Apply Camera transform
      ctx.translate(width / 2, height / 2);

      // Apply Screenshake
      if (shakeRef.current > 0.1) {
        const sx = (Math.random() - 0.5) * shakeRef.current;
        const sy = (Math.random() - 0.5) * shakeRef.current;
        ctx.translate(sx, sy);
        shakeRef.current *= 0.92; // Decay
      }

      ctx.scale(zoom, zoom);
      ctx.translate(-camX, -camY);

      // 1. Draw Hexagonal / Grid Floor inside Arena (Strictly bounded and finite - zero chance of infinite loop)
      const gridSize = 100;
      const halfW = (width / zoom) / 2;
      const halfH = (height / zoom) / 2;
      const rawStartX = Math.floor((camX - halfW) / gridSize) * gridSize;
      const rawEndX = Math.ceil((camX + halfW) / gridSize) * gridSize;
      const rawStartY = Math.floor((camY - halfH) / gridSize) * gridSize;
      const rawEndY = Math.ceil((camY + halfH) / gridSize) * gridSize;

      // Strictly clamp grid lines to Arena bounds
      const startGridX = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, Number.isFinite(rawStartX) ? rawStartX : -ARENA_RADIUS));
      const endGridX = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, Number.isFinite(rawEndX) ? rawEndX : ARENA_RADIUS));
      const startGridY = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, Number.isFinite(rawStartY) ? rawStartY : -ARENA_RADIUS));
      const endGridY = Math.max(-ARENA_RADIUS, Math.min(ARENA_RADIUS, Number.isFinite(rawEndY) ? rawEndY : ARENA_RADIUS));

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (Number.isFinite(startGridX) && Number.isFinite(endGridX) && endGridX >= startGridX) {
        let iters = 0;
        for (let x = startGridX; x <= endGridX && iters < 200; x += gridSize, iters++) {
          ctx.moveTo(x, startGridY);
          ctx.lineTo(x, endGridY);
        }
      }
      if (Number.isFinite(startGridY) && Number.isFinite(endGridY) && endGridY >= startGridY) {
        let iters = 0;
        for (let y = startGridY; y <= endGridY && iters < 200; y += gridSize, iters++) {
          ctx.moveTo(startGridX, y);
          ctx.lineTo(endGridX, y);
        }
      }
      ctx.stroke();

      // 2. Draw Arena Boundary Force-Field
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2);
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#ef4444';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;
      ctx.stroke();

      // Outer forbidden zone tint
      ctx.lineWidth = 100;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.stroke();
      ctx.restore();

      // 3. Draw Food Orbs (Visible in camera viewport)
      const viewLeft = camX - (width / zoom) / 2 - 50;
      const viewRight = camX + (width / zoom) / 2 + 50;
      const viewTop = camY - (height / zoom) / 2 - 50;
      const viewBottom = camY + (height / zoom) / 2 + 50;

      const time = Date.now() * 0.003;

      for (let i = 0; i < orbs.length; i++) {
        const orb = orbs[i];
        if (orb.x < viewLeft || orb.x > viewRight || orb.y < viewTop || orb.y > viewBottom) {
          continue;
        }

        const pulse = 1 + Math.sin(time + orb.pulseOffset) * 0.12;
        const r = orb.radius * pulse;

        // Glow halo for energy pellets & dropped orbs
        if (orb.value >= 2) {
          ctx.fillStyle = orb.color;
          ctx.globalAlpha = 0.42;
          ctx.beginPath();
          ctx.arc(orb.x, orb.y, r * 1.85, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }

        ctx.fillStyle = orb.color;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
        ctx.fill();

        // Specular shine center
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(orb.x - r * 0.25, orb.y - r * 0.25, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      // Helper to draw a single snake cleanly
      const drawSnake = (s: Snake) => {
        if (!s || !s.segments || s.segments.length === 0) return;
        const head = s.segments[0];
        if (!head || isNaN(head.x) || isNaN(head.y)) return;

        const bodyRadius = 12 + Math.sqrt(Math.max(1, s.mass || 40)) * 1.0;
        const skin = s.skin || { headColor: '#00f0ff', bodyColors: ['#00f0ff'], eyeColor: '#00f0ff', glowColor: '#00f0ff' };
        const bodyColors = (skin.bodyColors && skin.bodyColors.length > 0) ? skin.bodyColors : [skin.headColor || '#00f0ff'];

        // Draw Boost Flames behind snake if boosting
        if (s.isBoosting) {
          ctx.save();
          ctx.fillStyle = skin.headColor || '#fbbf24';
          ctx.globalAlpha = 0.45;
          ctx.shadowColor = skin.headColor || '#fbbf24';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(head.x, head.y, bodyRadius * 1.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Spawn protection shimmering aura
        const isSpawnProtected = s.spawnProtectionUntil && s.spawnProtectionUntil > Date.now();
        if (isSpawnProtected) {
          ctx.save();
          const shieldPulse = Math.sin(Date.now() * 0.012) * 3;
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(head.x, head.y, bodyRadius * 1.55 + shieldPulse, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
          ctx.fill();
          ctx.restore();
        }

        // Draw Body Segments (from tail to neck)
        for (let k = s.segments.length - 1; k >= 1; k--) {
          const seg = s.segments[k];
          if (!seg) continue;
          if (seg.x < viewLeft - 80 || seg.x > viewRight + 80 || seg.y < viewTop - 80 || seg.y > viewBottom + 80) {
            continue;
          }

          const taper = 0.75 + 0.25 * (1 - (k / s.segments.length));
          const segR = bodyRadius * taper;
          const color = bodyColors[k % bodyColors.length];

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(seg.x, seg.y, segR, 0, Math.PI * 2);
          ctx.fill();

          // 3D Spherical volume highlight
          ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
          ctx.beginPath();
          ctx.arc(seg.x - segR * 0.25, seg.y - segR * 0.25, segR * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }

        // Draw Snake Head (Segment 0)
        ctx.save();
        ctx.translate(head.x, head.y);
        ctx.rotate(isNaN(s.angle) ? 0 : s.angle);

        // Head Base with animated glow support
        ctx.fillStyle = skin.headColor || '#00f0ff';
        ctx.shadowColor = skin.glowColor || skin.headColor || '#00f0ff';
        if (skin.animated) {
          ctx.shadowBlur = (s.isPlayer ? 16 : 8) + Math.sin(Date.now() * 0.006) * 6;
        } else {
          ctx.shadowBlur = s.isPlayer ? 12 : 5;
        }
        ctx.beginPath();
        ctx.arc(0, 0, bodyRadius * 1.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // ─── High-Definition Expressive 3D Eyes ───
        const eyeOffsetForward = bodyRadius * 0.38;
        const eyeOffsetSide = bodyRadius * 0.54;
        const eyeRadius = bodyRadius * 0.40;
        const eyePositions = [
          { x: eyeOffsetForward, y: -eyeOffsetSide },
          { x: eyeOffsetForward, y: eyeOffsetSide },
        ];

        eyePositions.forEach((pos) => {
          ctx.save();
          ctx.translate(pos.x, pos.y);

          // 1. Outer Eyeliner / Contour Shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.beginPath();
          ctx.arc(0, 0, eyeRadius + 1.2, 0, Math.PI * 2);
          ctx.fill();

          // 2. Sclera
          const scleraGrad = ctx.createRadialGradient(
            -eyeRadius * 0.2, -eyeRadius * 0.2, eyeRadius * 0.1,
            0, 0, eyeRadius
          );
          scleraGrad.addColorStop(0, '#ffffff');
          scleraGrad.addColorStop(0.75, '#f8fafc');
          scleraGrad.addColorStop(1, '#cbd5e1');

          ctx.fillStyle = scleraGrad;
          ctx.beginPath();
          ctx.arc(0, 0, eyeRadius, 0, Math.PI * 2);
          ctx.fill();

          // 3. Iris
          const irisRadius = eyeRadius * 0.72;
          const pupilTrackX = eyeRadius * 0.22;
          const pupilTrackY = 0;

          const irisGrad = ctx.createRadialGradient(
            pupilTrackX, pupilTrackY, irisRadius * 0.1,
            pupilTrackX, pupilTrackY, irisRadius
          );
          const irisBaseColor = skin.eyeColor || '#0ea5e9';
          irisGrad.addColorStop(0, '#ffffff');
          irisGrad.addColorStop(0.25, irisBaseColor);
          irisGrad.addColorStop(0.85, irisBaseColor);
          irisGrad.addColorStop(1, '#020617');

          ctx.fillStyle = irisGrad;
          ctx.beginPath();
          ctx.arc(pupilTrackX, pupilTrackY, irisRadius, 0, Math.PI * 2);
          ctx.fill();

          // Iris outer ring
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // 4. Deep Obsidian Pupil
          const pupilRadius = irisRadius * (s.isBoosting ? 0.48 : 0.54);
          ctx.fillStyle = '#020617';
          ctx.beginPath();
          ctx.arc(pupilTrackX, pupilTrackY, pupilRadius, 0, Math.PI * 2);
          ctx.fill();

          // 5. Specular Highlights
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(255, 255, 255, 0.8)';
          ctx.shadowBlur = 2;
          ctx.beginPath();
          ctx.arc(
            pupilTrackX + pupilRadius * 0.38,
            pupilTrackY - pupilRadius * 0.38,
            pupilRadius * 0.42,
            0,
            Math.PI * 2
          );
          ctx.fill();

          ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
          ctx.shadowBlur = 0;
          ctx.beginPath();
          ctx.arc(
            pupilTrackX - pupilRadius * 0.35,
            pupilTrackY + pupilRadius * 0.35,
            pupilRadius * 0.22,
            0,
            Math.PI * 2
          );
          ctx.fill();

          ctx.restore();
        });

        ctx.restore();

        // ─── Blue Energy Shield Circle around Head ───────────────────
        if (s.isPlayer && shieldActive) {
          ctx.save();
          const now = Date.now();
          const shieldRadius = bodyRadius * 1.8 + Math.sin(now * 0.008) * 3.5;

          const shieldGrad = ctx.createRadialGradient(head.x, head.y, bodyRadius * 0.4, head.x, head.y, shieldRadius);
          shieldGrad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
          shieldGrad.addColorStop(0.65, 'rgba(14, 165, 233, 0.28)');
          shieldGrad.addColorStop(1, 'rgba(56, 189, 248, 0.5)');

          ctx.fillStyle = shieldGrad;
          ctx.beginPath();
          ctx.arc(head.x, head.y, shieldRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3.5;
          ctx.shadowColor = '#38bdf8';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(head.x, head.y, shieldRadius, 0, Math.PI * 2);
          ctx.stroke();

          const angleOffset = (now * 0.004) % (Math.PI * 2);
          ctx.strokeStyle = '#a5f3fc';
          ctx.lineWidth = 2.2;
          ctx.shadowColor = '#06b6d4';
          ctx.shadowBlur = 10;

          ctx.beginPath();
          ctx.arc(head.x, head.y, shieldRadius + 3.5, angleOffset, angleOffset + Math.PI * 0.65);
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(head.x, head.y, shieldRadius + 3.5, angleOffset + Math.PI, angleOffset + Math.PI * 1.65);
          ctx.stroke();

          const innerPulseR = bodyRadius * 1.35 + Math.cos(now * 0.012) * 2;
          ctx.strokeStyle = 'rgba(224, 242, 254, 0.75)';
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(head.x, head.y, innerPulseR, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        }

        // Name & Mass Label over snake head
        ctx.save();
        ctx.font = `600 ${Math.max(11, Math.min(15, 11 + bodyRadius * 0.18))}px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = s.isPlayer ? '#38bdf8' : '#e2e8f0';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(s.name, head.x, head.y - bodyRadius - 12);
        ctx.font = `500 ${Math.max(9, Math.min(12, 9 + bodyRadius * 0.14))}px monospace`;
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(`${Math.floor(s.mass || 0)}`, head.x, head.y - bodyRadius - 1);
        ctx.restore();
      };

      // 4. Draw All Snakes (Bots/Other players, Local player on top)
      for (let i = 0; i < snakes.length; i++) {
        const s = snakes[i];
        if (!s || s.dead) continue;

        if (!s.isPlayer) {
          // Proximity fire aura visual indicator: if enemy head is near player head
          if (fireAuraActive && player && !player.dead && player.segments && player.segments.length > 0) {
            const pHead = player.segments[0];
            const eHead = s.segments && s.segments.length > 0 ? s.segments[0] : null;
            if (pHead && eHead) {
              const dist = Math.hypot(eHead.x - pHead.x, eHead.y - pHead.y);
              if (dist < 320) {
                ctx.save();
                ctx.strokeStyle = '#f97316';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(eHead.x, eHead.y, 30, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
              }
            }
          }

          // Frost Slow Effect on Enemies
          if (frostActive && s.segments && s.segments.length > 0 && s.segments[0]) {
            const enemyHead = s.segments[0];
            const eRadius = Math.max(12, 10 + Math.pow(Math.max(1, s.mass), 0.32) * 1.5);
            ctx.save();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5;
            ctx.shadowColor = '#06b6d4';
            ctx.shadowBlur = 10;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(enemyHead.x, enemyHead.y, eRadius * 1.6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }

          drawSnake(s);
        }
      }

      if (player && !player.dead) {
        drawSnake(player);
      }

      // 5. Frost Screen Overlay Vignette
      if (frostActive) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const grad = ctx.createRadialGradient(
          width / 2, height / 2, Math.min(width, height) * 0.35,
          width / 2, height / 2, Math.max(width, height) * 0.72
        );
        grad.addColorStop(0, 'rgba(6, 182, 212, 0)');
        grad.addColorStop(1, 'rgba(6, 182, 212, 0.22)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.font = '700 12px "Outfit", sans-serif';
        ctx.fillStyle = '#67e8f9';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#0891b2';
        ctx.shadowBlur = 8;
        ctx.fillText('❄️ ONDE DE GIVRE ACTIVE : IA ET ENNEMIS RALENTIS DE 50% ❄️', width / 2, 72);
        ctx.restore();
      }

      ctx.restore();
    } catch (err) {
      console.error('ArenaCanvas render error caught:', err);
    }
  }, [snakesRef, orbsRef, playerSnakeRef, fireAuraActive, shieldActive, frostActive]);

  // Request Animation Frame loop for rendering (Resilient - never stops on error)
  useEffect(() => {
    let animId: number;
    let isRunning = true;

    const loop = () => {
      if (!isRunning) return;
      try {
        render();
      } catch (err) {
        console.error('Render loop iteration error:', err);
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => {
      isRunning = false;
      cancelAnimationFrame(animId);
    };
  }, [render]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none touch-none bg-slate-950">
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
      />
    </div>
  );
};

export const ArenaCanvas = React.memo(ArenaCanvasComponent);
