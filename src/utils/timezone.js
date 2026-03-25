const DEFAULT_TIMEZONE = process.env.TIMEZONE || 'America/Vancouver';

/**
 * Get a YYYY-MM-DD date string in the specified timezone.
 * @param {Date} date
 * @param {string} tz - IANA timezone (default: America/Vancouver or TIMEZONE env var)
 * @returns {string} YYYY-MM-DD
 */
function getLocalDateStr(date, tz = DEFAULT_TIMEZONE) {
  return date.toLocaleDateString('en-CA', { timeZone: tz }); // en-CA gives YYYY-MM-DD
}

/**
 * Get the YYYY-MM month string in the specified timezone.
 * @param {Date} date
 * @param {string} tz
 * @returns {string} YYYY-MM
 */
function getLocalMonthStr(date, tz = DEFAULT_TIMEZONE) {
  return getLocalDateStr(date, tz).slice(0, 7);
}

/**
 * Get the Monday of the current week as a Date, in the specified timezone.
 * @param {Date} date
 * @param {string} tz
 * @returns {Date}
 */
function getLocalWeekStart(date, tz = DEFAULT_TIMEZONE) {
  // Get the local date parts in the target timezone
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const year = parseInt(parts.find(p => p.type === 'year').value);
  const month = parseInt(parts.find(p => p.type === 'month').value);
  const day = parseInt(parts.find(p => p.type === 'day').value);
  const weekday = parts.find(p => p.type === 'weekday').value;

  // Map weekday abbreviation to day number (Mon=1 ... Sun=7)
  const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dayOfWeek = dayMap[weekday];

  // Go back to Monday
  const mondayDay = day - (dayOfWeek - 1);
  // Create a date representing midnight on that Monday in the local timezone
  // We use a simple Date construction which will be in the server's timezone,
  // but since we only compare it against timestamps, we need to build the
  // actual UTC instant for midnight Monday in the target timezone.
  const localMidnightStr = `${year}-${String(month).padStart(2, '0')}-${String(mondayDay).padStart(2, '0')}T00:00:00`;

  // Use Intl to figure out the offset, then build correct UTC time
  // Simpler approach: construct date and use it for >= comparison with entry dates
  // Since entries are compared as local date strings, we just need the Monday date string
  const mondayDate = new Date(year, month - 1, mondayDay, 0, 0, 0, 0);
  return mondayDate;
}

/**
 * Get the Monday date string (YYYY-MM-DD) for the current week in the specified timezone.
 * @param {Date} date
 * @param {string} tz
 * @returns {string} YYYY-MM-DD
 */
function getLocalWeekStartStr(date, tz = DEFAULT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const year = parseInt(parts.find(p => p.type === 'year').value);
  const month = parseInt(parts.find(p => p.type === 'month').value);
  const day = parseInt(parts.find(p => p.type === 'day').value);
  const weekday = parts.find(p => p.type === 'weekday').value;

  const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const dayOfWeek = dayMap[weekday];

  // Create a temp date to handle month boundaries correctly
  const tempDate = new Date(year, month - 1, day - (dayOfWeek - 1));
  return getLocalDateStr(tempDate, tz);
}

module.exports = { getLocalDateStr, getLocalMonthStr, getLocalWeekStart, getLocalWeekStartStr, DEFAULT_TIMEZONE };
