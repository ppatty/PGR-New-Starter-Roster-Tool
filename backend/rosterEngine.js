'use strict';

const MANDATORY_SESSIONS = [
  { name: 'Welcome Day', label: 'Welcome Day', start: '09:00' },
  { name: 'PGR F&B On boarding', label: 'PGR F&B On boarding', start: '09:00' },
  { name: 'Elevate Training', label: 'Elevate Training', start: '09:00' }
];
const MANDATORY_SESSION_HOURS = 5;
const RULES = {
  'Oasis Food': ['08:00', '11:00', '16:00'],
  'Oasis Bar': ['06:00', '08:00', '10:00', '14:00', '16:00', '17:00', '18:00', '19:00'],
  'SOV South Floor': Array.from({ length: 12 }, (_, k) => `${(9 + k).toString().padStart(2, '0')}:00`),
  'SOV North Floor': ['18:00'],
  'SOV South Bar': ['06:00', '10:00', '14:00', '18:00'],
  'SOV Dining': ['17:00']
};
const DEFAULT_BLOCKS = {
  'Oasis Food': 5,
  'Oasis Bar': 0,
  'SOV South Floor': 0,
  'SOV North Floor': 0,
  'SOV South Bar': 0,
  'SOV Dining': 0
};
const MINIMUM_BLOCKS = {};
const DEFAULT_MIN_SHIFTS = calculateMinimumShifts(DEFAULT_BLOCKS);
const SPLIT_SHIFT_LEG_MINUTES = 210;
const SPLIT_SHIFT_BREAK_MINUTES = 60;

function parseYMD(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Invalid ISO date string: ${iso}`);
  }
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toYMD(date) {
  const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function nextDow(startDate, dow, includeStart = true) {
  const d = new Date(startDate);
  if (!includeStart) d.setDate(d.getDate() + 1);
  while (d.getDay() !== dow) d.setDate(d.getDate() + 1);
  return d;
}

function isSun(date) {
  return date.getDay() === 0;
}

function isMon(date) {
  return date.getDay() === 1;
}

function nextWorking(date) {
  const d = new Date(date);
  while (isSun(d)) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function addWorkDay(date) {
  const d = new Date(date);
  d.setDate(d.getDate() + 1);
  return nextWorking(d);
}

function isOutletAllowedOnDate(outlet, dateObj) {
  const dow = dateObj.getDay();
  if (dow === 0) return false;
  if (outlet === 'SOV North Floor') return dow === 5 || dow === 6;
  return true;
}

function pickTime(outlet, index) {
  const times = (RULES[outlet] || ['09:00']).filter((time) => time <= '19:00');
  const safe = times.length ? times : ['19:00'];
  return safe[index % safe.length];
}

function pad2(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function makeRow(starter, dateObj, start, outlet, step, durationHours = 8) {
  const [hh, mm] = start.split(':').map(Number);
  const endH = (hh + durationHours) % 24;
  const endM = mm;
  return {
    Starter: starter.Name,
    StaffID: starter.StaffID || '',
    Avatar: starter.Avatar || '',
    Date: toYMD(dateObj),
    Start: start,
    End: `${pad2(endH)}:${pad2(endM)}`,
    Outlet: outlet,
    Step: step,
    Shift: `${start.replace(':', '')}-${pad2(endH)}${pad2(endM)} ${outlet} TRN`
  };
}

function addMinutes(timeStr, minutes) {
  const [hours, mins] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const nextHours = Math.floor(normalized / 60);
  const nextMinutes = normalized % 60;
  return `${pad2(nextHours)}:${pad2(nextMinutes)}`;
}

function generateSplitShift(startTime, areaOne = 'Sovereign', areaTwo = 'Oasis') {
  const firstLegEnd = addMinutes(startTime, SPLIT_SHIFT_LEG_MINUTES);
  const secondLegStart = addMinutes(firstLegEnd, SPLIT_SHIFT_BREAK_MINUTES);
  const secondLegEnd = addMinutes(secondLegStart, SPLIT_SHIFT_LEG_MINUTES);
  const rosterString = `${startTime} - ${firstLegEnd} (${areaOne}) / ${secondLegStart} - ${secondLegEnd} (${areaTwo})`;

  return {
    display: rosterString,
    totalHours: 8,
    locations: [areaOne, areaTwo],
    isDevelopmentFocus: true,
    note: 'Pulse Check required during transition!'
  };
}

function calculateMinimumShifts(blockMap) {
  return MANDATORY_SESSIONS.length + Object.values(blockMap || {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

function sanitizeBlocks(blocks = []) {
  const normalized = { ...DEFAULT_BLOCKS };
  if (Array.isArray(blocks)) {
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue;
      const outlet = block.outlet || block.name;
      if (!outlet) continue;
      const raw = Number(block.count ?? block.shifts ?? block.value);
      if (Number.isNaN(raw)) continue;
      const minimum = MINIMUM_BLOCKS[outlet] || 0;
      normalized[outlet] = Math.max(minimum, Math.max(0, Math.floor(raw)));
    }
  } else if (blocks && typeof blocks === 'object') {
    for (const [outlet, value] of Object.entries(blocks)) {
      const minimum = MINIMUM_BLOCKS[outlet] || 0;
      const raw = Number(value);
      if (!Number.isNaN(raw)) {
        normalized[outlet] = Math.max(minimum, Math.max(0, Math.floor(raw)));
      }
    }
  }
  return normalized;
}

function sanitizeStarters(starters) {
  if (!Array.isArray(starters) || starters.length === 0) {
    throw new Error('At least one starter is required to build a roster.');
  }
  return starters.map((s, index) => {
    if (!s || typeof s !== 'object') {
      throw new Error(`Starter at index ${index} must be an object.`);
    }
    const Name = (s.Name || s.name || '').trim();
    if (!Name) {
      throw new Error(`Starter at index ${index} is missing a name.`);
    }
    const startDate = s.StartDate || s.startDate;
    if (!startDate) {
      throw new Error(`Starter "${Name}" is missing StartDate.`);
    }
    parseYMD(startDate);
    const birthDate = s.BirthDate || s.birthDate || '';
    if (birthDate) {
      parseYMD(birthDate);
    }
    const blackout = Array.isArray(s.blackoutDates) ? s.blackoutDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) : [];
    return {
      Name,
      StaffID: (s.StaffID || s.staffId || '').trim(),
      StartDate: startDate,
      BirthDate: birthDate,
      blackoutDates: blackout,
      Avatar: s.Avatar || s.avatar || ''
    };
  });
}

function shiftsInLastNDays(rows, starterName, dateObj, n) {
  const start = new Date(dateObj);
  start.setDate(start.getDate() - (n - 1));
  const startKey = toYMD(start);
  const endKey = toYMD(dateObj);
  let count = 0;
  const mandatoryLabels = new Set(MANDATORY_SESSIONS.map((s) => s.label));
  for (const row of rows) {
    if (row.Starter !== starterName) continue;
    if (mandatoryLabels.has(row.Outlet)) continue;
    if (row.Date >= startKey && row.Date <= endKey) count++;
  }
  return count;
}

function canWorkThisDay(rows, starterName, dateObj) {
  return shiftsInLastNDays(rows, starterName, dateObj, 10) < 8;
}

function lastShiftEnd(rows, starterName) {
  let last = null;
  for (const row of rows) {
    if (row.Starter !== starterName) continue;
    const date = parseYMD(row.Date);
    const [hh, mm] = row.End.split(':').map(Number);
    date.setHours(hh, mm, 0, 0);
    if (!last || date > last) last = date;
  }
  return last;
}

function hasMinRest(rows, starterName, dateObj, startTime) {
  const last = lastShiftEnd(rows, starterName);
  if (!last) return true;
  const start = new Date(dateObj);
  const [hh, mm] = startTime.split(':').map(Number);
  start.setHours(hh, mm, 0, 0);
  return start - last >= 12 * 60 * 60 * 1000;
}

function buildRoster(options = {}) {
  const {
    starters: rawStarters,
    blocks,
    welcomeDay = 2,
    onboardDay = 3,
    elevateDay = 4,
    shuffle = false,
    minShifts
  } = options;

  if (welcomeDay < 0 || welcomeDay > 6 || onboardDay < 0 || onboardDay > 6 || elevateDay < 0 || elevateDay > 6) {
    throw new Error('welcomeDay, onboardDay, and elevateDay must be between 0 (Sunday) and 6 (Saturday).');
  }

  const starters = sanitizeStarters(rawStarters);
  const blockMap = sanitizeBlocks(blocks);
  const targetMinShifts = Number.isFinite(minShifts) ? minShifts : calculateMinimumShifts(blockMap);
  const allRows = [];
  const placedByStarter = new Map();
  const placedByStarterOutlet = new Map();
  const usedSlots = new Set();

  function incPlaced(starterName, outlet) {
    placedByStarter.set(starterName, (placedByStarter.get(starterName) || 0) + 1);
    if (!placedByStarterOutlet.has(starterName)) {
      placedByStarterOutlet.set(starterName, new Map());
    }
    const outletMap = placedByStarterOutlet.get(starterName);
    outletMap.set(outlet, (outletMap.get(outlet) || 0) + 1);
  }

  function getPlaced(starterName) {
    return placedByStarter.get(starterName) || 0;
  }

  function getPlacedOutlet(starterName, outlet) {
    return placedByStarterOutlet.get(starterName)?.get(outlet) || 0;
  }

  function addRow(row) {
    allRows.push(row);
    incPlaced(row.Starter, row.Outlet);
  }

  const normalized = starters.map((starter) => {
    const norm = parseYMD(starter.StartDate);
    while (isSun(norm)) {
      norm.setDate(norm.getDate() + 1);
    }
    return { ...starter, NormStart: norm };
  });

  const groups = {};
  for (const starter of normalized) {
    const key = toYMD(starter.NormStart);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...starter, blackoutDates: [...starter.blackoutDates] });
  }

  const sortedKeys = Object.keys(groups).sort();
  for (const dayKey of sortedKeys) {
    const welcomeDate = nextDow(parseYMD(dayKey), welcomeDay);
    const onboardingDate = nextDow(welcomeDate, onboardDay, false);
    const elevateDate = nextDow(onboardingDate, elevateDay, false);
    for (const starter of groups[dayKey]) {
      addRow(makeRow(starter, welcomeDate, MANDATORY_SESSIONS[0].start, MANDATORY_SESSIONS[0].label, 1, MANDATORY_SESSION_HOURS));
      addRow(makeRow(starter, onboardingDate, MANDATORY_SESSIONS[1].start, MANDATORY_SESSIONS[1].label, 2, MANDATORY_SESSION_HOURS));
      addRow(makeRow(starter, elevateDate, MANDATORY_SESSIONS[2].start, MANDATORY_SESSIONS[2].label, 3, MANDATORY_SESSION_HOURS));
      starter.__state = {
        currentOutlet: null,
        remaining: 0,
        nextDate: addWorkDay(elevateDate)
      };
    }
  }

  const conflicts = {
    outletConflicts: 0,
    dateConflicts: 0,
    fallbackUsed: 0,
    safetyTriggered: false
  };

  const everyone = sortedKeys.flatMap((key) => groups[key]);
  let progress = true;
  let safety = 0;

  while (progress && safety < 5000) {
    progress = false;
    safety += 1;
    if (safety > 4000) conflicts.safetyTriggered = true;

    for (const starter of everyone) {
      if (getPlaced(starter.Name) >= targetMinShifts) {
        starter.__state = null;
        continue;
      }
      if (!starter.__state) continue;

      const state = starter.__state;
      let currentDate = nextWorking(state.nextDate);
      let currentKey = toYMD(currentDate);
      let outlet = state.currentOutlet;

      if (state.remaining <= 0) {
        let candidates = Object.keys(blockMap).filter((o) => getPlacedOutlet(starter.Name, o) < blockMap[o]);
        if (!candidates.length) {
          starter.__state = null;
          continue;
        }
        if (shuffle) {
          candidates = shuffleArray(candidates);
        }
        const allowedToday = candidates.filter((o) => !usedSlots.has(`${currentKey}|${o}`) && isOutletAllowedOnDate(o, currentDate));
        if (!allowedToday.length) conflicts.outletConflicts += 1;
        outlet = allowedToday[0] || (shuffle ? shuffleArray(candidates)[0] : candidates[0]);
        state.currentOutlet = outlet;
        state.remaining = Math.max(0, blockMap[outlet] - getPlacedOutlet(starter.Name, outlet));
      }

      const initialDate = currentDate;
      let guard = 0;
      while (
        starter.blackoutDates.includes(currentKey) ||
        usedSlots.has(`${currentKey}|${outlet}`) ||
        !isOutletAllowedOnDate(outlet, currentDate) ||
        !canWorkThisDay(allRows, starter.Name, currentDate) ||
        !hasMinRest(allRows, starter.Name, currentDate, pickTime(outlet, allRows.length))
      ) {
        currentDate = addWorkDay(currentDate);
        currentKey = toYMD(currentDate);
        guard += 1;
        if (guard > 100) break;
      }

      if (currentDate > initialDate) conflicts.dateConflicts += 1;
      const startTime = pickTime(outlet, allRows.length);
      addRow(makeRow(starter, currentDate, startTime, outlet, getPlaced(starter.Name) + 1, 8));
      usedSlots.add(`${currentKey}|${outlet}`);
      state.remaining -= 1;
      state.nextDate = addWorkDay(currentDate);
      progress = true;
    }
  }

  for (const starter of everyone) {
    let placed = getPlaced(starter.Name);
    if (placed >= targetMinShifts) continue;
    let last = allRows.filter((row) => row.Starter === starter.Name).map((row) => row.Date).sort().pop();
    let current = last ? addWorkDay(parseYMD(last)) : nextWorking(starter.NormStart);
    let rotation = 0;
    let guard = 0;
    const preferences = ['SOV South Floor', 'SOV South Bar', 'Oasis Food', 'Oasis Bar', 'SOV North Floor', 'SOV Dining'];
    let fallbackNeeded = false;

    while (placed < targetMinShifts && guard < 5000) {
      guard += 1;
      const key = toYMD(current);
      if (starter.blackoutDates.includes(key)) {
        current = addWorkDay(current);
        continue;
      }
      let outlet = preferences.find((o) =>
        (!usedSlots.has(`${key}|${o}`)) &&
        isOutletAllowedOnDate(o, current) &&
        canWorkThisDay(allRows, starter.Name, current) &&
        hasMinRest(allRows, starter.Name, current, pickTime(o, rotation))
      );

      if (!outlet) {
        current = addWorkDay(current);
        fallbackNeeded = true;
        continue;
      }

      const startTime = pickTime(outlet, rotation++);
      addRow(makeRow(starter, current, startTime, outlet, getPlaced(starter.Name) + 1, 8));
      usedSlots.add(`${key}|${outlet}`);
      placed += 1;
      current = addWorkDay(current);
    }

    if (fallbackNeeded) conflicts.fallbackUsed += 1;
  }

  allRows.sort((a, b) =>
    a.Starter.localeCompare(b.Starter) ||
    a.Date.localeCompare(b.Date) ||
    a.Start.localeCompare(b.Start)
  );

  const totalConflicts = conflicts.outletConflicts + conflicts.dateConflicts + conflicts.fallbackUsed;
  let summary = `Built ${allRows.length} shifts for ${starters.length} starter(s)`;
  if (totalConflicts > 0) {
    const parts = [];
    if (conflicts.outletConflicts > 0) parts.push(`${conflicts.outletConflicts} outlet conflicts`);
    if (conflicts.dateConflicts > 0) parts.push(`${conflicts.dateConflicts} scheduling conflicts`);
    if (conflicts.fallbackUsed > 0) parts.push(`${conflicts.fallbackUsed} fallback shifts`);
    if (conflicts.safetyTriggered) parts.push('complex scheduling');
    summary += ` • Resolved: ${parts.join(', ')}`;
  }

  return {
    rows: allRows,
    conflicts,
    summary,
    stats: {
      starters: starters.length,
      minShifts: targetMinShifts,
      welcomeDay,
      onboardDay,
      elevateDay
    }
  };
}

function shuffleArray(values) {
  const arr = values.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = {
  buildRoster,
  generateSplitShift,
  sanitizeBlocks,
  sanitizeStarters,
  DEFAULT_MIN_SHIFTS,
  DEFAULT_BLOCKS,
  MANDATORY_SESSIONS
};
