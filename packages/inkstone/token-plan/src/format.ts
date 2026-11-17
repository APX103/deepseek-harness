/**
 * 墨点 presentation helpers shared by future UI surfaces.
 *
 * @module dsh-inkstone-token-plan/format
 */

/** Format one 墨点 balance the way the desktop shows it: three decimals. */
export function formatInkstoneCredits(credits: number): string {
  return Number.isFinite(credits) && credits >= 0 ? credits.toFixed(3) : '0.000'
}
