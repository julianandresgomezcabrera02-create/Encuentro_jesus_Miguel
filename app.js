// 👇 PEGA AQUÍ el enlace público de tu Google Sheet en formato CSV.
// En Google Sheets: Archivo → Compartir → Publicar en la Web → elige la hoja y el formato "CSV" → Publicar → copia el enlace.
const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQrzD5MdPdeJZe3leWTK3Is_e1vnfhAU6T--jMXXpWvOw7gwAtvhIgrt5Y6CVv0FxJiu1Ed8z4ByeZ4/pub?gid=0&single=true&output=csv';

// Nombre de tu amigo (aparece en el título)
const FRIEND_NAME = 'Miguel';

const $ = (id) => document.getElementById(id);
const els = {
  home: $('home'), choice: $('choice'), list: $('list'),
  title: $('title'), moods: $('moods'), status: $('status'),
  choiceTitle: $('choice-title'), versesCount: $('verses-count'), songsCount: $('songs-count'),
  listTitle: $('list-title'), listBody: $('list-body'),
  toggle: $('theme-toggle'),
};

// Estado -> { emoji, items: [{verse, message, url}] }
let groups = new Map();

/* ---------- Tema claro / oscuro ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#04196E' : '#C2D8FF';
  els.toggle.setAttribute('aria-checked', String(theme === 'light'));
  try { localStorage.setItem('theme', theme); } catch (e) { /* sin almacenamiento */ }
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { /* ignorar */ }
  // El diseño principal es el oscuro; el claro queda a un toque del switch
  applyTheme(saved || 'dark');
}

els.toggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

/* ---------- CSV ---------- */
// Parser CSV que soporta comillas, comillas escapadas ("") y saltos de línea dentro de campos.
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const normalizeKey = (s) =>
  s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z_]/g, '');

// Agrupa los registros por "Estado"
function groupByState(rows) {
  if (rows.length < 2) return new Map();
  const headers = rows[0].map(normalizeKey);
  const idx = (name) => headers.indexOf(name);
  const col = {
    state: idx('estado'), emoji: idx('emoji'), verse: idx('versiculo'),
    message: idx('mensaje'), url: idx('url_youtube'),
  };
  if (col.state === -1) throw new Error('El CSV no tiene la columna "Estado".');

  const map = new Map();
  for (const r of rows.slice(1)) {
    const get = (i) => (i >= 0 && r[i] ? r[i].trim() : '');
    const state = get(col.state);
    if (!state) continue;
    if (!map.has(state)) map.set(state, { emoji: '', items: [] });
    const g = map.get(state);
    if (!g.emoji) g.emoji = get(col.emoji);
    g.items.push({ verse: get(col.verse), message: get(col.message), url: get(col.url) });
  }
  return map;
}

/* ---------- YouTube ---------- */
// Convierte enlaces normales de YouTube al formato embed. Devuelve '' si no reconoce el enlace.
function toEmbedUrl(url) {
  if (!url) return '';
  let u;
  try { u = new URL(url.trim()); } catch (e) { return ''; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id = '';

  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
    else {
      const m = u.pathname.match(/^\/(embed|shorts|live|v)\/([\w-]{6,})/);
      if (m) id = m[2];
    }
  }
  if (!/^[\w-]{6,}$/.test(id)) return '';

  const params = new URLSearchParams({ rel: '0', playsinline: '1' });
  const start = u.searchParams.get('t') || u.searchParams.get('start');
  if (start && /^\d+s?$/.test(start)) params.set('start', parseInt(start, 10));
  return `https://www.youtube.com/embed/${id}?${params}`;
}

/* ---------- UI ---------- */
function renderMoods() {
  els.moods.innerHTML = '';
  let i = 0;
  for (const [state, g] of groups) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'glass mood';
    btn.style.setProperty('--i', i++);
    btn.setAttribute('role', 'listitem');

    // Si existe icons/<estado>.png (sin tildes, en minúsculas) se usa el logo; si no, el emoji
    const emoji = document.createElement('img');
    emoji.className = 'mood-icon';
    emoji.alt = '';
    emoji.src = `icons/${normalizeKey(state)}.png`;
    emoji.addEventListener('error', () => {
      const fallback = el('span', 'emoji', g.emoji);
      emoji.replaceWith(fallback);
    }, { once: true });
    const label = document.createElement('span');
    label.textContent = state;

    btn.append(emoji, label);
    btn.addEventListener('click', () => showChoice(state));
    els.moods.appendChild(btn);
  }
}

let currentState = null;

function show(screen) {
  els.listBody.innerHTML = ''; // detiene cualquier reproducción
  for (const s of [els.home, els.choice, els.list]) s.classList.toggle('hidden', s !== screen);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const el = (tag, className, text) => {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text) n.textContent = text;
  return n;
};

const youtubeId = (url) => (toEmbedUrl(url).match(/embed\/([\w-]+)/) || [])[1] || '';

// Pantalla 2: dos tarjetas (versículos y canciones)
function showChoice(state) {
  currentState = state;
  const { emoji, items } = groups.get(state);
  els.choiceTitle.textContent = `${emoji} ${state}`.trim();
  const verses = items.filter((i) => i.verse || i.message).length;
  const songs = items.filter((i) => youtubeId(i.url)).length;
  els.versesCount.textContent = `${verses} ${verses === 1 ? 'versículo' : 'versículos'}`;
  els.songsCount.textContent = `${songs} ${songs === 1 ? 'canción' : 'canciones'}`;
  show(els.choice);
}

// Pantalla 3a: una tarjeta por versículo
function showVerses() {
  const items = shuffle(groups.get(currentState).items.filter((i) => i.verse || i.message));
  show(els.list);
  els.listTitle.textContent = '📖 Versículos';
  for (const item of items) {
    const card = el('article', 'glass item verse-card');
    card.style.setProperty('--i', els.listBody.children.length);
    if (item.verse) card.appendChild(el('p', 'verse', item.verse));
    if (item.message) card.appendChild(el('p', 'message', item.message));
    els.listBody.appendChild(card);
  }
}

// Pantalla 3b: una tarjeta por canción; al tocarla se despliega el reproductor
function showSongs() {
  const items = shuffle(groups.get(currentState).items.filter((i) => youtubeId(i.url)));
  show(els.list);
  els.listTitle.textContent = '🎵 Canciones';
  items.forEach((item, n) => els.listBody.appendChild(songCard(item, n + 1)));
}

function songCard(item, n) {
  const id = youtubeId(item.url);
  const card = el('article', 'glass item song');
  card.style.setProperty('--i', n - 1);

  const head = el('button', 'song-head');
  head.type = 'button';
  const thumb = el('img', 'thumb');
  thumb.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  thumb.alt = '';
  thumb.loading = 'lazy';
  const title = el('span', 'song-title', `Canción ${n}`);
  const sub = el('span', 'song-sub', 'Toca para escuchar');
  const meta = el('span', 'song-meta');
  meta.append(title, sub);
  const play = el('span', 'play');
  play.innerHTML =
    '<svg class="i-play" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>' +
    '<svg class="i-pause" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
  head.append(thumb, meta, play);
  card.appendChild(head);

  // El CSV no trae el nombre: lo pedimos a YouTube (si falla, queda "Canción n")
  fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((d) => { title.textContent = d.title; })
    .catch(() => {});

  head.addEventListener('click', () => {
    const open = card.querySelector('.song-player');
    // cierra cualquier otro reproductor abierto
    els.listBody.querySelectorAll('.song-player').forEach((p) => {
      const c = p.closest('.song');
      p.remove();
      c.classList.remove('open');
      c.querySelector('.song-sub').textContent = 'Toca para escuchar';
    });
    if (open) return; // estaba abierto: solo se cierra

    const player = el('div', 'song-player');
    const frame = el('div', 'frame');
    const iframe = document.createElement('iframe');
    iframe.src = toEmbedUrl(item.url) + '&autoplay=1';
    iframe.title = 'Reproductor de YouTube';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);
    player.appendChild(frame);
    card.appendChild(player);
    card.classList.add('open');
    sub.textContent = 'Reproduciendo · toca para cerrar';
  });
  return card;
}

$('open-verses').addEventListener('click', showVerses);
$('open-songs').addEventListener('click', showSongs);
$('back-home').addEventListener('click', () => show(els.home));
$('back-choice').addEventListener('click', () => show(els.choice));

/* ---------- Carga ---------- */
async function init() {
  initTheme();
  els.title.textContent = `¿Cómo te sientes hoy, ${FRIEND_NAME}?`;

  if (!csvUrl || csvUrl === 'URL_AQUI') {
    els.status.textContent = 'Falta configurar la variable csvUrl en app.js con el enlace CSV de Google Sheets.';
    return;
  }

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    groups = groupByState(parseCSV(await res.text()));
    if (groups.size === 0) throw new Error('El CSV está vacío.');
    els.status.textContent = '';
    renderMoods();
  } catch (err) {
    console.error(err);
    els.status.textContent = 'No pudimos cargar el contenido. Revisa tu conexión e inténtalo de nuevo.';
  }
}

init();
