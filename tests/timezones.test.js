import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ZONES, MAX_ZONES, getOffsetMinutes, formatOffset, zonedTimeToUtc, zonedParts, buildDayGrid,
  bestRows, classifyTime, dayOffset, dayLabel, slotDetails, invitationText, encodeState, decodeState,
  resolveZoneInput, canonicalZone, zoneName, zoneOptions, todayIn, addDays, isValidDateString,
  isValidTimeZone, normalizeWork, formatTime,
} from '../src/timezones.js';

const at = (iso) => Date.parse(iso);

test('Nova York: horário padrão em janeiro, horário de verão em julho', () => {
  assert.equal(getOffsetMinutes('America/New_York', at('2026-01-15T12:00:00Z')), -300);
  assert.equal(getOffsetMinutes('America/New_York', at('2026-07-15T12:00:00Z')), -240);
});

test('São Paulo não tem horário de verão desde 2019', () => {
  // Dezembro de 2018 ainda tinha horário de verão (UTC−2).
  assert.equal(getOffsetMinutes('America/Sao_Paulo', at('2018-12-15T12:00:00Z')), -120);
  for (const iso of ['2019-12-15T12:00:00Z', '2025-01-15T12:00:00Z', '2026-07-15T12:00:00Z', '2026-12-15T12:00:00Z']) {
    assert.equal(getOffsetMinutes('America/Sao_Paulo', at(iso)), -180, iso);
  }
});

test('Lisboa no inverno e no verão', () => {
  assert.equal(getOffsetMinutes('Europe/Lisbon', at('2026-01-15T12:00:00Z')), 0);
  assert.equal(getOffsetMinutes('Europe/Lisbon', at('2026-07-15T12:00:00Z')), 60);
});

test('outros fusos, inclusive com meia hora', () => {
  assert.equal(getOffsetMinutes('Australia/Sydney', at('2026-01-15T12:00:00Z')), 660);
  assert.equal(getOffsetMinutes('Australia/Sydney', at('2026-07-15T12:00:00Z')), 600);
  assert.equal(getOffsetMinutes('Asia/Kolkata', at('2026-07-15T12:00:00Z')), 330);
  assert.equal(getOffsetMinutes('America/Noronha', at('2026-07-15T12:00:00Z')), -120);
  assert.equal(getOffsetMinutes('America/Manaus', at('2026-07-15T12:00:00Z')), -240);
  assert.equal(getOffsetMinutes('America/Rio_Branco', at('2026-07-15T12:00:00Z')), -300);
  assert.equal(formatOffset(-180), 'UTC−3');
  assert.equal(formatOffset(330), 'UTC+5:30');
  assert.equal(formatOffset(-210), 'UTC−3:30');
  assert.equal(formatOffset(0), 'UTC+0');
});

test('hora local para instante, inclusive nas trocas de horário', () => {
  assert.equal(zonedTimeToUtc('2026-10-08', 14, 0, 'America/Sao_Paulo'), at('2026-10-08T17:00:00Z'));
  assert.equal(zonedTimeToUtc('2026-07-15', 9, 30, 'Europe/Lisbon'), at('2026-07-15T08:30:00Z'));
  // 02:30 não existe em Nova York em 8/3/2026: vai para 03:30 (horário de verão).
  assert.equal(zonedTimeToUtc('2026-03-08', 2, 30, 'America/New_York'), at('2026-03-08T07:30:00Z'));
  // 01:30 acontece duas vezes em 1/11/2026: usa a primeira.
  assert.equal(zonedTimeToUtc('2026-11-01', 1, 30, 'America/New_York'), at('2026-11-01T05:30:00Z'));
  // Em 4/11/2018 a meia-noite não existiu em São Paulo: o dia começou à 01:00.
  assert.equal(zonedTimeToUtc('2018-11-04', 0, 0, 'America/Sao_Paulo'), at('2018-11-04T03:00:00Z'));
});

test('grade do dia segue o primeiro lugar, com 23 ou 25 horas nas trocas', () => {
  const normal = buildDayGrid('2026-10-08', DEFAULT_ZONES);
  assert.equal(normal.length, 24);
  assert.equal(normal[0].cells[0].time, '00:00');
  assert.equal(normal[23].cells[0].time, '23:00');
  assert.ok(normal.every((row) => row.cells[0].dayOffset === 0));
  assert.equal(buildDayGrid('2026-03-08', ['America/New_York']).length, 23);
  assert.equal(buildDayGrid('2026-11-01', ['America/New_York']).length, 25);
  assert.equal(buildDayGrid('2026-03-29', ['Europe/Lisbon']).length, 23);
  assert.equal(buildDayGrid('2026-10-25', ['Europe/Lisbon']).length, 25);
  const gap = buildDayGrid('2018-11-04', ['America/Sao_Paulo']);
  assert.equal(gap.length, 23);
  assert.equal(gap[0].cells[0].time, '01:00');
});

test('conversão de horário com troca de data', () => {
  const zones = ['America/Sao_Paulo', 'Asia/Tokyo', 'Europe/Lisbon'];
  const night = zonedTimeToUtc('2026-10-08', 22, 0, 'America/Sao_Paulo');
  const details = slotDetails(night, zones, '2026-10-08');
  assert.deepEqual(details.map((d) => [d.name, d.start, d.end, d.dayOffset]), [
    ['Brasília', '22:00', '23:00', 0],
    ['Tóquio', '10:00', '11:00', 1],
    ['Lisboa', '02:00', '03:00', 1],
  ]);
  const morning = zonedTimeToUtc('2026-10-08', 8, 0, 'Asia/Tokyo');
  assert.equal(formatTime('America/Sao_Paulo', morning), '20:00');
  assert.equal(dayOffset('America/Sao_Paulo', morning, '2026-10-08'), -1);
  // Diferença de 25 horas: dois dias de diferença.
  const late = zonedTimeToUtc('2026-10-08', 23, 0, 'Pacific/Pago_Pago');
  assert.equal(dayOffset('Pacific/Kiritimati', late, '2026-10-08'), 2);
  assert.equal(dayLabel(1), '+1 dia');
  assert.equal(dayLabel(-1), '−1 dia');
  assert.equal(dayLabel(2), '+2 dias');
  assert.equal(dayLabel(0), '');
});

test('classifica expediente, cedo ou tarde e noite', () => {
  const cases = [[9, 0, 'work'], [8, 59, 'edge'], [17, 59, 'work'], [18, 0, 'edge'], [21, 59, 'edge'],
    [22, 0, 'night'], [6, 59, 'night'], [7, 0, 'edge'], [0, 0, 'night']];
  for (const [h, m, expected] of cases) assert.equal(classifyTime(h, m), expected, `${h}:${m}`);
  // Expediente configurável, inclusive atravessando a meia-noite.
  assert.equal(classifyTime(8, 0, { start: 8, end: 17 }), 'work');
  assert.equal(classifyTime(23, 0, { start: 22, end: 6 }), 'work');
  assert.equal(classifyTime(5, 30, { start: 22, end: 6 }), 'work');
  assert.equal(classifyTime(12, 0, { start: 22, end: 6 }), 'edge');
});

test('encontra os horários em que todos estão no expediente', () => {
  const rows = buildDayGrid('2026-10-08', DEFAULT_ZONES);
  const best = bestRows(rows);
  assert.equal(best.kind, 'all');
  // Brasília 10h–13h = Lisboa 14h–17h = Nova York 9h–12h.
  assert.deepEqual(best.indexes.map((i) => rows[i].cells.map((c) => c.time)), [
    ['10:00', '14:00', '09:00'],
    ['11:00', '15:00', '10:00'],
    ['12:00', '16:00', '11:00'],
    ['13:00', '17:00', '12:00'],
  ]);
  assert.ok(rows[9].cells[2].category === 'edge' && !rows[9].allWork);
});

test('sem horário comum, sugere o que reúne mais gente no expediente', () => {
  const rows = buildDayGrid('2026-10-08', ['America/Sao_Paulo', 'Europe/Lisbon', 'America/New_York', 'Asia/Tokyo']);
  const best = bestRows(rows);
  assert.equal(best.kind, 'partial');
  assert.equal(best.count, 3);
  assert.deepEqual(best.indexes, [10, 11, 12, 13]);
  const far = bestRows(buildDayGrid('2026-10-08', ['America/Sao_Paulo', 'Asia/Tokyo']));
  assert.equal(far.kind, 'partial');
  assert.equal(far.count, 1);
});

test('texto do convite em português', () => {
  const instant = zonedTimeToUtc('2026-10-08', 22, 0, 'America/Sao_Paulo');
  assert.equal(invitationText(instant, ['America/Sao_Paulo', 'America/New_York', 'Asia/Tokyo'], '2026-10-08'), [
    'Reunião: quinta-feira, 8 de outubro de 2026',
    '',
    'Horário em cada lugar:',
    '• Brasília: 22:00 às 23:00',
    '• Nova York: 21:00 às 22:00',
    '• Tóquio: 10:00 às 11:00 (sexta-feira, 9 de outubro, +1 dia)',
  ].join('\n'));
  const tokyo = zonedTimeToUtc('2026-10-08', 8, 0, 'Asia/Tokyo');
  assert.match(invitationText(tokyo, ['Asia/Tokyo', 'America/Sao_Paulo'], '2026-10-08'), /Brasília: 20:00 às 21:00 \(quarta-feira, 7 de outubro, −1 dia\)/);
});

test('estado na URL: ida e volta', () => {
  const state = { zones: ['America/Sao_Paulo', 'Etc/GMT+3', 'Asia/Kolkata'], date: '2026-10-08', work: { start: 8, end: 17 } };
  const search = encodeState(state);
  assert.equal(search, '?tz=America/Sao_Paulo,Etc/GMT%2B3,Asia/Kolkata&data=2026-10-08&inicio=8&fim=17');
  assert.deepEqual(decodeState(search), state);
  // Expediente padrão não vai para a URL.
  assert.equal(encodeState({ zones: DEFAULT_ZONES, date: '2026-10-08', work: { start: 9, end: 18 } }),
    '?tz=America/Sao_Paulo,Europe/Lisbon,America/New_York&data=2026-10-08');
});

test('estado na URL: entradas inválidas são ignoradas', () => {
  assert.deepEqual(decodeState('?tz=Asia/Calcutta,Invalida/Zona,America/Sao_Paulo,America/Sao_Paulo&data=2026-02-30'), {
    zones: ['Asia/Kolkata', 'America/Sao_Paulo'], date: null, work: null,
  });
  // "+" sem codificar vira espaço no navegador; volta a ser "+".
  assert.deepEqual(decodeState('?tz=Etc/GMT+3').zones, ['Etc/GMT+3']);
  assert.deepEqual(decodeState('?tz=x,y'), { zones: null, date: null, work: null });
  assert.equal(decodeState('?tz=America/Sao_Paulo&inicio=25&fim=18').work, null);
  assert.equal(decodeState('?tz=America/Sao_Paulo&inicio=9&fim=9').work, null);
  assert.deepEqual(decodeState('?inicio=22&fim=6').work, { start: 22, end: 6 });
  const many = Array.from({ length: 15 }, (_, i) => `Etc/GMT${i < 7 ? '+' : '-'}${(i % 7) + 1}`).join(',');
  assert.equal(decodeState(`?tz=${encodeURIComponent(many)}`).zones.length, MAX_ZONES);
  assert.deepEqual(decodeState(''), { zones: null, date: null, work: null });
});

test('busca de lugares', () => {
  const supported = Intl.supportedValuesOf('timeZone');
  assert.equal(resolveZoneInput('Brasília'), 'America/Sao_Paulo');
  assert.equal(resolveZoneInput('brasilia'), 'America/Sao_Paulo');
  assert.equal(resolveZoneInput('Tóquio (Asia/Tokyo)'), 'Asia/Tokyo');
  assert.equal(resolveZoneInput('indIa (calcutá)'), 'Asia/Kolkata');
  assert.equal(resolveZoneInput('Asia/Calcutta'), 'Asia/Kolkata');
  assert.equal(resolveZoneInput('europe/paris', supported), 'Europe/Paris');
  assert.equal(resolveZoneInput('Europe/Paris'), 'Europe/Paris');
  assert.equal(resolveZoneInput('Atlântida'), null);
  assert.equal(resolveZoneInput(''), null);
  assert.equal(canonicalZone('America/Buenos_Aires'), 'America/Argentina/Buenos_Aires');
  assert.equal(zoneName('America/Argentina/Cordoba'), 'Cordoba');
  assert.equal(zoneName('America/Port_of_Spain'), 'Port of Spain');
  assert.equal(zoneName('Asia/Calcutta'), 'Índia (Calcutá)');
  const options = zoneOptions(['Asia/Calcutta', 'Europe/Paris']);
  assert.equal(options[0].label, 'Brasília (America/Sao_Paulo)');
  assert.ok(options.some((o) => o.id === 'Europe/Paris'));
  assert.ok(!options.some((o) => o.id === 'Asia/Calcutta'));
  assert.equal(isValidTimeZone('Europe/Lisbon'), true);
  assert.equal(isValidTimeZone('Mars/Olympus'), false);
});

test('datas', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(isValidDateString('2026-02-29'), false);
  assert.equal(isValidDateString('2028-02-29'), true);
  assert.equal(isValidDateString('08/10/2026'), false);
  assert.equal(todayIn('Asia/Tokyo', at('2026-10-08T20:00:00Z')), '2026-10-09');
  assert.equal(todayIn('America/Sao_Paulo', at('2026-10-08T20:00:00Z')), '2026-10-08');
  assert.deepEqual(zonedParts('UTC', at('2026-10-08T00:05:09Z')), { year: 2026, month: 10, day: 8, hour: 0, minute: 5, second: 9 });
  assert.deepEqual(normalizeWork({ start: '8', end: '17' }), { start: 8, end: 17 });
  assert.deepEqual(normalizeWork({ start: 18, end: 18 }), { start: 9, end: 18 });
});
