import { HDate, Sedra } from 'https://esm.sh/@hebcal/core@5';
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
}

langToggle.addEventListener('click', toggleLanguage);
document.getElementById('modal-lang-toggle').addEventListener('click', toggleLanguage);

modeRadios.forEach(r => r.addEventListener('change', () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  gregorianInput.hidden = mode !== 'gregorian';
  hebrewInput.hidden = mode !== 'hebrew';
}));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const type = document.getElementById('type').value;
  const mode = document.querySelector('input[name="mode"]:checked').value;

  let hebDay, hebMonthName, hebYear;

  if (mode === 'gregorian') {
    const dateStr = document.getElementById('gregorian-date').value;
    if (!dateStr) {
      alert(t('alertPickDate'));
      return;
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const afterSunset = document.getElementById('after-sunset').checked;
    let hd = new HDate(new Date(y, m - 1, d));
    if (afterSunset) hd = hd.next();
    hebDay = hd.getDate();
    hebMonthName = hd.getMonthName();
    hebYear = hd.getFullYear();
  } else {
    hebDay = parseInt(document.getElementById('hebrew-day').value, 10);
    hebMonthName = document.getElementById('hebrew-month').value;
    const yearStr = yearInput.value.trim();
    if (yearStr) {
      hebYear = parseHebrewYear(yearStr);
      if (!hebYear) {
        alert(t('alertBadYear'));
        return;
      }
    } else {
      hebYear = null;
    }
    if (!hebDay || !hebMonthName) {
      alert(t('alertHebrewDate'));
      return;
    }
  }

  if (type === 'bar_mitzvah' && !hebYear) {
    alert(t('alertYearRequired'));
    return;
  }

  const gender = type === 'bar_mitzvah' ? document.getElementById('gender').value : null;

  events.push({
    id: crypto.randomUUID(),
    name,
    type,
    hebDay,
    hebMonthName,
    hebYearOrigin: hebYear,
    gender,
  });

  saveEvents();
  render();
  form.reset();
  gregorianInput.hidden = false;
  hebrewInput.hidden = true;
  setSelectedType('birthday');
  updateYearPreview();
});

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
    const id = e.target.dataset.id;
    events = events.filter(ev => ev.id !== id);
    saveEvents();
    render();
  }
});

function render() {
  const lang = getLang();
  const dict = translations[lang];
  list.innerHTML = '';
  emptyMsg.style.display = events.length === 0 ? 'block' : 'none';
  for (const ev of events) {
    const li = document.createElement('li');
    li.innerHTML = ev.type === 'bar_mitzvah'
      ? renderBarMitzvahItem(ev, dict, lang)
      : renderRegularItem(ev, dict, lang);
    list.appendChild(li);
  }
}

function renderRegularItem(ev, dict, lang) {
  const dateStr = formatHebrewDate(ev.hebDay, ev.hebMonthName, ev.hebYearOrigin, lang, dict);
  const counterStr = formatCounter(ev, dict);
  return `
    <div class="event-info">
      <span class="event-name">${escapeHtml(ev.name)}</span>
      <span class="event-meta">${labelForType(ev.type)} • ${dateStr}${counterStr ? ' • ' + counterStr : ''}</span>
    </div>
    <button class="delete-btn" data-id="${ev.id}" type="button">${dict.remove}</button>
  `;
}

function formatCounter(ev, dict) {
  if (!ev.hebYearOrigin) return '';
  const currentYear = new HDate(new Date()).getFullYear();
  const n = currentYear - ev.hebYearOrigin;
  if (n <= 0) return '';
  const word = n === 1 ? dict.yearLabel : dict.yearsLabel;
  return `${n} ${word}`;
}

function renderBarMitzvahItem(ev, dict, lang) {
  const age = ev.gender === 'girl' ? 12 : 13;
  const bmYear = ev.hebYearOrigin + age;
  const bmHd = resolveHebrewDate(ev.hebDay, ev.hebMonthName, bmYear);
  if (!bmHd) return renderRegularItem(ev, dict, lang);
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
  const parshaLine = parsha
    ? `<span class="event-meta event-sub">📖 ${escapeHtml(parsha)}</span>`
    : '';

  return `
    <div class="event-info">
      <span class="event-name">${escapeHtml(ev.name)}</span>
      <span class="event-meta">${dict.typeBarMitzvah} • ${dict.dob}: ${dobStr}</span>
      <span class="event-meta event-sub">🎓 ${dict[labelKey]}: ${bmStr} · ${bmGregStr}</span>
      <span class="event-meta event-sub">🕍 ${dict[shabbatKey]}: ${shabbatStr} · ${shabbatGregStr}</span>
      ${parshaLine}
    </div>
    <button class="delete-btn" data-id="${ev.id}" type="button">${dict.remove}</button>
  `;
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
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
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
    lines.push(
      'BEGIN:VEVENT',
      `UID:${ev.uid}`,
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
    const stripped = parsha.replace(/[֑-ׇ]/g, '').trim();
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
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
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
    shareListEl.innerHTML = '';
    return;
  }
  try {
    const acls = await gcal.listAcl(calId);
    const dict = translations[getLang()];
    shareListEl.innerHTML = '';
    for (const rule of acls) {
      if (rule.scope?.type !== 'user' || rule.role === 'owner') continue;
      const email = rule.scope.value;
      const roleLabel = rule.role === 'writer' ? dict.roleWriter : dict.roleReader;
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="share-email">${escapeHtml(email)}</span>
        <span class="share-role-tag">${roleLabel}</span>
        <button class="delete-btn remove-share-btn" type="button" data-rule-id="${escapeHtml(rule.id)}" data-email="${escapeHtml(email)}">${dict.remove}</button>
      `;
      shareListEl.appendChild(li);
    }
  } catch (err) {
    console.warn('Failed to list ACLs', err);
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
    calendarListEl.innerHTML = '';
    calendarListEmpty.hidden = calendars.length > 0;
    const dict = translations[getLang()];
    for (const cal of calendars) {
      const li = document.createElement('li');
      li.dataset.calId = cal.id;
      li.dataset.calName = cal.name;
      if (cal.id === activeId) li.classList.add('active');
      li.innerHTML = `
        <span class="calendar-dot" style="background:${colorFromId(cal.id)}"></span>
        <span class="calendar-name-text">${escapeHtml(cal.name)}</span>
        ${cal.id === activeId ? `<span class="calendar-badge">${dict.activeBadge}</span>` : ''}
      `;
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
  for (const ge of allEvents) {
    const props = ge.extendedProperties?.private;
    if (!props?.sourceId) continue;
    if (bySourceId.has(props.sourceId)) continue;
    bySourceId.set(props.sourceId, {
      id: props.sourceId,
      name: props.sourceName,
      type: props.sourceType,
      hebDay: parseInt(props.sourceDay, 10),
      hebMonthName: props.sourceMonth,
      hebYearOrigin: props.sourceYearOrigin ? parseInt(props.sourceYearOrigin, 10) : null,
      gender: props.sourceGender || null,
    });
  }
  return Array.from(bySourceId.values());
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

    let created = 0, updated = 0, deleted = 0, skipped = 0;

    for (const want of desired) {
      const ex = existingByUid.get(want.uid);
      const gEvent = toGoogleEvent(want);
      if (!ex) {
        await gcal.createEvent(calendarId, gEvent);
        created++;
      } else if (gEventChanged(ex, gEvent)) {
        await gcal.updateEvent(calendarId, ex.id, gEvent);
        updated++;
      } else {
        skipped++;
      }
    }

    for (const [uid, ex] of existingByUid) {
      if (!desiredByUid.has(uid)) {
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
