// Lógica pura do planejador: fusos via Intl (o horário de verão vem do
// próprio navegador, nunca de deslocamentos fixos), grade do dia, sobreposição
// de expediente, convite e estado na URL. Sem DOM.

export const HOUR_MS = 3600000;
const DAY_MS = 86400000;
export const MAX_ZONES = 10;
export const DEFAULT_ZONES = ['America/Sao_Paulo', 'Europe/Lisbon', 'America/New_York'];
export const DEFAULT_WORK = { start: 9, end: 18 };
// Fora do expediente, mas ainda acordado: entre 7h e 22h. O resto é noite.
export const AWAKE = { start: 7, end: 22 };

export const FRIENDLY_ZONES = [
  { id: 'America/Sao_Paulo', name: 'Brasília' },
  { id: 'America/Manaus', name: 'Manaus' },
  { id: 'America/Cuiaba', name: 'Cuiabá' },
  { id: 'America/Rio_Branco', name: 'Rio Branco' },
  { id: 'America/Noronha', name: 'Fernando de Noronha' },
  { id: 'Europe/Lisbon', name: 'Lisboa' },
  { id: 'Europe/London', name: 'Londres' },
  { id: 'Europe/Madrid', name: 'Madri' },
  { id: 'Europe/Berlin', name: 'Berlim' },
  { id: 'America/New_York', name: 'Nova York' },
  { id: 'America/Chicago', name: 'Chicago' },
  { id: 'America/Denver', name: 'Denver' },
  { id: 'America/Los_Angeles', name: 'Los Angeles' },
  { id: 'America/Toronto', name: 'Toronto' },
  { id: 'America/Mexico_City', name: 'Cidade do México' },
  { id: 'America/Argentina/Buenos_Aires', name: 'Buenos Aires', aliases: ['America/Buenos_Aires'] },
  { id: 'America/Santiago', name: 'Santiago' },
  { id: 'America/Bogota', name: 'Bogotá' },
  { id: 'Asia/Tokyo', name: 'Tóquio' },
  { id: 'Australia/Sydney', name: 'Sydney' },
  { id: 'Asia/Dubai', name: 'Dubai' },
  { id: 'Asia/Kolkata', name: 'Índia (Calcutá)', aliases: ['Asia/Calcutta'] },
  { id: 'Asia/Singapore', name: 'Singapura' },
  { id: 'Asia/Shanghai', name: 'Xangai' },
  { id: 'Africa/Johannesburg', name: 'Joanesburgo' },
];

const BY_ID = new Map();
for (const zone of FRIENDLY_ZONES) {
  BY_ID.set(zone.id.toLowerCase(), zone);
  for (const alias of zone.aliases || []) BY_ID.set(alias.toLowerCase(), zone);
}

const validity = new Map();
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  if (!validity.has(tz)) {
    let ok = true;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      ok = false;
    }
    validity.set(tz, ok);
  }
  return validity.get(tz);
}

// Usa o nome moderno para fusos com apelido antigo (Asia/Calcutta -> Asia/Kolkata).
export function canonicalZone(tz) {
  const friendly = BY_ID.get(String(tz).toLowerCase());
  return friendly ? friendly.id : tz;
}

export function zoneName(tz) {
  const friendly = BY_ID.get(String(tz).toLowerCase());
  if (friendly) return friendly.name;
  const last = String(tz).split('/').pop();
  return last.replace(/_/g, ' ');
}

function normalizeText(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Opções da busca: lugares com nome em português primeiro, depois todos os fusos do navegador.
export function zoneOptions(supported = []) {
  const options = FRIENDLY_ZONES.map((z) => ({ id: z.id, label: `${z.name} (${z.id})` }));
  const known = new Set(FRIENDLY_ZONES.flatMap((z) => [z.id, ...(z.aliases || [])]));
  for (const id of supported) {
    if (!known.has(id)) options.push({ id, label: id });
  }
  return options;
}

/** Converte o texto digitado na busca em um fuso válido (ou null). */
export function resolveZoneInput(text, supported = []) {
  const raw = String(text ?? '').trim();
  if (!raw) return null;
  const inParens = /\(([^()]+)\)\s*$/.exec(raw);
  const candidates = [inParens ? inParens[1].trim() : null, raw].filter(Boolean);
  for (const candidate of candidates) {
    const key = normalizeText(candidate);
    const friendly = FRIENDLY_ZONES.find((z) => normalizeText(z.name) === key);
    if (friendly) return friendly.id;
    const byId = BY_ID.get(candidate.toLowerCase());
    if (byId) return byId.id;
    const listed = supported.find((id) => id.toLowerCase() === candidate.toLowerCase().replace(/ /g, '_'));
    if (listed) return canonicalZone(listed);
    if (candidate.includes('/') && isValidTimeZone(candidate)) return canonicalZone(candidate);
  }
  return null;
}

// ---------- Datas e horários ----------

const formatters = new Map();
function partsFormatter(tz) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

/** Data e hora locais de um instante (ms) em um fuso. */
export function zonedParts(tz, instant) {
  const parts = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(instant))) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Deslocamento do fuso em relação ao UTC, em minutos, naquele instante. */
export function getOffsetMinutes(tz, instant) {
  const t = Math.floor(Number(instant) / 1000) * 1000;
  const p = zonedParts(tz, t);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - t) / 60000);
}

export function formatOffset(minutes) {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function dateKey(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function todayIn(tz, now = Date.now()) {
  const p = zonedParts(tz, now);
  return dateKey(p.year, p.month, p.day);
}

function wallClock(tz, instant) {
  const p = zonedParts(tz, instant);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}

/**
 * Instante (ms) em que o relógio do fuso marca a data e hora pedidas.
 * Na mudança de horário: hora repetida usa a primeira ocorrência; hora que
 * não existe é empurrada para depois do salto (como fazem os calendários).
 */
export function zonedTimeToUtc(dateStr, hour, minute, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, minute);
  const before = getOffsetMinutes(tz, wall - DAY_MS);
  const after = getOffsetMinutes(tz, wall + DAY_MS);
  const candidates = [...new Set([wall - before * 60000, wall - after * 60000])]
    .filter((t) => wallClock(tz, t) === wall)
    .sort((a, b) => a - b);
  return candidates.length ? candidates[0] : wall - before * 60000;
}

/** Diferença em dias entre a data local do instante no fuso e a data escolhida. */
export function dayOffset(tz, instant, dateStr) {
  const p = zonedParts(tz, instant);
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(y, m - 1, d)) / DAY_MS);
}

export function dayLabel(offset) {
  if (offset === 0) return '';
  const sign = offset > 0 ? '+' : '−';
  const n = Math.abs(offset);
  return `${sign}${n} ${n === 1 ? 'dia' : 'dias'}`;
}

function inRange(minutes, startHour, endHour) {
  const start = startHour * 60;
  const end = endHour * 60;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

/** 'work' (expediente), 'edge' (cedo ou tarde) ou 'night' (noite). */
export function classifyTime(hour, minute, work = DEFAULT_WORK) {
  const minutes = hour * 60 + minute;
  if (inRange(minutes, work.start, work.end)) return 'work';
  if (inRange(minutes, AWAKE.start, AWAKE.end)) return 'edge';
  return 'night';
}

const pad = (n) => String(n).padStart(2, '0');

export function formatTime(tz, instant) {
  const p = zonedParts(tz, instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Grade do dia: uma linha por hora do primeiro lugar (referência), de 0h até
 * a meia-noite seguinte. Em dias de troca de horário a grade tem 23 ou 25 linhas.
 */
export function buildDayGrid(dateStr, zones, work = DEFAULT_WORK) {
  const ref = zones[0];
  const start = zonedTimeToUtc(dateStr, 0, 0, ref);
  const end = zonedTimeToUtc(addDays(dateStr, 1), 0, 0, ref);
  const rows = [];
  for (let t = start; t < end; t += HOUR_MS) {
    const cells = zones.map((tz) => {
      const p = zonedParts(tz, t);
      return {
        tz,
        time: `${pad(p.hour)}:${pad(p.minute)}`,
        dayOffset: dayOffset(tz, t, dateStr),
        category: classifyTime(p.hour, p.minute, work),
      };
    });
    const workCount = cells.filter((c) => c.category === 'work').length;
    rows.push({
      instant: t,
      cells,
      workCount,
      nightCount: cells.filter((c) => c.category === 'night').length,
      allWork: workCount === zones.length,
    });
  }
  return rows;
}

/** Melhores linhas: todos no expediente; senão, o máximo de lugares no expediente. */
export function bestRows(rows) {
  const all = rows.map((r, i) => (r.allWork ? i : -1)).filter((i) => i >= 0);
  if (all.length) return { kind: 'all', indexes: all };
  const max = Math.max(0, ...rows.map((r) => r.workCount));
  if (max === 0) return { kind: 'none', indexes: [] };
  const top = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.workCount === max);
  const fewestNights = Math.min(...top.map(({ r }) => r.nightCount));
  return { kind: 'partial', count: max, indexes: top.filter(({ r }) => r.nightCount === fewestNights).map(({ i }) => i) };
}

const longDates = new Map();
function longDate(tz, instant, withYear) {
  const key = `${tz}|${withYear}`;
  let f = longDates.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}),
    });
    longDates.set(key, f);
  }
  return f.format(new Date(instant));
}

/** Horário escolhido em cada lugar (início e fim), com a data local. */
export function slotDetails(instant, zones, dateStr, durationMinutes = 60) {
  return zones.map((tz) => ({
    tz,
    name: zoneName(tz),
    start: formatTime(tz, instant),
    end: formatTime(tz, instant + durationMinutes * 60000),
    dayOffset: dayOffset(tz, instant, dateStr),
    date: longDate(tz, instant, false),
    fullDate: longDate(tz, instant, true),
    offset: formatOffset(getOffsetMinutes(tz, instant)),
  }));
}

/** Texto do convite, pronto para colar em e-mail ou mensagem. */
export function invitationText(instant, zones, dateStr, durationMinutes = 60) {
  const items = slotDetails(instant, zones, dateStr, durationMinutes);
  const lines = [`Reunião: ${items[0].fullDate}`, '', 'Horário em cada lugar:'];
  for (const item of items) {
    let line = `• ${item.name}: ${item.start} às ${item.end}`;
    if (item.dayOffset !== 0) line += ` (${item.date}, ${dayLabel(item.dayOffset)})`;
    lines.push(line);
  }
  return lines.join('\n');
}

// ---------- Estado na URL ----------

function parseHour(value) {
  if (value === null || value === undefined || !/^\d{1,2}$/.test(String(value))) return null;
  const n = Number(value);
  return n >= 0 && n <= 24 ? n : null;
}

export function normalizeWork(work) {
  const start = parseHour(work && work.start);
  const end = parseHour(work && work.end);
  if (start === null || end === null || start === end || start > 23 || end < 1) return { ...DEFAULT_WORK };
  return { start, end };
}

export function encodeState({ zones, date, work }) {
  const params = [`tz=${zones.map((z) => encodeURIComponent(z).replace(/%2F/gi, '/')).join(',')}`];
  if (date) params.push(`data=${date}`);
  if (work && (work.start !== DEFAULT_WORK.start || work.end !== DEFAULT_WORK.end)) {
    params.push(`inicio=${work.start}`, `fim=${work.end}`);
  }
  return `?${params.join('&')}`;
}

export function decodeState(search) {
  const params = new URLSearchParams(search);
  let zones = null;
  const tz = params.get('tz');
  if (tz) {
    // URLSearchParams transforma "+" em espaço; nomes de fuso nunca têm espaço.
    const list = tz.split(',').map((z) => canonicalZone(z.trim().replace(/ /g, '+'))).filter(isValidTimeZone);
    zones = [...new Set(list)].slice(0, MAX_ZONES);
    if (!zones.length) zones = null;
  }
  const date = isValidDateString(params.get('data')) ? params.get('data') : null;
  let work = null;
  if (params.has('inicio') || params.has('fim')) {
    const candidate = { start: params.get('inicio'), end: params.get('fim') };
    const normalized = normalizeWork(candidate);
    if (String(normalized.start) === candidate.start && String(normalized.end) === candidate.end) work = normalized;
  }
  return { zones, date, work };
}
