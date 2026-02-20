// src/components/ClockTimePicker.tsx
import React, { useState } from 'react';
import './ClockTimePicker.css';

interface ClockTimePickerProps {
  value: string; // "HH:mm"
  onChange: (value: string) => void;
  onClose: () => void;
  isOpen: boolean;
}

const parseTime = (timeStr: string) => {
  if (!timeStr) return { h: 12, m: 0 };
  const [h, m] = timeStr.split(':').map(Number);
  return { h: isNaN(h) ? 12 : h, m: isNaN(m) ? 0 : m };
};

export const ClockTimePicker: React.FC<ClockTimePickerProps> = ({
  value,
  onChange,
  onClose,
  isOpen,
}) => {
  if (!isOpen) return null;

  const initial = parseTime(value);
  const [hours, setHours] = useState(initial.h);
  const [minutes, setMinutes] = useState(initial.m);
  const [mode, setMode] = useState<'h' | 'm'>('h');

  // Constants
  const SIZE = 240; // Diameter
  const CX = SIZE / 2;
  const CY = SIZE / 2;
  const R_OUTER = 96;
  const R_INNER = 64; // for 24h
  const R_MIN = R_OUTER; 

  // Format Helpers
  const formatTime = (h: number, m: number) => {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  const handleSave = () => {
    onChange(formatTime(hours, minutes));
    onClose();
  };

  // Convert angle to value
  const getValueFromAngle = (
    angle: number,
    dist: number,
    isHours: boolean
  ): number => {
    // atan2 returns angle relative to +X axis (3 o'clock).
    // Our clock: 12 is at -90deg (top).
    // Let's stick to standard: 0 deg = 3 o'clock.
    // 12 o'clock = 270 deg (-90).
    
    // We get angle in degrees [0, 360). 0 is 3 o'clock.
    // Clock numbers start at 12 (top) which is 270 deg.
    // Let's normalize so 0 deg is at 12 o'clock (top).
    let clockAngle = angle + 90; 
    if (clockAngle >= 360) clockAngle -= 360; 
    
    if (isHours) {
      // 12 steps of 30 degrees
      let step = Math.round(clockAngle / 30);
      if (step === 0) step = 12; // 0 deg is 12 o'clock

      // 24h Logic:
      // Inner circle (dist < split) -> 13..23, 00
      // Outer circle (dist > split) -> 1..12
      // Standard Android 24h: 13-00 is OUTER, 1-12 is INNER? 
      // Actually usually 1-12 is inner, 13-00 is outer. Let's check Material Design.
      // Material Design 24h: 00 is top of OUTER. 12 is top of INNER.
      // 13 is 1 o'clock position on OUTER. 1 is 1 o'clock position on INNER. 
      // OK so: 
      // OUTER ring = 0, 13, 14, ... 23
      // INNER ring = 12, 1, 2, ... 11? 
      
      // Let's implement:
      // Outer ring: 00 (top), 13 (1), 14 (2)... 23 (11)
      // Inner ring: 12 (top), 01 (1), 02 (2)... 11 (11)
      
      const isInner = dist < (R_OUTER + R_INNER) / 2; 

      if (isInner) {
         // Inner ring: 1..12
         // clockAngle 0 -> 12
         // clockAngle 30 -> 1
         // clockAngle 60 -> 2
         if (step === 0 || step === 12) return 12; // 12 is at 0 deg relative to top? No 0 deg at top is 12.
         return step;
      } else {
         // Outer ring: 00..23 (except 12)
         // 0 deg (top) -> 00
         // 30 deg (1) -> 13
         if (step === 12) return 0; // 00 hours
         return step + 12;
      }
    } else {
      // Minutes: 60 steps of 6 degrees
      let step = Math.round(clockAngle / 6);
      if (step === 60) step = 0;
      return step;
    }
  };

  const getPointer = (
    e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent,
    rect: DOMRect
  ) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as any).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as any).clientY;
    const x = clientX - rect.left - CX;
    const y = clientY - rect.top - CY;
    const dist = Math.sqrt(x * x + y * y);
    let angle = Math.atan2(y, x) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    return { angle, dist };
  };

  const handleInteraction = (e: any) => {
    // e.preventDefault(); // Sometimes prevents click?
    if (!e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { angle, dist } = getPointer(e, rect);

    if (mode === 'h') {
      const val = getValueFromAngle(angle, dist, true);
      setHours(val);
    } else {
      const val = getValueFromAngle(angle, dist, false);
      setMinutes(val);
    }
  };

  // Convert value to position for rendering
  const getPos = (val: number, isHours: boolean) => {
    // 0 hours -> top (00 or 12 or 24) -> -90 deg
    // 1 hours -> 30 deg - 90 = -60
    
    // For hours:
    // If val is 0 -> top outer
    // If val is 12 -> top inner
    // If val is 13 -> 1 outer -> 30 deg
    // If val is 1 -> 1 inner -> 30 deg
    
    let deg = 0;
    let r = R_OUTER;

    if (isHours) {
      if (val === 0) { deg = 0; r = R_OUTER; }
      else if (val === 12) { deg = 0; r = R_INNER; }
      else if (val > 12) { deg = (val - 12) * 30; r = R_OUTER; }
      else { deg = val * 30; r = R_INNER; }
    } else {
      deg = val * 6;
      r = R_MIN;
    }

    // Convert to radians usually starts 0 at 3 o'clock. 
    // We want 0 deg at 12 o'clock for the math above.
    // So subtract 90 from standard position?
    // standard: 0 = 3 o'clock ("0 deg")
    // logic above: 0 = 12 o'clock
    // so standard + 90 = logic
    // standard = logic - 90
    
    const rad = ((deg - 90) * Math.PI) / 180;
    const x = CX + r * Math.cos(rad);
    const y = CY + r * Math.sin(rad);
    return { x, y, r, deg: deg - 90 }; // return angle for line
  };

  // Switch to minutes after dragging hours (on mouse up)
  const handleMouseUp = () => {
    if (mode === 'h') {
      setTimeout(() => setMode('m'), 300);
    }
  };

  // Render numbers
  const renderNumbers = () => {
    const nums = [];
    if (mode === 'h') {
      // Outer: 00, 13..23
      // Positions: outer 00,13..23 / inner 12,01..11
      
      // Let's loop 0..23
      for (let i = 0; i < 24; i++) {
        // If i=0 -> top outer
        // If i=12 -> top inner
        // If i=13 -> 1 outer
        // If i=1 -> 1 inner
        
        const { x, y } = getPos(i, true);
        const isSelected = hours === i;
        
        // Skip rendering styling here, just position
        // We render two rings. 
        // Logic check:
        // i=0 (00) -> top outer
        // i=1 (01) -> 1 inner
        // i=12 (12) -> top inner
        // i=13 (13) -> 1 outer
        const isInner = (i > 0 && i <= 12);
        const text = i === 0 ? '00' : String(i);
        
        // We only render text if it's the number style
        nums.push(
          <div
            key={i}
            className={`clock-number ${isInner ? 'inner' : ''} ${isSelected ? 'selected' : ''}`}
            style={{ left: x, top: y }}
          >
            {text}
          </div>
        );
      }
    } else {
      // Minutes: 0, 5, 10...
      for (let i = 0; i < 60; i += 5) {
        const { x, y } = getPos(i, false);
        const isSelected = minutes === i;
        nums.push(
          <div
            key={i}
            className={`clock-number ${isSelected ? 'selected' : ''}`}
            style={{ left: x, top: y }}
          >
            {String(i).padStart(2, '0')}
          </div>
        );
      }
    }
    return nums;
  };

  // Hand position
  const handPos = getPos(mode === 'h' ? hours : minutes, mode === 'h');

  return (
    <div className="clock-overlay" onClick={onClose}>
      <div 
        className="clock-modal" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="clock-header">
           <div 
             className={`time-display ${mode === 'h' ? 'active' : ''}`}
             onClick={() => setMode('h')}
           >
             {String(hours).padStart(2, '0')}
           </div>
           <div className="time-separator">:</div>
           <div 
             className={`time-display ${mode === 'm' ? 'active' : ''}`}
             onClick={() => setMode('m')}
           >
             {String(minutes).padStart(2, '0')}
           </div>
        </div>
        
        <div className="clock-face-container">
          <div 
            className="clock-face"
            onMouseDown={(e) => {
               // Only left click
               if (e.button !== 0) return;
               handleInteraction(e);
            }}
            onMouseMove={(e) => {
              if (e.buttons === 1) handleInteraction(e);
            }}
            onMouseUp={handleMouseUp}
            // Touch support
            onTouchStart={handleInteraction}
            onTouchMove={handleInteraction}
            onTouchEnd={handleMouseUp}
          >
            {/* Hand & Selection Circle */}
            <svg 
              className="clock-hand-svg" 
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Line */}
              <line 
                x1={CX} y1={CY}
                x2={handPos.x} y2={handPos.y}
                className="clock-hand-line"
              />
              {/* Selection Circle (behind number) */}
              <circle 
                cx={handPos.x} cy={handPos.y}
                r={16}
                className="clock-selection-circle"
              />
              {/* Center Dot */}
              <circle cx={CX} cy={CY} r={4} className="clock-center-dot" />
            </svg>
            
            {renderNumbers()}
          </div>
        </div>

        <div className="clock-actions">
          <button className="clock-btn" onClick={onClose}>Cancel</button>
          <button className="clock-btn" onClick={handleSave}>OK</button>
        </div>
      </div>
    </div>
  );
};

export default ClockTimePicker;
