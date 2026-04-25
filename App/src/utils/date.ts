/**
 * Date formatting utilities for CryptoPay
 * Handles Supabase UTC timestamps that may not have timezone indicators
 */

/**
 * Parse a date string from Supabase and ensure it's treated as UTC
 * Supabase stores timestamps in UTC but sometimes without the 'Z' suffix
 */
export function parseUTCDate(dateString: string): Date {
  if (!dateString) return new Date();
  
  let dateStr = dateString;
  // Check if there's no timezone indicator
  // ISO format check: doesn't contain 'Z', '+', or '-' after position 10 (date portion)
  if (!dateStr.includes('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
    // Replace space with 'T' for ISO format and add 'Z' for UTC
    dateStr = dateStr.replace(' ', 'T') + 'Z';
  }
  return new Date(dateStr);
}

/**
 * Format a date for display in short format
 * Example: "Jan 10, 2026, 6:30 PM"
 */
export function formatDateShort(dateString: string): string {
  if (!dateString) return 'N/A';
  
  const date = parseUTCDate(dateString);
  return date.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date for display in long format with seconds
 * Example: "10 January 2026, 6:30:45 PM"
 */
export function formatDateLong(dateString: string): string {
  if (!dateString) return 'N/A';
  
  const date = parseUTCDate(dateString);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

/**
 * Format a date for display in compact format
 * Example: "10 Jan, 6:30 PM"
 */
export function formatDateCompact(dateString: string): string {
  if (!dateString) return 'N/A';
  
  const date = parseUTCDate(dateString);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Get relative time (e.g., "2 minutes ago", "1 hour ago")
 */
export function getRelativeTime(dateString: string): string {
  if (!dateString) return 'N/A';
  
  const date = parseUTCDate(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  
  return formatDateShort(dateString);
}
