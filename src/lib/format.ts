/**
 * Shared format utility — used by all provider adapters
 *
 * Extracted from the TikHub and RapidAPI adapters which both had
 * identical formatCount() functions. This shared version eliminates
 * duplication and is used across the NovaDL service layer.
 */

/**
 * Format a numeric count into a human-readable string.
 *
 * Examples:
 *   1500       → "1.5K"
 *   2500000    → "2.5M"
 *   42         → "42"
 */
export function formatCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return String(count);
}
