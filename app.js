import { HDate, Sedra } from 'https://esm.sh/@hebcal/core@5.10.0';
import { translations, getLang, setLang, t, applyLanguage } from './i18n.js';
import * as gcal from './googleCalendar.js';

const STORAGE_KEY = 'hebrew-dates-events';
const YEARS_AHEAD = 20;
const IL = true; // Israel calendar for parsha calculations

const GEMATRIA = [
  '', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
  'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל',
];

function gematria(n) {
  return GEMATRIA[n] || String(n);
}

const HUNDREDS = ['', 'ק', 'ר', 'ש', 'ת'];
const TENS = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
const ONES = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
const LETTER_VALUES = {
  'א':1,'ב':2,'ג':3,'ד':4,'ה':5,'ו':6,'ז':7,'ח':8,'ט':9,
  'י':10,'כ':20,'ך':20,'ל':30,'מ':40,'ם':40,'נ':50,'ן':50,
  'ס':60,'ע':70,'פ':80,'ף':80,'צ':90,'ץ':90,
  'ק':100,'ר':200,'ש':300,'ת':400,
};

function yearGematria(year) {
  if (!year) return '';
  let n = year % 1000; // strip millennium prefix (5000)
  let result = '';
  let h = Math.floor(n / 100);
  while (h > 4) { result += 'ת'; h -= 4; }
  if (h > 0) result += HUNDREDS[h];
  const r = n % 100;
  if (r === 15) result += 'טו';
  else if (r === 16) result += 'טז';
  else {
    const t = Math.floor(r / 10);
    const o = r % 10;
    if (t > 0) result += TENS[t];
    if (o > 0) result += ONES[o];
  }
  if (result.length === 0) return '';
  if (result.length === 1) return result + '׳';
  return result.slice(0, -1) + '״' + result.slice(-1);
}

function parseHebrewYear(text) {
  if (!text) return null;
  const trimmed = text.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = parseInt(trimmed, 10);
    return n < 1000 ? n + 5000 : n;
  }
  const clean = trimmed.replace(/['"׳״\s]/g, '');
  if (!clean) return null;
  let sum = 0;
  for (const ch of clean) {
    const val = LETTER_VALUES[ch];
    if (val === undefined) return null;
    sum += val;
  }
  if (sum === 0) return null;
  return sum < 1000 ? sum + 5000 : sum;
}

let events = loadEvents();

const form = document.getElementById('event-form');
const typeSelect = document.getElementById('type');
const genderField = document.getElementById('gender-field');
const submitBtn = document.getElementById('submit-btn');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
let editingId = null;
let pendingDelete = null;
let toastTimer = null;
const modeRadios = document.querySelectorAll('input[name="mode"]');
const gregorianInput = document.getElementById('gregorian-input');
const hebrewInput = document.getElementById('hebrew-input');
const list = document.getElementById('event-list');
const emptyMsg = document.getElementById('empty-msg');
const downloadBtn = document.getElementById('download-btn');
const langToggle = document.getElementById('lang-toggle');

const barMitzvahHint = document.getElementById('bar-mitzvah-hint');
const yearInput = document.getElementById('hebrew-year');
const yearPreview = document.getElementById('year-preview');
const typeButtons = document.getElementById('type-buttons');
const eventPreviewTitle = document.getElementById('event-preview-title');
const eventPreviewMeta = document.getElementById('event-preview-meta');
const toast = document.getElementById('toast');
const toastText = document.getElementById('toast-text');
const toastAction = document.getElementById('toast-action');

typeButtons.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  setSelectedType(btn.dataset.type);
});

function setSelectedType(type) {
  typeSelect.value = type;
  typeButtons.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  updateTypeSpecificFields();
  updateEventPreview();
}

function updateTypeSpecificFields() {
  const isBM = typeSelect.value === 'bar_mitzvah';
  genderField.hidden = !isBM;
  barMitzvahHint.hidden = !isBM;
  document.getElementById('year-optional').hidden = isBM;
  document.getElementById('year-required').hidden = !isBM;
}
updateTypeSpecificFields();

yearInput.addEventListener('input', updateYearPreview);
function updateYearPreview() {
  const parsed = parseHebrewYear(yearInput.value);
  yearPreview.textContent = parsed ? `= ${yearGematria(parsed)} (${parsed})` : '';
}

populateHebrewDays();
applyLanguage();
render();
updateSubmitButtonText();
updateEventPreview();

function populateHebrewDays() {
  const sel = document.getElementById('hebrew-day');
  sel.innerHTML = '';
  for (let i = 1; i <= 30; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = gematria(i);
    sel.appendChild(opt);
  }
}

function toggleLanguage() {
  setLang(getLang() === 'en' ? 'he' : 'en');
  applyLanguage();
  render();
  updateSubmitButtonText();
  updateEventPreview();
}

langToggle.addEventListener('click', toggleLanguage);
document.getElementById('modal-lang-toggle').addEventListener('click', toggleLanguage);

modeRadios.forEach(r => r.addEventListener('change', () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  gregorianInput.hidden = mode !== 'gregorian';
  hebrewInput.hidden = mode !== 'hebrew';
  updateEventPreview();
}));

form.addEventListener('input', updateEventPreview);
form.addEventListener('change', updateEventPreview);

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const draft = readEventDraft({ requireComplete: true });
  if (draft.errorKey) {
    alert(t(draft.errorKey));
    return;
  }
  const { name, type, hebDay, hebMonthName, hebYearOrigin, gender } = draft.event;

  if (editingId) {
    const idx = events.findIndex(ev => ev.id === editingId);
    if (idx >= 0) {
      events[idx] = { ...events[idx], name, type, hebDay, hebMonthName, hebYearOrigin, gender };
    }
    editingId = null;
  } else {
    events.push({
      id: crypto.randomUUID(),
      name,
      type,
      hebDay,
      hebMonthName,
      hebYearOrigin,
      gender,
    });
  }

  saveEvents();
  render();
  form.reset();
  gregorianInput.hidden = false;
  hebrewInput.hidden = true;
  setSelectedType('birthday');
  updateYearPreview();
  updateSubmitButtonText();
  updateEventPreview();
});

function readEventDraft({ requireComplete = false } = {}) {
  const name = document.getElementById('name').value.trim();
  const type = document.getElementById('type').value;
  const mode = document.querySelector('input[name="mode"]:checked').value;
  let hebDay, hebMonthName, hebYearOrigin;

  if (requireComplete && !name) return { errorKey: 'alertNameRequired' };

  if (mode === 'gregorian') {
    const dateStr = document.getElementById('gregorian-date').value;
    if (!dateStr) return requireComplete ? { errorKey: 'alertPickDate' } : { event: null };
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return { errorKey: 'alertPickDate' };
    const afterSunset = document.getElementById('after-sunset').checked;
    let hd = new HDate(new Date(y, m - 1, d));
    if (afterSunset) hd = hd.next();
    hebDay = hd.getDate();
    hebMonthName = hd.getMonthName();
    hebYearOrigin = hd.getFullYear();
  } else {
    hebDay = parseInt(document.getElementById('hebrew-day').value, 10);
    hebMonthName = document.getElementById('hebrew-month').value;
    const yearStr = yearInput.value.trim();
    if (yearStr) {
      hebYearOrigin = parseHebrewYear(yearStr);
      if (!hebYearOrigin) return { errorKey: 'alertBadYear' };
    } else {
      hebYearOrigin = null;
    }
    if (!hebDay || !hebMonthName) {
      return requireComplete ? { errorKey: 'alertHebrewDate' } : { event: null };
    }
  }

  if (type === 'bar_mitzvah' && !hebYearOrigin) {
    return requireComplete ? { errorKey: 'alertYearRequired' } : { errorKey: 'previewYearRequired' };
  }

  return {
    event: {
      id: editingId || 'preview',
      name,
      type,
      hebDay,
      hebMonthName,
      hebYearOrigin,
      gender: type === 'bar_mitzvah' ? document.getElementById('gender').value : null,
    },
  };
}

function updateEventPreview() {
  const dict = translations[getLang()];
  const draft = readEventDraft({ requireComplete: false });
  eventPreviewTitle.classList.toggle('preview-warning', !!draft.errorKey);

  if (draft.errorKey) {
    eventPreviewTitle.textContent = t(draft.errorKey);
    eventPreviewMeta.textContent = '';
    return;
  }
  if (!draft.event) {
    eventPreviewTitle.textContent = dict.previewEmpty;
    eventPreviewMeta.textContent = '';
    return;
  }

  const previewEvent = {
    ...draft.event,
    name: draft.event.name || labelForType(draft.event.type),
  };
  eventPreviewTitle.textContent = `${labelIcon(previewEvent.type)} ${previewEvent.name}`;
  eventPreviewMeta.textContent = buildPreviewLine(previewEvent, dict, getLang());
}

function buildPreviewLine(ev, dict, lang) {
  if (ev.type === 'bar_mitzvah') {
    const next = getNextBarMitzvahOccurrence(ev, dict);
    if (!next) return dict.noUpcoming;
    return `${next.label}: ${formatGreg(next.date, lang)} · ${formatHebrewDateFromDate(next.date, lang, dict)} · ${formatDaysUntil(next.date, dict)}`;
  }

  const next = getNextOccurrence(ev);
  if (!next) return dict.noUpcoming;
  return `${dict.nextOccurrence}: ${formatGreg(next.date, lang)} · ${formatHebrewDate(next.hd.getDate(), next.hd.getMonthName(), next.hd.getFullYear(), lang, dict)} · ${formatDaysUntil(next.date, dict)}`;
}

downloadBtn.addEventListener('click', () => {
  if (events.length === 0) {
    alert(t('alertNoEvents'));
    return;
  }
  const ics = generateICS(events, YEARS_AHEAD);
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hebrew-dates.ics';
  a.click();
  URL.revokeObjectURL(url);
});

list.addEventListener('click', (e) => {
  if (e.target.classList.contains('delete-btn')) {
    deleteEventWithUndo(e.target.dataset.id);
  } else if (e.target.classList.contains('edit-btn')) {
    startEdit(e.target.dataset.id);
  }
});

cancelEditBtn.addEventListener('click', cancelEdit);
toastAction.addEventListener('click', undoDelete);

function deleteEventWithUndo(id) {
  const idx = events.findIndex(ev => ev.id === id);
  if (idx < 0) return;
  const [removed] = events.splice(idx, 1);
  pendingDelete = { event: removed, index: idx };
  saveEvents();
  render();
  if (editingId === id) cancelEdit();
  showToast(t('eventDeleted').replace('{name}', removed.name), t('undoDelete'));
}

function showToast(message, actionLabel) {
  if (toastTimer) clearTimeout(toastTimer);
  toastText.textContent = message;
  toastAction.textContent = actionLabel;
  toast.hidden = false;
  toastTimer = setTimeout(hideToast, 7000);
}

function hideToast() {
  toast.hidden = true;
  pendingDelete = null;
  toastTimer = null;
}

function undoDelete() {
  if (!pendingDelete) return;
  const { event, index } = pendingDelete;
  events.splice(Math.min(index, events.length), 0, event);
  saveEvents();
  render();
  hideToast();
}

function startEdit(id) {
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  editingId = id;
  document.getElementById('name').value = ev.name;
  setSelectedType(ev.type);
  document.querySelector('input[name="mode"][value="hebrew"]').checked = true;
  gregorianInput.hidden = true;
  hebrewInput.hidden = false;
  document.getElementById('hebrew-day').value = String(ev.hebDay);
  document.getElementById('hebrew-month').value = ev.hebMonthName;
  yearInput.value = ev.hebYearOrigin ? String(ev.hebYearOrigin) : '';
  updateYearPreview();
  if (ev.gender) document.getElementById('gender').value = ev.gender;
  updateSubmitButtonText();
  updateEventPreview();
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelEdit() {
  editingId = null;
  form.reset();
  gregorianInput.hidden = false;
  hebrewInput.hidden = true;
  setSelectedType('birthday');
  updateYearPreview();
  updateSubmitButtonText();
  updateEventPreview();
}

function updateSubmitButtonText() {
  const dict = translations[getLang()];
  submitBtn.textContent = editingId ? dict.saveChanges : dict.submit;
  cancelEditBtn.hidden = !editingId;
}

function el(tag, props = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'className') e.className = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k === 'textContent') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const c of (Array.isArray(children) ? children : [children])) {
    if (c == null || c === false) continue;
    e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return e;
}

function render() {
  const lang = getLang();
  const dict = translations[lang];
  list.replaceChildren();
  emptyMsg.style.display = events.length === 0 ? 'block' : 'none';
  for (const ev of events) {
    const li = document.createElement('li');
    li.className = `event-card event-card-${ev.type}`;
    if (ev.type === 'bar_mitzvah') appendBarMitzvahItem(li, ev, dict, lang);
    else appendRegularItem(li, ev, dict, lang);
    list.appendChild(li);
  }
}

function appendRegularItem(li, ev, dict, lang) {
  const dateStr = formatHebrewDate(ev.hebDay, ev.hebMonthName, ev.hebYearOrigin, lang, dict);
  const counterStr = formatCounter(ev, dict);
  const next = getNextOccurrence(ev);
  li.appendChild(el('div', { className: 'event-info' }, [
    el('span', { className: 'event-icon', textContent: labelIcon(ev.type) }),
    el('span', { className: 'event-name', textContent: ev.name }),
    el('span', { className: 'event-meta', textContent: `${labelForType(ev.type)} • ${dateStr}${counterStr ? ' • ' + counterStr : ''}` }),
    el('span', {
      className: 'event-next',
      textContent: next
        ? `${dict.nextOccurrence}: ${formatGreg(next.date, lang)} · ${formatDaysUntil(next.date, dict)}`
        : dict.noUpcoming,
    }),
  ]));
  li.appendChild(eventActions(ev, dict));
}

function formatCounter(ev, dict) {
  if (!ev.hebYearOrigin) return '';
  const currentYear = new HDate(new Date()).getFullYear();
  const n = currentYear - ev.hebYearOrigin;
  if (n <= 0) return '';
  const word = n === 1 ? dict.yearLabel : dict.yearsLabel;
  return `${n} ${word}`;
}

function appendBarMitzvahItem(li, ev, dict, lang) {
  const age = ev.gender === 'girl' ? 12 : 13;
  const bmYear = (ev.hebYearOrigin ?? 0) + age;
  const bmHd = resolveHebrewDate(ev.hebDay, ev.hebMonthName, bmYear);
  if (!bmHd) { appendRegularItem(li, ev, dict, lang); return; }
  const bmGreg = bmHd.greg();
  const shabbat = shabbatOnOrAfter(bmGreg);
  const shabbatHd = new HDate(shabbat);

  const labelKey = ev.gender === 'girl' ? 'batMitzvahLabel' : 'barMitzvahLabel';
  const shabbatKey = ev.gender === 'girl' ? 'shabbatBatMitzvah' : 'shabbatBarMitzvah';

  const dobStr = formatHebrewDate(ev.hebDay, ev.hebMonthName, ev.hebYearOrigin, lang, dict);
  const bmStr = formatHebrewDate(bmHd.getDate(), bmHd.getMonthName(), bmHd.getFullYear(), lang, dict);
  const shabbatStr = formatHebrewDate(shabbatHd.getDate(), shabbatHd.getMonthName(), shabbatHd.getFullYear(), lang, dict);
  const bmGregStr = formatGreg(bmGreg, lang);
  const shabbatGregStr = formatGreg(shabbat, lang);
  const parsha = formatParsha(getParsha(shabbatHd, lang), lang);
  const next = getNextBarMitzvahOccurrence(ev, dict);

  li.appendChild(el('div', { className: 'event-info' }, [
    el('span', { className: 'event-icon', textContent: labelIcon(ev.type) }),
    el('span', { className: 'event-name', textContent: ev.name }),
    el('span', { className: 'event-meta', textContent: `${dict.typeBarMitzvah} • ${dict.dob}: ${dobStr}` }),
    el('span', {
      className: 'event-next',
      textContent: next
        ? `${next.label}: ${formatGreg(next.date, lang)} · ${formatDaysUntil(next.date, dict)}`
        : dict.noUpcoming,
    }),
    el('span', { className: 'event-meta event-sub', textContent: `🎓 ${dict[labelKey]}: ${bmStr} · ${bmGregStr}` }),
    el('span', { className: 'event-meta event-sub', textContent: `🕍 ${dict[shabbatKey]}: ${shabbatStr} · ${shabbatGregStr}` }),
    parsha ? el('span', { className: 'event-meta event-sub', textContent: `📖 ${parsha}` }) : null,
  ]));
  li.appendChild(eventActions(ev, dict));
}

function eventActions(ev, dict) {
  return el('div', { className: 'event-actions' }, [
    el('button', { className: 'edit-btn', type: 'button', dataset: { id: ev.id }, textContent: dict.edit }),
    el('button', { className: 'delete-btn', type: 'button', dataset: { id: ev.id }, textContent: dict.remove }),
  ]);
}

function getNextOccurrence(ev, fromDate = new Date()) {
  const today = startOfDay(fromDate);
  const startHebYear = new HDate(today).getFullYear();
  for (let i = 0; i <= YEARS_AHEAD; i++) {
    const targetHebYear = startHebYear + i;
    const hd = resolveHebrewDate(ev.hebDay, ev.hebMonthName, targetHebYear);
    if (!hd) continue;
    const counter = ev.hebYearOrigin ? targetHebYear - ev.hebYearOrigin : null;
    if (counter !== null && counter <= 0) continue;
    const date = startOfDay(hd.greg());
    if (date >= today) return { date, hd, counter };
  }
  return null;
}

function getNextBarMitzvahOccurrence(ev, dict, fromDate = new Date()) {
  const result = [];
  buildBarMitzvahEvents(result, ev, dict);
  const today = startOfDay(fromDate);
  return result
    .map((item, index) => ({
      date: startOfDay(item.start),
      label: index === 0
        ? (ev.gender === 'girl' ? dict.batMitzvahLabel : dict.barMitzvahLabel)
        : (ev.gender === 'girl' ? dict.shabbatBatMitzvah : dict.shabbatBarMitzvah),
    }))
    .filter(item => item.date >= today)
    .sort((a, b) => a.date - b.date)[0] || null;
}

function formatHebrewDateFromDate(date, lang, dict) {
  const hd = new HDate(date);
  return formatHebrewDate(hd.getDate(), hd.getMonthName(), hd.getFullYear(), lang, dict);
}

function formatDaysUntil(date, dict) {
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);
  if (days <= 0) return dict.todayLabel;
  if (days === 1) return dict.tomorrowLabel;
  if (days < 60) return dict.inDays.replace('{n}', days);

  const duration = calendarDurationUntil(date);
  const parts = [];
  if (duration.years > 0) {
    parts.push(formatDurationUnit(duration.years, dict.yearUnitOne, dict.yearUnitMany));
    if (duration.months > 0) {
      parts.push(formatDurationUnit(duration.months, dict.monthUnitOne, dict.monthUnitMany));
    }
  } else if (duration.months > 0) {
    parts.push(formatDurationUnit(duration.months, dict.monthUnitOne, dict.monthUnitMany));
  }

  if (parts.length === 0) return dict.inDays.replace('{n}', days);
  return dict.inDuration.replace('{duration}', joinDurationParts(parts));
}

function calendarDurationUntil(date) {
  const from = startOfDay(new Date());
  const to = startOfDay(date);
  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    months -= 1;
    const previousMonthLastDay = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    days += previousMonthLastDay;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days };
}

function formatDurationUnit(n, one, many) {
  return n === 1 ? one : many.replace('{n}', n);
}

function joinDurationParts(parts) {
  if (parts.length <= 1) return parts[0] || '';
  if (getLang() === 'he') return `${parts[0]} ו${parts[1]}`;
  return `${parts[0]} and ${parts[1]}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatHebrewDate(day, month, year, lang, dict) {
  const dayLabel = lang === 'he' ? gematria(day) : day;
  const mLabel = monthLabel(month, dict);
  if (!year) return `${dayLabel} ${mLabel}`;
  const yearLabel = lang === 'he' ? yearGematria(year) : year;
  return `${dayLabel} ${mLabel} ${yearLabel}`;
}

function monthLabel(name, dict) {
  if (!name) return '';
  return dict.monthShort[name]
      || dict.monthShort[name.replace(/'/g, '')]
      || name;
}

function formatGreg(d, lang) {
  return d.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function labelForType(t) {
  const dict = translations[getLang()];
  return ({
    birthday: dict.typeBirthday,
    anniversary: dict.typeAnniversary,
    memorial: dict.typeMemorial,
    bar_mitzvah: dict.typeBarMitzvah,
    other: dict.typeOther,
  })[t] || t;
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function saveEvents() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

function loadEvents() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    return raw.map(validateEvent).filter(Boolean);
  } catch {
    return [];
  }
}

const VALID_TYPES = new Set(['birthday', 'anniversary', 'memorial', 'bar_mitzvah', 'other']);
const VALID_MONTHS = new Set([
  'Nisan', 'Iyyar', 'Sivan', 'Tamuz', 'Av', 'Elul', 'Tishrei',
  'Cheshvan', 'Kislev', 'Tevet', 'Shvat', "Sh'vat",
  'Adar', 'Adar I', 'Adar II',
]);

function validateEvent(ev) {
  if (!ev || typeof ev !== 'object') return null;
  if (typeof ev.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(ev.id)) return null;
  if (typeof ev.name !== 'string' || ev.name.length === 0 || ev.name.length > 200) return null;
  if (!VALID_TYPES.has(ev.type)) return null;
  if (!Number.isInteger(ev.hebDay) || ev.hebDay < 1 || ev.hebDay > 30) return null;
  if (typeof ev.hebMonthName !== 'string' || !VALID_MONTHS.has(ev.hebMonthName)) return null;
  const yearOk = ev.hebYearOrigin === null || ev.hebYearOrigin === undefined
    || (Number.isInteger(ev.hebYearOrigin) && ev.hebYearOrigin >= 3000 && ev.hebYearOrigin <= 7000);
  if (!yearOk) return null;
  const genderOk = ev.gender === null || ev.gender === undefined
    || ev.gender === 'boy' || ev.gender === 'girl';
  if (!genderOk) return null;
  return {
    id: ev.id,
    name: ev.name,
    type: ev.type,
    hebDay: ev.hebDay,
    hebMonthName: ev.hebMonthName,
    hebYearOrigin: ev.hebYearOrigin ?? null,
    gender: ev.gender ?? null,
  };
}

function buildEventsForExport(events, years) {
  const result = [];
  const today = new Date();
  const startHebYear = new HDate(today).getFullYear();
  const dict = translations[getLang()];

  for (const ev of events) {
    if (ev.type === 'bar_mitzvah') {
      buildBarMitzvahEvents(result, ev, dict);
    } else {
      for (let i = 0; i < years; i++) {
        const targetHebYear = startHebYear + i;
        const hd = resolveHebrewDate(ev.hebDay, ev.hebMonthName, targetHebYear);
        if (!hd) continue;
        const counter = ev.hebYearOrigin ? targetHebYear - ev.hebYearOrigin : null;
        if (counter !== null && counter <= 0) continue;
        result.push({
          uid: `${ev.id}-${targetHebYear}@hebrew-dates-app`,
          start: hd.greg(),
          end: addDays(hd.greg(), 1),
          summary: buildSummary(ev, counter),
          description: buildDescription(hd, dict),
          source: ev,
        });
      }
    }
  }
  return result;
}

function buildBarMitzvahEvents(result, ev, dict) {
  const age = ev.gender === 'girl' ? 12 : 13;
  const targetHebYear = ev.hebYearOrigin + age;
  const hd = resolveHebrewDate(ev.hebDay, ev.hebMonthName, targetHebYear);
  if (!hd) return;
  const greg = hd.greg();
  const labelKey = ev.gender === 'girl' ? 'batMitzvahLabel' : 'barMitzvahLabel';
  const shabbatKey = ev.gender === 'girl' ? 'shabbatBatMitzvah' : 'shabbatBarMitzvah';

  result.push({
    uid: `${ev.id}-bm@hebrew-dates-app`,
    start: greg,
    end: addDays(greg, 1),
    summary: `🎓 ${dict[labelKey]}: ${ev.name}`,
    description: buildDescription(hd, dict),
    source: ev,
  });

  const shabbat = shabbatOnOrAfter(greg);
  if (shabbat.getTime() === greg.getTime()) return;

  const lang = getLang();
  const hdShabbat = new HDate(shabbat);
  const parsha = formatParsha(getParsha(hdShabbat, lang), lang);
  result.push({
    uid: `${ev.id}-bm-shabbat@hebrew-dates-app`,
    start: shabbat,
    end: addDays(shabbat, 1),
    summary: parsha
      ? `🎓 ${dict[shabbatKey]}: ${ev.name} — ${parsha}`
      : `🎓 ${dict[shabbatKey]}: ${ev.name}`,
    description: parsha
      ? `${buildDescription(hdShabbat, dict)}\n${parsha}`
      : buildDescription(hdShabbat, dict),
    source: ev,
  });
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function generateICS(events, years) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hebrew Dates App//EN',
    'CALSCALE:GREGORIAN',
  ];
  const stamp = formatICSTimestamp(new Date());
  for (const ev of buildEventsForExport(events, years)) {
    const uid = safeUID(ev.uid);
    if (!uid) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${formatICSDate(ev.start)}`,
      `DTEND;VALUE=DATE:${formatICSDate(ev.end)}`,
      `SUMMARY:${icsEscape(ev.summary)}`,
      `DESCRIPTION:${icsEscape(ev.description)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function buildSummary(ev, counter) {
  const base = `${labelIcon(ev.type)} ${ev.name}`;
  return counter ? `${base} (${counter})` : base;
}

function buildDescription(hd, dict) {
  const lang = getLang();
  const mLabel = monthLabel(hd.getMonthName(), dict);
  const dayLabel = lang === 'he' ? gematria(hd.getDate()) : hd.getDate();
  const yearLabel = lang === 'he' ? yearGematria(hd.getFullYear()) : hd.getFullYear();
  return `${dict.month}: ${dayLabel} ${mLabel} ${yearLabel}`;
}

function getParsha(hd, lang) {
  try {
    const sedra = new Sedra(hd.getFullYear(), IL);
    const locale = lang === 'he' ? 'he' : 'en';
    const name = sedra.getString(hd, locale);
    return name || '';
  } catch (err) {
    console.warn('Failed to get parsha', err);
    return '';
  }
}

function formatParsha(parsha, lang) {
  if (!parsha) return '';
  if (lang === 'he') {
    const stripped = parsha
      .replace(/\u05BE/g, ' ')
      .replace(/[\u0591-\u05BD\u05BF-\u05C7]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return stripped.startsWith('פרשת') ? stripped : `פרשת ${stripped}`;
  }
  return parsha.startsWith('Parashat') || parsha.startsWith('Parshat') ? parsha : `Parshat ${parsha}`;
}

function shabbatOnOrAfter(d) {
  const result = new Date(d);
  const dow = result.getDay();
  if (dow === 6) return result;
  result.setDate(result.getDate() + (6 - dow));
  return result;
}

function resolveHebrewDate(day, monthName, hebYear) {
  try {
    const isLeap = HDate.isLeapYear(hebYear);
    let effectiveMonth = monthName;
    if (monthName === 'Adar' && isLeap) {
      effectiveMonth = 'Adar II';
    } else if (monthName === 'Adar I' && !isLeap) {
      effectiveMonth = 'Adar';
    }
    const monthNum = HDate.monthFromName(effectiveMonth);
    const monthLen = HDate.daysInMonth(monthNum, hebYear);
    const effectiveDay = Math.min(day, monthLen);
    return new HDate(effectiveDay, monthNum, hebYear);
  } catch (err) {
    console.warn('Failed to resolve date', { day, monthName, hebYear }, err);
    return null;
  }
}

function labelIcon(type) {
  return { birthday: '🎂', anniversary: '💍', memorial: '🕯️', bar_mitzvah: '🎓', other: '📅' }[type] || '📅';
}

function formatICSDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatICSTimestamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(s) {
  return String(s)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // strip control chars except \t \n \r
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const UID_RE = /^[a-zA-Z0-9-]+-(?:\d+|bm|bm-shabbat)@hebrew-dates-app$/;
function safeUID(uid) {
  return UID_RE.test(uid) ? uid : null;
}

// ─── Google Calendar sync ───────────────────────────────────────────────

const gcalConnect = document.getElementById('gcal-connect');
const gcalConnected = document.getElementById('gcal-connected');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const calendarNameInput = document.getElementById('calendar-name-input');
const syncBtn = document.getElementById('sync-btn');
const syncStatus = document.getElementById('sync-status');
const calendarListEl = document.getElementById('calendar-list');
const calendarListEmpty = document.getElementById('calendar-list-empty');
const refreshCalsBtn = document.getElementById('refresh-cals-btn');
const shareEmailInput = document.getElementById('share-email');
const shareRoleSelect = document.getElementById('share-role');
const shareBtn = document.getElementById('share-btn');
const shareListEl = document.getElementById('share-list');
const shareStatus = document.getElementById('share-status');

shareBtn.addEventListener('click', async () => {
  const email = shareEmailInput.value.trim();
  if (!email || !email.includes('@')) {
    alert(t('alertInvalidEmail'));
    return;
  }
  const role = shareRoleSelect.value;
  const calId = gcal.getCalendarId();
  if (!calId) {
    alert(t('alertNoActiveCalendar'));
    return;
  }
  shareBtn.disabled = true;
  try {
    await gcal.requestAclAccess();
    await gcal.addAcl(calId, email, role);
    shareStatus.textContent = t('shareAdded').replace('{email}', email);
    shareEmailInput.value = '';
    refreshShareList();
  } catch (err) {
    console.error(err);
    shareStatus.textContent = t('shareError').replace('{msg}', err.message || String(err));
  } finally {
    shareBtn.disabled = false;
  }
});

shareListEl.addEventListener('click', async (e) => {
  const removeBtn = e.target.closest('.remove-share-btn');
  if (!removeBtn) return;
  const email = removeBtn.dataset.email;
  const ruleId = removeBtn.dataset.ruleId;
  const calId = gcal.getCalendarId();
  if (!calId || !ruleId) return;
  if (!confirm(t('removeShareConfirm').replace('{email}', email))) return;
  try {
    await gcal.requestAclAccess();
    await gcal.removeAcl(calId, ruleId);
    shareStatus.textContent = t('shareRemoved').replace('{email}', email);
    refreshShareList();
  } catch (err) {
    console.error(err);
    shareStatus.textContent = t('shareError').replace('{msg}', err.message || String(err));
  }
});

async function refreshShareList() {
  if (!gcal.isSignedIn()) return;
  const calId = gcal.getCalendarId();
  if (!calId) {
    shareListEl.replaceChildren();
    return;
  }
  try {
    const acls = await gcal.listAcl(calId);
    const dict = translations[getLang()];
    shareListEl.replaceChildren();
    for (const rule of acls) {
      if (rule.scope?.type !== 'user' || rule.role === 'owner') continue;
      if (typeof rule.id !== 'string' || typeof rule.scope.value !== 'string') continue;
      const email = rule.scope.value;
      const roleLabel = rule.role === 'writer' ? dict.roleWriter : dict.roleReader;
      const li = document.createElement('li');
      li.appendChild(el('span', { className: 'share-email', textContent: email }));
      li.appendChild(el('span', { className: 'share-role-tag', textContent: roleLabel }));
      li.appendChild(el('button', {
        className: 'delete-btn remove-share-btn', type: 'button',
        dataset: { ruleId: rule.id, email },
        textContent: dict.remove,
      }));
      shareListEl.appendChild(li);
    }
  } catch (err) {
    // Most likely the user hasn't granted the ACL scope yet — that's expected
    // because we only request it lazily when they click Share. Silent.
    if (!String(err.message).includes('insufficient')) {
      console.warn('Failed to list ACLs', err);
    }
  }
}

refreshCalsBtn.addEventListener('click', () => refreshCalendarList());

calendarListEl.addEventListener('click', (e) => {
  const li = e.target.closest('li[data-cal-id]');
  if (!li) return;
  const id = li.dataset.calId;
  const name = li.dataset.calName;
  gcal.setCalendarId(id);
  gcal.setCalendarName(name);
  calendarNameInput.value = name;
  refreshCalendarList();
});

function colorFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 60%)`;
}

async function refreshCalendarList() {
  if (!gcal.isSignedIn()) return;
  try {
    const calendars = await gcal.listCalendars();
    const activeId = gcal.getCalendarId();
    calendarListEl.replaceChildren();
    calendarListEmpty.hidden = calendars.length > 0;
    const dict = translations[getLang()];
    for (const cal of calendars) {
      const li = document.createElement('li');
      li.dataset.calId = cal.id;
      li.dataset.calName = cal.name;
      if (cal.id === activeId) li.classList.add('active');
      const dot = el('span', { className: 'calendar-dot' });
      dot.style.background = colorFromId(cal.id);
      li.appendChild(dot);
      li.appendChild(el('span', { className: 'calendar-name-text', textContent: cal.name }));
      if (cal.id === activeId) {
        li.appendChild(el('span', { className: 'calendar-badge', textContent: dict.activeBadge }));
      }
      calendarListEl.appendChild(li);
    }
  } catch (err) {
    console.warn('Failed to list calendars', err);
  }
}

calendarNameInput.value = gcal.getCalendarName();

gcal.setOnAuthChange(async (signedIn, err) => {
  refreshSyncUI();
  if (err && err !== 'popup_closed') {
    syncStatus.textContent = `(${err})`;
    return;
  }
  if (signedIn) {
    setMode('google');
    try {
      const loaded = await loadEventsFromGoogle();
      if (loaded.length > 0) {
        await applyLoadedEvents(loaded);
      } else {
        syncStatus.textContent = t('noEventsInGoogle');
      }
    } catch (e) {
      console.error('Load from Google failed', e);
    }
  }
});

async function applyLoadedEvents(loaded) {
  if (events.length === 0) {
    events = loaded;
  } else {
    const useGoogle = confirm(
      t('conflictPrompt')
        .replace('{local}', events.length)
        .replace('{remote}', loaded.length),
    );
    if (!useGoogle) return;
    events = loaded;
  }
  saveEvents();
  render();
  syncStatus.textContent = t('eventsLoadedFromGoogle').replace('{n}', loaded.length);
}

connectBtn.addEventListener('click', () => {
  if (!window.google?.accounts?.oauth2) {
    alert(t('alertGsiNotLoaded'));
    return;
  }
  try { gcal.initTokenClient(); } catch (err) { console.warn(err); }
  gcal.signIn();
});

disconnectBtn.addEventListener('click', (e) => {
  e.preventDefault();
  gcal.signOut();
});

calendarNameInput.addEventListener('change', () => {
  const name = calendarNameInput.value.trim() || 'Hebrew Dates';
  gcal.setCalendarName(name);
  calendarNameInput.value = name;
});

syncBtn.addEventListener('click', () => {
  syncToGoogle().catch(err => {
    console.error(err);
    syncStatus.textContent = t('syncError').replace('{msg}', err.message || String(err));
  });
});

function refreshSyncUI() {
  const signedIn = gcal.isSignedIn();
  gcalConnect.hidden = signedIn;
  gcalConnected.hidden = !signedIn;
  if (signedIn) {
    refreshCalendarList();
    refreshShareList();
  }
}

// Wait until Google Identity Services script has loaded
function whenGsiReady() {
  return new Promise(resolve => {
    if (window.google?.accounts?.oauth2) return resolve();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

whenGsiReady().then(() => {
  try { gcal.initTokenClient(); } catch (err) { console.warn(err); }
  refreshSyncUI();
});

refreshSyncUI();

async function loadEventsFromGoogle() {
  let calendarId = gcal.getCalendarId();
  if (!calendarId) {
    const cals = await gcal.listCalendars();
    if (cals.length === 0) return [];
    calendarId = cals[0].id;
    gcal.setCalendarId(calendarId);
    gcal.setCalendarName(cals[0].name);
    calendarNameInput.value = cals[0].name;
  }
  const allEvents = await gcal.listAllEvents(calendarId);
  const bySourceId = new Map();
  // First pass: events with full source metadata
  for (const ge of allEvents) {
    const props = ge.extendedProperties?.private;
    if (!props?.sourceId) continue;
    if (bySourceId.has(props.sourceId)) continue;
    const candidate = {
      id: props.sourceId,
      name: typeof props.sourceName === 'string' ? props.sourceName : '',
      type: props.sourceType,
      hebDay: parseInt(props.sourceDay, 10),
      hebMonthName: props.sourceMonth,
      hebYearOrigin: props.sourceYearOrigin ? parseInt(props.sourceYearOrigin, 10) : null,
      gender: props.sourceGender || null,
    };
    const validated = validateEvent(candidate);
    if (validated) bySourceId.set(validated.id, validated);
  }
  // Second pass: legacy events without metadata — recover from iCalUID + summary
  for (const ge of allEvents) {
    if (ge.extendedProperties?.private?.sourceId) continue;
    const sourceId = extractSourceIdFromUID(ge.iCalUID || '');
    if (!sourceId || bySourceId.has(sourceId)) continue;
    const parsed = parseLegacyEvent(ge, sourceId);
    const validated = parsed && validateEvent(parsed);
    if (validated) bySourceId.set(validated.id, validated);
  }
  return Array.from(bySourceId.values());
}

function extractSourceIdFromUID(uid) {
  if (!uid.endsWith('@hebrew-dates-app')) return null;
  const stripped = uid.slice(0, -'@hebrew-dates-app'.length);
  const m = stripped.match(/^(.+?)(?:-\d+|-bm(?:-shabbat)?)$/);
  return m ? m[1] : null;
}

function parseLegacyEvent(ge, sourceId) {
  if (ge.iCalUID?.includes('-bm-shabbat@')) return null; // Shabbat sub-event of bar mitzvah
  const summary = ge.summary || '';
  const iconMap = {
    '🎂': 'birthday', '💍': 'anniversary', '🕯️': 'memorial',
    '🎓': 'bar_mitzvah', '📅': 'other',
  };
  let type = null;
  let name = summary;
  for (const [icon, t] of Object.entries(iconMap)) {
    if (summary.startsWith(icon)) {
      type = t;
      name = summary.slice(icon.length).trim();
      break;
    }
  }
  if (!type) return null;
  const counterMatch = name.match(/^(.+?)\s*\((\d+)\)\s*$/);
  if (counterMatch) name = counterMatch[1].trim();
  if (type === 'bar_mitzvah') {
    const bmMatch = name.match(/^.+?:\s*(.+?)(?:\s+—\s+.+)?$/);
    if (bmMatch) name = bmMatch[1].trim();
  }
  const dateStr = ge.start?.date;
  if (!dateStr) return null;
  const [y, mo, d] = dateStr.split('-').map(Number);
  const hd = new HDate(new Date(y, mo - 1, d));
  return {
    id: sourceId,
    name,
    type,
    hebDay: hd.getDate(),
    hebMonthName: hd.getMonthName(),
    hebYearOrigin: null,
    gender: type === 'bar_mitzvah' ? 'boy' : null,
  };
}

function isOurEvent(ge) {
  if (ge.extendedProperties?.private?.sourceId) return true;
  if (ge.iCalUID?.endsWith('@hebrew-dates-app')) return true;
  return false;
}

function calculateSyncPlan(desired, desiredByUid, existingByUid) {
  let created = 0, updated = 0, deleted = 0, skipped = 0;
  for (const want of desired) {
    const ex = existingByUid.get(want.uid);
    const gEvent = toGoogleEvent(want);
    if (!ex) created++;
    else if (ex.status === 'cancelled' || gEventChanged(ex, gEvent)) updated++;
    else skipped++;
  }
  for (const [uid, ex] of existingByUid) {
    if (!desiredByUid.has(uid) && ex.status !== 'cancelled' && isOurEvent(ex)) deleted++;
  }
  return { created, updated, deleted, skipped, changed: created + updated + deleted };
}

function formatSyncPlan(plan, calendarName) {
  return t('syncPreviewConfirm')
    .replace('{calendar}', calendarName)
    .replace('{created}', plan.created)
    .replace('{updated}', plan.updated)
    .replace('{deleted}', plan.deleted)
    .replace('{skipped}', plan.skipped);
}

async function syncToGoogle() {
  if (!gcal.isSignedIn()) return;
  if (events.length === 0) {
    alert(t('alertNoEvents'));
    return;
  }

  syncBtn.disabled = true;
  syncStatus.textContent = t('syncing');

  try {
    const name = calendarNameInput.value.trim() || 'Hebrew Dates';
    gcal.setCalendarName(name);
    const calendarId = await gcal.ensureCalendar(name);

    const desired = buildEventsForExport(events, YEARS_AHEAD);
    const desiredByUid = new Map(desired.map(e => [e.uid, e]));

    const existing = await gcal.listAllEvents(calendarId);
    const existingByUid = new Map();
    for (const e of existing) {
      if (e.iCalUID) existingByUid.set(e.iCalUID, e);
    }

    const plan = calculateSyncPlan(desired, desiredByUid, existingByUid);
    if (plan.changed === 0) {
      syncStatus.textContent = t('syncNoChanges').replace('{skipped}', plan.skipped);
      refreshCalendarList();
      refreshShareList();
      return;
    }
    if (!confirm(formatSyncPlan(plan, name))) {
      syncStatus.textContent = t('syncCancelled');
      return;
    }

    let created = 0, updated = 0, deleted = 0, skipped = 0;

    for (const want of desired) {
      const ex = existingByUid.get(want.uid);
      const gEvent = toGoogleEvent(want);
      if (!ex) {
        try {
          await gcal.createEvent(calendarId, gEvent);
          created++;
        } catch (err) {
          if (String(err.message).includes(' 409')) {
            const conflict = await gcal.findEventByICalUID(calendarId, gEvent.iCalUID);
            if (conflict) {
              await gcal.patchEvent(calendarId, conflict.id, { status: 'confirmed' });
              await gcal.patchEvent(calendarId, conflict.id, gEvent);
              updated++;
            } else { throw err; }
          } else { throw err; }
        }
      } else if (ex.status === 'cancelled') {
        // Cancelled events sometimes reject PUT ("Invalid start time").
        // PATCH with status:confirmed first to restore, then PATCH the rest.
        await gcal.patchEvent(calendarId, ex.id, { status: 'confirmed' });
        await gcal.patchEvent(calendarId, ex.id, gEvent);
        updated++;
      } else if (gEventChanged(ex, gEvent)) {
        await gcal.updateEvent(calendarId, ex.id, gEvent);
        updated++;
      } else {
        skipped++;
      }
    }

    for (const [uid, ex] of existingByUid) {
      if (!desiredByUid.has(uid) && ex.status !== 'cancelled' && isOurEvent(ex)) {
        await gcal.deleteEvent(calendarId, ex.id);
        deleted++;
      }
    }

    syncStatus.textContent = t('syncDone')
      .replace('{created}', created)
      .replace('{updated}', updated)
      .replace('{deleted}', deleted)
      .replace('{skipped}', skipped);
    refreshCalendarList();
    refreshShareList();
  } finally {
    syncBtn.disabled = false;
  }
}

function toGoogleEvent(ev) {
  return {
    iCalUID: ev.uid,
    summary: ev.summary,
    description: ev.description,
    start: { date: formatYMD(ev.start) },
    end: { date: formatYMD(ev.end) },
    transparency: 'transparent',
    extendedProperties: {
      private: {
        sourceId: ev.source.id,
        sourceType: ev.source.type,
        sourceName: ev.source.name,
        sourceDay: String(ev.source.hebDay),
        sourceMonth: ev.source.hebMonthName,
        sourceYearOrigin: ev.source.hebYearOrigin ? String(ev.source.hebYearOrigin) : '',
        sourceGender: ev.source.gender || '',
      },
    },
  };
}

function gEventChanged(existing, desired) {
  return (existing.summary || '') !== desired.summary
      || (existing.description || '') !== desired.description
      || existing.start?.date !== desired.start.date
      || existing.end?.date !== desired.end.date;
}

function formatYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─── App mode (anonymous vs google) ─────────────────────────────────────

const MODE_KEY = 'app-mode';
const syncCard = document.getElementById('sync-card');
const welcomeModal = document.getElementById('welcome-modal');
const switchModeBtn = document.getElementById('switch-mode-btn');

function getMode() {
  return localStorage.getItem(MODE_KEY);
}

function setMode(mode) {
  localStorage.setItem(MODE_KEY, mode);
  applyMode(mode);
}

function applyMode(mode) {
  const isAnon = mode === 'anonymous';
  syncCard.hidden = isAnon;
}

welcomeModal.addEventListener('click', (e) => {
  const btn = e.target.closest('.welcome-btn');
  if (!btn) return;
  const mode = btn.dataset.mode;
  welcomeModal.hidden = true;
  setMode(mode);
  if (mode === 'google') {
    try { gcal.initTokenClient(); } catch (err) { console.warn(err); }
    gcal.signIn();
  }
});

switchModeBtn.addEventListener('click', () => {
  welcomeModal.hidden = false;
});

const savedMode = getMode();
if (savedMode) {
  applyMode(savedMode);
} else {
  welcomeModal.hidden = false;
}
