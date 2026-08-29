"use client";

import { useMemo } from "react";

// Standard Reed-Solomon GF(256) & QR Code Matrix generator for self-contained SVG rendering
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_EXP[i + 255] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF256_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j], factor);
      next[j + 1] ^= poly[j];
    }
    poly = next;
  }
  return poly;
}

function rsCompute(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ res[0];
    for (let j = 0; j < ecCount - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    res[ecCount - 1] = gfMul(gen[ecCount], factor);
  }
  return res;
}

// QR Code capacities and specs for Byte mode with Medium error correction (Version 1-10)
const QR_VERSIONS = [
  { version: 1, size: 21, totalDataBytes: 19, ecBytes: 10 },
  { version: 2, size: 25, totalDataBytes: 34, ecBytes: 16 },
  { version: 3, size: 29, totalDataBytes: 55, ecBytes: 26 },
  { version: 4, size: 33, totalDataBytes: 80, ecBytes: 36 },
  { version: 5, size: 37, totalDataBytes: 108, ecBytes: 48 },
  { version: 6, size: 41, totalDataBytes: 136, ecBytes: 64 },
  { version: 7, size: 45, totalDataBytes: 156, ecBytes: 72 },
  { version: 8, size: 49, totalDataBytes: 194, ecBytes: 88 },
  { version: 9, size: 53, totalDataBytes: 232, ecBytes: 110 },
  { version: 10, size: 57, totalDataBytes: 274, ecBytes: 130 },
];

function generateQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const textBytes = encoder.encode(text);
  const dataLen = textBytes.length;

  let chosen = QR_VERSIONS[0];
  for (const v of QR_VERSIONS) {
    if (v.totalDataBytes >= dataLen + 3) {
      chosen = v;
      break;
    }
    chosen = v;
  }

  const { size, totalDataBytes, ecBytes } = chosen;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    Array(size).fill(null),
  );

  // 1. Finder patterns
  const addFinder = (r: number, c: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        if (
          (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
          (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)
        ) {
          matrix[nr][nc] = true;
        } else {
          matrix[nr][nc] = false;
        }
      }
    }
  };
  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // 2. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (matrix[6][i] === null) matrix[6][i] = i % 2 === 0;
    if (matrix[i][6] === null) matrix[i][6] = i % 2 === 0;
  }

  // 3. Dark module & format reservations
  matrix[size - 8][8] = true;
  for (let i = 0; i < 9; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[8][i] = false;
  }
  for (let i = size - 8; i < size; i++) {
    if (matrix[8][i] === null) matrix[8][i] = false;
    if (matrix[i][8] === null) matrix[8][i] = false;
  }

  // 4. Encode data bits (Byte mode 0100)
  const bitArray: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) {
      bitArray.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Mode byte
  pushBits(dataLen, 8); // Character count
  for (const b of textBytes) {
    pushBits(b, 8);
  }
  // Terminator
  pushBits(0, Math.min(4, totalDataBytes * 8 - bitArray.length));
  // Byte alignment
  while (bitArray.length % 8 !== 0) bitArray.push(0);
  // Pad bytes
  const pad = [0xec, 0x11];
  let pIdx = 0;
  while (bitArray.length < totalDataBytes * 8) {
    pushBits(pad[pIdx % 2], 8);
    pIdx++;
  }

  // Convert bits to byte stream
  const dataBytes = new Uint8Array(totalDataBytes);
  for (let i = 0; i < totalDataBytes; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bitArray[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // Compute EC codewords
  const ec = rsCompute(dataBytes, ecBytes);
  const fullCodewords = new Uint8Array(totalDataBytes + ecBytes);
  fullCodewords.set(dataBytes, 0);
  fullCodewords.set(ec, totalDataBytes);

  // Convert full stream to bits
  const fullBits: number[] = [];
  for (const cw of fullCodewords) {
    for (let i = 7; i >= 0; i--) fullBits.push((cw >> i) & 1);
  }

  // Place data bits into matrix (zigzag upward/downward)
  let bitIdx = 0;
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (matrix[r][c] === null) {
          const bit = bitIdx < fullBits.length ? fullBits[bitIdx++] : 0;
          // Apply standard mask pattern 0: (r + c) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit === 1) !== mask;
        }
      }
    }
    upward = !upward;
  }

  return matrix.map((row) => row.map((cell) => cell ?? false));
}

export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  ariaLabel?: string;
}

export function QrCode({
  value,
  size = 200,
  className,
  ariaLabel = "Payment request QR code",
}: QrCodeProps) {
  const matrix = useMemo(() => {
    try {
      return generateQrMatrix(value);
    } catch {
      // Fallback empty matrix if encoding fails
      return Array.from({ length: 21 }, () => Array(21).fill(false));
    }
  }, [value]);

  const moduleCount = matrix.length;
  const padding = 3;
  const totalGrid = moduleCount + padding * 2;

  // Generate SVG path for dark modules for performance and crisp edges
  const pathData = useMemo(() => {
    let d = "";
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (matrix[r][c]) {
          const x = c + padding;
          const y = r + padding;
          d += `M${x},${y}h1v1h-1z `;
        }
      }
    }
    return d;
  }, [matrix, moduleCount, padding]);

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${totalGrid} ${totalGrid}`}
      width={size}
      height={size}
      className={className}
      style={{
        display: "block",
        maxWidth: "100%",
        height: "auto",
        background: "var(--color-paper, #f5f3ec)",
        borderRadius: "0.4rem",
      }}
    >
      <title>{ariaLabel}</title>
      <rect width="100%" height="100%" fill="var(--color-paper, #f5f3ec)" />
      <path d={pathData} fill="var(--color-ink, #0b0c0b)" />
    </svg>
  );
}
