(() => {
  'use strict';

  const C = {
    overlayId: 'operator-kart-rally',
    styleId: 'operator-kart-rally-style',
    host: 'robohub.apps.openai.org',
    apiUrl: 'https://robohub.apps.openai.org/api/collection_ops/shift?location=lion',
    refreshMs: 15000,
    rankSlots: 34,
    title: 'OPERATOR INDY KARTS',
    crew: 'LION Nightshift Crew',
    lapHours: 2,
    shiftStartHour: 22,
    shiftStartMinute: 30,
    shiftEndHour: 6,
    shiftEndMinute: 30,
    totalShiftHours: 8,
    productiveShiftHours: 6.5,
    minElapsedHours: 0.25,
    minCurrentHours: 0.05,
    startLineProgress: 0.07,
    coinRespawnMs: 7 * 60 * 1000,
    itemRespawnMs: 10 * 60 * 1000,
    inactivePitMs: 40 * 60 * 1000,
    pitEnterMs: 6500,
    pitExitMs: 5200,
    raceStartCutInDelayMs: 15 * 60 * 1000,
    raceStartCutInWindowMs: 90 * 60 * 1000,
    trackCruiseSpeed: 0.024,
    trackChaseSpeed: 0.18,
    passHourGap: 0.05,
    passLaneSpread: 62,
    passLaneHoldMs: 2600,
    passLaneSpeed: 24,
    spriteSheetUrl: 'operator-kart-rally-assets/kart-sprite-directions.png',
    trackImageUrl: 'operator-kart-rally-assets/oval-track.png',
    treeSpriteUrl: 'operator-kart-rally-assets/tree-sprites.svg',
    cloudSpriteUrl: 'operator-kart-rally-assets/cumulus-cloud-sprites.svg',
    trackAspect: 1700 / 560,
    spriteCount: 10,
    spriteDirectionCount: 8,
    breaks: [
      { label: '1ST BREAK', hour: 0, minute: 30, durationMin: 15 },
      { label: 'LUNCH', hour: 2, minute: 30, durationMin: 30 },
      { label: '2ND BREAK', hour: 4, minute: 30, durationMin: 15 }
    ]
  };

  const LABEL_ENTRIES = [
    ['Myron G', '1'],
    ['Firdavsbek M', '2'],
    ['Burak A', '3'],
    ['William M', '4'],
    ['Bryan Sogelau', '5'],
    ["Ja'meisha R", '6'],
    ['Christian S', '7'],
    ['Jasmine M', '8'],
    ['Eiffel V', '9'],
    ['Tilomai P', '10'],
    ['Eric R', '11'],
    ['Adrian G', '12'],
    ['Jack E', '13'],
    ['Abraham Avalos', '14'],
    ['Emiliano C', '15'],
    ['Isaac F', '16'],
    ['Jakari W', '18'],
    ['Curtis T', '19'],
    ['Dhanasekar J', '20'],
    ['Casey P', '21'],
    ['Eric R', '22'],
    ['Carlos M', '23'],
    ['William R III', '24'],
    ['Matthew Nguyen', '25'],
    ['Kanishka T', '26'],
    ['Kelvin C', '27'],
    ['Annalie J', '28'],
    ['Eric Ribaya', '29'],
    ['Omar L', '30'],
    ['Nyjel T', '31'],
    ['Jasmine J', '32'],
    ['Bobbi B', '33'],
    ['Avantika D', '35'],
    ['Nathan C', '36']
  ];
  const normalizeNameKey = value => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  function addLabelLookup(lookup, name, locker) {
    const key = normalizeNameKey(name);
    if (!key) return;
    if (!lookup[key]) lookup[key] = [];
    lookup[key].push(locker);
  }
  const NORMALIZED_LABELS = (() => {
    const lookup = {};
    LABEL_ENTRIES.forEach(([name, locker]) => {
      addLabelLookup(lookup, name, locker);
      const parts = name.trim().split(/\s+/);
      if (parts.length === 2 && parts[1].length > 1) addLabelLookup(lookup, `${parts[0]} ${parts[1][0]}`, locker);
    });
    return lookup;
  })();

  const old = document.getElementById(C.overlayId);
  if (old) {
    try {
      old.__cleanup?.();
    } catch {}
    old.remove();
    document.getElementById(C.styleId)?.remove();
  }

  const TRACK = {
    width: 1700,
    height: 560,
    straight: 1080,
    baseRadius: 150,
    laneOffsets: [-78, -56, -34, -12, 12, 34, 56, 78, 0]
  };

  const PIT = {
    columns: 9,
    rows: 3,
    minX: 27.8,
    maxX: 74.2,
    rowsY: [45.2, 51.0, 56.8],
    entry: { x: 43, y: 66.4, rotation: -12 },
    exit: { x: 58, y: 66.4, rotation: 12 }
  };
  const DEMO_PASS_SPEED_BOOSTS = {
    4: 0.0046,
    9: 0.0032
  };

  const state = {
    timer: null,
    resizeTimer: null,
    animationFrame: null,
    lastFrame: null,
    busy: false,
    lastPayload: null,
    rankPositions: {},
    rankHourValues: {},
    rankSessionValues: {},
    rankAwayValues: {},
    rankSetupValues: {},
    motionByLocker: {},
    hourProgressByLocker: {},
    totalHoursByLocker: {},
    trackClock: 0,
    laneByLocker: {},
    propHits: {},
    propTimers: {},
    hudTimer: null,
    cheerTimer: null,
    leaderLocker: null,
    lastLeaderCheerAt: 0,
    lastAudienceCheerAt: 0,
    coinStreaks: {},
    coinPointsByLocker: {},
    itemBonusPointsByLocker: {},
    lastLapFlashByLocker: {},
    lapsByLocker: {},
    collisionHits: {},
    passFlashHits: {},
    passCutInLocks: {},
    operatorActivity: {},
    pitTargets: {},
    pitStates: {},
    activeLockers: {},
    warpInLockers: {},
    startCutInSeen: {},
    startCutInQueue: [],
    startCutInBusyUntil: 0,
    renderedOnce: false
  };
  const localPreview = location.protocol === 'file:' || ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
  const breakCloudDemo = localPreview && new URLSearchParams(location.search).has('breakCloudDemo');
  const $ = id => document.getElementById(id);
  const num = value => Number.parseFloat(value) || 0;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (start, end, t) => start + (end - start) * t;
  const smooth = value => value * value * (3 - 2 * value);
  function labelFor(name, seenCounts) {
    const key = normalizeNameKey(name);
    const lockers = NORMALIZED_LABELS[key];
    if (!lockers?.length) return '--';
    if (!seenCounts) return lockers[0];
    const index = seenCounts[key] || 0;
    seenCounts[key] = index + 1;
    return lockers[Math.min(index, lockers.length - 1)];
  }
  const esc = value => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
  const TRACK_PROPS = [
    { id: 'item-a', type: 'item', x: 35, y: 28, rx: 4.6, ry: 7 },
    { id: 'coin-a', type: 'coin', x: 42, y: 29, rx: 3.4, ry: 6 },
    { id: 'coin-b', type: 'coin', x: 55, y: 28, rx: 3.4, ry: 6 },
    { id: 'coin-c', type: 'coin', x: 40, y: 74, rx: 3.4, ry: 6 },
    { id: 'coin-d', type: 'coin', x: 58, y: 75, rx: 3.4, ry: 6 }
  ];
  const ITEM_BONUSES = [
    { label: '+1', points: 1 },
    { label: '+3', points: 3 },
    { label: '+5', points: 5 },
    { label: 'CHEER +10', points: 10, cheer: true }
  ];
  const TRACK_ITEM_SPAWNS = [
    { x: 30, y: 14, rx: 5.4, ry: 9 },
    { x: 42, y: 33, rx: 5.2, ry: 8 },
    { x: 56, y: 14, rx: 5.2, ry: 8 },
    { x: 70, y: 33, rx: 5.2, ry: 8 },
    { x: 89, y: 38, rx: 6, ry: 10 },
    { x: 97, y: 50, rx: 6, ry: 10 },
    { x: 89, y: 62, rx: 6, ry: 10 },
    { x: 70, y: 66, rx: 5.4, ry: 9 },
    { x: 56, y: 87, rx: 5.2, ry: 8 },
    { x: 42, y: 66, rx: 5.2, ry: 8 },
    { x: 30, y: 87, rx: 5.2, ry: 8 },
    { x: 11, y: 62, rx: 6, ry: 10 },
    { x: 3, y: 50, rx: 6, ry: 10 },
    { x: 11, y: 38, rx: 6, ry: 10 }
  ];
  const TRACK_COIN_SPAWNS = [
    { x: 30, y: 23, rx: 5.2, ry: 12 },
    { x: 44, y: 23, rx: 5.2, ry: 12 },
    { x: 58, y: 23, rx: 5.2, ry: 12 },
    { x: 72, y: 23, rx: 5.2, ry: 12 },
    { x: 91, y: 38, rx: 11, ry: 8.5 },
    { x: 93, y: 50, rx: 12, ry: 8.5 },
    { x: 91, y: 62, rx: 11, ry: 8.5 },
    { x: 72, y: 77, rx: 5.2, ry: 12 },
    { x: 58, y: 77, rx: 5.2, ry: 12 },
    { x: 44, y: 77, rx: 5.2, ry: 12 },
    { x: 30, y: 77, rx: 5.2, ry: 12 },
    { x: 9, y: 62, rx: 11, ry: 8.5 },
    { x: 7, y: 50, rx: 12, ry: 8.5 },
    { x: 9, y: 38, rx: 11, ry: 8.5 }
  ];

  function sessions(operator) {
    return num(
      operator.sessions ??
      operator.Sessions ??
      operator.sessionCount ??
      operator.SessionCount ??
      operator['Sessions'] ??
      operator['Session Count'] ??
      operator['Session_Count'] ??
      operator.collectSessions ??
      operator.collect_sessions ??
      operator.collectedSessions ??
      operator.collected_sessions ??
      operator.CollectSessions ??
      operator.Collect_Sessions ??
      operator.CollectedSessions ??
      operator.Collected_Sessions ??
      operator['Collect Sessions'] ??
      operator['Collected Sessions'] ??
      operator['Collect_Sessions'] ??
      operator['Collected_Sessions']
    );
  }

  function parseMetricValue(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'object') {
      return firstMetric(value, ['value', 'Value', 'hours', 'Hours', 'time', 'Time', 'duration', 'Duration', 'total', 'Total', 'minutes', 'Minutes', 'seconds', 'Seconds']);
    }
    const text = String(value).trim();
    if (!text || ['--', 'n/a', 'na', 'not started'].includes(text.toLowerCase())) return null;
    if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(text)) {
      const parts = text.split(':').map(part => Number.parseFloat(part) || 0);
      if (parts.length === 2) return parts[0] + parts[1] / 60;
      return parts[0] + parts[1] / 60 + parts[2] / 3600;
    }
    const hourMatch = text.match(/([\d.]+)\s*h/i);
    const minuteMatch = text.match(/([\d.]+)\s*m/i);
    const secondMatch = text.match(/([\d.]+)\s*s/i);
    if (hourMatch || minuteMatch || secondMatch) {
      return (hourMatch ? Number.parseFloat(hourMatch[1]) : 0) +
        (minuteMatch ? Number.parseFloat(minuteMatch[1]) / 60 : 0) +
        (secondMatch ? Number.parseFloat(secondMatch[1]) / 3600 : 0);
    }
    const parsed = Number.parseFloat(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function firstMetric(operator, keys) {
    for (const key of keys) {
      const value = operator[key];
      const parsed = parseMetricValue(value);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function periodMixSources(operator) {
    return [
      operator.periodMix,
      operator.period_mix,
      operator.PeriodMix,
      operator.Period_Mix,
      operator['Period Mix'],
      operator.periods,
      operator.Periods,
      operator.periodBreakdown,
      operator.period_breakdown,
      operator['Period Breakdown']
    ].filter(Boolean);
  }

  function includesAny(value, needles) {
    const text = String(value ?? '').toLowerCase();
    return needles.some(needle => text.includes(needle));
  }

  function entryName(entry) {
    return [
      entry?.color,
      entry?.Color,
      entry?.colour,
      entry?.Colour,
      entry?.name,
      entry?.Name,
      entry?.label,
      entry?.Label,
      entry?.title,
      entry?.Title,
      entry?.key,
      entry?.Key,
      entry?.category,
      entry?.Category,
      entry?.status,
      entry?.Status,
      entry?.period,
      entry?.Period
    ].filter(value => value !== undefined && value !== null).join(' ');
  }

  function periodMixMetric(operator, colorNames, labelNames = []) {
    const needles = [...colorNames, ...labelNames].map(value => String(value).toLowerCase());
    for (const source of periodMixSources(operator)) {
      if (Array.isArray(source)) {
        for (const entry of source) {
          if (includesAny(entryName(entry), needles)) {
            const parsed = firstMetric(entry, ['value', 'Value', 'hours', 'Hours', 'time', 'Time', 'duration', 'Duration', 'total', 'Total', 'minutes', 'Minutes', 'seconds', 'Seconds']);
            if (parsed !== null) return parsed;
          }
        }
        continue;
      }
      if (source && typeof source === 'object') {
        for (const [key, value] of Object.entries(source)) {
          if (includesAny(key, needles) || includesAny(entryName(value), needles)) {
            const parsed = parseMetricValue(value);
            if (parsed !== null) return parsed;
          }
        }
      }
    }
    return null;
  }

  function awayTime(operator) {
    return periodMixMetric(operator, ['cyan'], ['away']) ?? firstMetric(operator, [
      'periodMixCyan',
      'period_mix_cyan',
      'PeriodMixCyan',
      'Period Mix Cyan',
      'Cyan',
      'cyan',
      'awayTime',
      'away_time',
      'AwayTime',
      'Away_Time',
      'Away Time',
      'awayHours',
      'away_hours',
      'AwayHours',
      'Away_Hours',
      'Away Hours',
      'totalAway',
      'total_away',
      'TotalAway',
      'Total Away',
      'away',
      'Away'
    ]);
  }

  function setupTime(operator) {
    return periodMixMetric(operator, ['teal'], ['setup', 'block']) ?? firstMetric(operator, [
      'periodMixTeal',
      'period_mix_teal',
      'PeriodMixTeal',
      'Period Mix Teal',
      'Teal',
      'teal',
      'blockTime',
      'block_time',
      'BlockTime',
      'Block_Time',
      'Block Time',
      'blockHours',
      'block_hours',
      'BlockHours',
      'Block_Hours',
      'Block Hours',
      'setupTime',
      'setup_time',
      'setUpTime',
      'set_up_time',
      'SetupTime',
      'SetUpTime',
      'Setup_Time',
      'Set_Up_Time',
      'Setup Time',
      'Set Up Time',
      'setupHours',
      'setup_hours',
      'setUpHours',
      'set_up_hours',
      'SetupHours',
      'SetUpHours',
      'Setup Hours',
      'Set Up Hours',
      'setup',
      'Setup',
      'setUp',
      'Set Up',
      'block',
      'Block'
    ]);
  }

  function formatTimeMetric(value) {
    return Number.isFinite(value) ? value.toFixed(2) : '--';
  }

  function rgbFromCss(value) {
    const match = String(value || '').match(/rgba?\(([^)]+)\)/i);
    if (!match) return null;
    const parts = match[1].split(',').map(part => Number.parseFloat(part.trim()));
    if (parts.length < 3 || parts.some((part, index) => index < 3 && !Number.isFinite(part))) return null;
    if (parts.length > 3 && parts[3] <= 0.05) return null;
    return { r: parts[0], g: parts[1], b: parts[2] };
  }

  function rgbToHsl({ r, g, b }) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    if (max === min) return { hue: 0, saturation: 0, lightness };
    const delta = max - min;
    const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    const hue = max === r
      ? ((g - b) / delta + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / delta + 2) * 60
        : ((r - g) / delta + 4) * 60;
    return { hue, saturation, lightness };
  }

  function periodRoleFromColor(color) {
    const rgb = rgbFromCss(color);
    if (!rgb) return null;
    const { hue, saturation, lightness } = rgbToHsl(rgb);
    if (saturation < 0.28 || hue < 140 || hue > 190) return null;
    return lightness >= 0.58 ? 'away' : 'setup';
  }

  function rowOperatorName(row) {
    const firstCell = row.querySelector('td,[role="cell"]');
    const text = (firstCell?.innerText || firstCell?.textContent || '').trim();
    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const name = lines.find(line => !/^id\b/i.test(line) && !/^operator$/i.test(line));
    return name || '';
  }

  function latestHoursFromRow(row) {
    const text = row.innerText || row.textContent || '';
    const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*h\b/gi)].map(match => Number.parseFloat(match[1]));
    if (matches.length >= 2) return matches[1];
    return matches[0] || 0;
  }

  function periodMixRatiosFromRow(row) {
    const candidates = [...row.querySelectorAll('*')].map(element => {
      const rect = element.getBoundingClientRect();
      if (rect.width < 120 || rect.height < 4 || rect.height > 36) return null;
      const segments = [...element.children].map(child => {
        const childRect = child.getBoundingClientRect();
        if (childRect.width < 1 || childRect.height < 3 || childRect.height > 36) return null;
        const role = periodRoleFromColor(getComputedStyle(child).backgroundColor);
        const color = rgbFromCss(getComputedStyle(child).backgroundColor);
        if (!color) return null;
        return { role, width: childRect.width };
      }).filter(Boolean);
      const coloredWidth = segments.reduce((sum, segment) => sum + segment.width, 0);
      if (segments.length < 2 || coloredWidth < 80 || !segments.some(segment => segment.role)) return null;
      return { element, rect, segments, coloredWidth };
    }).filter(Boolean);
    const candidate = candidates.sort((a, b) => b.coloredWidth - a.coloredWidth)[0];
    if (!candidate) return null;
    const awayWidth = candidate.segments
      .filter(segment => segment.role === 'away')
      .reduce((sum, segment) => sum + segment.width, 0);
    const setupWidth = candidate.segments
      .filter(segment => segment.role === 'setup')
      .reduce((sum, segment) => sum + segment.width, 0);
    return {
      awayRatio: awayWidth / candidate.coloredWidth,
      setupRatio: setupWidth / candidate.coloredWidth,
      latestHours: latestHoursFromRow(row)
    };
  }

  function pagePeriodMixByName() {
    const rows = [...document.querySelectorAll('tr,[role="row"]')]
      .filter(row => !row.closest?.(`#${C.overlayId}`));
    const results = {};
    rows.forEach(row => {
      const name = rowOperatorName(row);
      if (!name) return;
      const ratios = periodMixRatiosFromRow(row);
      if (!ratios) return;
      const key = normalizeNameKey(name);
      if (!key) return;
      if (!results[key]) results[key] = [];
      results[key].push(ratios);
    });
    return results;
  }

  function pagePeriodMixForOperator(name, pageMix, seenCounts, totalHours) {
    const key = normalizeNameKey(name);
    const list = pageMix[key];
    if (!list?.length) return null;
    const index = seenCounts[key] || 0;
    seenCounts[key] = index + 1;
    const mix = list[Math.min(index, list.length - 1)];
    const baseHours = Number.isFinite(totalHours) && totalHours > 0 ? totalHours : mix.latestHours;
    if (!Number.isFinite(baseHours) || baseHours <= 0) return null;
    return {
      away: mix.awayRatio > 0 ? baseHours * mix.awayRatio : null,
      setup: mix.setupRatio > 0 ? baseHours * mix.setupRatio : null
    };
  }

  function operatorHours(operator) {
    const collectedRaw = operator.collectedHours ?? operator['Collected Hours'];
    const evalRaw = operator.EvalHours ?? operator['Eval Hours'] ?? operator.evalHours ?? operator.eval_hours;
    const hasCollectedOrEval = [collectedRaw, evalRaw].some(value => value !== undefined && value !== null && value !== '');
    if (hasCollectedOrEval) return num(collectedRaw) + num(evalRaw);
    const directTotal = operator.totalHours ??
      operator.total_hours ??
      operator.TotalHours ??
      operator['Total Hours'] ??
      operator.total ??
      operator.Total ??
      operator.hours ??
      operator.Hours;
    return num(directTotal);
  }

  function shiftStart(now) {
    const start = new Date(now);
    start.setHours(C.shiftStartHour, C.shiftStartMinute, 0, 0);
    const end = new Date(start);
    end.setHours(C.shiftEndHour, C.shiftEndMinute, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);
    if (now < start) {
      const previousStart = new Date(start);
      previousStart.setDate(previousStart.getDate() - 1);
      const previousEnd = new Date(end);
      previousEnd.setDate(previousEnd.getDate() - 1);
      if (now <= previousEnd) return previousStart;
    }
    return start;
  }

  function projected(totalHours, timestamp) {
    const now = timestamp instanceof Date && !Number.isNaN(timestamp.getTime()) ? timestamp : new Date();
    const elapsedShiftHours = clamp((now - shiftStart(now)) / 3600000, 0, C.totalShiftHours);
    const elapsedProductiveHours = elapsedShiftHours / C.totalShiftHours * C.productiveShiftHours;
    if (elapsedProductiveHours < C.minElapsedHours || totalHours < C.minCurrentHours) return null;
    return clamp(totalHours / elapsedProductiveHours * C.productiveShiftHours, 0, 99.99);
  }

  function activeBreak(now, started) {
    if (!started) return null;
    for (const item of C.breaks) {
      const start = new Date(now);
      start.setHours(item.hour, item.minute, 0, 0);
      const end = new Date(start.getTime() + item.durationMin * 60000);
      if (now >= start && now < end) return item;
    }
    return null;
  }

  function normalize(raw) {
    const timestamp = raw?.collectionOps?.timestamp ? new Date(raw.collectionOps.timestamp) : new Date();
    const labelCounts = {};
    const pageMix = pagePeriodMixByName();
    const pageMixCounts = {};
    const operators = (raw?.collectionOps?.operators || [])
      .map(operator => {
        const total = operatorHours(operator);
        const pagePeriodMix = pagePeriodMixForOperator(operator.operator, pageMix, pageMixCounts, total);
        return {
          name: operator.operator,
          locker: labelFor(operator.operator, labelCounts),
          total,
          projected: projected(total, timestamp),
          sessions: sessions(operator),
          away: pagePeriodMix?.away ?? awayTime(operator),
          setup: pagePeriodMix?.setup ?? setupTime(operator)
        };
      })
      .filter(operator => operator.locker !== '--')
      .sort((a, b) => Number(a.locker) - Number(b.locker));
    if (!operators.length) throw new Error('No labeled operators were returned from the API.');
    return { timestamp, operators };
  }

  function demoRaw() {
    const seconds = Math.floor(Date.now() / 1000);
    const operators = LABEL_ENTRIES.map(([name], index) => {
      const wave = (Math.sin(seconds / 18 + index * 1.6) + 1) * 0.08;
      const base = clamp(4.95 - index * 0.18 + wave, 0.25, 5.55);
      return {
        operator: name,
        collectedHours: Math.max(base - 0.25, 0).toFixed(2),
        EvalHours: (0.12 + (index % 4) * 0.06).toFixed(2),
        collectSessions: 2 + index % 7,
        'Period Mix': [
          { color: 'Cyan', hours: index % 6 === 0 ? '--' : (0.05 + (index % 5) * 0.03).toFixed(2) },
          { color: 'Teal', hours: index % 7 === 0 ? '--' : (0.02 + (index % 4) * 0.02).toFixed(2) }
        ]
      };
    });
    return { collectionOps: { timestamp: new Date().toISOString(), operators } };
  }

  async function fetchShift() {
    if (localPreview) return normalize(demoRaw());
    const url = new URL(C.apiUrl);
    url.searchParams.set('_okrTs', String(Date.now()));
    const response = await fetch(url.toString(), { credentials: 'include', mode: 'cors', cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed: ${response.status}`);
    return normalize(await response.json());
  }

  function spriteIndexFor(locker) {
    const index = Number(locker);
    return Number.isFinite(index) ? (index - 1) % C.spriteCount : 0;
  }

  function directionIndexFor(degrees) {
    const normalized = ((degrees % 360) + 360) % 360;
    return Math.round(normalized / 45) % C.spriteDirectionCount;
  }

  function platePosition(directionIndex) {
    const frame = 112;
    const angle = directionIndex * Math.PI / 4;
    const localX = 5;
    const localY = 0;
    const x = frame / 2 + localX * Math.cos(angle) - localY * Math.sin(angle);
    const y = frame / 2 + localX * Math.sin(angle) + localY * Math.cos(angle);
    return { x: x / frame * 100, y: y / frame * 100 };
  }

  function flamePosition(directionIndex) {
    const frame = 112;
    const angle = directionIndex * Math.PI / 4;
    const localX = -30;
    const localY = 0;
    const x = frame / 2 + localX * Math.cos(angle) - localY * Math.sin(angle);
    const y = frame / 2 + localX * Math.sin(angle) + localY * Math.cos(angle);
    return {
      x: x / frame * 100,
      y: y / frame * 100,
      angle: directionIndex * 45
    };
  }

  function installStyles() {
    const style = document.createElement('style');
    style.id = C.styleId;
    style.textContent = `
      @keyframes okrIn{from{opacity:0}to{opacity:1}}
      @keyframes okrVibrate{0%,100%{transform:translate(0,0) rotate(0)}25%{transform:translate(.6px,-.5px) rotate(-.4deg)}50%{transform:translate(-.5px,.4px) rotate(.35deg)}75%{transform:translate(.4px,.3px) rotate(-.25deg)}}
      @keyframes okrFlip{0%{transform:rotateX(0);filter:brightness(1)}45%{transform:rotateX(86deg);filter:brightness(.55)}55%{transform:rotateX(-86deg);filter:brightness(1.35)}100%{transform:rotateX(0);filter:brightness(1)}}
      @keyframes okrCloudDrift{from{background-position:0 0,0 0,0 0,0 0}to{background-position:160px 0,-120px 0,110px 0,-90px 0}}
      @keyframes okrCrowdPulse{0%,100%{filter:saturate(1)}50%{filter:saturate(1.25) brightness(1.08)}}
      @keyframes okrCrowdCheer{0%,100%{filter:saturate(1.3) brightness(1.08);transform:translateY(0)}50%{filter:saturate(1.9) brightness(1.28);transform:translateY(-5px)}}
      @keyframes okrCrowdWave{0%,100%{opacity:.18;transform:translateY(7px) scale(.9)}28%{opacity:.95;transform:translateY(-10px) scale(1.06)}56%{opacity:.58;transform:translateY(-3px) scale(.98)}}
      @keyframes okrBleacherCheer{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.006)}}
      @keyframes okrCheerBurst{0%{opacity:0;transform:translate(-50%,12px) scale(.72)}16%{opacity:1;transform:translate(-50%,-4px) scale(1.06)}72%{opacity:1;transform:translate(-50%,-8px) scale(1)}100%{opacity:0;transform:translate(-50%,-18px) scale(.9)}}
      @keyframes okrCheerConfetti{0%{opacity:0;transform:translateY(10px) scale(.7)}20%{opacity:1}100%{opacity:0;transform:translateY(-30px) scale(1.12)}}
      @keyframes okrCameraFloat{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(0,-5px,0) scale(1.006)}}
      @keyframes okrLivePulse{0%,100%{box-shadow:0 0 0 rgba(239,68,68,0)}50%{box-shadow:0 0 16px rgba(239,68,68,.7)}}
      @keyframes okrLightSweep{0%,100%{opacity:.22;transform:translateX(-8%)}50%{opacity:.38;transform:translateX(8%)}}
      @keyframes okrCloudSail{from{transform:translate3d(var(--cloud-start),0,0) scale(var(--cloud-scale))}to{transform:translate3d(var(--cloud-end),0,0) scale(var(--cloud-scale))}}
      @keyframes okrBreakCloudFloat{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-4px)}}
      @keyframes okrBirdGlide{from{transform:translate3d(var(--bird-start),0,0) scale(var(--bird-scale))}to{transform:translate3d(var(--bird-end),0,0) scale(var(--bird-scale))}}
      @keyframes okrBirdFlap{0%,100%{transform:translateY(0) rotate(var(--wing-rot))}50%{transform:translateY(1px) rotate(var(--wing-mid-rot))}}
      @keyframes okrHudPulse{0%,100%{filter:brightness(1);transform:translateY(0)}50%{filter:brightness(1.22);transform:translateY(0)}}
      @keyframes okrScoreSweep{from{transform:translateX(-110%)}to{transform:translateX(110%)}}
      @keyframes okrItemSpin{0%,100%{transform:translate(-50%,-50%) rotate(45deg) scale(1)}50%{transform:translate(-50%,-57%) rotate(45deg) scale(1.08)}}
      @keyframes okrSignalCycle{0%,26%{background:#ef4444;box-shadow:0 0 12px rgba(239,68,68,.85)}33%,59%{background:#facc15;box-shadow:0 0 12px rgba(250,204,21,.85)}66%,100%{background:#22c55e;box-shadow:0 0 12px rgba(34,197,94,.85)}}
      @keyframes okrCoinBob{0%,100%{transform:translate(-50%,-50%) translateY(0) scaleX(.82)}50%{transform:translate(-50%,-50%) translateY(-5px) scaleX(1)}}
      @keyframes okrCoinCollect{0%{opacity:1;transform:translate(-50%,-50%) translateY(0) scale(1)}45%{opacity:1;transform:translate(-50%,-50%) translateY(-24px) scale(1.55)}100%{opacity:0;transform:translate(-50%,-50%) translateY(-36px) scale(.35)}}
      @keyframes okrCoinStreak{0%{opacity:0;transform:translate(-50%,-8px) scale(.72)}18%{opacity:1;transform:translate(-50%,-20px) scale(1.06)}72%{opacity:1;transform:translate(-50%,-25px) scale(1)}100%{opacity:0;transform:translate(-50%,-37px) scale(.82)}}
      @keyframes okrFireworkBurst{0%{opacity:0;transform:translate(-50%,-50%) scale(.12)}10%{opacity:1;transform:translate(-50%,-50%) scale(.5)}58%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}82%{opacity:.86;transform:translate(-50%,-50%) scale(1.22)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.34)}}
      @keyframes okrBoxHit{0%{transform:translate(-50%,-50%) rotate(45deg) scale(1)}38%{transform:translate(-50%,-78%) rotate(45deg) scale(1.24)}100%{transform:translate(-50%,-50%) rotate(45deg) scale(1)}}
      @keyframes okrItemBurst{0%{opacity:0;transform:translate(-50%,-50%) scale(.28)}12%{opacity:1;transform:translate(-50%,-50%) scale(.72)}62%{opacity:.96;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.28)}}
      @keyframes okrItemBonusPop{0%{opacity:0;transform:translate(-50%,-8px) scale(.68) rotate(-4deg)}16%{opacity:1;transform:translate(-50%,-24px) scale(1.08) rotate(3deg)}72%{opacity:1;transform:translate(-50%,-29px) scale(1) rotate(-2deg)}100%{opacity:0;transform:translate(-50%,-42px) scale(.86) rotate(4deg)}}
      @keyframes okrPassCutIn{0%{opacity:0;transform:translateX(-34px) scale(.96)}12%{opacity:1;transform:translateX(0) scale(1.02)}72%{opacity:1;transform:translateX(0) scale(1)}100%{opacity:0;transform:translateX(20px) scale(.98)}}
      @keyframes okrPowerBurst{0%{opacity:.95;transform:scale(.55) rotate(0)}100%{opacity:0;transform:scale(1.55) rotate(18deg)}}
      @keyframes okrWarpIn{0%{opacity:0;transform:scale(.08) rotate(-18deg);filter:brightness(2.2) saturate(1.8)}18%{opacity:1;transform:scale(1.22) rotate(8deg);filter:brightness(1.9) saturate(1.5)}34%{opacity:.35;transform:scale(.72) rotate(-5deg)}52%{opacity:1;transform:scale(1.08) rotate(2deg);filter:brightness(1.45) saturate(1.35)}100%{opacity:1;transform:scale(1) rotate(0);filter:brightness(1) saturate(1)}}
      @keyframes okrBannerGlow{0%,100%{filter:brightness(1);transform:translateY(0)}50%{filter:brightness(1.18);transform:translateY(-1px)}}
      @keyframes okrBannerFirework{0%{opacity:0;transform:translate(-50%,-50%) scale(.18) rotate(0)}14%{opacity:1;transform:translate(-50%,-50%) scale(.72) rotate(8deg)}70%{opacity:.92;transform:translate(-50%,-50%) scale(1.15) rotate(22deg)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.34) rotate(36deg)}}
      @keyframes okrBump{0%{transform:translate(0,0) rotate(0)}38%{transform:translate(var(--bump-x),var(--bump-y)) rotate(var(--bump-rot))}100%{transform:translate(0,0) rotate(0)}}
      @keyframes okrImpactSpark{0%{opacity:0;transform:translate(-50%,-50%) scale(.4)}14%{opacity:1;transform:translate(-50%,-50%) scale(.9)}70%{opacity:.92;transform:translate(-50%,-50%) scale(1.12)}100%{opacity:0;transform:translate(-50%,-50%) scale(.72)}}
      @keyframes okrLeaderFlame{0%,100%{opacity:.82;width:24px;filter:drop-shadow(0 0 4px rgba(249,115,22,.74))}50%{opacity:1;width:34px;filter:drop-shadow(0 0 9px rgba(250,204,21,.94))}}
      @keyframes okrSignWave{0%,100%{transform:translateY(0) rotate(var(--sign-rot))}50%{transform:translateY(-4px) rotate(var(--sign-mid-rot))}}
      #${C.overlayId}{--lane-h:52px;--track-w:1700px;--track-h:560px;--track-bottom-gap:28px;--race-h:720px;--bleacher-h:142px;--grandstand-lift:120px;--kart-size:66px;--plate-x:50%;--plate-y:60%;--plate-width:24px;--plate-height:14px;--plate-font:11px;--plate-border:2px;--finish-w:34px;--finish-tile:16px;--rank-top:92px;--rank-board-w:410px;--rank-row-h:17px;position:fixed;inset:0;z-index:2147483647;overflow:auto;color:#fff;background:radial-gradient(circle at 18% 54%,rgba(255,255,255,.14) 0 1px,transparent 1.5px) 0 0/24px 18px,radial-gradient(circle at 76% 70%,rgba(255,255,255,.1) 0 1px,transparent 1.5px) 0 0/30px 22px,linear-gradient(180deg,#64b5f6 0,#83d4ff 23%,#8ee68e 23%,#2baa4d 58%,#137336 100%);font-family:"Arial Black",Impact,Arial,Helvetica,sans-serif;animation:okrIn .16s ease;text-rendering:geometricPrecision}
      #${C.overlayId} *{box-sizing:border-box}
      #${C.overlayId} .clouds{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:radial-gradient(ellipse at 46% 17%,rgba(255,255,255,.16) 0 12%,transparent 46%),linear-gradient(180deg,rgba(255,255,255,.08),transparent 42%);animation:okrCloudDrift 90s linear infinite}
      #${C.overlayId} .clouds:before,#${C.overlayId} .clouds:after{content:"";position:absolute;left:-16%;right:-16%;height:148px;opacity:.24;background:radial-gradient(circle at 10% 64%,rgba(255,255,255,.38) 0 30px,transparent 32px),radial-gradient(circle at 21% 50%,rgba(255,255,255,.36) 0 42px,transparent 44px),radial-gradient(circle at 34% 42%,rgba(255,255,255,.34) 0 54px,transparent 56px),radial-gradient(circle at 51% 48%,rgba(255,255,255,.32) 0 46px,transparent 48px),radial-gradient(circle at 72% 60%,rgba(255,255,255,.32) 0 42px,transparent 44px),linear-gradient(180deg,transparent 0 48%,rgba(205,224,240,.28) 49% 78%,transparent 79%);filter:blur(6px);animation:okrCloudSail 70s linear infinite alternate;--cloud-start:-5%;--cloud-end:5%;--cloud-scale:1}
      #${C.overlayId} .clouds:before{top:72px}
      #${C.overlayId} .clouds:after{top:142px;opacity:.16;animation-duration:92s;animation-direction:alternate-reverse}
      #${C.overlayId} .cloud{position:absolute;top:var(--cloud-top);left:var(--cloud-left);width:var(--cloud-w);height:var(--cloud-h);opacity:var(--cloud-alpha);background:url("${C.cloudSpriteUrl}") var(--cloud-frame) 0/400% 100% no-repeat;filter:drop-shadow(0 14px 10px rgba(30,64,105,.24));transform-origin:center;animation:okrCloudSail var(--cloud-time) ease-in-out infinite alternate;--cloud-start:-7%;--cloud-end:7%;--cloud-scale:1}
      #${C.overlayId} .cloud:before,#${C.overlayId} .cloud:after{display:none}
      #${C.overlayId} .cloud-a{--cloud-left:2%;--cloud-top:42px;--cloud-w:246px;--cloud-h:124px;--cloud-alpha:.88;--cloud-time:48s;--cloud-scale:1.08;--cloud-start:-3vw;--cloud-end:8vw;--cloud-frame:0%}
      #${C.overlayId} .cloud-b{--cloud-left:30%;--cloud-top:96px;--cloud-w:180px;--cloud-h:90px;--cloud-alpha:.66;--cloud-time:62s;--cloud-scale:.9;--cloud-start:5vw;--cloud-end:-4vw;--cloud-frame:33.333%}
      #${C.overlayId} .cloud-c{--cloud-left:67%;--cloud-top:24px;--cloud-w:286px;--cloud-h:143px;--cloud-alpha:.84;--cloud-time:54s;--cloud-scale:1.18;--cloud-start:4vw;--cloud-end:-7vw;--cloud-frame:66.666%}
      #${C.overlayId} .cloud-d{--cloud-left:83%;--cloud-top:128px;--cloud-w:204px;--cloud-h:102px;--cloud-alpha:.58;--cloud-time:76s;--cloud-scale:.96;--cloud-start:-4vw;--cloud-end:5vw;--cloud-frame:100%}
      #${C.overlayId} .grass-texture{position:fixed;left:0;right:0;top:23vh;bottom:0;z-index:0;pointer-events:none;opacity:.82;background:radial-gradient(circle at 12% 18%,rgba(255,255,255,.13) 0 1px,transparent 1.8px) 0 0/18px 14px,radial-gradient(circle at 64% 34%,rgba(7,74,36,.22) 0 1.5px,transparent 2.4px) 0 0/26px 22px,linear-gradient(105deg,rgba(255,255,255,.11) 0 1px,transparent 1px 13px) 0 0/28px 24px,linear-gradient(72deg,rgba(4,94,45,.2) 0 1px,transparent 1px 15px) 0 0/32px 26px,repeating-linear-gradient(90deg,rgba(255,255,255,.045) 0 42px,rgba(5,94,42,.11) 42px 84px),radial-gradient(ellipse at 24% 38%,rgba(255,244,180,.11) 0 7%,transparent 26%),radial-gradient(ellipse at 78% 78%,rgba(4,78,35,.24) 0 12%,transparent 35%);mix-blend-mode:soft-light}
      #${C.overlayId} .bird{position:absolute;left:var(--bird-left);top:var(--bird-top);z-index:1;width:var(--bird-w);height:var(--bird-h);opacity:var(--bird-alpha);transform-origin:center;animation:okrBirdGlide var(--bird-time) linear infinite;--bird-start:-8vw;--bird-end:8vw;--bird-scale:1}
      #${C.overlayId} .bird:before,#${C.overlayId} .bird:after{content:"";position:absolute;top:46%;width:56%;height:62%;border-top:3px solid rgba(15,23,42,.72);border-radius:50%;filter:drop-shadow(0 1px 0 rgba(255,255,255,.08));animation:okrBirdFlap .9s ease-in-out infinite}
      #${C.overlayId} .bird:before{right:48%;transform-origin:right center;--wing-rot:22deg;--wing-mid-rot:13deg}
      #${C.overlayId} .bird:after{left:48%;transform-origin:left center;--wing-rot:-22deg;--wing-mid-rot:-13deg}
      #${C.overlayId} .bird-a{--bird-left:16%;--bird-top:76px;--bird-w:32px;--bird-h:14px;--bird-alpha:.62;--bird-time:38s;--bird-scale:1.05;--bird-start:-10vw;--bird-end:8vw}
      #${C.overlayId} .bird-b{--bird-left:48%;--bird-top:54px;--bird-w:24px;--bird-h:11px;--bird-alpha:.5;--bird-time:45s;--bird-scale:.82;--bird-start:7vw;--bird-end:-9vw}
      #${C.overlayId} .bird-c{--bird-left:72%;--bird-top:84px;--bird-w:30px;--bird-h:13px;--bird-alpha:.5;--bird-time:52s;--bird-scale:.9;--bird-start:10vw;--bird-end:-7vw}
      #${C.overlayId} .bird-d{--bird-left:35%;--bird-top:92px;--bird-w:17px;--bird-h:8px;--bird-alpha:.36;--bird-time:34s;--bird-scale:.62;--bird-start:-6vw;--bird-end:11vw}
      #${C.overlayId} .fireworks-layer{position:fixed;inset:0;z-index:6;overflow:hidden;pointer-events:none}
      #${C.overlayId} .firework{position:absolute;left:var(--fw-left);top:var(--fw-top);width:12px;height:12px;border-radius:999px;opacity:0;background:radial-gradient(circle,#fff 0 26%,var(--fw-a) 27% 58%,transparent 68%);box-shadow:0 0 20px var(--fw-a),0 0 38px rgba(255,255,255,.58);filter:drop-shadow(0 0 10px var(--fw-a)) drop-shadow(0 0 18px rgba(255,255,255,.55));transform:translate(-50%,-50%) scale(.2);pointer-events:none}
      #${C.overlayId} .firework:before,#${C.overlayId} .firework:after{content:"";position:absolute;left:50%;top:50%;width:7px;height:7px;border-radius:999px;background:var(--fw-a);box-shadow:0 -58px 0 var(--fw-a),41px -41px 0 var(--fw-b),58px 0 0 var(--fw-c),41px 41px 0 var(--fw-a),0 58px 0 var(--fw-b),-41px 41px 0 var(--fw-c),-58px 0 0 var(--fw-a),-41px -41px 0 var(--fw-b),22px -54px 0 #fff,-22px 54px 0 #fff;filter:drop-shadow(0 0 8px rgba(255,255,255,.75));transform:translate(-50%,-50%)}
      #${C.overlayId} .firework:after{width:5px;height:5px;box-shadow:0 -36px 0 var(--fw-c),25px -25px 0 var(--fw-a),36px 0 0 var(--fw-b),25px 25px 0 var(--fw-c),0 36px 0 var(--fw-a),-25px 25px 0 var(--fw-b),-36px 0 0 var(--fw-c),-25px -25px 0 var(--fw-a),13px -34px 0 #fff,-13px 34px 0 #fff;transform:translate(-50%,-50%) rotate(22deg)}
      #${C.overlayId}.is-fireworks .firework{animation:okrFireworkBurst 2.2s ease-out forwards;animation-delay:var(--fw-delay)}
      #${C.overlayId} .firework-a{--fw-left:17%;--fw-top:96px;--fw-delay:0s;--fw-a:#fde047;--fw-b:#f472b6;--fw-c:#38bdf8}
      #${C.overlayId} .firework-b{--fw-left:36%;--fw-top:58px;--fw-delay:.34s;--fw-a:#fb7185;--fw-b:#a7f3d0;--fw-c:#facc15}
      #${C.overlayId} .firework-c{--fw-left:58%;--fw-top:84px;--fw-delay:.68s;--fw-a:#93c5fd;--fw-b:#fef3c7;--fw-c:#f97316}
      #${C.overlayId} .firework-d{--fw-left:80%;--fw-top:112px;--fw-delay:1.02s;--fw-a:#86efac;--fw-b:#f9a8d4;--fw-c:#fde047}
      #${C.overlayId} .firework-e{--fw-left:48%;--fw-top:142px;--fw-delay:1.36s;--fw-a:#c084fc;--fw-b:#fef08a;--fw-c:#67e8f9}
      #${C.overlayId} .firework-f{--fw-left:91%;--fw-top:72px;--fw-delay:1.7s;--fw-a:#f97316;--fw-b:#bef264;--fw-c:#f9a8d4}
      #${C.overlayId} .firework-g{--fw-left:25%;--fw-top:184px;--fw-delay:2.04s;--fw-a:#67e8f9;--fw-b:#fef08a;--fw-c:#fb7185}
      #${C.overlayId} .firework-h{--fw-left:69%;--fw-top:154px;--fw-delay:2.38s;--fw-a:#bef264;--fw-b:#c084fc;--fw-c:#f97316}
      #${C.overlayId} .firework-i{--fw-left:8%;--fw-top:134px;--fw-delay:2.72s;--fw-a:#f9a8d4;--fw-b:#38bdf8;--fw-c:#fde047}
      #${C.overlayId} .firework-j{--fw-left:87%;--fw-top:196px;--fw-delay:3.06s;--fw-a:#fef08a;--fw-b:#fb7185;--fw-c:#86efac}
      #${C.overlayId} .firework-k{--fw-left:50%;--fw-top:102px;--fw-delay:3.4s;--fw-a:#38bdf8;--fw-b:#fde047;--fw-c:#f472b6}
      #${C.overlayId} .firework-l{--fw-left:74%;--fw-top:56px;--fw-delay:3.74s;--fw-a:#fb923c;--fw-b:#a7f3d0;--fw-c:#93c5fd}
      #${C.overlayId} .screen-fx{position:fixed;inset:0;z-index:5;pointer-events:none;background:linear-gradient(rgba(255,255,255,.038) 50%,rgba(0,0,0,.046) 50%) 0 0/100% 4px,repeating-linear-gradient(90deg,rgba(255,255,255,.025) 0 1px,transparent 1px 4px),radial-gradient(ellipse at 50% 52%,transparent 39%,rgba(15,23,42,.22) 100%);opacity:.72}
      #${C.overlayId} .screen-fx:before{content:"";position:absolute;inset:13px;border:2px solid rgba(255,255,255,.14);border-radius:10px;box-shadow:inset 0 0 46px rgba(15,23,42,.24),0 0 26px rgba(255,255,255,.06)}
      #${C.overlayId} .screen-fx:after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 0 34%,rgba(255,255,255,.13) 41%,transparent 50%);animation:okrLightSweep 8s ease-in-out infinite}
      #${C.overlayId} .top{position:sticky;top:0;z-index:7;margin:10px;padding:8px;border:0;background:transparent;box-shadow:none;backdrop-filter:none}
      #${C.overlayId} .head{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center}
      #${C.overlayId} .head-actions{display:flex;align-items:center;gap:7px}
      #${C.overlayId} .hours-stat-box{display:grid;grid-template-columns:auto auto;align-items:center;gap:7px;min-height:32px;padding:0 9px;border:2px solid #111827;border-radius:6px;color:#f8fafc;background:linear-gradient(180deg,#111827,#020617);font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 0 #111827,inset 0 2px 0 rgba(255,255,255,.16),0 0 12px rgba(250,204,21,.26)}
      #${C.overlayId} .hours-stat-box b{color:#facc15;font:1000 8px/1 "Arial Black",Arial,Helvetica,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-shadow:1px 1px 0 #000}
      #${C.overlayId} .hours-stat-box strong{display:block;min-width:58px;color:#f8fafc;font:1000 15px/1 "Arial Black",Arial,Helvetica,sans-serif;text-align:right;text-shadow:2px 2px 0 #000}
      #${C.overlayId} .score-stats-panel{position:fixed;right:calc(var(--rank-board-w) + 22px);top:42px;z-index:6;display:flex;flex-direction:column;align-items:stretch;gap:6px;min-width:156px;padding:5px;border:2px solid rgba(17,24,39,.9);border-radius:8px;background:linear-gradient(180deg,rgba(15,23,42,.9),rgba(2,6,23,.84));box-shadow:0 5px 0 rgba(3,7,18,.8),inset 0 1px 0 rgba(255,255,255,.14),0 0 14px rgba(250,204,21,.22);pointer-events:none}
      #${C.overlayId} .score-stats-panel .hours-stat-box{min-height:30px;padding:0 8px}
      #${C.overlayId} .title{color:#fff;font-family:Impact,"Arial Black",Arial,Helvetica,sans-serif;font-size:34px;font-weight:1000;line-height:1;text-shadow:0 2px 0 #ef4444,3px 3px 0 #111827,5px 5px 0 rgba(14,165,233,.62),0 0 12px rgba(255,255,255,.35);letter-spacing:.04em;-webkit-text-stroke:1px #111827}
      #${C.overlayId} .crew{display:block;margin-top:4px;color:#111827;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:900;letter-spacing:.12em;text-shadow:none;text-transform:uppercase;-webkit-text-stroke:0}
      #${C.overlayId} button{min-height:32px;border:2px solid #111827;border-radius:6px;padding:0 10px;color:#111827;background:linear-gradient(180deg,#fff 0,#e5e7eb 100%);font:900 12px/1 "Arial Black",Arial,Helvetica,sans-serif;cursor:pointer;box-shadow:0 4px 0 #111827,inset 0 2px 0 #fff,inset 0 -3px 0 #9ca3af}
      #${C.overlayId} #okr-close{position:fixed;right:12px;top:8px;z-index:9;min-height:24px;padding:0 8px;border-radius:5px;font-size:10px;box-shadow:0 3px 0 #111827,inset 0 1px 0 #fff,inset 0 -2px 0 #9ca3af}
      #${C.overlayId} .race{position:relative;z-index:1;display:flex;min-height:var(--race-h);padding:8px calc(var(--rank-board-w) + 26px) 16px 12px;flex-direction:column;justify-content:flex-end;gap:6px;overflow:hidden;perspective:1800px;perspective-origin:50% 12%}
      #${C.overlayId} .race:before{content:"";position:absolute;left:0;right:0;bottom:0;height:78%;z-index:0;pointer-events:none;background:radial-gradient(circle at 9% 22%,rgba(255,255,255,.14) 0 1px,transparent 1.7px) 0 0/20px 17px,radial-gradient(circle at 74% 58%,rgba(6,95,45,.22) 0 1.4px,transparent 2.2px) 0 0/24px 21px,linear-gradient(115deg,rgba(255,255,255,.1) 0 1px,transparent 1px 10px) 0 0/20px 20px,linear-gradient(72deg,rgba(5,78,35,.2) 0 1px,transparent 1px 12px) 0 0/22px 19px,repeating-linear-gradient(90deg,rgba(255,255,255,.035) 0 52px,rgba(5,94,42,.13) 52px 104px),radial-gradient(circle at 16% 78%,rgba(250,240,138,.17) 0 1px,transparent 1.5px) 0 0/28px 24px,radial-gradient(ellipse at 50% 82%,rgba(255,255,255,.14) 0 10%,transparent 46%),radial-gradient(ellipse at 50% 92%,rgba(0,0,0,.22) 0 42%,transparent 70%)}
      #${C.overlayId} .tree-line{position:fixed;left:0;right:0;top:calc(23vh - 160px);height:170px;z-index:1;pointer-events:none;opacity:.98;background:transparent;filter:drop-shadow(0 14px 12px rgba(0,0,0,.2))}
      #${C.overlayId} .tree-line:before{display:none}
      #${C.overlayId} .tree-line:after{content:"";position:absolute;left:2%;right:2%;bottom:0;height:44px;border-radius:50%;background:radial-gradient(ellipse at 50% 100%,rgba(6,78,59,.38) 0 52%,transparent 74%);filter:blur(5px)}
      #${C.overlayId} .tree{position:absolute;left:var(--tree-x);bottom:var(--tree-y);width:var(--tree-w);height:var(--tree-h);background:url("${C.treeSpriteUrl}") var(--tree-frame) 0/400% 100% no-repeat;image-rendering:pixelated;image-rendering:crisp-edges;transform:translateZ(0) scale(var(--tree-scale));transform-origin:50% 100%;filter:drop-shadow(6px 8px 0 rgba(4,41,21,.36)) drop-shadow(12px 18px 10px rgba(6,44,24,.24))}
      #${C.overlayId} .tree-a{--tree-x:1%;--tree-y:0;--tree-w:96px;--tree-h:128px;--tree-scale:1.2;--tree-frame:0%}
      #${C.overlayId} .tree-b{--tree-x:7%;--tree-y:0;--tree-w:96px;--tree-h:128px;--tree-scale:.95;--tree-frame:33.333%}
      #${C.overlayId} .tree-c{--tree-x:-2%;--tree-y:0;--tree-w:96px;--tree-h:128px;--tree-scale:.72;--tree-frame:66.666%;opacity:.82}
      #${C.overlayId} .tree-d{--tree-x:96%;--tree-y:0;--tree-w:96px;--tree-h:128px;--tree-scale:.76;--tree-frame:100%;opacity:.84}
      #${C.overlayId} .tree-e{--tree-x:88%;--tree-y:0;--tree-w:96px;--tree-h:128px;--tree-scale:1.05;--tree-frame:33.333%}
      #${C.overlayId} .tree-f{--tree-x:95%;--tree-y:0;--tree-w:96px;--tree-h:128px;--tree-scale:.82;--tree-frame:0%}
      #${C.overlayId} .scene-camera{position:relative;z-index:2;display:flex;width:100%;flex-direction:column;justify-content:flex-end;gap:6px;transform-origin:50% 88%}
      #${C.overlayId} .hud-row{position:absolute;left:18px;top:0;z-index:6;display:block;min-width:0;max-width:calc(100% - var(--rank-board-w) - 64px);pointer-events:none}
      #${C.overlayId} .live-stack{display:grid;gap:5px;justify-items:start}
      #${C.overlayId} .hud-top-line{display:flex;align-items:stretch;gap:8px;min-width:0}
      #${C.overlayId} .broadcast-hud{position:relative;display:flex;align-items:center;gap:8px;padding:6px 9px;border:2px solid rgba(17,24,39,.88);border-radius:6px;color:#f8fafc;background:rgba(2,6,23,.76);font:1000 10px/1 Arial,Helvetica,sans-serif;letter-spacing:.12em;text-shadow:1px 1px 0 #000;box-shadow:0 5px 0 rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.18);white-space:nowrap}
      #${C.overlayId} .live-dot{width:8px;height:8px;border-radius:999px;background:#ef4444;animation:okrLivePulse 1.2s ease-in-out infinite}
      #${C.overlayId} .game-hud{position:relative;display:flex;gap:6px;align-items:stretch;min-width:0;pointer-events:none}
      #${C.overlayId} .game-card{display:grid;min-width:70px;gap:0;padding:2px 7px;border:2px solid #111827;border-radius:6px;color:#f8fafc;background:linear-gradient(180deg,rgba(15,23,42,.92),rgba(2,6,23,.82));box-shadow:0 5px 0 rgba(0,0,0,.35),inset 0 2px 0 rgba(255,255,255,.16),inset 0 0 0 1px rgba(56,189,248,.22);text-align:center;text-shadow:1px 1px 0 #000;animation:okrHudPulse 2.2s steps(2,end) infinite}
      #${C.overlayId} .game-card.is-active{border-color:#facc15;box-shadow:0 5px 0 rgba(0,0,0,.35),inset 0 2px 0 rgba(255,255,255,.2),0 0 18px rgba(250,204,21,.65)}
      #${C.overlayId} .game-card b{color:#facc15;font-size:7px;line-height:1;letter-spacing:.1em;text-transform:uppercase}
      #${C.overlayId} .game-card strong{color:#38bdf8;font-size:11px;line-height:1;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace}
      #${C.overlayId} .break-banner{position:fixed;left:50%;top:68px;z-index:7;display:none;width:min(460px,42vw);height:auto;padding:0;color:#0f172a;background:transparent;font-family:"Arial Black",Arial,Helvetica,sans-serif;overflow:visible;text-align:center;pointer-events:none}
      #${C.overlayId} .break-banner:before,#${C.overlayId} .break-banner:after{display:none}
      #${C.overlayId} .break-banner.is-active{display:grid;grid-template-rows:auto auto;align-items:center;justify-items:center;gap:7px;animation:okrBreakCloudFloat 4.8s ease-in-out infinite}
      #${C.overlayId} .break-banner-title{position:relative;z-index:2;color:#075985;font-size:25px;font-weight:1000;letter-spacing:.1em;line-height:1;white-space:nowrap;text-shadow:3px 3px 0 #fff,0 0 10px rgba(125,211,252,.82),0 4px 10px rgba(15,23,42,.18);-webkit-text-stroke:1px rgba(255,255,255,.78)}
      #${C.overlayId} .break-banner-top3{position:relative;z-index:2;display:flex;align-items:center;justify-content:center;gap:7px;min-width:0;flex-wrap:nowrap}
      #${C.overlayId} .break-banner-racer{display:flex;align-items:center;gap:4px;min-height:21px;padding:2px 8px;border:2px solid rgba(14,116,144,.78);border-radius:999px;color:#075985;background:linear-gradient(180deg,rgba(255,255,255,.94),rgba(224,242,254,.82));box-shadow:0 2px 0 rgba(14,116,144,.26),inset 0 1px 0 rgba(255,255,255,.9),0 3px 9px rgba(30,64,105,.18);font:1000 10px/1 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;white-space:nowrap;text-shadow:0 1px 0 #fff}
      #${C.overlayId} .break-banner-racer b{color:#f97316;font-family:"Arial Black",Arial,Helvetica,sans-serif;font-size:10px;text-shadow:0 1px 0 #fff}
      #${C.overlayId} .banner-firework{display:none}
      #${C.overlayId} .banner-firework-left{left:78px}
      #${C.overlayId} .banner-firework-right{right:78px;animation-delay:.45s}
      #${C.overlayId} .grandstand{position:relative;z-index:3;width:min(100%,var(--track-w));margin:0 auto;display:grid;gap:4px;transform:translateY(calc(-1 * var(--grandstand-lift)))}
      #${C.overlayId} .bleachers{position:relative;width:100%;height:var(--bleacher-h);margin:0;border:3px solid #111827;border-radius:8px 8px 4px 4px;overflow:hidden;background:linear-gradient(180deg,#7f1d1d 0 13%,#111827 14% 16%,#475569 17% 100%);box-shadow:0 7px 0 #111827,0 12px 18px rgba(0,0,0,.22),inset 0 3px 0 rgba(255,255,255,.18)}
      #${C.overlayId} .bleachers:before{content:"";position:absolute;inset:25px 16px 30px;background:radial-gradient(circle at 7px 8px,#facc15 0 3px,transparent 3.6px) 0 0/34px 20px,radial-gradient(circle at 20px 10px,#38bdf8 0 3px,transparent 3.6px) 0 0/38px 20px,radial-gradient(circle at 30px 7px,#f472b6 0 3px,transparent 3.6px) 0 0/42px 20px,linear-gradient(180deg,transparent 0 13px,rgba(15,23,42,.72) 13px 15px,transparent 15px 20px);animation:okrCrowdPulse 1.8s steps(2,end) infinite}
      #${C.overlayId} .bleachers:after{content:"";position:absolute;left:0;right:0;bottom:0;height:26px;background:linear-gradient(180deg,rgba(15,23,42,.18),rgba(15,23,42,.72)),repeating-linear-gradient(90deg,#e5e7eb 0 26px,#94a3b8 26px 52px);border-top:3px solid #111827;box-shadow:inset 0 4px 0 rgba(255,255,255,.16)}
      #${C.overlayId} .bleacher-roof{position:absolute;left:-2%;right:-2%;top:0;z-index:4;height:24px;background:repeating-linear-gradient(90deg,#dc2626 0 52px,#f8fafc 52px 104px);border-bottom:3px solid #111827;transform:skewX(-10deg);transform-origin:top left}
      #${C.overlayId} .crowd-wave{position:absolute;left:18px;right:18px;top:36px;bottom:44px;z-index:2;display:grid;grid-template-columns:repeat(14,1fr);align-items:end;gap:6px;pointer-events:none}
      #${C.overlayId} .crowd-wave span{display:block;justify-self:center;width:20px;height:36px;border-radius:999px 999px 5px 5px;opacity:0;background:radial-gradient(circle at 50% 8%,#f8fafc 0 3px,transparent 3.6px),radial-gradient(circle at 30% 32%,var(--wave-a) 0 3px,transparent 3.7px),radial-gradient(circle at 70% 32%,var(--wave-b) 0 3px,transparent 3.7px),radial-gradient(circle at 50% 57%,var(--wave-c) 0 3px,transparent 3.7px);filter:drop-shadow(0 2px 0 rgba(17,24,39,.46));transform:translateY(7px) scale(.9);--wave-a:#fde047;--wave-b:#38bdf8;--wave-c:#f472b6}
      #${C.overlayId} .crowd-wave span:nth-child(3n+1){--wave-a:#facc15;--wave-b:#86efac;--wave-c:#f97316}
      #${C.overlayId} .crowd-wave span:nth-child(3n+2){--wave-a:#38bdf8;--wave-b:#f9a8d4;--wave-c:#fde047}
      #${C.overlayId} .grandstand.is-waving .crowd-wave span,#${C.overlayId} .grandstand.is-cheering .crowd-wave span{animation:okrCrowdWave 1.15s ease-in-out infinite;animation-delay:var(--wave-delay)}
      #${C.overlayId} .fan-signs{position:absolute;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:12px;pointer-events:none}
      #${C.overlayId} .fan-signs-back{left:18px;right:18px;top:26px;height:24px;opacity:.9}
      #${C.overlayId} .fan-signs-front{left:18px;right:18px;bottom:38px;height:30px}
      #${C.overlayId} .fan-sign{position:relative;display:grid;place-items:center;min-width:52px;min-height:24px;padding:3px 7px;border:2px solid #111827;border-radius:5px;color:#111827;background:linear-gradient(180deg,var(--sign-bg,#fde047),#fff7ad);font:1000 11px/1 "Arial Black",Arial,Helvetica,sans-serif;letter-spacing:.02em;text-shadow:0 1px 0 rgba(255,255,255,.58);box-shadow:0 4px 0 #111827,0 0 10px rgba(250,204,21,.28);transform:rotate(var(--sign-rot));animation:okrSignWave var(--sign-speed) ease-in-out infinite}
      #${C.overlayId} .fan-sign:before{content:"";position:absolute;left:50%;top:100%;width:4px;height:8px;background:#111827;transform:translateX(-50%)}
      #${C.overlayId} .fan-signs-back .fan-sign{min-width:44px;min-height:20px;padding:2px 6px;font-size:9px;box-shadow:0 3px 0 #111827,0 0 8px rgba(250,204,21,.24)}
      #${C.overlayId} .fan-signs-back .fan-sign:before{height:8px}
      #${C.overlayId} .fan-sign-a{--sign-rot:-4deg;--sign-mid-rot:3deg;--sign-speed:2.4s;--sign-bg:#fde047}
      #${C.overlayId} .fan-sign-b{--sign-rot:5deg;--sign-mid-rot:-3deg;--sign-speed:2.8s;--sign-bg:#7dd3fc}
      #${C.overlayId} .fan-sign-c{--sign-rot:-2deg;--sign-mid-rot:4deg;--sign-speed:2.2s;--sign-bg:#f9a8d4}
      #${C.overlayId} .fan-sign-d{--sign-rot:4deg;--sign-mid-rot:-4deg;--sign-speed:2.6s;--sign-bg:#86efac}
      #${C.overlayId} .fan-sign-e{--sign-rot:-5deg;--sign-mid-rot:2deg;--sign-speed:3s;--sign-bg:#fdba74}
      #${C.overlayId} .grandstand.is-cheering .fan-sign{animation-duration:.42s;filter:saturate(1.25) brightness(1.08)}
      #${C.overlayId} .grandstand.is-cheering .bleachers{animation:okrBleacherCheer .34s steps(2,end) infinite;filter:saturate(1.35) brightness(1.12);box-shadow:0 7px 0 #111827,0 12px 18px rgba(0,0,0,.22),inset 0 3px 0 rgba(255,255,255,.18),0 0 22px rgba(250,204,21,.5)}
      #${C.overlayId} .grandstand.is-cheering .bleachers:before{animation:okrCrowdCheer .18s steps(2,end) infinite}
      #${C.overlayId} .cheer-burst{position:absolute;left:50%;top:30px;z-index:6;display:grid;place-items:center;opacity:0;pointer-events:none;transform:translate(-50%,8px) scale(.86)}
      #${C.overlayId} .cheer-burst span{position:relative;z-index:1;display:block;padding:5px 10px;border:3px solid #111827;border-radius:7px;color:#111827;background:linear-gradient(180deg,#fde047,#f97316);font:1000 13px/1 "Arial Black",Arial,Helvetica,sans-serif;letter-spacing:.05em;text-shadow:0 1px 0 rgba(255,255,255,.55);box-shadow:0 5px 0 #111827,0 0 18px rgba(250,204,21,.72)}
      #${C.overlayId} .cheer-burst:before,#${C.overlayId} .cheer-burst:after{content:"";position:absolute;inset:-24px -70px;opacity:0;background:radial-gradient(circle at 12% 42%,#facc15 0 3px,transparent 4px),radial-gradient(circle at 24% 68%,#38bdf8 0 3px,transparent 4px),radial-gradient(circle at 38% 32%,#f472b6 0 3px,transparent 4px),radial-gradient(circle at 61% 58%,#22c55e 0 3px,transparent 4px),radial-gradient(circle at 76% 24%,#f97316 0 3px,transparent 4px),radial-gradient(circle at 90% 64%,#fff 0 3px,transparent 4px);filter:drop-shadow(0 2px 0 rgba(17,24,39,.45))}
      #${C.overlayId} .cheer-burst:after{transform:scaleX(-1)}
      #${C.overlayId} .grandstand.is-cheering .cheer-burst{animation:okrCheerBurst 4.1s ease-out forwards}
      #${C.overlayId} .grandstand.is-cheering .cheer-burst:before,#${C.overlayId} .grandstand.is-cheering .cheer-burst:after{animation:okrCheerConfetti 3.8s ease-out forwards}
      #${C.overlayId} .track{position:relative;width:min(100%,var(--track-w));height:var(--track-h);margin:0 auto var(--track-bottom-gap);background:url("${C.trackImageUrl}") center/100% 100% no-repeat;filter:none;transform:rotateX(1deg);transform-origin:50% 0;backface-visibility:hidden}
      #${C.overlayId} .track:before{display:none}
      #${C.overlayId} .track:after{display:none}
      #${C.overlayId} .infield{position:absolute;left:18%;right:18%;top:42%;height:17%;z-index:1;border:0;border-radius:999px;background:radial-gradient(ellipse at 50% 42%,rgba(255,255,255,.16),transparent 56%),radial-gradient(circle at 18% 58%,rgba(92,64,24,.16) 0 1.4px,transparent 2px) 0 0/26px 22px,linear-gradient(115deg,rgba(255,255,255,.11) 0 1px,transparent 1px 14px) 0 0/24px 19px,linear-gradient(180deg,#cdae67 0,#b88943 52%,#936a34 100%);box-shadow:inset 0 3px 0 rgba(255,255,255,.18),inset 0 -5px 0 rgba(92,64,24,.16);pointer-events:none;overflow:hidden}
      #${C.overlayId} .pit-lane{position:absolute;left:2%;right:2%;bottom:0;height:90%;z-index:1;border:2px solid rgba(17,24,39,.66);border-radius:16px;background:linear-gradient(180deg,#64748b 0,#334155 52%,#1f2937 100%);box-shadow:inset 0 2px 0 rgba(255,255,255,.2),inset 0 -4px 0 rgba(2,6,23,.38),0 2px 0 rgba(17,24,39,.26);overflow:hidden}
      #${C.overlayId} .pit-label{position:absolute;left:2%;top:15%;z-index:3;display:grid;place-items:center;width:38px;height:18px;border:2px solid #111827;border-radius:4px;color:#111827;background:#facc15;font:1000 10px/1 "Arial Black",Arial,Helvetica,sans-serif;letter-spacing:.08em;transform:skew(-8deg);box-shadow:0 2px 0 rgba(17,24,39,.52)}
      #${C.overlayId} .pit-grid{position:absolute;left:10%;right:4%;top:15%;bottom:14%;z-index:2;display:grid;grid-template-columns:repeat(9,1fr);grid-template-rows:repeat(3,1fr);gap:6px 8px}
      #${C.overlayId} .pit-grid:before,#${C.overlayId} .pit-grid:after{content:"";position:absolute;left:0;right:0;height:2px;background:repeating-linear-gradient(90deg,rgba(250,204,21,.78) 0 16px,transparent 16px 28px);filter:drop-shadow(0 1px 0 rgba(17,24,39,.45));pointer-events:none}
      #${C.overlayId} .pit-grid:before{top:33.333%;transform:translateY(-50%)}
      #${C.overlayId} .pit-grid:after{top:66.666%;transform:translateY(-50%)}
      #${C.overlayId} .pit-spot{display:block;min-width:0;min-height:0;border:1px solid rgba(248,250,252,.38);border-radius:4px;background:rgba(15,23,42,.13);box-shadow:inset 0 1px 0 rgba(255,255,255,.1),inset 0 -2px 0 rgba(2,6,23,.18),0 0 0 1px rgba(17,24,39,.16)}
      #${C.overlayId} .game-props{position:absolute;inset:0;z-index:2;pointer-events:none}
      #${C.overlayId} .item-box{position:absolute;left:var(--item-x);top:var(--item-y);display:grid;place-items:center;width:24px;height:24px;color:#111827;background:transparent;filter:drop-shadow(0 4px 0 #111827) drop-shadow(0 0 8px rgba(250,204,21,.58));animation:okrItemSpin 1.8s ease-in-out infinite;animation-delay:var(--item-delay);transition:opacity .18s ease,visibility .18s ease}
      #${C.overlayId} .item-box span{position:relative;z-index:1;display:grid;place-items:center;width:22px;height:22px;border:2px solid #111827;border-radius:5px;color:#111827;background:linear-gradient(180deg,#fde047 0,#facc15 58%,#f59e0b 100%);font:1000 15px/1 "Arial Black",Arial,Helvetica,sans-serif;transform:rotate(-45deg);box-shadow:inset 0 2px 0 rgba(255,255,255,.45),inset 0 -3px 0 rgba(120,53,15,.28)}
      #${C.overlayId} .item-box.is-hit{animation:okrBoxHit .58s ease-out;filter:drop-shadow(0 4px 0 #111827) drop-shadow(0 0 16px rgba(250,204,21,.86))}
      #${C.overlayId} .item-box.is-hit:before{content:"";position:absolute;left:50%;top:50%;z-index:0;width:5px;height:5px;background:#fff;box-shadow:0 -27px 0 #fff,0 -20px 0 #facc15,14px -23px 0 #fde047,24px -14px 0 #38bdf8,31px 0 0 #facc15,23px 14px 0 #22c55e,14px 24px 0 #fff,0 31px 0 #f97316,-14px 24px 0 #fde047,-24px 14px 0 #f472b6,-31px 0 0 #facc15,-23px -14px 0 #38bdf8,-14px -23px 0 #fff,8px -34px 0 #fef08a,34px -8px 0 #f97316,34px 10px 0 #fff,8px 34px 0 #38bdf8,-10px 34px 0 #facc15,-34px 8px 0 #fff,-34px -10px 0 #22c55e;image-rendering:pixelated;filter:drop-shadow(0 2px 0 rgba(17,24,39,.58));pointer-events:none;animation:okrItemBurst .5s steps(4,end) forwards}
      #${C.overlayId} .item-box.is-hit span{background:#22c55e;color:#f8fafc}
      #${C.overlayId} .item-box.is-hit:after{content:attr(data-bonus);position:absolute;left:50%;top:-18px;z-index:2;padding:2px 4px;border:2px solid #111827;border-radius:4px;color:#111827;background:#facc15;font:1000 8px/1 "Arial Black",Arial,Helvetica,sans-serif;transform:translateX(-50%) rotate(-45deg);box-shadow:0 2px 0 #111827}
      #${C.overlayId} .item-box.is-hidden{visibility:hidden;opacity:0;animation:none;transform:translate(-50%,-50%) scale(.35)}
      #${C.overlayId} .item-a{--item-x:35%;--item-y:28%;--item-delay:0s}
      #${C.overlayId} .item-b{--item-x:50%;--item-y:76%;--item-delay:.25s}
      #${C.overlayId} .item-c{--item-x:65%;--item-y:28%;--item-delay:.5s}
      #${C.overlayId} .item-d{--item-x:77%;--item-y:58%;--item-delay:.75s}
      #${C.overlayId} .start-gantry{position:absolute;left:70%;top:2%;display:flex;align-items:center;justify-content:center;gap:5px;width:86px;height:28px;border:3px solid #111827;border-radius:7px;background:linear-gradient(180deg,#374151,#020617);box-shadow:0 5px 0 #111827,inset 0 2px 0 rgba(255,255,255,.18);transform:translateX(-50%)}
      #${C.overlayId} .start-gantry i{width:13px;height:13px;border:2px solid #020617;border-radius:999px;background:#ef4444;animation:okrSignalCycle 2.1s steps(1,end) infinite;animation-delay:var(--signal-delay)}
      #${C.overlayId} .signal-a{--signal-delay:0s}
      #${C.overlayId} .signal-b{--signal-delay:.18s}
      #${C.overlayId} .signal-c{--signal-delay:.36s}
      #${C.overlayId} .track-coin{position:absolute;left:var(--coin-x);top:var(--coin-y);width:16px;height:22px;border:2px solid #78350f;border-radius:50%;background:linear-gradient(90deg,#f59e0b,#fde68a 48%,#f59e0b);box-shadow:0 3px 0 #78350f,0 0 10px rgba(250,204,21,.6);animation:okrCoinBob 1.3s ease-in-out infinite;animation-delay:var(--coin-delay);transition:opacity .18s ease,visibility .18s ease}
      #${C.overlayId} .track-coin.is-collected{animation:okrCoinCollect .58s ease-out forwards}
      #${C.overlayId} .track-coin.is-collected:after{content:"+1";position:absolute;left:50%;top:-16px;padding:1px 4px;border:2px solid #78350f;border-radius:4px;color:#78350f;background:#fde68a;font:1000 9px/1 "Arial Black",Arial,Helvetica,sans-serif;transform:translateX(-50%);box-shadow:0 2px 0 #78350f}
      #${C.overlayId} .track-coin.is-hidden{visibility:hidden;opacity:0;animation:none;transform:translate(-50%,-50%) scale(.35)}
      #${C.overlayId} .coin-a{--coin-x:42%;--coin-y:29%;--coin-delay:0s}
      #${C.overlayId} .coin-b{--coin-x:55%;--coin-y:28%;--coin-delay:.2s}
      #${C.overlayId} .coin-c{--coin-x:40%;--coin-y:74%;--coin-delay:.4s}
      #${C.overlayId} .coin-d{--coin-x:58%;--coin-y:75%;--coin-delay:.6s}
      #${C.overlayId} .impact-spark{position:absolute;left:var(--spark-x);top:var(--spark-y);z-index:1800;width:4px;height:4px;background:#fff;box-shadow:-8px 0 0 #facc15,8px 0 0 #fef08a,0 -8px 0 #fff,0 8px 0 #f97316,-6px -6px 0 #fde047,6px -6px 0 #f472b6,-6px 6px 0 #fb7185,6px 6px 0 #38bdf8,-12px 3px 0 rgba(250,204,21,.85),12px -3px 0 rgba(255,255,255,.9);image-rendering:pixelated;filter:drop-shadow(0 2px 0 rgba(17,24,39,.72)) drop-shadow(0 0 6px rgba(250,204,21,.65));pointer-events:none;transform:translate(-50%,-50%);animation:okrImpactSpark .38s steps(4,end) forwards}
      #${C.overlayId} .impact-spark:before,#${C.overlayId} .impact-spark:after{content:"";position:absolute;left:0;top:0;width:4px;height:4px;background:#f8fafc;box-shadow:-4px -10px 0 #fde047,10px 4px 0 #facc15,-10px -4px 0 #f97316,4px 10px 0 #38bdf8}
      #${C.overlayId} .impact-spark:after{transform:rotate(45deg);opacity:.78}
      #${C.overlayId} .pass-cutin{position:absolute;left:18px;top:49%;z-index:1900;display:grid;grid-template-columns:52px 1fr;align-items:center;width:228px;min-height:68px;padding:8px 10px;border:3px solid #111827;border-radius:7px;color:#f8fafc;background:linear-gradient(180deg,#1f2937 0,#020617 100%);box-shadow:0 6px 0 #030712,0 0 0 3px rgba(250,204,21,.7),0 0 16px rgba(56,189,248,.28);pointer-events:none;overflow:hidden;animation:okrPassCutIn 1.85s ease-out forwards}
      #${C.overlayId} .pass-cutin:before{content:"";position:absolute;inset:0;background:linear-gradient(105deg,rgba(250,204,21,.9) 0 24%,transparent 24% 100%),repeating-linear-gradient(135deg,rgba(255,255,255,.1) 0 3px,transparent 3px 9px);opacity:.9}
      #${C.overlayId} .pass-cutin:after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,#facc15,#38bdf8,#facc15)}
      #${C.overlayId} .pass-cutin-badge{position:relative;z-index:1;display:grid;place-items:center;width:44px;height:44px;border:3px solid #111827;border-radius:6px;color:#111827;background:linear-gradient(180deg,#fff7ad,#facc15);font:1000 10px/1 "Arial Black",Arial,Helvetica,sans-serif;box-shadow:0 4px 0 #111827;transform:skew(-8deg)}
      #${C.overlayId} .pass-cutin-text{position:relative;z-index:1;display:grid;gap:4px;min-width:0;padding-left:6px}
      #${C.overlayId} .pass-cutin-title{display:block;color:#facc15;font:1000 17px/1 "Arial Black",Arial,Helvetica,sans-serif;letter-spacing:.06em;text-shadow:2px 2px 0 #000}
      #${C.overlayId} .pass-cutin-detail{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#f8fafc;font:900 11px/1 Arial,Helvetica,sans-serif;letter-spacing:.02em;text-shadow:1px 1px 0 #000}
      #${C.overlayId} .pass-cutin-detail b{color:#facc15;font-weight:1000}
      #${C.overlayId} .start-cutin{width:274px;grid-template-columns:58px 1fr;box-shadow:0 6px 0 #030712,0 0 0 3px rgba(34,197,94,.72),0 0 18px rgba(34,197,94,.32)}
      #${C.overlayId} .start-cutin:before{background:linear-gradient(105deg,rgba(34,197,94,.88) 0 24%,transparent 24% 100%),repeating-linear-gradient(135deg,rgba(255,255,255,.1) 0 3px,transparent 3px 9px)}
      #${C.overlayId} .start-cutin:after{background:linear-gradient(90deg,#22c55e,#facc15,#22c55e)}
      #${C.overlayId} .start-cutin .pass-cutin-badge{width:48px;background:linear-gradient(180deg,#dcfce7,#22c55e)}
      #${C.overlayId} .start-cutin .pass-cutin-title{color:#86efac;font-size:15px}
      #${C.overlayId} .start-cutin .pass-cutin-detail{font-size:12px}
      #${C.overlayId} .start-cutin .pass-cutin-detail b{color:#86efac}
      #${C.overlayId} .kart{position:absolute;left:var(--x);top:var(--y);z-index:var(--kart-z);width:var(--kart-size);height:var(--kart-size);transform:translate(-50%,-50%) translate(var(--dodge-x,0px),var(--dodge-y,0px));transform-origin:center;filter:drop-shadow(0 8px 4px rgba(0,0,0,.55)) drop-shadow(0 1px 0 rgba(255,255,255,.16));will-change:left,top,transform}
      #${C.overlayId} .kart.is-passing{transition:left .18s linear,top .18s linear,transform .18s linear}
      #${C.overlayId} .kart.is-pitting:after{content:"PIT";position:absolute;left:100%;top:42%;z-index:8;display:grid;place-items:center;min-width:26px;height:15px;border:2px solid #111827;border-radius:4px;color:#111827;background:#facc15;font:1000 8px/1 "Arial Black",Arial,Helvetica,sans-serif;letter-spacing:.06em;box-shadow:0 2px 0 #111827;transform:translate(4px,-50%) skew(-8deg);pointer-events:none}
      #${C.overlayId} .kart-shell{position:absolute;inset:0;transform-origin:48% 78%;animation:okrVibrate .16s steps(2,end) infinite}
      #${C.overlayId} .kart.is-bumping .kart-shell{filter:brightness(1.08) saturate(1.08);animation:okrBump .24s ease-out}
      #${C.overlayId} .kart.is-pit-parked .kart-shell{animation:none;filter:brightness(.94) saturate(.9);transform:scale(.86)}
      #${C.overlayId} .kart.is-warping .kart-shell{animation:okrWarpIn .92s steps(5,end),okrVibrate .16s steps(2,end) .92s infinite}
      #${C.overlayId} .kart.is-powered .kart-sprite{filter:saturate(1.6) brightness(1.24)}
      #${C.overlayId} .kart.is-powered .kart-shell:after{content:"";position:absolute;inset:-8%;z-index:3;border-radius:999px;background:radial-gradient(circle,rgba(250,204,21,.58) 0 18%,rgba(56,189,248,.36) 28%,transparent 62%);mix-blend-mode:screen;pointer-events:none;animation:okrPowerBurst .62s ease-out forwards}
      #${C.overlayId} .kart-sprite{position:absolute;inset:0;background-image:url("${C.spriteSheetUrl}");background-repeat:no-repeat;background-size:${C.spriteCount * 100}% ${C.spriteDirectionCount * 100}%;background-position:var(--sprite-x) var(--sprite-y);image-rendering:auto}
      #${C.overlayId} .kart-leader-flame{position:absolute;left:var(--flame-x);top:var(--flame-y);z-index:1;display:none;width:28px;height:19px;border-radius:70% 40% 40% 70%;background:radial-gradient(circle at 82% 50%,#fff7ad 0 14%,#facc15 15% 31%,transparent 32%),radial-gradient(circle at 58% 50%,#fb923c 0 31%,transparent 32%),linear-gradient(90deg,#ef4444 0,#f97316 42%,rgba(250,204,21,.78) 78%,transparent 100%);clip-path:polygon(0 50%,30% 10%,100% 28%,76% 50%,100% 72%,30% 90%);transform:translate(-50%,-50%) rotate(var(--flame-angle));transform-origin:50% 50%;mix-blend-mode:screen;pointer-events:none;animation:okrLeaderFlame .18s steps(2,end) infinite}
      #${C.overlayId} .kart.is-leader:not(.is-pitting) .kart-leader-flame{display:block}
      #${C.overlayId} .kart-number{position:absolute;left:var(--plate-x);top:var(--plate-y);z-index:2;display:grid;place-items:center;min-width:var(--plate-width);height:var(--plate-height);padding:0 2px;border:var(--plate-border) solid rgba(17,24,39,.74);border-radius:4px;color:#111827;background:linear-gradient(180deg,rgba(255,255,255,.88) 0,rgba(248,250,252,.76) 62%,rgba(219,234,254,.66) 100%);font:1000 var(--plate-font)/1 Arial,Helvetica,sans-serif;letter-spacing:-.05em;box-shadow:0 1px 0 rgba(255,255,255,.52),inset 0 -1px 0 rgba(148,163,184,.3),0 1px 0 rgba(17,24,39,.28);text-shadow:0 1px 0 rgba(255,255,255,.66);transform:translate(-50%,-50%);opacity:1}
      #${C.overlayId} .coin-streak{position:absolute;left:50%;top:-4px;z-index:8;display:block;min-width:54px;padding:3px 6px;border:2px solid #78350f;border-radius:5px;color:#78350f;background:linear-gradient(180deg,#fff7ad,#facc15);font:1000 10px/1 "Arial Black",Arial,Helvetica,sans-serif;text-align:center;text-shadow:0 1px 0 rgba(255,255,255,.66);box-shadow:0 4px 0 #78350f,0 0 13px rgba(250,204,21,.82);animation:okrCoinStreak 1.55s ease-out forwards;pointer-events:none}
      #${C.overlayId} .item-bonus{position:absolute;left:50%;top:-10px;z-index:9;display:block;min-width:44px;padding:4px 7px;border:2px solid #111827;border-radius:6px;color:#111827;background:linear-gradient(180deg,#dbeafe,#38bdf8);font:1000 11px/1 "Arial Black",Arial,Helvetica,sans-serif;text-align:center;text-shadow:0 1px 0 rgba(255,255,255,.62);box-shadow:0 4px 0 #111827,0 0 14px rgba(56,189,248,.75);animation:okrItemBonusPop 1.75s ease-out forwards;pointer-events:none}
      #${C.overlayId} .item-bonus.is-cheer-bonus{min-width:70px;color:#111827;background:linear-gradient(180deg,#fff7ad,#f97316);box-shadow:0 4px 0 #111827,0 0 18px rgba(250,204,21,.88)}
      #${C.overlayId} .rank-board{position:fixed;right:12px;top:42px;bottom:8px;z-index:4;display:flex;width:var(--rank-board-w);min-height:0;padding:2px;border:2px solid rgba(17,24,39,.92);border-radius:8px;background:linear-gradient(180deg,rgba(15,23,42,.9),rgba(2,6,23,.88));box-shadow:0 5px 0 rgba(3,7,18,.9),0 10px 16px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.12),inset 0 0 0 1px rgba(250,204,21,.16);overflow:hidden}
      #${C.overlayId} .rank-board:before{display:none}
      #${C.overlayId} .rank-head{display:grid;grid-template-columns:46px 42px minmax(96px,1fr) 48px 46px 50px;gap:2px;align-items:center;margin-bottom:0;padding:0;color:#fde68a;font-size:10px;font-weight:1000;letter-spacing:0;text-align:center;text-transform:uppercase;text-shadow:1px 1px 0 #000;opacity:.92}
      #${C.overlayId} .rank-head span{display:grid;place-items:center;min-width:0;height:17px;line-height:1;white-space:nowrap}
      #${C.overlayId} .rank-head span:last-child{font-size:12px}
      #${C.overlayId} .rank-columns{position:relative;z-index:1;display:block;width:100%;min-height:0;flex:1}
      #${C.overlayId} .rank-column{display:flex;width:100%;min-height:0;flex:1;flex-direction:column;gap:0}
      #${C.overlayId} .rank-list{display:grid;gap:0;grid-auto-rows:var(--rank-row-h);align-content:start;min-height:0;overflow:hidden}
      #${C.overlayId} .rank-row{display:grid;grid-template-columns:1fr;gap:1px;align-items:center;min-height:0}
      #${C.overlayId} .rank-place{position:relative;display:grid;place-items:center;height:100%;min-height:19px;border:1px solid rgba(17,24,39,.9);border-radius:3px;color:#111827;background:linear-gradient(180deg,#fde047 0 48%,#b45309 49% 51%,#facc15 52% 100%);font:1000 17px/1 Arial,Helvetica,sans-serif;letter-spacing:-.05em;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 -2px 0 rgba(120,53,15,.36),0 1px 0 #000;text-shadow:0 1px 0 rgba(255,255,255,.55);transform-origin:center;transform-style:preserve-3d;overflow:hidden;white-space:nowrap}
      #${C.overlayId} .rank-place:before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.28);box-shadow:0 -1px 0 rgba(0,0,0,.45)}
      #${C.overlayId} .rank-place.is-podium{padding-left:12px}
      #${C.overlayId} .rank-place.is-podium:after{content:"\\2605";position:absolute;left:3px;top:50%;z-index:1;font-size:12px;line-height:1;transform:translateY(-50%);text-shadow:0 1px 0 rgba(0,0,0,.75),0 0 5px var(--podium-star)}
      #${C.overlayId} .rank-place.is-gold{--podium-star:#facc15}
      #${C.overlayId} .rank-place.is-silver{--podium-star:#e5e7eb}
      #${C.overlayId} .rank-place.is-bronze{--podium-star:#d97706}
      #${C.overlayId} .rank-place.is-gold:after{color:#facc15}
      #${C.overlayId} .rank-place.is-silver:after{color:#f8fafc}
      #${C.overlayId} .rank-place.is-bronze:after{color:#d97706}
      #${C.overlayId} .rank-place.is-first{border-color:#fff7ad;background:linear-gradient(180deg,#fff7ad 0 45%,#92400e 46% 52%,#facc15 53% 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.82),inset 0 -2px 0 rgba(120,53,15,.42),0 1px 0 #000,0 0 10px rgba(250,204,21,.72)}
      #${C.overlayId} .rank-place.is-second{border-color:#e5e7eb;box-shadow:inset 0 1px 0 rgba(255,255,255,.74),inset 0 -2px 0 rgba(100,116,139,.32),0 1px 0 #000,0 0 8px rgba(226,232,240,.45)}
      #${C.overlayId} .rank-place.is-third{border-color:#fdba74;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 -2px 0 rgba(120,53,15,.36),0 1px 0 #000,0 0 8px rgba(217,119,6,.45)}
      #${C.overlayId} .rank-place.is-flip{animation:okrFlip .62s ease}
      #${C.overlayId} .rank-locker{display:grid;grid-template-columns:46px 42px minmax(96px,1fr) 48px 46px 50px;gap:2px;align-items:center;height:100%;min-height:19px;padding:1px;border:1px solid rgba(148,163,184,.2);border-radius:4px;background:rgba(15,23,42,.74);box-shadow:inset 0 1px 0 rgba(255,255,255,.08);font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace}
      #${C.overlayId} .rank-locker.is-first{border-color:rgba(250,204,21,.88);background:linear-gradient(90deg,rgba(250,204,21,.2),rgba(15,23,42,.78) 42%,rgba(15,23,42,.74));box-shadow:inset 0 1px 0 rgba(255,255,255,.14),0 0 8px rgba(250,204,21,.28)}
      #${C.overlayId} .rank-locker.is-second{border-color:rgba(226,232,240,.74);background:linear-gradient(90deg,rgba(226,232,240,.16),rgba(15,23,42,.78) 42%,rgba(15,23,42,.74));box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 0 7px rgba(226,232,240,.22)}
      #${C.overlayId} .rank-locker.is-third{border-color:rgba(217,119,6,.78);background:linear-gradient(90deg,rgba(217,119,6,.16),rgba(15,23,42,.78) 42%,rgba(15,23,42,.74));box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 0 7px rgba(217,119,6,.22)}
      #${C.overlayId} .rank-cell{position:relative;display:grid;place-items:center;min-width:0;height:100%;min-height:17px;padding:0 3px;border:0;border-radius:3px;color:#f8fafc;background:transparent;box-shadow:none;text-shadow:1px 1px 0 #000;transform-origin:center;transform-style:preserve-3d;overflow:hidden}
      #${C.overlayId} .rank-cell:before{display:none}
      #${C.overlayId} .rank-cell.is-flip{animation:okrFlip .62s ease}
      #${C.overlayId} .rank-locker-num{font-size:17px;font-weight:1000;letter-spacing:-.05em}
      #${C.overlayId} .rank-hours{display:flex;align-items:center;justify-content:center;gap:1px;color:#111827;background:linear-gradient(180deg,#fde047 0 48%,#b45309 49% 51%,#facc15 52% 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 -2px 0 rgba(120,53,15,.36),0 1px 0 #000;text-shadow:0 1px 0 rgba(255,255,255,.55);font-size:15px;font-weight:1000;letter-spacing:-.07em;white-space:nowrap}
      #${C.overlayId} .rank-hours:before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.28);box-shadow:0 -1px 0 rgba(0,0,0,.45)}
      #${C.overlayId} .rank-hours .rank-projected{color:#111827}
      #${C.overlayId} .rank-sessions{color:#111827;background:linear-gradient(180deg,#fde047 0 48%,#b45309 49% 51%,#facc15 52% 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 -2px 0 rgba(120,53,15,.36),0 1px 0 #000;text-shadow:0 1px 0 rgba(255,255,255,.55);font-size:16px;font-weight:1000;letter-spacing:-.05em;white-space:nowrap}
      #${C.overlayId} .rank-sessions:before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.28);box-shadow:0 -1px 0 rgba(0,0,0,.45)}
      #${C.overlayId} .rank-time{color:#111827;background:linear-gradient(180deg,#dbeafe 0 48%,#1e3a8a 49% 51%,#38bdf8 52% 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.62),inset 0 -2px 0 rgba(30,58,138,.34),0 1px 0 #000;text-shadow:0 1px 0 rgba(255,255,255,.55);font-size:13px;font-weight:1000;letter-spacing:-.06em;white-space:nowrap}
      #${C.overlayId} .rank-time:before{content:"";position:absolute;left:0;right:0;top:50%;height:1px;background:rgba(255,255,255,.28);box-shadow:0 -1px 0 rgba(0,0,0,.45)}
      #${C.overlayId} .rank-away{background:linear-gradient(180deg,#cffafe 0 48%,#0e7490 49% 51%,#67e8f9 52% 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.68),inset 0 -2px 0 rgba(14,116,144,.36),0 1px 0 #000}
      #${C.overlayId} .rank-setup{background:linear-gradient(180deg,#ccfbf1 0 48%,#0f766e 49% 51%,#2dd4bf 52% 100%);box-shadow:inset 0 1px 0 rgba(255,255,255,.68),inset 0 -2px 0 rgba(15,118,110,.36),0 1px 0 #000}
      #${C.overlayId} .rank-empty{padding:10px 6px;border:2px dashed rgba(250,204,21,.45);border-radius:6px;color:#fde68a;text-align:center;font-size:15px;font-weight:900}
      #${C.overlayId} .msg{position:fixed;right:14px;bottom:14px;z-index:8;max-width:430px;padding:12px 14px;border:2px solid #111827;border-radius:8px;color:#111827;background:#fff;font-size:13px;font-weight:900;box-shadow:0 10px 30px rgba(0,0,0,.28)}
      #${C.overlayId}.break .track{filter:brightness(.8) saturate(.82)}
      #${C.overlayId}.break .kart{transition:left .9s ease}
      @media(max-width:820px){
        #${C.overlayId}{--rank-board-w:392px}
        #${C.overlayId} .head{grid-template-columns:1fr}
        #${C.overlayId} .head-actions{justify-self:end}
        #${C.overlayId} .hours-stat-box{min-height:28px;padding:0 7px}
        #${C.overlayId} .hours-stat-box strong{min-width:50px;font-size:13px}
        #${C.overlayId} .score-stats-panel{right:calc(var(--rank-board-w) + 18px);top:42px}
        #${C.overlayId} .race{padding-right:calc(var(--rank-board-w) + 20px)}
        #${C.overlayId} .rank-board{right:8px;overflow:hidden}
        #${C.overlayId} #okr-close{right:8px}
        #${C.overlayId} .bleachers{height:min(var(--bleacher-h),116px)}
        #${C.overlayId} .title{font-size:28px}
        #${C.overlayId} .hud-row{left:18px;right:auto;top:0;max-width:calc(100% - var(--rank-board-w) - 34px)}
        #${C.overlayId} .hud-top-line{flex-wrap:wrap}
        #${C.overlayId} .game-hud{flex-wrap:wrap}
      }
      @media(prefers-reduced-motion:reduce){
        #${C.overlayId} .kart-shell,#${C.overlayId} .kart-leader-flame,#${C.overlayId} .impact-spark,#${C.overlayId} .impact-spark:before,#${C.overlayId} .impact-spark:after,#${C.overlayId} .pass-cutin,#${C.overlayId} .clouds,#${C.overlayId} .cloud,#${C.overlayId} .bird,#${C.overlayId} .bird:before,#${C.overlayId} .bird:after,#${C.overlayId} .firework,#${C.overlayId} .firework:before,#${C.overlayId} .firework:after,#${C.overlayId} .clouds:before,#${C.overlayId} .clouds:after,#${C.overlayId} .bleachers,#${C.overlayId} .bleachers:before,#${C.overlayId} .crowd-wave span,#${C.overlayId} .fan-sign,#${C.overlayId} .coin-streak,#${C.overlayId} .item-bonus,#${C.overlayId} .cheer-burst,#${C.overlayId} .cheer-burst:before,#${C.overlayId} .cheer-burst:after,#${C.overlayId} .scene-camera,#${C.overlayId} .screen-fx:after,#${C.overlayId} .track:after,#${C.overlayId} .live-dot,#${C.overlayId} .game-card,#${C.overlayId} .rank-board:before,#${C.overlayId} .item-box,#${C.overlayId} .item-box:before,#${C.overlayId} .start-gantry i,#${C.overlayId} .track-coin,#${C.overlayId} .kart.is-powered .kart-shell:after,#${C.overlayId} .break-banner,#${C.overlayId} .banner-firework{animation:none}
      }
    `;
    document.head.appendChild(style);
  }

  function cleanup() {
    clearInterval(state.timer);
    clearTimeout(state.resizeTimer);
    clearTimeout(state.hudTimer);
    clearTimeout(state.cheerTimer);
    for (const timer of Object.values(state.propTimers)) clearTimeout(timer);
    if (state.animationFrame) cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
    window.removeEventListener('resize', resized);
    document.getElementById(C.styleId)?.remove();
    document.getElementById(C.overlayId)?.remove();
  }

  function createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = C.overlayId;
    overlay.__cleanup = cleanup;
    document.body.appendChild(overlay);
    return overlay;
  }

  function wrongHost(overlay) {
    overlay.innerHTML = `<div class="clouds"></div><div class="msg" style="left:50%;right:auto;top:50%;bottom:auto;transform:translate(-50%,-50%)">Open this bookmarklet while you are on <b>${C.host}</b> so it can use your RoboHub session.<br><br><button id="okr-host-close" type="button">Close</button></div>`;
    $('okr-host-close')?.addEventListener('click', cleanup);
  }

  function shell(overlay) {
    overlay.innerHTML = `
      <div class="clouds" aria-hidden="true">
        <span class="cloud cloud-a"></span>
        <span class="cloud cloud-b"></span>
        <span class="cloud cloud-c"></span>
        <span class="cloud cloud-d"></span>
        <span class="bird bird-a"></span>
        <span class="bird bird-b"></span>
        <span class="bird bird-c"></span>
        <span class="bird bird-d"></span>
      </div>
      <div class="break-banner" id="okr-break-banner" aria-hidden="true"></div>
      <div class="fireworks-layer" aria-hidden="true">
        <span class="firework firework-a"></span>
        <span class="firework firework-b"></span>
        <span class="firework firework-c"></span>
        <span class="firework firework-d"></span>
        <span class="firework firework-e"></span>
        <span class="firework firework-f"></span>
        <span class="firework firework-g"></span>
        <span class="firework firework-h"></span>
        <span class="firework firework-i"></span>
        <span class="firework firework-j"></span>
        <span class="firework firework-k"></span>
        <span class="firework firework-l"></span>
      </div>
      <div class="screen-fx" aria-hidden="true"></div>
      <div class="grass-texture" aria-hidden="true"></div>
      <div class="tree-line" aria-hidden="true">
        <span class="tree tree-a"></span>
        <span class="tree tree-b"></span>
        <span class="tree tree-c"></span>
        <span class="tree tree-d"></span>
        <span class="tree tree-e"></span>
        <span class="tree tree-f"></span>
      </div>
      <div class="top">
        <div class="head">
          <div class="title">${C.title}<span class="crew">${C.crew}</span></div>
          <div class="head-actions">
            <button id="okr-close" type="button">Close</button>
          </div>
        </div>
      </div>
      <aside class="rank-board" id="okr-rank-board" aria-label="Live race order board"></aside>
      <div class="score-stats-panel" aria-hidden="true">
        <div class="hours-stat-box total-hours-box" title="Total operator hours"><b>Total Hours</b><strong id="okr-total-hours">0.00h</strong></div>
        <div class="hours-stat-box avg-hours-box" title="Average hours per active operator"><b>Avg. Hours</b><strong id="okr-avg-hours">0.00h</strong></div>
      </div>
      <div class="race">
        <div class="hud-row" aria-hidden="true">
          <div class="live-stack">
            <div class="hud-top-line">
              <div class="broadcast-hud"><span class="live-dot"></span><span>LIVE RACE CAM</span></div>
              <div class="game-hud">
                <span class="game-card"><b>Mode</b><strong>ARCADE</strong></span>
                <span class="game-card" title="Total active operators"><b>Total Ops</b><strong id="okr-total-operators">0</strong></span>
                <span class="game-card"><b>Item</b><strong id="okr-item-status">READY</strong></span>
              </div>
            </div>
          </div>
        </div>
        <div class="scene-camera">
          <div class="grandstand">
            <div class="cheer-burst" id="okr-cheer-burst" aria-hidden="true"><span>LEADER LAP</span></div>
            <div class="bleachers" aria-hidden="true">
              <div class="bleacher-roof"></div>
              <div class="crowd-wave">
                ${Array.from({ length: 14 }, (_, index) => `<span style="--wave-delay:${(index * 0.07).toFixed(2)}s"></span>`).join('')}
              </div>
              <div class="fan-signs fan-signs-back" id="okr-fan-signs-back"></div>
              <div class="fan-signs fan-signs-front" id="okr-fan-signs"></div>
            </div>
          </div>
          <div class="track" id="okr-track"></div>
        </div>
      </div>
    `;
    $('okr-close')?.addEventListener('click', cleanup);
  }

  function fitKarts(operatorCount) {
    const overlay = $(C.overlayId);
    if (!overlay) return;

    const top = overlay.querySelector('.top');
    const race = overlay.querySelector('.race');
    const topBottom = top?.getBoundingClientRect().bottom || 82;
    const raceWidth = race?.getBoundingClientRect().width || window.innerWidth;
    const rankBoardWidth = clamp(Math.round(window.innerWidth * 0.31), 392, 440);
    const sideReserve = rankBoardWidth + 88;
    const availableWidth = Math.max(300, raceWidth - sideReserve);
    const raceHeight = Math.max(430, window.innerHeight - topBottom - 14);
    const rankBoardTop = 42;
    const rankBoardBottom = 8;
    const rankBoardChrome = 8;
    const rankHeaderHeight = 17;
    const rankRowsHeight = Math.max(260, window.innerHeight - rankBoardTop - rankBoardBottom - rankBoardChrome - rankHeaderHeight);
    const rankRowHeight = clamp(Math.floor(rankRowsHeight / Math.max(operatorCount, 1)), 19, 26);
    const bleacherHeight = clamp(Math.round(raceHeight * 0.18), 118, 142);
    const trackBottomGap = clamp(Math.round(raceHeight * 0.04), 22, 34);
    const availableHeight = Math.max(220, raceHeight - bleacherHeight - trackBottomGap - 48);
    const trackHeight = clamp(Math.floor(Math.min(availableHeight, availableWidth / C.trackAspect)), 260, 720);
    const trackWidth = Math.round(trackHeight * C.trackAspect);
    const laneHeight = clamp(Math.floor(trackHeight / Math.max(operatorCount, 1)), 22, 52);
    const kartSize = clamp(Math.round(trackHeight * 0.115), 30, 44);
    const plateBorder = laneHeight < 34 ? 1 : 2;
    const naturalGrandstandTop = topBottom + raceHeight - 16 - trackBottomGap - trackHeight - 6 - bleacherHeight;
    const grassLine = Math.round(window.innerHeight * 0.23);
    const grandstandLift = clamp(Math.round(naturalGrandstandTop - grassLine), 24, 170);

    overlay.style.setProperty('--track-h', `${trackHeight}px`);
    overlay.style.setProperty('--track-w', `${trackWidth}px`);
    overlay.style.setProperty('--race-h', `${Math.round(raceHeight)}px`);
    overlay.style.setProperty('--bleacher-h', `${bleacherHeight}px`);
    overlay.style.setProperty('--grandstand-lift', `${grandstandLift}px`);
    overlay.style.setProperty('--track-bottom-gap', `${trackBottomGap}px`);
    overlay.style.setProperty('--rank-board-w', `${rankBoardWidth}px`);
    overlay.style.setProperty('--rank-row-h', `${rankRowHeight}px`);
    overlay.style.setProperty('--lane-h', `${laneHeight}px`);
    overlay.style.setProperty('--kart-size', `${kartSize}px`);
    overlay.style.setProperty('--plate-width', `${Math.max(22, Math.round(kartSize * 0.48))}px`);
    overlay.style.setProperty('--plate-height', `${Math.max(14, Math.round(kartSize * 0.3))}px`);
    overlay.style.setProperty('--plate-font', `${Math.max(12, Math.round(kartSize * 0.27))}px`);
    overlay.style.setProperty('--plate-border', `${plateBorder}px`);
    overlay.style.setProperty('--finish-w', `${clamp(Math.round(laneHeight * 0.65), 18, 34)}px`);
    overlay.style.setProperty('--finish-tile', `${clamp(Math.round(laneHeight * 0.31), 8, 16)}px`);
    overlay.style.setProperty('--rank-top', `${Math.round(topBottom + 10)}px`);
  }

  function rankedOperatorsByHours(operators) {
    return operators
      .filter(operator => operator.total > 0)
      .sort((a, b) => b.total - a.total || Number(a.locker) - Number(b.locker))
      .slice(0, C.rankSlots);
  }

  function leaderOperator(operators) {
    return rankedOperatorsByHours(operators)[0] || null;
  }

  function lapsForHours(totalHours) {
    return Math.max(0, Math.floor(Math.max(0, Number(totalHours) || 0) / C.lapHours));
  }

  function lapsFor(locker) {
    const totalHours = state.totalHoursByLocker[locker];
    if (Number.isFinite(totalHours)) return lapsForHours(totalHours);
    return Math.max(0, Math.floor(Number(state.lapsByLocker[locker]) || 0));
  }

  function coinsFor(locker) {
    return Math.max(0, Math.floor(Number(state.coinPointsByLocker[locker]) || 0));
  }

  function refreshRankBoard() {
    if (!state.lastPayload) return;
    const board = $('okr-rank-board');
    if (board) board.innerHTML = rankBoardHtml(state.lastPayload.operators);
  }

  function rankBoardHtml(operators) {
    const ranked = rankedOperatorsByHours(operators);
    const rows = operators
      .filter(operator => operator.total > 0)
      .sort((a, b) => Number(a.locker) - Number(b.locker));
    const previous = state.rankPositions || {};
    const previousHourValues = state.rankHourValues || {};
    const previousSessionValues = state.rankSessionValues || {};
    const previousAwayValues = state.rankAwayValues || {};
    const previousSetupValues = state.rankSetupValues || {};
    const hasPrevious = Object.keys(previous).length > 0;
    const hasPreviousHours = Object.keys(previousHourValues).length > 0;
    const hasPreviousSessions = Object.keys(previousSessionValues).length > 0;
    const hasPreviousAway = Object.keys(previousAwayValues).length > 0;
    const hasPreviousSetup = Object.keys(previousSetupValues).length > 0;
    const rankByLocker = {};
    ranked.forEach((operator, index) => {
      rankByLocker[operator.locker] = index + 1;
    });
    state.rankPositions = { ...rankByLocker };
    state.rankHourValues = Object.fromEntries(rows.map(operator => {
      const projectedHours = operator.projected == null ? '--' : operator.projected.toFixed(2);
      return [operator.locker, `${operator.total.toFixed(2)}/${projectedHours}`];
    }));
    state.rankSessionValues = Object.fromEntries(rows.map(operator => [
      operator.locker,
      Math.max(0, Math.round(operator.sessions || 0))
    ]));
    state.rankAwayValues = Object.fromEntries(rows.map(operator => [
      operator.locker,
      formatTimeMetric(operator.away)
    ]));
    state.rankSetupValues = Object.fromEntries(rows.map(operator => [
      operator.locker,
      formatTimeMetric(operator.setup)
    ]));

    if (!rows.length) {
      return '<div class="rank-head"><span>LOCKER</span><span>POS</span><span title="Hours / Projected Hours">HOUR/PROJ</span><span title="Total Sessions">SESS</span><span title="Away Time">AWAY</span><span title="Setup / Block Time">SETUP</span></div><div class="rank-empty">Awaiting active operators</div>';
    }

    return `
      <div class="rank-columns">
        <div class="rank-column">
          <div class="rank-head"><span>LOCKER</span><span>POS</span><span title="Hours / Projected Hours">HOUR/PROJ</span><span title="Total Sessions">SESS</span><span title="Away Time">AWAY</span><span title="Setup / Block Time">SETUP</span></div>
          <div class="rank-list">
            ${rows.map(operator => {
              const position = rankByLocker[operator.locker] || '--';
              const posChanged = hasPrevious && previous[operator.locker] !== undefined && previous[operator.locker] !== position;
              const posFlipClass = posChanged ? ' is-flip' : '';
              const projectedHours = operator.projected == null ? '--' : operator.projected.toFixed(2);
              const hourValue = `${operator.total.toFixed(2)}/${projectedHours}`;
              const hoursChanged = hasPreviousHours && previousHourValues[operator.locker] !== undefined && previousHourValues[operator.locker] !== hourValue;
              const hoursFlipClass = hoursChanged ? ' is-flip' : '';
              const sessionValue = Math.max(0, Math.round(operator.sessions || 0));
              const sessionsChanged = hasPreviousSessions && previousSessionValues[operator.locker] !== undefined && previousSessionValues[operator.locker] !== sessionValue;
              const sessionsFlipClass = sessionsChanged ? ' is-flip' : '';
              const awayValue = formatTimeMetric(operator.away);
              const setupValue = formatTimeMetric(operator.setup);
              const awayChanged = hasPreviousAway && previousAwayValues[operator.locker] !== undefined && previousAwayValues[operator.locker] !== awayValue;
              const setupChanged = hasPreviousSetup && previousSetupValues[operator.locker] !== undefined && previousSetupValues[operator.locker] !== setupValue;
              const awayFlipClass = awayChanged ? ' is-flip' : '';
              const setupFlipClass = setupChanged ? ' is-flip' : '';
              const podiumClass = position === 1
                ? ' is-podium is-gold is-first'
                : position === 2
                  ? ' is-podium is-silver is-second'
                  : position === 3
                    ? ' is-podium is-bronze is-third'
                    : '';
              return `<div class="rank-row">
                <div class="rank-locker${podiumClass}" title="${esc(operator.total.toFixed(2))} total hours, ${esc(projectedHours)} projected hours, ${esc(Math.round(operator.sessions))} total sessions, ${esc(awayValue)} away time, ${esc(setupValue)} setup time">
                  <span class="rank-cell rank-locker-num">${esc(operator.locker)}</span>
                  <span class="rank-place${posFlipClass}${podiumClass}">${esc(position)}</span>
                  <span class="rank-cell rank-hours${hoursFlipClass}"><span>${operator.total.toFixed(2)}</span><span>/</span><span class="rank-projected">${esc(projectedHours)}</span></span>
                  <span class="rank-cell rank-sessions${sessionsFlipClass}">${esc(sessionValue)}</span>
                  <span class="rank-cell rank-time rank-away${awayFlipClass}">${esc(awayValue)}</span>
                  <span class="rank-cell rank-time rank-setup${setupFlipClass}">${esc(setupValue)}</span>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function breakBannerHtml(breakItem, operators) {
    if (!breakItem) return '';
    const title = breakItem.label === 'LUNCH' ? 'LUNCH TIME' : 'BREAK TIME';
    const topThree = rankedOperatorsByHours(operators).slice(0, 3);
    const racers = topThree.length
      ? topThree.map((operator, index) => (
        `<span class="break-banner-racer"><b>${index + 1}</b>#${esc(operator.locker)} ${operator.total.toFixed(2)}h</span>`
      )).join('')
      : '<span class="break-banner-racer"><b>--</b>WAITING</span>';

    return `
      <span class="banner-firework banner-firework-left" aria-hidden="true"></span>
      <span class="break-banner-title">${title}</span>
      <span class="break-banner-top3">${racers}</span>
      <span class="banner-firework banner-firework-right" aria-hidden="true"></span>
    `;
  }

  function crowdSignsHtml(operators, row = 'front') {
    const ranked = rankedOperatorsByHours(operators);
    const lockers = ranked.map(operator => operator.locker);
    const messages = row === 'back'
      ? [
        lockers[3] ? `#${lockers[3]}` : 'WOO',
        'GO!',
        lockers[4] ? `#${lockers[4]}` : 'KARTS',
        'FAST',
        lockers[5] ? `#${lockers[5]}` : 'TEAM'
      ]
      : [
        lockers[0] ? `GO #${lockers[0]}` : 'GO KARTS',
        lockers[1] ? `#${lockers[1]} FAST` : 'FAST',
        'LION',
        lockers[2] ? `GO #${lockers[2]}` : 'COINS',
        'LAP!'
      ];

    return messages.map((message, index) => (
      `<span class="fan-sign fan-sign-${String.fromCharCode(97 + index)}">${esc(message)}</span>`
    )).join('');
  }

  function laneOffsetForIndex(laneIndex) {
    return TRACK.laneOffsets[laneIndex % TRACK.laneOffsets.length];
  }

  function clampLaneOffset(offset) {
    return clamp(offset, -82, 82);
  }

  function trackGeometry(progress, laneIndex, laneOffset = laneOffsetForIndex(laneIndex)) {
    const centerX = TRACK.width / 2;
    const centerY = TRACK.height / 2;
    const leftX = centerX - TRACK.straight / 2;
    const rightX = centerX + TRACK.straight / 2;
    const radius = TRACK.baseRadius + laneOffset;
    const topY = centerY - radius;
    const bottomY = centerY + radius;
    const straightLen = rightX - leftX;
    const arcLen = Math.PI * radius;
    const lapLen = straightLen * 2 + arcLen * 2;
    const stagger = (laneIndex - 4) * 3.5;
    let distance = ((((progress % 1) + 1) % 1) * lapLen + stagger + lapLen) % lapLen;
    let x;
    let y;
    let rotation;

    if (distance < straightLen) {
      x = rightX - distance;
      y = topY;
      rotation = 180;
    } else if ((distance -= straightLen) < arcLen) {
      const theta = -Math.PI / 2 - distance / radius;
      x = leftX + Math.cos(theta) * radius;
      y = centerY + Math.sin(theta) * radius;
      rotation = Math.atan2(-Math.cos(theta), Math.sin(theta)) * 180 / Math.PI;
    } else if ((distance -= arcLen) < straightLen) {
      x = leftX + distance;
      y = bottomY;
      rotation = 0;
    } else {
      distance -= straightLen;
      const theta = Math.PI / 2 - distance / radius;
      x = rightX + Math.cos(theta) * radius;
      y = centerY + Math.sin(theta) * radius;
      rotation = Math.atan2(-Math.cos(theta), Math.sin(theta)) * 180 / Math.PI;
    }

    return {
      x: x / TRACK.width * 100,
      y: y / TRACK.height * 100,
      rotation
    };
  }

  function mixGeometry(start, end, amount) {
    const t = smooth(clamp(amount, 0, 1));
    return {
      x: lerp(start.x, end.x, t),
      y: lerp(start.y, end.y, t),
      rotation: lerp(start.rotation, end.rotation, t)
    };
  }

  function pitSlotGeometry(slotIndex) {
    const index = Math.max(0, Number(slotIndex) || 0) % (PIT.columns * PIT.rows);
    const column = index % PIT.columns;
    const row = Math.floor(index / PIT.columns);
    const x = lerp(PIT.minX, PIT.maxX, PIT.columns <= 1 ? 0.5 : column / (PIT.columns - 1));
    return {
      x,
      y: PIT.rowsY[row] || PIT.rowsY[0],
      rotation: 0
    };
  }

  function pitGeometryForRacer(racer, normalGeometry, now) {
    const target = state.pitTargets[racer.locker];
    const wantsPit = Boolean(target?.pitted);
    const slot = pitSlotGeometry(target?.slotIndex ?? racer.laneIndex);
    let pitState = state.pitStates[racer.locker];

    if (wantsPit) {
      if (!pitState || pitState.phase === 'track' || pitState.phase === 'exiting') {
        pitState = {
          phase: 'entering',
          startedAt: now,
          from: normalGeometry,
          slot
        };
        state.pitStates[racer.locker] = pitState;
      }

      pitState.slot = slot;
      if (pitState.phase === 'entering') {
        const amount = clamp((now - pitState.startedAt) / C.pitEnterMs, 0, 1);
        const approachAmount = clamp(amount / 0.62, 0, 1);
        const slotAmount = clamp((amount - 0.62) / 0.38, 0, 1);
        const geometry = amount < 0.62
          ? mixGeometry(pitState.from, PIT.entry, approachAmount)
          : mixGeometry(PIT.entry, slot, slotAmount);
        if (amount >= 1) {
          pitState.phase = 'parked';
          pitState.startedAt = now;
        }
        const vars = kartVars(racer.locker, geometry);
        pitState.vars = vars;
        return {
          phase: pitState.phase === 'parked' ? 'parked' : 'enter',
          pitting: true,
          reason: target.reason,
          vars
        };
      }

      const vars = kartVars(racer.locker, slot);
      pitState.vars = vars;
      return {
        phase: 'parked',
        pitting: true,
        reason: target.reason,
        vars
      };
    }

    if (pitState && pitState.phase !== 'track') {
      if (pitState.phase !== 'exiting') {
        pitState.phase = 'exiting';
        pitState.startedAt = now;
        pitState.from = pitState.slot || slot;
      }

      const amount = clamp((now - pitState.startedAt) / C.pitExitMs, 0, 1);
      if (amount >= 1) {
        delete state.pitStates[racer.locker];
        return null;
      }

      const exitAmount = clamp(amount / 0.52, 0, 1);
      const mergeAmount = clamp((amount - 0.52) / 0.48, 0, 1);
      const geometry = amount < 0.52
        ? mixGeometry(pitState.from, PIT.exit, exitAmount)
        : mixGeometry(PIT.exit, normalGeometry, mergeAmount);
      const vars = kartVars(racer.locker, geometry);
      pitState.vars = vars;
      return {
        phase: 'exit',
        pitting: true,
        vars
      };
    }

    return null;
  }

  function speedFor(operator) {
    const pace = clamp(operator.total / C.lapHours, 0, 1);
    const demoBoost = localPreview ? (DEMO_PASS_SPEED_BOOSTS[operator.locker] || 0) : 0;
    return C.trackChaseSpeed + pace * 0.035 + demoBoost;
  }

  function normalizeProgress(value) {
    return ((value % 1) + 1) % 1;
  }

  function hourProgressFor(operator) {
    return normalizeProgress(Math.max(0, operator.total) / C.lapHours);
  }

  function targetProgressFor(operator) {
    return normalizeProgress(state.trackClock + hourProgressFor(operator));
  }

  function signedProgressDelta(from, to) {
    const delta = normalizeProgress(to - from);
    return delta > 0.5 ? delta - 1 : delta;
  }

  function moveProgressToward(current, target, maxStep) {
    const delta = signedProgressDelta(current, target);
    if (Math.abs(delta) <= maxStep) return target;
    return normalizeProgress(current + Math.sign(delta) * maxStep);
  }

  function averageLapLength() {
    return TRACK.straight * 2 + Math.PI * TRACK.baseRadius * 2;
  }

  function safeProgressGap(kartCount, kartSize) {
    if (kartCount < 2) return 0;
    const visualGap = clamp(kartSize * 1.62 / averageLapLength(), 0.022, 0.04);
    return Math.min(visualGap, 0.94 / kartCount);
  }

  function ensureLaneState(locker, laneIndex, now) {
    if (!state.laneByLocker[locker]) {
      const baseOffset = laneOffsetForIndex(laneIndex);
      state.laneByLocker[locker] = {
        base: baseOffset,
        current: baseOffset,
        target: baseOffset,
        driftUntil: now
      };
    }
    return state.laneByLocker[locker];
  }

  function updateLaneOffset(locker, laneIndex, now, dt) {
    const lane = ensureLaneState(locker, laneIndex, now);
    lane.base = clampLaneOffset(lane.base);
    lane.target = clampLaneOffset(now <= lane.driftUntil ? lane.target : lane.base);

    const delta = lane.target - lane.current;
    const maxStep = C.passLaneSpeed * dt;
    if (Math.abs(delta) <= maxStep) {
      lane.current = lane.target;
    } else {
      lane.current += Math.sign(delta) * maxStep;
    }

    lane.current = clampLaneOffset(lane.current);
    return lane.current;
  }

  function progressGap(ahead, behind) {
    return normalizeProgress(ahead - behind);
  }

  function racerHours(racer) {
    return Number.isFinite(racer.totalHours) ? racer.totalHours : 0;
  }

  function hourGap(first, second) {
    return Math.abs(racerHours(first) - racerHours(second));
  }

  function closeEnoughForSideBySide(first, second) {
    return hourGap(first, second) < C.passHourGap;
  }

  function canPass(passer, passed) {
    return racerHours(passer) >= racerHours(passed) + C.passHourGap;
  }

  function markPassingPair(first, second) {
    first.isPassing = true;
    second.isPassing = true;
  }

  function sideBySideLaneTargets(first, second, now) {
    const firstLane = ensureLaneState(first.locker, first.laneIndex, now);
    const secondLane = ensureLaneState(second.locker, second.laneIndex, now);
    const midpoint = clampLaneOffset((firstLane.base + secondLane.base) / 2);
    const spread = C.passLaneSpread;
    const firstInside = firstLane.current < secondLane.current
      || (firstLane.current === secondLane.current && Number(first.locker) <= Number(second.locker));

    firstLane.target = clampLaneOffset(midpoint + (firstInside ? -spread / 2 : spread / 2));
    secondLane.target = clampLaneOffset(midpoint + (firstInside ? spread / 2 : -spread / 2));
    firstLane.driftUntil = now + C.passLaneHoldMs;
    secondLane.driftUntil = now + C.passLaneHoldMs;
    markPassingPair(first, second);
  }

  function passingLaneTargets(passer, passed, now) {
    const passerLane = ensureLaneState(passer.locker, passer.laneIndex, now);
    const passedLane = ensureLaneState(passed.locker, passed.laneIndex, now);
    const midpoint = clampLaneOffset((passerLane.base + passedLane.base) / 2);
    const direction = passedLane.current <= 0 ? 1 : -1;
    const halfSpread = C.passLaneSpread / 2;

    passerLane.target = clampLaneOffset(midpoint + direction * halfSpread);
    passedLane.target = clampLaneOffset(midpoint - direction * halfSpread);
    passerLane.driftUntil = now + C.passLaneHoldMs;
    passedLane.driftUntil = now + C.passLaneHoldMs;
    markPassingPair(passer, passed);
  }

  function driftTargetForFrontKart(front, rear, now) {
    const frontLane = ensureLaneState(front.locker, front.laneIndex, now);
    const rearLane = ensureLaneState(rear.locker, rear.laneIndex, now);
    const awayFromRear = frontLane.base >= rearLane.current ? 1 : -1;
    const edgePush = Math.abs(frontLane.base) > 62 ? -Math.sign(frontLane.base) : awayFromRear;
    return clampLaneOffset(frontLane.base + edgePush * 24);
  }

  function updateTrafficDrifts(racers, now) {
    for (const racer of racers) {
      const lane = ensureLaneState(racer.locker, racer.laneIndex, now);
      if (now > lane.driftUntil) lane.target = lane.base;
    }

    for (let frontIndex = 0; frontIndex < racers.length; frontIndex += 1) {
      for (let rearIndex = 0; rearIndex < racers.length; rearIndex += 1) {
        if (frontIndex === rearIndex) continue;
        const front = racers[frontIndex];
        const rear = racers[rearIndex];
        if (isPittingRacer(front) || isPittingRacer(rear)) continue;
        const gap = progressGap(front.current, rear.current);
        if (gap <= 0.006 || gap >= 0.052) continue;

        if (closeEnoughForSideBySide(front, rear)) {
          sideBySideLaneTargets(front, rear, now);
          continue;
        }

        if (canPass(rear, front)) {
          passingLaneTargets(rear, front, now);
          continue;
        }

        const frontLane = ensureLaneState(front.locker, front.laneIndex, now);
        frontLane.target = driftTargetForFrontKart(front, rear, now);
        frontLane.driftUntil = now + 1250;
        front.isPassing = true;
      }
    }
  }

  function scaledTrackPoint(vars, rect) {
    return {
      x: vars.x / 100 * rect.width,
      y: vars.y / 100 * rect.height
    };
  }

  function distanceBetweenVars(a, b, rect) {
    const first = scaledTrackPoint(a, rect);
    const second = scaledTrackPoint(b, rect);
    return Math.hypot(first.x - second.x, first.y - second.y);
  }

  function contactPairKey(first, second) {
    return [first.locker, second.locker].sort().join(':');
  }

  function passPairKey(passer, passed) {
    return `${passer.locker}:${passed.locker}`;
  }

  function triggerKartBump(racer, nx, ny) {
    const bumpX = clamp(nx * 5.5, -6, 6);
    const bumpY = clamp(ny * 4.5, -5, 5);
    racer.kart.style.setProperty('--bump-x', `${bumpX.toFixed(1)}px`);
    racer.kart.style.setProperty('--bump-y', `${bumpY.toFixed(1)}px`);
    racer.kart.style.setProperty('--bump-rot', `${(nx * 3).toFixed(1)}deg`);
    racer.kart.classList.remove('is-bumping');
    void racer.kart.offsetWidth;
    racer.kart.classList.add('is-bumping');

    clearTimeout(state.propTimers[`bump-${racer.locker}`]);
    state.propTimers[`bump-${racer.locker}`] = setTimeout(() => {
      racer.kart.classList.remove('is-bumping');
    }, 260);
  }

  function triggerImpactSpark(first, second, rect, now) {
    const key = contactPairKey(first, second);
    if (now - (state.collisionHits[key] || 0) < 460) return;
    state.collisionHits[key] = now;

    const firstPoint = renderedPointFor(first, rect);
    const secondPoint = renderedPointFor(second, rect);
    let dx = firstPoint.x - secondPoint.x;
    let dy = firstPoint.y - secondPoint.y;
    let distance = Math.hypot(dx, dy);
    if (distance < 0.001) {
      const angle = Number(first.locker) * 1.73 || 0.5;
      dx = Math.cos(angle);
      dy = Math.sin(angle);
      distance = 1;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    triggerKartBump(first, nx, ny);
    triggerKartBump(second, -nx, -ny);

    const track = $('okr-track');
    if (!track) return;
    const spark = document.createElement('span');
    spark.className = 'impact-spark';
    spark.setAttribute('aria-hidden', 'true');
    spark.style.setProperty('--spark-x', `${((firstPoint.x + secondPoint.x) / 2 / rect.width * 100).toFixed(2)}%`);
    spark.style.setProperty('--spark-y', `${((firstPoint.y + secondPoint.y) / 2 / rect.height * 100).toFixed(2)}%`);
    track.appendChild(spark);

    const timerKey = `spark-${key}-${Math.round(now)}`;
    state.propTimers[timerKey] = setTimeout(() => {
      spark.remove();
      delete state.propTimers[timerKey];
    }, 420);
  }

  function triggerPassFlash(passer, passed, now) {
    const key = passPairKey(passer, passed);
    const lastHit = state.passFlashHits[key];
    if (Number.isFinite(lastHit) && now - lastHit < 2600) return false;
    state.passFlashHits[key] = now;

    const overlay = $(C.overlayId);
    if (!overlay) return false;

    overlay.querySelector('.pass-cutin')?.remove();

    const flash = document.createElement('span');
    flash.className = 'pass-cutin';
    flash.dataset.passer = passer.locker;
    flash.dataset.passed = passed.locker;
    flash.setAttribute('aria-hidden', 'true');
    flash.innerHTML = `
      <span class="pass-cutin-badge">PASS</span>
      <span class="pass-cutin-text">
        <span class="pass-cutin-title">OVERTAKE!</span>
        <span class="pass-cutin-detail"><b>#${esc(passer.locker)}</b> passed #${esc(passed.locker)}</span>
      </span>
    `;
    overlay.appendChild(flash);

    const timerKey = `pass-${key}-${Math.round(now)}`;
    state.propTimers[timerKey] = setTimeout(() => {
      flash.remove();
      delete state.propTimers[timerKey];
    }, 1950);
    return true;
  }

  function triggerRaceStartCutIn(locker, now) {
    const overlay = $(C.overlayId);
    if (!overlay) return false;

    overlay.querySelector('.pass-cutin')?.remove();

    const flash = document.createElement('span');
    flash.className = 'pass-cutin start-cutin';
    flash.dataset.locker = locker;
    flash.setAttribute('aria-hidden', 'true');
    flash.innerHTML = `
      <span class="pass-cutin-badge">START</span>
      <span class="pass-cutin-text">
        <span class="pass-cutin-title">RACE START</span>
        <span class="pass-cutin-detail"><b>Kart #${esc(locker)}</b> has Entered the Race</span>
      </span>
    `;
    overlay.appendChild(flash);

    const timerKey = `start-${locker}-${Math.round(now)}`;
    state.propTimers[timerKey] = setTimeout(() => {
      flash.remove();
      delete state.propTimers[timerKey];
    }, 2300);
    return true;
  }

  function detectPassFlashes(racers, now) {
    if (racers.length < 2) return;
    const activePassKeys = new Set();

    for (let frontIndex = 0; frontIndex < racers.length; frontIndex += 1) {
      for (let rearIndex = 0; rearIndex < racers.length; rearIndex += 1) {
        if (frontIndex === rearIndex) continue;

        const front = racers[frontIndex];
        const rear = racers[rearIndex];
        if (isPittingRacer(front) || isPittingRacer(rear)) continue;
        if (!canPass(rear, front)) continue;
        if (rear.speed <= front.speed + 0.0002) continue;

        const beforeGap = progressGap(front.current, rear.current);
        const afterGap = progressGap(front.next, rear.next);
        const key = passPairKey(rear, front);
        const crossed = beforeGap > 0 && beforeGap < 0.016 && afterGap > 0.9;
        const overtaking = beforeGap > 0.004 && beforeGap < 0.038;
        if (crossed || overtaking) {
          activePassKeys.add(key);
          passingLaneTargets(rear, front, now);
          if (!state.passCutInLocks[key]) {
            if (triggerPassFlash(rear, front, now)) state.passCutInLocks[key] = now;
          }
        } else if (beforeGap > 0.075) {
          delete state.passCutInLocks[key];
        }
      }
    }

    for (const key of Object.keys(state.passCutInLocks)) {
      if (!activePassKeys.has(key)) delete state.passCutInLocks[key];
    }
  }

  function resolveKartSpacing(racers, minGap) {
    if (racers.length < 2 || minGap <= 0) return;
    const targetGap = Math.min(minGap, 0.98 / racers.length);

    for (let pass = 0; pass < 8; pass += 1) {
      let changed = false;
      racers.sort((a, b) => a.next - b.next);

      for (let index = 0; index < racers.length; index += 1) {
        const current = racers[index];
        const next = racers[(index + 1) % racers.length];
        const gap = normalizeProgress(next.next - current.next);
        if (gap >= targetGap) continue;

        const push = (targetGap - gap) * 0.28;
        current.next = normalizeProgress(current.next - push);
        next.next = normalizeProgress(next.next + push);
        changed = true;
      }

      if (!changed) break;
    }
  }

  function resolveTrackPointSpacing(racers, rect, minDistance, now) {
    if (racers.length < 2 || minDistance <= 0) return;
    const lapPixels = Math.max(1, averageLapLength() * (rect.width / TRACK.width));

    for (let pass = 0; pass < 8; pass += 1) {
      let changed = false;

      racers.forEach(racer => {
        racer.vars = racer.pitDemo?.vars || kartVars(racer.locker, trackGeometry(racer.next, racer.laneIndex, racer.laneOffset));
      });

      for (let first = 0; first < racers.length - 1; first += 1) {
        for (let second = first + 1; second < racers.length; second += 1) {
          const a = racers[first];
          const b = racers[second];
          const distance = distanceBetweenVars(a.vars, b.vars, rect);
          if (distance >= minDistance) continue;

          if (closeEnoughForSideBySide(a, b)) {
            sideBySideLaneTargets(a, b, now);
            const delta = signedProgressDelta(a.next, b.next);
            const midpoint = normalizeProgress(a.next + delta / 2);
            a.next = moveProgressToward(a.next, midpoint, 0.0008);
            b.next = moveProgressToward(b.next, midpoint, 0.0008);
            if (distance >= minDistance * 0.4) {
              changed = true;
              continue;
            }
          }

          if (canPass(a, b) || canPass(b, a)) {
            if (canPass(a, b)) {
              passingLaneTargets(a, b, now);
            } else {
              passingLaneTargets(b, a, now);
            }
            if (distance >= minDistance * 0.45) {
              changed = true;
              continue;
            }
          }

          const progressDelta = signedProgressDelta(a.next, b.next);
          const direction = Math.abs(progressDelta) > 0.00001
            ? Math.sign(progressDelta)
            : (Number(a.locker) <= Number(b.locker) ? 1 : -1);
          const push = clamp((minDistance - distance) / lapPixels * 0.24, 0.0004, 0.004);
          a.next = normalizeProgress(a.next - direction * push);
          b.next = normalizeProgress(b.next + direction * push);
          changed = true;
        }
      }

      if (!changed) break;
    }
  }

  function renderedPointFor(racer, rect) {
    const vars = racer.vars || racer.desiredVars;
    const point = scaledTrackPoint(vars, rect);
    return {
      x: point.x + (racer.dodgeX || 0),
      y: point.y + (racer.dodgeY || 0)
    };
  }

  function markStackedKarts(racers, rect, dustDistance, now) {
    if (racers.length < 2) return;

    for (let first = 0; first < racers.length - 1; first += 1) {
      for (let second = first + 1; second < racers.length; second += 1) {
        if (isPittingRacer(racers[first]) || isPittingRacer(racers[second])) continue;
        const pointA = renderedPointFor(racers[first], rect);
        const pointB = renderedPointFor(racers[second], rect);
        const distance = Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
        if (distance >= dustDistance) continue;

        triggerImpactSpark(racers[first], racers[second], rect, now);
      }
    }
  }

  function limitDodge(racer, limit) {
    const distance = Math.hypot(racer.dodgeX, racer.dodgeY);
    if (distance <= limit || distance <= 0) return;
    const scale = limit / distance;
    racer.dodgeX *= scale;
    racer.dodgeY *= scale;
  }

  function isAnchoredPitKart(racer) {
    return racer.pitDemo?.phase === 'parked';
  }

  function isPittingRacer(racer) {
    return Boolean(racer.pitDemo && racer.pitDemo.pitting !== false);
  }

  function separateRenderedKarts(racers, rect, minDistance, now) {
    if (racers.length < 2) return;
    const dodgeLimit = minDistance * 0.34;

    racers.forEach(racer => {
      racer.vars = racer.pitDemo?.vars || kartVars(racer.locker, trackGeometry(racer.next, racer.laneIndex, racer.laneOffset));
      racer.dodgeX = 0;
      racer.dodgeY = 0;
    });

    for (let pass = 0; pass < 6; pass += 1) {
      let changed = false;

      for (let first = 0; first < racers.length - 1; first += 1) {
        for (let second = first + 1; second < racers.length; second += 1) {
          const a = racers[first];
          const b = racers[second];
          const pointA = scaledTrackPoint(a.vars, rect);
          const pointB = scaledTrackPoint(b.vars, rect);
          let dx = pointA.x + a.dodgeX - pointB.x - b.dodgeX;
          let dy = pointA.y + a.dodgeY - pointB.y - b.dodgeY;
          let distance = Math.hypot(dx, dy);
          const aPitting = isPittingRacer(a);
          const bPitting = isPittingRacer(b);
          const pairMinDistance = aPitting && bPitting
            ? minDistance * 0.72
            : (aPitting || bPitting ? minDistance * 1.15 : minDistance * 0.9);

          if (distance >= pairMinDistance) continue;
          if (distance < 0.001) {
            const angle = (first - second) * 2.399963;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distance = 1;
          }

          const push = pairMinDistance - distance;
          const nx = dx / distance;
          const ny = dy / distance;
          const aAnchored = isAnchoredPitKart(a);
          const bAnchored = isAnchoredPitKart(b);

          if (aAnchored && bAnchored) {
            continue;
          } else if (aAnchored && !bAnchored) {
            b.dodgeX -= nx * push;
            b.dodgeY -= ny * push;
          } else if (!aAnchored && bAnchored) {
            a.dodgeX += nx * push;
            a.dodgeY += ny * push;
          } else {
            const halfPush = push / 2;
            a.dodgeX += nx * halfPush;
            a.dodgeY += ny * halfPush;
            b.dodgeX -= nx * halfPush;
            b.dodgeY -= ny * halfPush;
          }
          limitDodge(a, dodgeLimit);
          limitDodge(b, dodgeLimit);
          changed = true;
        }
      }

      if (!changed) break;
    }
  }

  function enforcePitClearance(racers, rect, minDistance) {
    const pitRacers = racers.filter(isPittingRacer);
    if (!pitRacers.length) return;

    const targetDistance = minDistance * 1.25;
    const dodgeLimit = minDistance * 0.55;

    for (let pass = 0; pass < 6; pass += 1) {
      let changed = false;

      for (const pit of pitRacers) {
        pit.dodgeX = 0;
        pit.dodgeY = 0;
        const pitPoint = scaledTrackPoint(pit.vars, rect);

        for (const other of racers) {
          if (other === pit || other.pitDemo) continue;
          const otherPoint = scaledTrackPoint(other.vars, rect);
          let dx = otherPoint.x + other.dodgeX - pitPoint.x;
          let dy = otherPoint.y + other.dodgeY - pitPoint.y;
          let distance = Math.hypot(dx, dy);

          if (distance >= targetDistance) continue;
          if (distance < 0.001) {
            const angle = (Number(other.locker) || 1) * 1.73;
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            distance = 1;
          }

          const push = targetDistance - distance;
          other.dodgeX += dx / distance * push;
          other.dodgeY += dy / distance * push;
          limitDodge(other, dodgeLimit);
          changed = true;
        }
      }

      if (!changed) break;
    }
  }

  function kartVars(locker, geometry) {
    const spriteIndex = spriteIndexFor(locker);
    const directionIndex = directionIndexFor(geometry.rotation);
    const plate = platePosition(directionIndex);
    const flame = flamePosition(directionIndex);
    const spriteX = C.spriteCount === 1 ? 0 : spriteIndex / (C.spriteCount - 1) * 100;
    const spriteY = C.spriteDirectionCount === 1 ? 0 : directionIndex / (C.spriteDirectionCount - 1) * 100;
    return {
      x: geometry.x,
      y: geometry.y,
      z: Math.round(geometry.y * 10),
      spriteX,
      spriteY,
      plateX: plate.x,
      plateY: plate.y,
      flameX: flame.x,
      flameY: flame.y,
      flameAngle: flame.angle
    };
  }

  function styleForKart(locker, progress, laneIndex, laneOffset) {
    const vars = kartVars(locker, trackGeometry(progress, laneIndex, laneOffset));
    return styleFromKartVars(vars);
  }

  function styleFromKartVars(vars) {
    return `--x:${vars.x.toFixed(2)}%;--y:${vars.y.toFixed(2)}%;--kart-z:${vars.z};--sprite-x:${vars.spriteX}%;--sprite-y:${vars.spriteY}%;--plate-x:${vars.plateX.toFixed(2)}%;--plate-y:${vars.plateY.toFixed(2)}%;--flame-x:${vars.flameX.toFixed(2)}%;--flame-y:${vars.flameY.toFixed(2)}%;--flame-angle:${vars.flameAngle}deg`;
  }

  function applyKartVars(kart, vars) {
    kart.style.setProperty('--x', `${vars.x.toFixed(2)}%`);
    kart.style.setProperty('--y', `${vars.y.toFixed(2)}%`);
    kart.style.setProperty('--kart-z', String(vars.z));
    kart.style.setProperty('--sprite-x', `${vars.spriteX}%`);
    kart.style.setProperty('--sprite-y', `${vars.spriteY}%`);
    kart.style.setProperty('--plate-x', `${vars.plateX.toFixed(2)}%`);
    kart.style.setProperty('--plate-y', `${vars.plateY.toFixed(2)}%`);
    kart.style.setProperty('--flame-x', `${vars.flameX.toFixed(2)}%`);
    kart.style.setProperty('--flame-y', `${vars.flameY.toFixed(2)}%`);
    kart.style.setProperty('--flame-angle', `${vars.flameAngle}deg`);
    return vars;
  }

  function applyKartPosition(kart, locker, progress, laneIndex, laneOffset) {
    const vars = kartVars(locker, trackGeometry(progress, laneIndex, laneOffset));
    return applyKartVars(kart, vars);
  }

  function isWarping(locker, now = Date.now()) {
    const startedAt = Number(state.warpInLockers[locker]) || 0;
    if (!startedAt) return false;
    if (now - startedAt > 1600) {
      delete state.warpInLockers[locker];
      return false;
    }
    return true;
  }

  function syncMotion(operators) {
    const active = new Set();
    for (const operator of operators) {
      active.add(operator.locker);
      const operatorActive = operator.total > C.minCurrentHours;
      const wasActive = Boolean(state.activeLockers[operator.locker]);
      const shouldWarpIn = state.renderedOnce && operatorActive && !wasActive;
      const targetProgress = targetProgressFor(operator);
      state.hourProgressByLocker[operator.locker] = hourProgressFor(operator);
      state.totalHoursByLocker[operator.locker] = Math.max(0, operator.total);
      if (!Number.isFinite(state.motionByLocker[operator.locker])) {
        state.motionByLocker[operator.locker] = shouldWarpIn
          ? C.startLineProgress
          : targetProgress;
      } else if (shouldWarpIn) {
        state.motionByLocker[operator.locker] = C.startLineProgress;
      }
      if (shouldWarpIn) state.warpInLockers[operator.locker] = Date.now();
      state.activeLockers[operator.locker] = operatorActive;
      state.lapsByLocker[operator.locker] = lapsForHours(operator.total);
    }
    for (const locker of Object.keys(state.motionByLocker)) {
      if (!active.has(locker)) delete state.motionByLocker[locker];
    }
    for (const locker of Object.keys(state.hourProgressByLocker)) {
      if (!active.has(locker)) delete state.hourProgressByLocker[locker];
    }
    for (const locker of Object.keys(state.totalHoursByLocker)) {
      if (!active.has(locker)) delete state.totalHoursByLocker[locker];
    }
    for (const locker of Object.keys(state.laneByLocker)) {
      if (!active.has(locker)) delete state.laneByLocker[locker];
    }
    for (const locker of Object.keys(state.lapsByLocker)) {
      if (!active.has(locker)) delete state.lapsByLocker[locker];
    }
    for (const locker of Object.keys(state.coinStreaks)) {
      if (!active.has(locker)) delete state.coinStreaks[locker];
    }
    for (const locker of Object.keys(state.coinPointsByLocker)) {
      if (!active.has(locker)) delete state.coinPointsByLocker[locker];
    }
    for (const locker of Object.keys(state.itemBonusPointsByLocker)) {
      if (!active.has(locker)) delete state.itemBonusPointsByLocker[locker];
    }
    for (const locker of Object.keys(state.lastLapFlashByLocker)) {
      if (!active.has(locker)) delete state.lastLapFlashByLocker[locker];
    }
    for (const key of Object.keys(state.passFlashHits)) {
      const [passer, passed] = key.split(':');
      if (!active.has(passer) || !active.has(passed)) delete state.passFlashHits[key];
    }
    for (const key of Object.keys(state.passCutInLocks)) {
      const [passer, passed] = key.split(':');
      if (!active.has(passer) || !active.has(passed)) delete state.passCutInLocks[key];
    }
    for (const locker of Object.keys(state.operatorActivity)) {
      if (!active.has(locker)) delete state.operatorActivity[locker];
    }
    for (const locker of Object.keys(state.pitTargets)) {
      if (!active.has(locker)) delete state.pitTargets[locker];
    }
    for (const locker of Object.keys(state.pitStates)) {
      if (!active.has(locker)) delete state.pitStates[locker];
    }
    for (const locker of Object.keys(state.activeLockers)) {
      if (!active.has(locker)) delete state.activeLockers[locker];
    }
    for (const locker of Object.keys(state.warpInLockers)) {
      if (!active.has(locker)) delete state.warpInLockers[locker];
    }
  }

  function dateKey(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function shiftKey(now) {
    return dateKey(shiftStart(now));
  }

  function isRaceStartCutInWindow(now) {
    const start = shiftStart(now);
    const earliest = new Date(start.getTime() + C.raceStartCutInDelayMs);
    const latest = new Date(start.getTime() + C.raceStartCutInWindowMs);
    return now >= earliest && now <= latest;
  }

  function queueRaceStartCutIn(locker, timestamp) {
    const key = `${shiftKey(timestamp)}:${locker}`;
    if (state.startCutInSeen[key]) return;
    state.startCutInSeen[key] = true;
    state.startCutInQueue.push(locker);
    processRaceStartCutInQueue();
  }

  function processRaceStartCutInQueue() {
    if (!state.startCutInQueue.length) return;
    const wait = state.startCutInBusyUntil - Date.now();
    clearTimeout(state.propTimers.startCutInQueue);
    if (wait > 0) {
      state.propTimers.startCutInQueue = setTimeout(processRaceStartCutInQueue, wait);
      return;
    }

    const locker = state.startCutInQueue.shift();
    if (!locker || !triggerRaceStartCutIn(locker, Date.now())) return;
    state.startCutInBusyUntil = Date.now() + 2500;
    state.propTimers.startCutInQueue = setTimeout(processRaceStartCutInQueue, 2500);
  }

  function updateOperatorActivity(operators, timestamp) {
    const nowMs = Date.now();
    const active = new Set();
    const currentShiftKey = shiftKey(timestamp);
    const raceStartWindow = isRaceStartCutInWindow(timestamp);

    operators.forEach(operator => {
      active.add(operator.locker);
      const total = Number(operator.total) || 0;
      const operatorActive = total > C.minCurrentHours;
      const previous = state.operatorActivity[operator.locker];
      const totalChanged = !previous || previous.shiftKey !== currentShiftKey || Math.abs(total - previous.total) >= 0.005;
      const wasActive = Boolean(previous?.active && previous.shiftKey === currentShiftKey);

      state.operatorActivity[operator.locker] = {
        shiftKey: currentShiftKey,
        total,
        active: operatorActive,
        lastChangedAt: totalChanged ? nowMs : previous.lastChangedAt,
        lastSeenAt: nowMs
      };

      if (operatorActive && raceStartWindow && !wasActive) {
        queueRaceStartCutIn(operator.locker, timestamp);
      }
    });

    for (const locker of Object.keys(state.operatorActivity)) {
      if (!active.has(locker)) delete state.operatorActivity[locker];
    }
  }

  function updatePitTargets(operators, breakItem) {
    const nowMs = Date.now();
    const active = new Set();

    operators.forEach((operator, index) => {
      active.add(operator.locker);
      const operatorActive = operator.total > C.minCurrentHours;
      const activity = state.operatorActivity[operator.locker];
      const inactive = operatorActive && activity && nowMs - activity.lastChangedAt >= C.inactivePitMs;
      const shouldPit = operatorActive && (Boolean(breakItem) || inactive);

      if (shouldPit) {
        state.pitTargets[operator.locker] = {
          pitted: true,
          reason: breakItem?.label || 'INACTIVE',
          slotIndex: index % (PIT.columns * PIT.rows)
        };
      } else {
        delete state.pitTargets[operator.locker];
      }
    });

    for (const locker of Object.keys(state.pitTargets)) {
      if (!active.has(locker)) delete state.pitTargets[locker];
    }
  }

  function randomInt(max) {
    return Math.floor(Math.random() * max);
  }

  function shuffle(values) {
    const next = values.slice();
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function spawnPoolFor(prop) {
    return prop.type === 'coin' ? TRACK_COIN_SPAWNS : TRACK_ITEM_SPAWNS;
  }

  function assignPropSpawn(prop, index) {
    const pool = spawnPoolFor(prop);
    const spawn = pool[index % pool.length];
    prop.spawnIndex = index % pool.length;
    prop.x = spawn.x;
    prop.y = spawn.y;
    prop.rx = spawn.rx;
    prop.ry = spawn.ry;
  }

  function initializeTrackProps() {
    const spawnOrders = {
      coin: shuffle(TRACK_COIN_SPAWNS.map((_, index) => index)),
      item: shuffle(TRACK_ITEM_SPAWNS.map((_, index) => index))
    };
    const spawnCounts = { coin: 0, item: 0 };
    TRACK_PROPS.forEach((prop, index) => {
      prop.hiddenUntil = 0;
      const type = prop.type === 'coin' ? 'coin' : 'item';
      const order = spawnOrders[type];
      const nextIndex = order[spawnCounts[type] % order.length];
      spawnCounts[type] += 1;
      assignPropSpawn(prop, nextIndex);
    });
  }

  function randomSpawnIndex(prop) {
    const spawnPool = spawnPoolFor(prop);
    const occupied = new Set(TRACK_PROPS
      .filter(other => other.id !== prop.id && other.type === prop.type)
      .map(other => other.spawnIndex)
      .filter(index => Number.isFinite(index)));
    const candidates = spawnPool
      .map((_, index) => index)
      .filter(index => index !== prop.spawnIndex && !occupied.has(index));
    const fallback = spawnPool
      .map((_, index) => index)
      .filter(index => index !== prop.spawnIndex);
    const pool = candidates.length ? candidates : fallback;
    return pool.length ? pool[randomInt(pool.length)] : randomInt(spawnPool.length);
  }

  function propStyle(prop) {
    const prefix = prop.type === 'coin' ? 'coin' : 'item';
    return `--${prefix}-x:${prop.x}%;--${prefix}-y:${prop.y}%`;
  }

  function propRespawnMs(prop) {
    return prop.type === 'coin' ? C.coinRespawnMs : C.itemRespawnMs;
  }

  function isPropHidden(prop) {
    return Number(prop.hiddenUntil) > Date.now();
  }

  function propNode(prop) {
    return document.querySelector(`#${C.overlayId} .${prop.id}`);
  }

  function updatePropElement(prop) {
    const node = propNode(prop);
    if (!node) return;
    const prefix = prop.type === 'coin' ? 'coin' : 'item';
    node.style.setProperty(`--${prefix}-x`, `${prop.x}%`);
    node.style.setProperty(`--${prefix}-y`, `${prop.y}%`);
    node.dataset.spawnIndex = String(prop.spawnIndex);
    node.dataset.respawnMs = String(propRespawnMs(prop));
    node.dataset.respawnAt = prop.hiddenUntil ? String(Math.round(prop.hiddenUntil)) : '';
    if (!node.classList.contains('is-hit')) node.dataset.bonus = '';
    node.classList.toggle('is-hidden', isPropHidden(prop));
  }

  function schedulePropRespawn(prop) {
    clearTimeout(state.propTimers[`respawn-${prop.id}`]);
    const delay = Math.max(0, Number(prop.hiddenUntil) - Date.now());
    if (!delay) {
      prop.hiddenUntil = 0;
      updatePropElement(prop);
      return;
    }
    state.propTimers[`respawn-${prop.id}`] = setTimeout(() => {
      prop.hiddenUntil = 0;
      updatePropElement(prop);
    }, delay);
  }

  function clearPropTimers() {
    clearTimeout(state.hudTimer);
    state.hudTimer = null;
    for (const timer of Object.values(state.propTimers)) clearTimeout(timer);
    state.propTimers = {};
    state.propHits = {};
    state.coinStreaks = {};
    state.coinPointsByLocker = {};
    state.itemBonusPointsByLocker = {};
    state.lastLapFlashByLocker = {};
    state.passFlashHits = {};
    state.passCutInLocks = {};
    const status = $('okr-item-status');
    const card = status?.closest?.('.game-card');
    if (status) status.textContent = 'READY';
    card?.classList.remove('is-active');
  }

  function setItemStatus(locker, type, bonus) {
    const status = $('okr-item-status');
    const card = status?.closest?.('.game-card');
    if (!status || !card) return;
    clearTimeout(state.hudTimer);
    card.classList.add('is-active');
    if (type === 'coin') {
      status.textContent = `COIN #${locker}`;
    } else if (bonus?.cheer) {
      status.textContent = `CHEER +10 #${locker}`;
    } else if (bonus?.label) {
      status.textContent = `${bonus.label} #${locker}`;
    } else {
      status.textContent = `ITEM #${locker}`;
    }
    state.hudTimer = setTimeout(() => {
      status.textContent = 'READY';
      card.classList.remove('is-active');
    }, 1300);
  }

  function pickItemBonus() {
    return ITEM_BONUSES[randomInt(ITEM_BONUSES.length)];
  }

  function showItemBonus(locker, kart, bonus) {
    kart.querySelector('.item-bonus')?.remove();
    const node = document.createElement('span');
    node.className = `item-bonus${bonus.cheer ? ' is-cheer-bonus' : ''}`;
    node.textContent = bonus.cheer ? 'CHEER +10' : bonus.label;
    kart.appendChild(node);

    clearTimeout(state.propTimers[`item-bonus-${locker}`]);
    state.propTimers[`item-bonus-${locker}`] = setTimeout(() => {
      node.remove();
    }, 1800);
  }

  function triggerAudienceCheerBonus(locker, now) {
    if (!locker || now - state.lastAudienceCheerAt < 1400) return;
    const grandstand = document.querySelector(`#${C.overlayId} .grandstand`);
    const burst = $('okr-cheer-burst');
    if (!grandstand || !burst) return;

    state.lastAudienceCheerAt = now;
    grandstand.dataset.cheerLocker = locker;
    const text = burst.querySelector('span');
    if (text) text.textContent = `CROWD CHEER +10 #${locker}`;
    grandstand.classList.remove('is-cheering');
    void grandstand.offsetWidth;
    grandstand.classList.add('is-cheering');
    triggerCrowdWave(locker);
    triggerFireworks();

    clearTimeout(state.cheerTimer);
    state.cheerTimer = setTimeout(() => {
      grandstand.classList.remove('is-cheering');
    }, 4400);
  }

  function triggerItemBonus(locker, kart, now, bonus = pickItemBonus()) {
    state.itemBonusPointsByLocker[locker] = (state.itemBonusPointsByLocker[locker] || 0) + bonus.points;
    showItemBonus(locker, kart, bonus);
    if (bonus.cheer) triggerAudienceCheerBonus(locker, now);
    return bonus;
  }

  function triggerCoinStreak(locker, kart, now) {
    state.coinPointsByLocker[locker] = coinsFor(locker) + 1;
    refreshRankBoard();
    const previous = state.coinStreaks[locker] || { count: 0, lastAt: 0 };
    const count = now - previous.lastAt < C.coinRespawnMs ? previous.count + 1 : 1;
    state.coinStreaks[locker] = { count, lastAt: now };

    kart.querySelector('.coin-streak')?.remove();
    const node = document.createElement('span');
    node.className = 'coin-streak';
    node.textContent = count > 1 ? `STREAK x${count}` : 'COIN +1';
    kart.appendChild(node);

    clearTimeout(state.propTimers[`streak-${locker}`]);
    state.propTimers[`streak-${locker}`] = setTimeout(() => {
      node.remove();
    }, 1700);
  }

  function triggerCrowdWave(locker) {
    const grandstand = document.querySelector(`#${C.overlayId} .grandstand`);
    if (!grandstand) return;
    grandstand.dataset.waveLocker = locker;
    grandstand.classList.remove('is-waving');
    void grandstand.offsetWidth;
    grandstand.classList.add('is-waving');

    clearTimeout(state.propTimers.crowdWave);
    state.propTimers.crowdWave = setTimeout(() => {
      grandstand.classList.remove('is-waving');
    }, 3200);
  }

  function triggerLapFlash(locker, now) {
    if (!locker || now - (state.lastLapFlashByLocker[locker] || 0) < 2200) return;
    state.lastLapFlashByLocker[locker] = now;
    state.lapsByLocker[locker] = lapsFor(locker);
    refreshRankBoard();
    triggerCrowdWave(locker);
  }

  function triggerFireworks() {
    const overlay = $(C.overlayId);
    if (!overlay) return;
    overlay.classList.remove('is-fireworks');
    void overlay.offsetWidth;
    overlay.classList.add('is-fireworks');

    clearTimeout(state.propTimers.fireworks);
    state.propTimers.fireworks = setTimeout(() => {
      overlay.classList.remove('is-fireworks');
    }, 6600);
  }

  function triggerProp(prop, locker, kart, now) {
    const lastHit = state.propHits[prop.id] || 0;
    if (now - lastHit < 1400 || isPropHidden(prop)) return;
    const node = propNode(prop);
    if (!node) return;

    state.propHits[prop.id] = now;
    const className = prop.type === 'coin' ? 'is-collected' : 'is-hit';
    const bonus = prop.type === 'item' ? pickItemBonus() : null;
    const nextSpawnIndex = randomSpawnIndex(prop);
    prop.hiddenUntil = Date.now() + propRespawnMs(prop);
    node.dataset.locker = locker;
    node.dataset.bonus = bonus?.label || '';
    node.dataset.respawnAt = String(Math.round(prop.hiddenUntil));
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);

    clearTimeout(state.propTimers[`effect-${prop.id}`]);
    state.propTimers[`effect-${prop.id}`] = setTimeout(() => {
      const currentNode = propNode(prop);
      currentNode?.classList.remove(className);
      if (currentNode) currentNode.dataset.bonus = '';
      assignPropSpawn(prop, nextSpawnIndex);
      updatePropElement(prop);
      schedulePropRespawn(prop);
    }, prop.type === 'coin' ? 620 : 720);

    kart.classList.add('is-powered');
    clearTimeout(state.propTimers[`kart-${locker}`]);
    state.propTimers[`kart-${locker}`] = setTimeout(() => kart.classList.remove('is-powered'), 660);
    if (prop.type === 'coin') triggerCoinStreak(locker, kart, now);
    if (prop.type === 'item') triggerItemBonus(locker, kart, now, bonus);
    setItemStatus(locker, prop.type, bonus);
  }

  function triggerLeaderCheer(locker, now) {
    if (!locker || now - state.lastLeaderCheerAt < 4200) return;
    const grandstand = document.querySelector(`#${C.overlayId} .grandstand`);
    const burst = $('okr-cheer-burst');
    if (!grandstand || !burst) return;

    state.lastLeaderCheerAt = now;
    grandstand.dataset.cheerLocker = locker;
    const text = burst.querySelector('span');
    if (text) text.textContent = `LEADER LAP #${locker}`;
    grandstand.classList.remove('is-cheering');
    void grandstand.offsetWidth;
    grandstand.classList.add('is-cheering');
    triggerFireworks();

    clearTimeout(state.cheerTimer);
    state.cheerTimer = setTimeout(() => {
      grandstand.classList.remove('is-cheering');
    }, 4400);
  }

  function frontHitPoint(vars, rect, kartSize) {
    const directionIndex = C.spriteDirectionCount === 1
      ? 0
      : Math.round((Number(vars.spriteY) || 0) / 100 * (C.spriteDirectionCount - 1));
    const angle = directionIndex * Math.PI / 4;
    const center = scaledTrackPoint(vars, rect);
    return {
      x: center.x + Math.cos(angle) * kartSize * 0.34,
      y: center.y + Math.sin(angle) * kartSize * 0.34
    };
  }

  function frontHitsProp(vars, prop, rect, kartSize) {
    const front = frontHitPoint(vars, rect, kartSize);
    const propX = prop.x / 100 * rect.width;
    const propY = prop.y / 100 * rect.height;
    const hitScale = prop.type === 'coin' ? 0.34 : 0.28;
    const rx = Math.max(8, prop.rx / 100 * rect.width * hitScale);
    const ry = Math.max(8, prop.ry / 100 * rect.height * hitScale);
    const dx = (front.x - propX) / rx;
    const dy = (front.y - propY) / ry;
    return dx * dx + dy * dy <= 1;
  }

  function checkTrackProps(kart, locker, vars, now, rect, kartSize) {
    for (const prop of TRACK_PROPS) {
      if (isPropHidden(prop)) continue;
      if (frontHitsProp(vars, prop, rect, kartSize)) {
        triggerProp(prop, locker, kart, now);
        return;
      }
    }
  }

  function animateKarts(now) {
    const overlay = $(C.overlayId);
    if (!overlay) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      state.animationFrame = null;
      state.lastFrame = null;
      return;
    }

    if (state.lastFrame !== null && now - state.lastFrame < 32) {
      state.animationFrame = requestAnimationFrame(animateKarts);
      return;
    }
    if (state.lastFrame === null) state.lastFrame = now;
    const dt = clamp((now - state.lastFrame) / 1000, 0, 0.05);
    state.lastFrame = now;
    state.trackClock = normalizeProgress(state.trackClock + C.trackCruiseSpeed * dt);

    const track = $('okr-track');
    const trackRect = track?.getBoundingClientRect();
    const rect = trackRect && trackRect.width && trackRect.height
      ? trackRect
      : { width: TRACK.width, height: TRACK.height };
    const kartSize = num(getComputedStyle(overlay).getPropertyValue('--kart-size')) || 48;
    const racers = [...overlay.querySelectorAll('.kart')].map(kart => {
      const locker = kart.dataset.locker;
      const laneIndex = Number(kart.dataset.laneIndex) || 0;
      const speed = Number(kart.dataset.speed) || C.trackChaseSpeed;
      const hourProgress = Number.isFinite(state.hourProgressByLocker[locker])
        ? state.hourProgressByLocker[locker]
        : Number(kart.dataset.hourProgress) || 0;
      const totalHours = Number.isFinite(state.totalHoursByLocker[locker])
        ? state.totalHoursByLocker[locker]
        : Number(kart.dataset.totalHours) || 0;
      const rawCurrent = Number.isFinite(state.motionByLocker[locker])
        ? state.motionByLocker[locker]
        : Number(kart.dataset.progress) || 0;
      const current = normalizeProgress(rawCurrent);
      const target = normalizeProgress(state.trackClock + hourProgress);
      const next = moveProgressToward(current, target, speed * dt);
      const pitActive = Boolean(state.pitTargets[locker]?.pitted || state.pitStates[locker]);
      return {
        kart,
        locker,
        laneIndex,
        speed,
        current,
        target,
        totalHours,
        pitDemo: null,
        wrapped: !pitActive && next < current && current - next > 0.5,
        next
      };
    });

    racers.forEach(racer => {
      if (racer.wrapped) {
        triggerLapFlash(racer.locker, now);
      }
      if (racer.locker === state.leaderLocker && racer.wrapped) {
        triggerLeaderCheer(racer.locker, now);
      }
    });

    updateTrafficDrifts(racers, now);
    racers.forEach(racer => {
      racer.laneOffset = updateLaneOffset(racer.locker, racer.laneIndex, now, dt);
      const normalGeometry = trackGeometry(racer.next, racer.laneIndex, racer.laneOffset);
      racer.pitDemo = pitGeometryForRacer(racer, normalGeometry, now);
      racer.desiredVars = racer.pitDemo?.vars || kartVars(racer.locker, normalGeometry);
    });
    detectPassFlashes(racers, now);
    const trackRacers = racers.filter(racer => !isPittingRacer(racer));
    resolveKartSpacing(trackRacers, safeProgressGap(racers.length, kartSize));
    resolveTrackPointSpacing(trackRacers, rect, kartSize * 1.2, now);
    separateRenderedKarts(racers, rect, kartSize * 1.06, now);
    enforcePitClearance(racers, rect, kartSize * 1.14);
    markStackedKarts(racers, rect, kartSize * 0.24, now);

    racers.forEach(racer => {
      const pitting = isPittingRacer(racer);
      const parked = racer.pitDemo?.phase === 'parked';
      const renderProgress = parked ? racer.current : racer.next;
      state.motionByLocker[racer.locker] = renderProgress;
      racer.kart.classList.toggle('is-passing', Boolean(racer.isPassing));
      racer.kart.classList.toggle('is-pitting', pitting);
      racer.kart.classList.toggle('is-pit-parked', racer.pitDemo?.phase === 'parked');
      racer.kart.classList.toggle('is-warping', isWarping(racer.locker));
      const vars = racer.pitDemo
        ? applyKartVars(racer.kart, racer.pitDemo.vars)
        : applyKartPosition(racer.kart, racer.locker, renderProgress, racer.laneIndex, racer.laneOffset);
      racer.kart.dataset.progress = renderProgress.toFixed(5);
      racer.kart.dataset.laneOffset = racer.laneOffset.toFixed(2);
      racer.kart.dataset.pitPhase = racer.pitDemo?.phase || '';
      racer.kart.style.setProperty('--dodge-x', `${(racer.dodgeX || 0).toFixed(1)}px`);
      racer.kart.style.setProperty('--dodge-y', `${(racer.dodgeY || 0).toFixed(1)}px`);
      if (!pitting) checkTrackProps(racer.kart, racer.locker, vars, now, rect, kartSize);
    });

    state.animationFrame = requestAnimationFrame(animateKarts);
  }

  function startMotion() {
    if (state.animationFrame || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    state.lastFrame = null;
    state.animationFrame = requestAnimationFrame(animateKarts);
  }

  function trackDecorHtml() {
    const propHtml = prop => {
      const hiddenClass = isPropHidden(prop) ? ' is-hidden' : '';
      const respawnAt = prop.hiddenUntil ? Math.round(prop.hiddenUntil) : '';
      if (prop.type === 'coin') {
        return `<span class="track-coin ${prop.id}${hiddenClass}" data-prop-id="${prop.id}" data-spawn-index="${prop.spawnIndex}" data-respawn-ms="${propRespawnMs(prop)}" data-respawn-at="${respawnAt}" style="${propStyle(prop)}"></span>`;
      }
      return `<span class="item-box ${prop.id}${hiddenClass}" data-prop-id="${prop.id}" data-spawn-index="${prop.spawnIndex}" data-respawn-ms="${propRespawnMs(prop)}" data-respawn-at="${respawnAt}" style="${propStyle(prop)}"><span>?</span></span>`;
    };
    return `
      <div class="infield">
        <div class="pit-lane" aria-hidden="true">
          <span class="pit-label">PIT</span>
          <span class="pit-grid">${Array.from({ length: PIT.columns * PIT.rows }, () => '<span class="pit-spot"></span>').join('')}</span>
        </div>
      </div>
      <div class="game-props" aria-hidden="true">
        <span class="start-gantry"><i class="signal-a"></i><i class="signal-b"></i><i class="signal-c"></i></span>
        ${TRACK_PROPS.filter(prop => prop.type === 'item').map(propHtml).join('')}
        ${TRACK_PROPS.filter(prop => prop.type === 'coin').map(propHtml).join('')}
      </div>
    `;
  }

  function renderedPitState(locker, laneIndex) {
    const pitState = state.pitStates[locker];
    if (!pitState || pitState.phase === 'track') return null;
    if (pitState.vars) {
      return {
        phase: pitState.phase === 'entering' ? 'enter' : pitState.phase,
        vars: pitState.vars
      };
    }
    if (pitState.phase === 'parked' && pitState.slot) {
      return {
        phase: 'parked',
        vars: kartVars(locker, pitState.slot)
      };
    }
    const target = state.pitTargets[locker];
    if (target?.pitted && pitState.phase === 'parked') {
      return {
        phase: 'parked',
        vars: kartVars(locker, pitSlotGeometry(target.slotIndex ?? laneIndex))
      };
    }
    return null;
  }

  function trackKartHtml(operator, index) {
    const laneIndex = index;
    const hourProgress = hourProgressFor(operator);
    const progress = normalizeProgress(state.motionByLocker[operator.locker] ?? targetProgressFor(operator));
    const laneState = ensureLaneState(operator.locker, laneIndex, performance.now());
    const laneOffset = laneState.current;
    const speed = speedFor(operator);
    const pitRender = renderedPitState(operator.locker, laneIndex);
    const pitClass = pitRender ? ` is-pitting${pitRender.phase === 'parked' ? ' is-pit-parked' : ''}` : '';
    const leaderClass = operator.locker === state.leaderLocker ? ' is-leader' : '';
    const warpClass = isWarping(operator.locker) ? ' is-warping' : '';
    const pitPhase = pitRender?.phase || '';
    const style = pitRender ? styleFromKartVars(pitRender.vars) : styleForKart(operator.locker, progress, laneIndex, laneOffset);
    return `
      <div class="kart${pitClass}${leaderClass}${warpClass}" data-locker="${esc(operator.locker)}" data-lane-index="${laneIndex}" data-lane-offset="${laneOffset.toFixed(2)}" data-hour-progress="${hourProgress.toFixed(5)}" data-total-hours="${operator.total.toFixed(4)}" data-progress="${progress.toFixed(5)}" data-speed="${speed.toFixed(5)}" data-pit-phase="${esc(pitPhase)}" title="Locker ${esc(operator.locker)}" style="${style}">
        <div class="kart-shell">
          <div class="kart-leader-flame" aria-hidden="true"></div>
          <div class="kart-sprite" aria-hidden="true"></div>
          <div class="kart-number">${esc(operator.locker)}</div>
        </div>
      </div>
    `;
  }

  function showError(message) {
    let node = $('okr-err');
    if (!node) {
      node = document.createElement('div');
      node.id = 'okr-err';
      node.className = 'msg';
      $(C.overlayId)?.appendChild(node);
    }
    node.textContent = `Overlay warning: ${message}`;
  }

  function clearError() {
    $('okr-err')?.remove();
  }

  function render(payload) {
    state.lastPayload = payload;
    const { operators, timestamp } = payload;
    const started = operators.some(operator => operator.total > 0);
    const totalOperatorHours = operators.reduce((sum, operator) => sum + operator.total, 0);
    const activeOperatorCount = operators.filter(operator => operator.total > 0).length;
    const averageOperatorHours = activeOperatorCount ? totalOperatorHours / activeOperatorCount : 0;
    const breakItem = activeBreak(timestamp, started);
    const bannerBreakItem = breakCloudDemo ? { label: '1ST BREAK' } : breakItem;
    const leader = leaderOperator(operators);
    const nextLeaderLocker = leader?.locker || null;

    $(C.overlayId)?.classList.toggle('break', Boolean(breakItem));
    fitKarts(operators.length);
    updateOperatorActivity(operators, timestamp);
    updatePitTargets(operators, breakItem);
    syncMotion(operators);
    if (state.leaderLocker !== nextLeaderLocker) {
      state.leaderLocker = nextLeaderLocker;
      state.lastLeaderCheerAt = 0;
    }
    const totalHoursNode = $('okr-total-hours');
    if (totalHoursNode) totalHoursNode.textContent = `${totalOperatorHours.toFixed(2)}h`;
    const avgHoursNode = $('okr-avg-hours');
    if (avgHoursNode) avgHoursNode.textContent = `${averageOperatorHours.toFixed(2)}h`;
    const totalOperatorsNode = $('okr-total-operators');
    if (totalOperatorsNode) totalOperatorsNode.textContent = String(activeOperatorCount);
    const breakBanner = $('okr-break-banner');
    if (breakBanner) {
      breakBanner.innerHTML = breakBannerHtml(bannerBreakItem, operators);
      breakBanner.classList.toggle('is-active', Boolean(bannerBreakItem));
      breakBanner.setAttribute('aria-hidden', bannerBreakItem ? 'false' : 'true');
    }
    $('okr-rank-board').innerHTML = rankBoardHtml(operators);
    const fanSignsBack = $('okr-fan-signs-back');
    if (fanSignsBack) fanSignsBack.innerHTML = crowdSignsHtml(operators, 'back');
    const fanSigns = $('okr-fan-signs');
    if (fanSigns) fanSigns.innerHTML = crowdSignsHtml(operators);
    $('okr-track').innerHTML = `${trackDecorHtml()}${operators.map(trackKartHtml).join('')}`;
    state.renderedOnce = true;
    startMotion();
  }

  async function update() {
    if (state.busy) return;
    state.busy = true;
    try {
      const payload = await fetchShift();
      clearError();
      render(payload);
    } catch (error) {
      showError(error?.message || String(error));
    } finally {
      state.busy = false;
    }
  }

  function resized() {
    clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(() => {
      if (state.lastPayload) render(state.lastPayload);
    }, 120);
  }

  installStyles();
  const overlay = createOverlay();
  if (location.hostname !== C.host && !localPreview) {
    wrongHost(overlay);
    return;
  }
  initializeTrackProps();
  shell(overlay);
  update();
  state.timer = setInterval(update, C.refreshMs);
  window.addEventListener('resize', resized);
})();
