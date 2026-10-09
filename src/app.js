import {
  DEFAULT_ZONES, DEFAULT_WORK, MAX_ZONES, HOUR_MS, buildDayGrid, bestRows, slotDetails, invitationText,
  encodeState, decodeState, resolveZoneInput, zoneOptions, zoneName, todayIn, isValidDateString,
  isValidTimeZone, canonicalZone, normalizeWork, getOffsetMinutes, formatOffset, formatTime, dayLabel,
} from './timezones.js';

const STORAGE_KEY = 'fuso-reuniao';
const SUPPORTED = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
const CATEGORY_LABELS = { work: 'no expediente', edge: 'cedo ou tarde', night: 'noite' };

const $ = (id) => document.getElementById(id);
const els = {
  date: $('date'),
  today: $('today'),
  search: $('zone-search'),
  list: $('zone-list'),
  add: $('add-zone'),
  addStatus: $('add-status'),
  workStart: $('work-start'),
  workEnd: $('work-end'),
  workStatus: $('work-status'),
  legendWork: $('legend-work'),
  zones: $('zones'),
  share: $('share'),
  shareStatus: $('share-status'),
  summary: $('summary'),
  wrap: document.querySelector('.grid-wrap'),
  grid: $('grid'),
  details: $('details'),
  invite: $('invite'),
  copyInvite: $('copy-invite'),
  inviteStatus: $('invite-status'),
};

const state = { zones: [...DEFAULT_ZONES], date: '', work: { ...DEFAULT_WORK }, pickedTime: null };
let rows = [];
let selectedIndex = 0;
let scrollPending = true;

function loadSaved() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return {};
    const zones = Array.isArray(saved.zones)
      ? [...new Set(saved.zones.filter((z) => typeof z === 'string').map(canonicalZone).filter(isValidTimeZone))].slice(0, MAX_ZONES)
      : [];
    return { zones: zones.length ? zones : null, work: saved.work ? normalizeWork(saved.work) : null };
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ zones: state.zones, work: state.work }));
  } catch {
    // Sem armazenamento: o link da página continua guardando a comparação.
  }
}

function updateUrl() {
  try {
    history.replaceState(null, '', `${location.pathname}${encodeState(state)}`);
  } catch {
    // Alguns ambientes bloqueiam a troca de endereço; o restante funciona.
  }
}

function setStatus(el, text, kind = '') {
  el.textContent = text;
  el.classList.toggle('error', kind === 'error');
  el.classList.toggle('ok', kind === 'ok');
}

const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;

function fillStaticControls() {
  for (let h = 0; h <= 23; h++) els.workStart.appendChild(new Option(hourLabel(h), String(h)));
  for (let h = 1; h <= 24; h++) els.workEnd.appendChild(new Option(hourLabel(h), String(h)));
  const frag = document.createDocumentFragment();
  for (const option of zoneOptions(SUPPORTED)) {
    const el = document.createElement('option');
    el.value = option.label;
    frag.appendChild(el);
  }
  els.list.appendChild(frag);
}

function pickIndex(best) {
  if (state.pickedTime) {
    const i = rows.findIndex((r) => r.cells[0].time === state.pickedTime);
    if (i >= 0) return i;
  }
  if (best.indexes.length) return best.indexes[0];
  const noon = rows.findIndex((r) => r.cells[0].time === '12:00');
  return noon >= 0 ? noon : 0;
}

function renderZones(instant) {
  const items = state.zones.map((tz, index) => {
    const name = zoneName(tz);
    const li = document.createElement('li');
    li.className = index === 0 ? 'chip ref' : 'chip';
    const label = document.createElement('span');
    label.className = 'chip-name';
    label.textContent = name;
    const meta = document.createElement('span');
    meta.className = 'chip-meta';
    meta.textContent = `${formatOffset(getOffsetMinutes(tz, instant))} · ${tz}`;
    li.append(label, meta);
    if (index === 0) {
      const badge = document.createElement('span');
      badge.className = 'chip-badge';
      badge.textContent = 'Referência';
      li.appendChild(badge);
    } else {
      const ref = document.createElement('button');
      ref.type = 'button';
      ref.textContent = 'Usar como referência';
      ref.setAttribute('aria-label', `Usar ${name} como referência`);
      ref.addEventListener('click', () => makeReference(index));
      li.appendChild(ref);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Remover ${name}`);
    remove.disabled = state.zones.length === 1;
    remove.addEventListener('click', () => removeZone(index));
    li.appendChild(remove);
    return li;
  });
  els.zones.replaceChildren(...items);
}

function renderGrid(best, instant) {
  const bestSet = new Set(best.indexes);
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  for (const tz of state.zones) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = zoneName(tz);
    const small = document.createElement('small');
    small.textContent = formatOffset(getOffsetMinutes(tz, instant));
    th.appendChild(small);
    headRow.appendChild(th);
  }
  head.appendChild(headRow);

  const body = document.createElement('tbody');
  const refName = zoneName(state.zones[0]);
  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.dataset.index = String(index);
    if (bestSet.has(index)) tr.classList.add('best');
    if (index === selectedIndex) tr.classList.add('selected');
    row.cells.forEach((cell, col) => {
      const el = document.createElement(col === 0 ? 'th' : 'td');
      el.className = cell.category;
      el.title = CATEGORY_LABELS[cell.category];
      if (col === 0) {
        el.scope = 'row';
        const button = document.createElement('button');
        button.type = 'button';
        button.setAttribute('aria-pressed', String(index === selectedIndex));
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = row.allWork ? '✓' : bestSet.has(index) ? '★' : '';
        const status = row.allWork ? 'todos no expediente' : `${row.workCount} de ${row.cells.length} no expediente`;
        button.setAttribute('aria-label', `${cell.time} em ${refName}: ${status}`);
        button.append(mark, document.createTextNode(cell.time));
        el.appendChild(button);
      } else {
        el.textContent = cell.time;
        if (cell.dayOffset) {
          const day = document.createElement('span');
          day.className = 'day';
          day.textContent = dayLabel(cell.dayOffset).replace(/ dias?$/, '');
          day.title = dayLabel(cell.dayOffset);
          el.appendChild(day);
          const sr = document.createElement('span');
          sr.className = 'sr-only';
          sr.textContent = ` (${dayLabel(cell.dayOffset)})`;
          el.appendChild(sr);
        }
      }
      tr.appendChild(el);
    });
    body.appendChild(tr);
  });
  els.grid.replaceChildren(head, body);

  if (scrollPending) {
    scrollPending = false;
    const target = body.children[selectedIndex];
    if (target) els.wrap.scrollTop = Math.max(0, target.offsetTop - els.wrap.clientHeight / 3);
  }
}

function runs(indexes) {
  const result = [];
  for (const i of indexes) {
    const last = result[result.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else result.push([i, i]);
  }
  return result;
}

function renderSummary(best) {
  if (state.zones.length === 1) {
    setStatus(els.summary, 'Adicione pelo menos mais um lugar para comparar.');
    return;
  }
  const ref = state.zones[0];
  if (best.kind === 'all') {
    const ranges = runs(best.indexes).map(([a, b]) => `das ${rows[a].cells[0].time} às ${formatTime(ref, rows[b].instant + HOUR_MS)}`);
    setStatus(els.summary, `✓ Todos no expediente ${ranges.join(' e ')} · referência: ${zoneName(ref)}.`);
  } else if (best.kind === 'partial') {
    setStatus(els.summary, `Nenhum horário reúne todos no expediente. ★ marca os que reúnem mais gente: ${best.count} de ${state.zones.length} lugares.`);
  } else {
    setStatus(els.summary, 'Ninguém está no expediente neste dia com o horário escolhido.');
  }
}

function renderDetails(instant) {
  const items = slotDetails(instant, state.zones, state.date).map((item) => {
    const li = document.createElement('li');
    const place = document.createElement('div');
    place.className = 'place';
    place.textContent = item.name;
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = `${item.start} às ${item.end}`;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = [item.date, item.offset, dayLabel(item.dayOffset)].filter(Boolean).join(' · ');
    li.append(place, time, meta);
    return li;
  });
  els.details.replaceChildren(...items);
  els.invite.value = invitationText(instant, state.zones, state.date);
}

function render() {
  rows = buildDayGrid(state.date, state.zones, state.work);
  const best = bestRows(rows);
  selectedIndex = pickIndex(best);
  const instant = rows[selectedIndex].instant;
  els.date.value = state.date;
  els.workStart.value = String(state.work.start);
  els.workEnd.value = String(state.work.end);
  els.legendWork.textContent = `Expediente (${hourLabel(state.work.start)}–${hourLabel(state.work.end)})`;
  renderZones(instant);
  renderGrid(best, instant);
  renderSummary(best);
  renderDetails(instant);
  updateUrl();
  save();
}

function selectRow(index) {
  if (!rows[index]) return;
  state.pickedTime = rows[index].cells[0].time;
  const focused = document.activeElement && document.activeElement.closest('tbody tr');
  render();
  if (focused) {
    const button = els.grid.querySelector(`tbody tr[data-index="${index}"] button`);
    if (button) button.focus();
  }
}

function makeReference(index) {
  const [tz] = state.zones.splice(index, 1);
  state.zones.unshift(tz);
  state.pickedTime = null;
  scrollPending = true;
  render();
}

function removeZone(index) {
  if (state.zones.length === 1) return;
  const [tz] = state.zones.splice(index, 1);
  if (index === 0) state.pickedTime = null;
  setStatus(els.addStatus, `Removido: ${zoneName(tz)}.`, 'ok');
  render();
}

function addZone() {
  const tz = resolveZoneInput(els.search.value, SUPPORTED);
  if (!tz) {
    setStatus(els.addStatus, 'Lugar não encontrado. Escolha uma opção da lista.', 'error');
    return;
  }
  if (state.zones.includes(tz)) {
    setStatus(els.addStatus, `${zoneName(tz)} já está na lista.`, 'error');
    return;
  }
  if (state.zones.length >= MAX_ZONES) {
    setStatus(els.addStatus, `Limite de ${MAX_ZONES} lugares por comparação.`, 'error');
    return;
  }
  state.zones.push(tz);
  els.search.value = '';
  setStatus(els.addStatus, `Adicionado: ${zoneName(tz)}.`, 'ok');
  render();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

els.add.addEventListener('click', addZone);
els.search.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addZone();
  }
});
els.date.addEventListener('change', () => {
  if (!isValidDateString(els.date.value)) return;
  state.date = els.date.value;
  scrollPending = true;
  render();
});
els.today.addEventListener('click', () => {
  state.date = todayIn(state.zones[0]);
  scrollPending = true;
  render();
});
for (const select of [els.workStart, els.workEnd]) {
  select.addEventListener('change', () => {
    const start = Number(els.workStart.value);
    const end = Number(els.workEnd.value);
    if (start === end) {
      setStatus(els.workStatus, 'O início e o fim do expediente precisam ser diferentes.', 'error');
      els.workStart.value = String(state.work.start);
      els.workEnd.value = String(state.work.end);
      return;
    }
    setStatus(els.workStatus, start > end ? 'Expediente que vira a noite (passa da meia-noite).' : '');
    state.work = { start, end };
    render();
  });
}
els.grid.addEventListener('click', (e) => {
  const tr = e.target.closest('tbody tr');
  if (tr) selectRow(Number(tr.dataset.index));
});
els.share.addEventListener('click', async () => {
  updateUrl();
  const ok = await copyText(location.href);
  setStatus(els.shareStatus, ok ? 'Link copiado: quem abrir verá os mesmos lugares e a mesma data.' : 'Não foi possível copiar. Copie o endereço da barra do navegador.', ok ? 'ok' : 'error');
});
els.copyInvite.addEventListener('click', async () => {
  const ok = await copyText(els.invite.value);
  setStatus(els.inviteStatus, ok ? 'Convite copiado.' : 'Não foi possível copiar. Selecione o texto e copie manualmente.', ok ? 'ok' : 'error');
});

function init() {
  const fromUrl = decodeState(location.search);
  const saved = loadSaved();
  state.zones = fromUrl.zones || saved.zones || [...DEFAULT_ZONES];
  state.work = fromUrl.work || saved.work || { ...DEFAULT_WORK };
  state.date = fromUrl.date || todayIn(state.zones[0]);
  fillStaticControls();
  render();
}

init();
