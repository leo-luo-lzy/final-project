import {fbmPerlin3D} from '../noise/perlin';
import ImageGuide from './ImageGuide';

export const FIELD_PERLIN = 0;
export const FIELD_CURL = 1;

class FlowField {
  cellSize: number;
  cols: number;
  rows: number;
  vx: Float32Array;
  vy: Float32Array;
  alignSigns: boolean = true;

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width /cellSize) + 1;
    this.rows = Math.ceil(height / cellSize) + 1;
    this.vx = new Float32Array(this.cols * this.rows);
    this.vy = new Float32Array(this.cols * this.rows);
  }

  build(type: number, noiseScale: number, octaves: number, time: number) {
    const cols = this.cols;
    const rows = this.rows;

    const n = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const nx = i * this.cellSize/ noiseScale;
        const ny = j * this.cellSize/ noiseScale;
        n[j * cols + i] = fbmPerlin3D(nx, ny, time, octaves, 2.0, 0.5);
      }
    }

    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const k = j * cols + i;
        let dx = 0.0;
        let dy = 0.0;
        if (type === FIELD_PERLIN) {
          const angle = n[k] * Math.PI * 2.0;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
        } else {
          const iL = Math.max(i - 1, 0);
          const iR = Math.min(i + 1, cols - 1);
          const jU = Math.max(j - 1, 0);
          const jD = Math.min(j + 1, rows - 1);
          const dndx = (n[j * cols + iR] - n[j * cols + iL]) / (iR - iL);
          const dndy = (n[jD * cols + i] - n[jU * cols + i]) / (jD - jU);
          dx = dndy;
          dy = -dndx;
        }
        const len = Math.sqrt(dx * dx + dy * dy) + 1e-8;
        this.vx[k] = dx / len;
        this.vy[k] = dy / len;
      }
    }
  }

  applyImage(guide: ImageGuide, edgeThreshold: number) {
    for (let j = 0; j < this.rows; j++) {
      for (let i = 0; i < this.cols; i++) {
        const k = j * this.cols + i;
        const g = guide.indexAt(i * this.cellSize, j * this.cellSize);
        const w = Math.min(guide.strength[g] / edgeThreshold, 1.0);

        const nx = this.vx[k];
        const ny = this.vy[k];
        const tx = guide.dirX[g];
        const ty = guide.dirY[g];

        const cx = (1.0 - w) * (nx * nx - ny * ny) + w * (tx * tx - ty * ty);
        const cy = (1.0 - w) * (2.0 * nx * ny) + w * (2.0 * tx * ty);
        const phi = 0.5 * Math.atan2(cy, cx);

        let dx = Math.cos(phi);
        let dy = Math.sin(phi);
        if (dx * nx + dy * ny < 0) {
          dx = -dx;
          dy = -dy;
        }
        this.vx[k] = dx;
        this.vy[k] = dy;
      }
    }
  }

  sample(x: number, y: number, refX: number, refY: number, out: Float32Array) {
    const gx = x / this.cellSize;
    const gy = y / this.cellSize;
    const i0 = Math.min(Math.max(Math.floor(gx), 0), this.cols - 2);
    const j0 = Math.min(Math.max(Math.floor(gy), 0), this.rows - 2);
    const tx = gx - i0;
    const ty = gy - j0;

    const k00 = j0 * this.cols + i0;
    const k10 = k00 + 1;
    const k01 = k00 + this.cols;
    const k11 = k01 + 1;

    let s00 = 1;
    let s10 = 1;
    let s01 = 1;
    let s11 = 1;
    if (this.alignSigns) {
      let rx = refX;
      let ry = refY;
      if (rx === 0 && ry === 0) {
        rx = this.vx[k00];
        ry = this.vy[k00];
      }
      s00 = this.vx[k00] * rx + this.vy[k00] * ry < 0 ? -1 : 1;
      s10 = this.vx[k10] * rx + this.vy[k10] * ry < 0 ? -1 : 1;
      s01 = this.vx[k01] * rx + this.vy[k01] * ry < 0 ? -1 : 1;
      s11 = this.vx[k11] * rx + this.vy[k11] * ry < 0 ? -1 : 1;
    }

    const w00 = (1 - tx) * (1 - ty) * s00;
    const w10 = tx * (1 - ty) * s10;
    const w01 = (1 - tx) * ty * s01;
    const w11 = tx * ty * s11;

    out[0] = this.vx[k00] * w00 + this.vx[k10] * w10 + this.vx[k01] * w01 + this.vx[k11] * w11;
    out[1] = this.vy[k00] * w00 + this.vy[k10] * w10 + this.vy[k01] * w01 + this.vy[k11] * w11;
  }
}

export default FlowField;
