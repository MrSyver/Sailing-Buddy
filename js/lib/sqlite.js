/**
 * Lesender Zugriff auf SQLite-Dateien – so viel davon, wie MBTiles braucht.
 *
 * Warum von Hand und nicht mit einer fertigen Bibliothek: SQLite als
 * WebAssembly wiegt rund ein Megabyte und will die Datei am liebsten ganz im
 * Arbeitsspeicher haben. Ein Kartenpaket ist aber vierhundert Megabyte groß.
 * Beides zusammen geht auf einem Telefon nicht gut aus.
 *
 * Hier wird stattdessen nur gelesen, und nur seitenweise: Die Datei bleibt
 * liegen, wo sie liegt, und es werden ausschließlich die paar Kilobyte
 * geholt, in denen die gesuchte Kachel steht. Das ist wenig Aufwand, weil
 * lesender Zugriff auf einen B-Baum überschaubar ist – und weil das
 * Dateiformat von SQLite festgeschrieben und abwärtskompatibel ist.
 *
 * Grundlage: „Database File Format“, Abschnitte 1.3 (Kopf), 1.6 (B-Baum-
 * Seiten), 2.1 (Nutzlast und Überlauf) und 2.2 (Datensätze).
 *
 * Nicht enthalten: Schreiben, Sperren, WAL, Freilisten, Sortierfolgen jenseits
 * von Zahlen. Das braucht eine Karte nicht.
 */

const HEADER_SIZE = 100;
const MAGIC = 'SQLite format 3\0';

// Seitenarten im B-Baum
const INTERIOR_INDEX = 2;
const INTERIOR_TABLE = 5;
const LEAF_INDEX = 10;
const LEAF_TABLE = 13;

/**
 * Eine Quelle liefert Bytes an einer Stelle. Im Browser ist das ein Blob,
 * im Test ein Puffer – der Leser kennt den Unterschied nicht.
 */
export function blobSource(blob) {
  return {
    size: blob.size,
    async read(offset, length) {
      const slice = blob.slice(offset, offset + length);
      return new Uint8Array(await slice.arrayBuffer());
    },
  };
}

export function bufferSource(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return {
    size: view.byteLength,
    async read(offset, length) {
      return view.subarray(offset, offset + length);
    },
  };
}

// ---------------------------------------------------------------------------
// Varints und Datensätze
// ---------------------------------------------------------------------------

/**
 * Ein Varint: bis zu neun Bytes, die ersten acht mit sieben Nutzbits und
 * einem Fortsetzungsbit, das neunte mit allen acht.
 *
 * Gerechnet wird ab dem fünften Byte mit Number statt mit Bitoperationen –
 * die arbeiten in JavaScript nur auf 32 Bit und würden hier still überlaufen.
 */
export function readVarint(bytes, start) {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    const byte = bytes[start + i];
    if (byte === undefined) return { value, length: i };
    if (i < 7) {
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return { value, length: i + 1 };
    } else {
      // Das neunte Byte zählt vollständig.
      value = value * 256 + byte;
      return { value, length: 9 };
    }
  }
  return { value, length: 9 };
}

const be = (bytes, offset, length) => {
  let value = 0;
  for (let i = 0; i < length; i += 1) value = value * 256 + bytes[offset + i];
  return value;
};

/** Vorzeichenbehaftete Ganzzahl in Big-Endian-Darstellung. */
function beSigned(bytes, offset, length) {
  const value = be(bytes, offset, length);
  const limit = 2 ** (length * 8 - 1);
  return value >= limit ? value - 2 * limit : value;
}

/**
 * Zerlegt einen Datensatz in seine Spalten.
 * `wanted` begrenzt, wie viele Spalten überhaupt ausgepackt werden – der
 * Rest wird übersprungen, was bei großen Blobs den Unterschied macht.
 */
export function decodeRecord(payload, wanted = Infinity) {
  const head = readVarint(payload, 0);
  const headerEnd = head.value;
  const types = [];
  let at = head.length;
  while (at < headerEnd) {
    const t = readVarint(payload, at);
    types.push(t.value);
    at += t.length;
  }

  const values = [];
  let body = headerEnd;
  for (let i = 0; i < types.length; i += 1) {
    const type = types[i];
    let value = null;
    let width = 0;

    if (type === 0) { value = null; width = 0; } else if (type >= 1 && type <= 4) {
      width = type;
      value = beSigned(payload, body, width);
    } else if (type === 5) { width = 6; value = beSigned(payload, body, 6); } else if (type === 6) { width = 8; value = beSigned(payload, body, 8); } else if (type === 7) {
      width = 8;
      value = new DataView(payload.buffer, payload.byteOffset + body, 8).getFloat64(0);
    } else if (type === 8) { value = 0; } else if (type === 9) { value = 1; } else if (type >= 12 && type % 2 === 0) {
      width = (type - 12) / 2;
      value = i < wanted ? payload.subarray(body, body + width) : null;
    } else if (type >= 13) {
      width = (type - 13) / 2;
      value = i < wanted
        ? new TextDecoder().decode(payload.subarray(body, body + width))
        : null;
    }

    values.push(value);
    body += width;
  }
  return values;
}

// ---------------------------------------------------------------------------
// Datenbank
// ---------------------------------------------------------------------------

/** Öffnet eine SQLite-Datei zum Lesen. */
export async function openDatabase(source, { cachePages = 64 } = {}) {
  const header = await source.read(0, HEADER_SIZE);
  const magic = new TextDecoder('latin1').decode(header.subarray(0, 16));
  if (magic !== MAGIC) throw new Error('Keine SQLite-Datei');

  const raw = be(header, 16, 2);
  const pageSize = raw === 1 ? 65536 : raw;
  const reserved = header[20];
  const usable = pageSize - reserved;
  if (usable < 480) throw new Error('Unbrauchbare Seitengröße');

  const cache = new Map();

  /** Eine Seite lesen. Seiten werden ab 1 gezählt. */
  async function page(n) {
    const cached = cache.get(n);
    if (cached) return cached;
    const bytes = await source.read((n - 1) * pageSize, pageSize);
    if (cache.size >= cachePages) cache.delete(cache.keys().next().value);
    cache.set(n, bytes);
    return bytes;
  }

  /** Kopf einer B-Baum-Seite. Seite 1 beginnt hinter dem Dateikopf. */
  function pageHeader(bytes, n) {
    const at = n === 1 ? HEADER_SIZE : 0;
    const type = bytes[at];
    const interior = type === INTERIOR_INDEX || type === INTERIOR_TABLE;
    return {
      type,
      cells: be(bytes, at + 3, 2),
      rightMost: interior ? be(bytes, at + 8, 4) : 0,
      cellPointers: at + (interior ? 12 : 8),
    };
  }

  const cellOffset = (bytes, head, i) => be(bytes, head.cellPointers + i * 2, 2);

  /**
   * Holt eine Nutzlast, die auf der Seite steht oder in Überlaufseiten
   * weiterläuft. Die Aufteilung folgt Abschnitt 2.1 des Dateiformats.
   */
  async function payloadOf(bytes, at, total, isTable) {
    const maxLocal = isTable
      ? usable - 35
      : Math.floor(((usable - 12) * 64) / 255) - 23;

    if (total <= maxLocal) return bytes.subarray(at, at + total);

    const minLocal = Math.floor(((usable - 12) * 32) / 255) - 23;
    let local = minLocal + ((total - minLocal) % (usable - 4));
    if (local > maxLocal) local = minLocal;

    const out = new Uint8Array(total);
    out.set(bytes.subarray(at, at + local), 0);
    let filled = local;
    let next = be(bytes, at + local, 4);

    while (next !== 0 && filled < total) {
      // eslint-disable-next-line no-await-in-loop
      const overflow = await page(next);
      const take = Math.min(usable - 4, total - filled);
      out.set(overflow.subarray(4, 4 + take), filled);
      filled += take;
      next = be(overflow, 0, 4);
    }
    return out;
  }

  /** Läuft eine Tabelle von vorn bis hinten durch. */
  async function scanTable(root, onRow, wanted = Infinity) {
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      // eslint-disable-next-line no-await-in-loop
      const bytes = await page(n);
      const head = pageHeader(bytes, n);

      if (head.type === INTERIOR_TABLE) {
        // Die Zellen stehen in Schlüsselreihenfolge, der rechte Zeiger ganz
        // hinten. Auf den Stapel geht es rückwärts, damit vorn zuerst
        // gelesen wird.
        const children = [];
        for (let i = 0; i < head.cells; i += 1) {
          children.push(be(bytes, cellOffset(bytes, head, i), 4));
        }
        children.push(head.rightMost);
        for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i]);
        continue;
      }
      if (head.type !== LEAF_TABLE) continue;

      for (let i = 0; i < head.cells; i += 1) {
        let at = cellOffset(bytes, head, i);
        const size = readVarint(bytes, at);
        at += size.length;
        const rowid = readVarint(bytes, at);
        at += rowid.length;
        // eslint-disable-next-line no-await-in-loop
        const payload = await payloadOf(bytes, at, size.value, true);
        const stop = onRow(decodeRecord(payload, wanted), rowid.value);
        if (stop === false) return;
      }
    }
  }

  /** Sucht eine Zeile über ihre Zeilennummer. */
  async function rowById(root, id, wanted = Infinity) {
    let n = root;
    for (let depth = 0; depth < 64; depth += 1) {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await page(n);
      const head = pageHeader(bytes, n);

      if (head.type === INTERIOR_TABLE) {
        let next = head.rightMost;
        for (let i = 0; i < head.cells; i += 1) {
          const at = cellOffset(bytes, head, i);
          const key = readVarint(bytes, at + 4);
          if (id <= key.value) { next = be(bytes, at, 4); break; }
        }
        n = next;
        continue;
      }
      if (head.type !== LEAF_TABLE) return null;

      for (let i = 0; i < head.cells; i += 1) {
        let at = cellOffset(bytes, head, i);
        const size = readVarint(bytes, at);
        at += size.length;
        const rowid = readVarint(bytes, at);
        if (rowid.value !== id) continue;
        at += rowid.length;
        // eslint-disable-next-line no-await-in-loop
        const payload = await payloadOf(bytes, at, size.value, true);
        return decodeRecord(payload, wanted);
      }
      return null;
    }
    return null;
  }

  /**
   * Sucht im Index nach einem Schlüssel und gibt die Zeilennummer zurück.
   * Verglichen wird spaltenweise über Zahlen – mehr braucht ein Kachelindex
   * nicht, und alles andere wäre hier falsche Vollständigkeit.
   */
  async function rowidFromIndex(root, key) {
    /**
     * Vergleicht den Eintrag mit dem gesuchten Schlüssel: −1 davor, +1 danach.
     *
     * Zahlen der Größe nach, Text zeichenweise. Das entspricht der Sortierung
     * BINARY von SQLite, solange der Text aus ASCII besteht – bei Kacheln sind
     * das Zahlen und Prüfsummen, also genau dieser Fall. Für Text mit Umlauten
     * oder anderen Schriften wäre hier mehr nötig.
     */
    const compare = (record) => {
      for (let i = 0; i < key.length; i += 1) {
        const a = record[i];
        const b = key[i];
        if (a === b) continue;
        return a < b ? -1 : 1;
      }
      return 0;
    };

    const visit = async (n, depth) => {
      if (depth > 64) return null;
      const bytes = await page(n);
      const head = pageHeader(bytes, n);
      const leaf = head.type === LEAF_INDEX;
      if (!leaf && head.type !== INTERIOR_INDEX) return null;

      for (let i = 0; i < head.cells; i += 1) {
        let at = cellOffset(bytes, head, i);
        const child = leaf ? 0 : be(bytes, at, 4);
        if (!leaf) at += 4;
        const size = readVarint(bytes, at);
        at += size.length;
        const payload = await payloadOf(bytes, at, size.value, false);
        const record = decodeRecord(payload);
        const order = compare(record);

        if (order === 0) return record[key.length];   // die Zeilennummer steht hinten
        if (order > 0) {
          // Dieser Eintrag liegt schon hinter dem gesuchten Schlüssel. Auf
          // einem Blatt heißt das: Es gibt ihn nicht. Auf einer inneren Seite
          // muss er links von hier stehen.
          return leaf ? null : visit(child, depth + 1);
        }
      }
      // Alle Einträge lagen davor – weiter im rechten Teilbaum.
      return leaf ? null : visit(head.rightMost, depth + 1);
    };

    return visit(root, 0);
  }

  /** Inhaltsverzeichnis: Tabellen, Indizes und ihre Wurzelseiten. */
  async function schema() {
    const out = [];
    await scanTable(1, (row) => {
      out.push({
        type: row[0], name: row[1], table: row[2], root: row[3], sql: row[4],
      });
    });
    return out;
  }

  return {
    pageSize,
    usable,
    encoding: be(header, 56, 4) || 1,
    page,
    schema,
    scanTable,
    rowById,
    rowidFromIndex,
  };
}
