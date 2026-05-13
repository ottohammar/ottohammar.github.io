/**
 * browser.js — Hammarska Släktföreningen file browser
 *
 * HOW IT WORKS
 * -----------
 * The browser reads its content from manifest.json (fetched at startup).
 * Edit manifest.json to reflect your actual folder/file structure.
 *
 * Each entry is an object:
 *   { name, type }          — folder
 *   { name, type, path }    — image | document
 *
 * "path" is the URL of the file relative to this page (or absolute).
 *
 * See manifest.json for a full example.
 */

'use strict';

// ── State ──────────────────────────────────────────────────────────────────
let ROOT      = null;        // top-level manifest node
let current   = null;        // node currently displayed
let stack     = [];          // breadcrumb trail of nodes
let viewMode  = 'grid';      // 'list' | 'grid'
let lbImages  = [];          // flat image list for current folder
let lbIndex   = 0;           // which image is open in lightbox

// ── DOM refs ───────────────────────────────────────────────────────────────
const container  = document.getElementById('file-container');
const breadcrumb = document.getElementById('breadcrumb');
const itemCount  = document.getElementById('item-count');
const btnList    = document.getElementById('btn-list');
const btnGrid    = document.getElementById('btn-grid');
const lightbox   = document.getElementById('lightbox');
const lbImg      = document.getElementById('lb-img');
const lbCaption  = document.getElementById('lb-caption');
const lbClose    = document.getElementById('lb-close');
const lbPrev     = document.getElementById('lb-prev');
const lbNext     = document.getElementById('lb-next');

// ── File type helpers ───────────────────────────────────────────────────────
const IMAGE_EXT = new Set(['jpg','jpeg','png','gif','webp','bmp','svg','tif','tiff']);

function extOf(name) {
  return name.split('.').pop().toLowerCase();
}

function isImage(entry) {
  return entry.type === 'image' || IMAGE_EXT.has(extOf(entry.name));
}

function iconFor(entry) {
  if (entry.type === 'folder') return 'fa fa-folder';
  if (isImage(entry))          return 'fa fa-file-image-o';
  const ext = extOf(entry.name);
  if (ext === 'pdf')                    return 'fa fa-file-pdf-o';
  if (['doc','docx'].includes(ext))     return 'fa fa-file-word-o';
  if (['xls','xlsx'].includes(ext))     return 'fa fa-file-excel-o';
  if (['ppt','pptx'].includes(ext))     return 'fa fa-file-powerpoint-o';
  if (['txt','csv'].includes(ext))      return 'fa fa-file-text-o';
  return 'fa fa-file-o';
}

// ── Rendering ──────────────────────────────────────────────────────────────
function render(node) {
  current = node;
  const entries = node.children || [];

  // sort: folders first, then alphabetical
  const sorted = [...entries].sort((a, b) => {
    const af = a.type === 'folder' ? 0 : 1;
    const bf = b.type === 'folder' ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name, 'sv');
  });

  // build image list for lightbox
  lbImages = sorted.filter(isImage);

  // item count label
  const folders = sorted.filter(e => e.type === 'folder').length;
  const files   = sorted.filter(e => e.type !== 'folder').length;
  const parts   = [];
  if (folders) parts.push(`${folders} mapp${folders !== 1 ? 'ar' : ''}`);
  if (files)   parts.push(`${files} fil${files !== 1 ? 'er' : ''}`);
  itemCount.textContent = parts.join(', ') || 'Tom mapp';

  renderBreadcrumb();
  renderEntries(sorted);
}

function renderBreadcrumb() {
  breadcrumb.innerHTML = '';

  const addCrumb = (label, node) => {
    const a = document.createElement('span');
    a.className = 'crumb';
    a.textContent = label;
    a.addEventListener('click', () => navigateTo(node, true));
    breadcrumb.appendChild(a);
  };

  const addSep = () => {
    const s = document.createElement('span');
    s.className = 'sep';
    s.textContent = '/';
    breadcrumb.appendChild(s);
  };

  addCrumb('~', ROOT);
  addSep();

  stack.forEach((node, i) => {
    const isLast = i === stack.length - 1;
    if (isLast) {
      const s = document.createElement('span');
      s.className = 'crumb-current';
      s.textContent = node.name;
      breadcrumb.appendChild(s);
    } else {
      addCrumb(node.name, node);
      addSep();
    }
  });
}

function renderEntries(entries) {
  container.innerHTML = '';
  container.className = viewMode === 'grid' ? 'grid-view' : 'list-view';

  if (!entries.length) {
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.textContent = '— tom mapp —';
    container.appendChild(e);
    return;
  }

  entries.forEach(entry => {
    const el = viewMode === 'grid'
      ? buildGridEntry(entry)
      : buildListEntry(entry);
    container.appendChild(el);
  });
}

// ---- List entry ----
function buildListEntry(entry) {
  const row = document.createElement('div');
  row.className = 'file-entry' + (entry.type === 'folder' ? ' is-folder' : '');
  row.setAttribute('role', 'button');
  row.setAttribute('tabindex', '0');
  row.title = entry.name;

  // icon col
  const icon = document.createElement('i');
  icon.className = 'file-icon ' + iconFor(entry);
  icon.setAttribute('aria-hidden', 'true');

  // thumb col — only for images
  let thumbWrap = null;
  if (isImage(entry) && entry.path) {
    thumbWrap = document.createElement('span');
    const img = document.createElement('img');
    img.className = 'file-thumb';
    img.src = entry.path;
    img.alt = entry.name;
    img.loading = 'lazy';
    thumbWrap.appendChild(img);
    row.classList.add('has-thumb');
  }

  // name col
  const name = document.createElement('span');
  name.className = 'file-name';
  name.textContent = entry.name;

  // meta col
  const meta = document.createElement('span');
  meta.className = 'file-meta';
  meta.textContent = entry.type === 'folder'
    ? `${(entry.children || []).length} objekt`
    : (entry.size || '');

  if (thumbWrap) {
    row.append(icon, thumbWrap, name, meta);
  } else {
    row.append(icon, name, meta);
  }
  addClickBehavior(row, entry);
  return row;
}

// ---- Grid entry ----
function buildGridEntry(entry) {
  const card = document.createElement('div');
  card.className = 'file-entry' + (entry.type === 'folder' ? ' is-folder' : '');
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.title = entry.name;

  const wrap = document.createElement('div');
  wrap.className = 'file-thumb-wrap';

  if (isImage(entry) && entry.path) {
    const img = document.createElement('img');
    img.className = 'file-thumb';
    img.src = entry.path;
    img.alt = entry.name;
    img.loading = 'lazy';
    wrap.appendChild(img);
  } else {
    wrap.className += ' file-thumb placeholder';
    wrap.setAttribute('aria-hidden', 'true');
    const i = document.createElement('i');
    i.className = iconFor(entry);
    wrap.appendChild(i);
  }

  const label = document.createElement('div');
  label.className = 'file-label';
  label.textContent = entry.name;

  card.append(wrap, label);
  addClickBehavior(card, entry);
  return card;
}

// ── Navigation ─────────────────────────────────────────────────────────────
function addClickBehavior(el, entry) {
  const handler = () => {
    if (entry.type === 'folder') {
      navigateTo(entry);
    } else if (isImage(entry)) {
      openLightbox(entry);
    } else if (entry.path) {
      window.open(entry.path, '_blank', 'noopener');
    }
  };
  el.addEventListener('click', handler);
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); });
}

/**
 * Navigate to a folder node.
 * @param {object}  node        - manifest node to display
 * @param {boolean} isCrumb     - true when clicking a breadcrumb (truncates stack)
 * @param {boolean} pushHistory - false when called from popstate (avoids double-push)
 */
function navigateTo(node, isCrumb = false, pushHistory = true) {
  if (node === ROOT) {
    stack = [];
  } else if (isCrumb) {
    const idx = stack.indexOf(node);
    if (idx !== -1) stack = stack.slice(0, idx + 1);
  } else {
    stack.push(node);
  }

  if (pushHistory) {
    const hash = stackToHash(stack);
    history.pushState({ folderPath: stack.map(n => n.name) }, '', hash || '#');
  }

  render(node);
}

// ── History helpers ────────────────────────────────────────────────────────

/** Encode the current stack as a URL hash: #Folder/Sub%20folder */
function stackToHash(s) {
  if (!s.length) return '#';
  return '#' + s.map(n => encodeURIComponent(n.name)).join('/');
}

/**
 * Walk the manifest tree by an array of folder names.
 * Returns { node, resolvedStack } — resolvedStack may be shorter if a
 * name is not found (graceful degradation).
 */
function resolveStackFromNames(names) {
  let node = ROOT;
  const resolvedStack = [];
  for (const name of names) {
    const child = (node.children || []).find(
      c => c.type === 'folder' && c.name === name
    );
    if (!child) break;
    node = child;
    resolvedStack.push(node);
  }
  return { node, resolvedStack };
}

/** Read location.hash and navigate there without pushing a new entry. */
function navigateToHash() {
  const raw = decodeURIComponent(location.hash.slice(1)); // strip leading #
  const names = raw ? raw.split('/') : [];
  const { node, resolvedStack } = resolveStackFromNames(names);
  stack = resolvedStack;
  render(node || ROOT);
}

// Fires when the user presses the browser back / forward buttons
window.addEventListener('popstate', () => {
  navigateToHash();
});

// ── Lightbox ───────────────────────────────────────────────────────────────
function openLightbox(entry) {
  lbIndex = lbImages.indexOf(entry);
  showLbSlide(lbIndex);
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
  lbClose.focus();
}

function closeLightbox() {
  lightbox.hidden = true;
  document.body.style.overflow = '';
}

function showLbSlide(idx) {
  const entry = lbImages[idx];
  lbImg.src     = entry.path;
  lbImg.alt     = entry.name;
  lbCaption.textContent = entry.name;
  lbPrev.style.visibility = idx > 0 ? 'visible' : 'hidden';
  lbNext.style.visibility = idx < lbImages.length - 1 ? 'visible' : 'hidden';
}

lbClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });

lbPrev.addEventListener('click', () => {
  if (lbIndex > 0) showLbSlide(--lbIndex);
});

lbNext.addEventListener('click', () => {
  if (lbIndex < lbImages.length - 1) showLbSlide(++lbIndex);
});

document.addEventListener('keydown', e => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape')     closeLightbox();
  if (e.key === 'ArrowLeft')  lbPrev.click();
  if (e.key === 'ArrowRight') lbNext.click();
});

// ── View toggle ────────────────────────────────────────────────────────────
btnList.addEventListener('click', () => setView('list'));
btnGrid.addEventListener('click', () => setView('grid'));

function setView(mode) {
  viewMode = mode;
  btnList.classList.toggle('active', mode === 'list');
  btnGrid.classList.toggle('active', mode === 'grid');
  btnList.setAttribute('aria-pressed', mode === 'list');
  btnGrid.setAttribute('aria-pressed', mode === 'grid');
  renderEntries(getSortedChildren(current));
}

function getSortedChildren(node) {
  return [...(node.children || [])].sort((a, b) => {
    const af = a.type === 'folder' ? 0 : 1;
    const bf = b.type === 'folder' ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.name.localeCompare(b.name, 'sv');
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('manifest.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ROOT = await res.json();
  } catch (err) {
    ROOT = DEMO_MANIFEST;
  }

  // Seed the initial history entry so the very first Back press works
  history.replaceState({ folderPath: [] }, '', location.hash || '#');

  // Restore folder from URL if the page was loaded with a hash (e.g. shared link)
  navigateToHash();
}

// ── Demo manifest (used when manifest.json is not found) ───────────────────
const DEMO_MANIFEST = {
  name: 'root',
  type: 'folder',
  children: [
    {
      name: 'Foton 1900–1950',
      type: 'folder',
      children: [
        { name: 'Bröllop 1923.jpg',  type: 'image', path: 'https://picsum.photos/seed/1923/800/600',  size: '1.2 MB' },
        { name: 'Sommar 1935.jpg',   type: 'image', path: 'https://picsum.photos/seed/1935/800/600',  size: '980 KB' },
        { name: 'Porträtt 1941.jpg', type: 'image', path: 'https://picsum.photos/seed/1941/600/800',  size: '840 KB' },
        { name: 'Gård 1948.jpg',     type: 'image', path: 'https://picsum.photos/seed/1948/800/600',  size: '1.1 MB' },
      ]
    },
    {
      name: 'Foton 1950–2000',
      type: 'folder',
      children: [
        { name: 'Släktmöte 1962.jpg', type: 'image', path: 'https://picsum.photos/seed/1962/800/600', size: '2.1 MB' },
        { name: 'Midsommar 1974.jpg', type: 'image', path: 'https://picsum.photos/seed/1974/800/600', size: '1.7 MB' },
        { name: 'Jubileum 1991.jpg',  type: 'image', path: 'https://picsum.photos/seed/1991/800/600', size: '3.2 MB' },
        {
          name: 'Utflykter',
          type: 'folder',
          children: [
            { name: 'Dalsland 1988.jpg',  type: 'image', path: 'https://picsum.photos/seed/1988/800/600', size: '2.4 MB' },
            { name: 'Vänern 1995.jpg',    type: 'image', path: 'https://picsum.photos/seed/1995/800/600', size: '1.9 MB' },
          ]
        }
      ]
    },
    {
      name: 'Dokument',
      type: 'folder',
      children: [
        { name: 'Släkthistorik.pdf',         type: 'document', path: '#', size: '4.5 MB' },
        { name: 'Kyrkobokföring 1766.pdf',   type: 'document', path: '#', size: '890 KB' },
        { name: 'Bouppteckning 1812.pdf',    type: 'document', path: '#', size: '210 KB' },
        { name: 'Medlemslista 2024.xlsx',    type: 'document', path: '#', size: '45 KB'  },
      ]
    }
  ]
};

init();