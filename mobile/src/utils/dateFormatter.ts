/**
 * Utility functions for human-readable date and time formatting
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Format a calendar date string (e.g. "2026-10-01") into human-readable date.
 * E.g. "2026-10-01" -> "October 1, 2026"
 */
export function formatReadableDate(dateString: string | null | undefined): string {
  if (!dateString) return 'Unknown Date';

  // Handle YYYY-MM-DD
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return `${MONTHS[month]} ${day}, ${year}`;
  }

  const date = new Date(dateString);
  if (!isNaN(date.getTime())) {
    return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
  }

  return dateString;
}

/**
 * Format date for group headings with relative names (Today, Yesterday, or readable date)
 */
export function formatGroupDate(dateString: string): string {
  if (!dateString) return 'Recent';

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const cleanDateStr = dateString.split('T')[0];

  if (cleanDateStr === todayStr) {
    return 'Today';
  } else if (cleanDateStr === yesterdayStr) {
    return 'Yesterday';
  }

  return formatReadableDate(cleanDateStr);
}

/**
 * Format a timestamp into event time or short date-time (e.g. "Today, 8:00 AM" or "Oct 24, 2:15 PM")
 */
export function formatEventDateTime(dateTimeStr: string | null | undefined): string {
  if (!dateTimeStr) return '';

  const date = new Date(dateTimeStr);
  if (isNaN(date.getTime())) {
    return formatReadableDate(dateTimeStr);
  }

  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const formattedHours = hours % 12 || 12;
  const formattedMinutes = minutes < 10 ? `0${minutes}` : minutes;
  const timeStr = `${formattedHours}:${formattedMinutes} ${ampm}`;

  const today = new Date();
  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isToday) {
    return `Today, ${timeStr}`;
  } else if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  } else {
    return `${MONTHS_SHORT[date.getMonth()]} ${date.getDate()}, ${timeStr}`;
  }
}

/**
 * Format current day header for chat (e.g. "Thursday, October 1")
 */
export function formatHeaderDate(): string {
  const now = new Date();
  const dayName = DAYS[now.getDay()];
  const monthName = MONTHS[now.getMonth()];
  const day = now.getDate();
  return `${dayName}, ${monthName} ${day}`;
}
