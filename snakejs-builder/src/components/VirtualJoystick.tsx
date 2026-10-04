import React, { useRef, useState, useCallback, useEffect } from 'react';

interface VirtualJoystickProps {
  onDirectionChange: (angle: number | null) => void;
  compact?: boolean;
}

const DEAD_ZONE = 8; // Ignore micro-jitters

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onDirectionChange, compact = false }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<boolean>(false);
  const [thumbPos, setThumbPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);
  const centerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const maxRadius = compact ? 36 : 46;

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerIdRef.current !== null) return;
    pointerIdRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);

    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    centerRef.current = { x: cx, y: cy };

    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > DEAD_ZONE) {
      const angle = Math.atan2(dy, dx);
      onDirectionChange(angle);
    }

    const clampedDist = Math.min(dist, maxRadius);
    const clampedAngle = Math.atan2(dy, dx);
    setThumbPos({
      x: Math.cos(clampedAngle) * clampedDist,
      y: Math.sin(clampedAngle) * clampedDist,
    });
    setActive(true);
  }, [onDirectionChange, maxRadius]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerIdRef.current) return;

    const dx = e.clientX - centerRef.current.x;
    const dy = e.clientY - centerRef.current.y;
    const dist = Math.hypot(dx, dy);

    if (dist > DEAD_ZONE) {
      const angle = Math.atan2(dy, dx);
      onDirectionChange(angle);
    }

    const clampedDist = Math.min(dist, maxRadius);
    const clampedAngle = Math.atan2(dy, dx);
    setThumbPos({
      x: Math.cos(clampedAngle) * clampedDist,
      y: Math.sin(clampedAngle) * clampedDist,
    });
  }, [onDirectionChange, maxRadius]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    setActive(false);
    setThumbPos({ x: 0, y: 0 });
    onDirectionChange(null);
  }, [onDirectionChange]);

  // Clean release if pointer cancel
  useEffect(() => {
    const handleGlobalUp = () => {
      if (pointerIdRef.current !== null) {
        pointerIdRef.current = null;
        setActive(false);
        setThumbPos({ x: 0, y: 0 });
        onDirectionChange(null);
      }
    };
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('pointercancel', handleGlobalUp);
    return () => {
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
    };
  }, [onDirectionChange]);

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }}
      className={`relative ${
        compact ? 'w-24 h-24' : 'w-28 h-28 sm:w-32 sm:h-32'
      } rounded-full border-2 transition-colors duration-150 flex items-center justify-center select-none cursor-pointer ${
        active
          ? 'bg-slate-900/70 border-sky-400/70 shadow-lg shadow-sky-500/20'
          : 'bg-slate-900/40 border-slate-700/50 hover:border-slate-600'
      } backdrop-blur-sm`}
    >
      {/* Direction Crosshairs */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-full h-px bg-white/10" />
        <div className="absolute h-full w-px bg-white/10" />
        <div className={`absolute ${compact ? 'w-12 h-12' : 'w-16 h-16'} rounded-full border border-white/5`} />
      </div>

      {/* Thumb Stick */}
      <div
        className={`${
          compact ? 'w-9 h-9' : 'w-11 h-11 sm:w-12 sm:h-12'
        } rounded-full border shadow-md flex items-center justify-center transition-transform duration-75 pointer-events-none ${
          active
            ? 'bg-gradient-to-br from-sky-400 to-emerald-400 border-white text-slate-950 scale-105 shadow-sky-400/40'
            : 'bg-slate-800/90 border-slate-600 text-slate-400'
        }`}
        style={{
          transform: `translate(${thumbPos.x}px, ${thumbPos.y}px)`,
        }}
      >
        <div className="w-3.5 h-3.5 rounded-full bg-white/40" />
      </div>
    </div>
  );
};
