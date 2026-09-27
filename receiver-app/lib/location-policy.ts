export const REFINE_MS = 20000;
export const CAPTURE_MS = 60000;
export const DELIVERY_MS = 120000;
export function meaningfullyBetter(first: number, next: number) {
  return Number.isFinite(next) && next >= 0 && first - next >= Math.max(10, first * 0.2);
}
