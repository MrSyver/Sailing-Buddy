/** Winzige Helfer zum Aufbau der Oberfläche – bewusst ohne Framework. */

/**
 * Erzeugt ein Element.
 *   h('div.card', { onclick: fn }, 'Text', childElement)
 * Klassen und ids dürfen im Tag stehen: 'button.btn.primary#go'
 */
export function h(tag, props = null, ...children) {
  let name = 'div';
  const classes = [];
  let id = null;

  const m = String(tag).match(/^([a-zA-Z0-9-]*)((?:[.#][^.#]+)*)$/);
  if (m) {
    if (m[1]) name = m[1];
    (m[2].match(/[.#][^.#]+/g) ?? []).forEach((part) => {
      if (part[0] === '.') classes.push(part.slice(1));
      else id = part.slice(1);
    });
  } else {
    name = tag;
  }

  const el = document.createElement(name);
  if (classes.length) el.className = classes.join(' ');
  if (id) el.id = id;

  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = [el.className, value].filter(Boolean).join(' ');
      else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'html') el.innerHTML = value;
      else if (key in el && key !== 'list' && typeof value !== 'object') {
        try { el[key] = value; } catch { el.setAttribute(key, value); }
      } else el.setAttribute(key, value === true ? '' : value);
    }
  }

  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Beschriftete Gruppe mehrerer Bedienelemente – etwa eine Segmentleiste.
 *
 * Bewusst kein <label>: Ein Label darf genau ein Bedienelement beschriften.
 * Umschließt es mehrere Schaltflächen, übernimmt jede von ihnen den Labeltext
 * als eigenen Namen, und Screenreader lesen Unsinn vor.
 */
export function group(label, control, hint = null) {
  control.setAttribute('role', 'group');
  control.setAttribute('aria-label', label);
  return h('div.field', h('span', label), control, hint && h('span.hint', hint));
}

/**
 * Klassenzusatz für große Zahlen in den Kacheln der Anzeige.
 *
 * Eine Entfernung von 1.234,56 sm ist in der vollen Schriftgröße breiter als
 * die Kachel. Statt sie abzuschneiden oder umzubrechen, wird sie ab einer
 * gewissen Länge kleiner gesetzt – ablesbar bleibt sie in jedem Fall.
 */
export function fit(value) {
  const n = String(value ?? '').length;
  if (n <= 6) return '';
  return n <= 9 ? '.long' : '.xlong';
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Wie h(), aber im SVG-Namensraum – einschließlich der Kurzschreibweise
 * 'svg.compass' für Klassen. SVG-Elemente haben kein beschreibbares
 * `className`, deshalb geht die Klasse über setAttribute.
 */
export function svg(tag, props = null, ...children) {
  const [name, ...classes] = String(tag).split('.');
  const el = document.createElementNS(SVG_NS, name);
  if (classes.length) el.setAttribute('class', classes.join(' '));
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
      else if (key === 'class' && classes.length) el.setAttribute('class', `${classes.join(' ')} ${value}`);
      else el.setAttribute(key, value);
    }
  }
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

/** Ersetzt den Inhalt eines Containers. */
export function render(container, ...children) {
  container.replaceChildren();
  append(container, children);
  return container;
}

let toastTimer = null;

/** Kurze Rückmeldung am unteren Rand. */
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = h('div.toast');
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/** In die Zwischenablage kopieren – mit Rückfallebene für alte Browser. */
export async function copy(text, message = 'Kopiert') {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
    return true;
  } catch {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0' } });
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    toast(ok ? message : 'Kopieren nicht möglich');
    return ok;
  }
}

/** Bildschirm wach halten, solange die App im Vordergrund ist. */
let wakeLock = null;

export async function keepAwake(enable) {
  if (!('wakeLock' in navigator)) return false;
  try {
    if (enable && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!enable && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
    return true;
  } catch {
    return false;
  }
}

export const isAwake = () => wakeLock !== null;
