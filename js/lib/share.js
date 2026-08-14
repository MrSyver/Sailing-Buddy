/**
 * Eine Datei aus der App herausgeben.
 *
 * Ein Logbuch mit fünfhundert Einträgen in die Zwischenablage zu legen ist auf
 * einem Telefon keine Ausgabe – man kann es nirgends einfügen, ohne dass es
 * abreißt. Gebraucht wird eine Datei: Sie geht in Mail, in Notizen, in
 * „Dateien“, in die Navigations-App.
 *
 * Zwei Wege, in dieser Reihenfolge:
 *
 *   1. Das Teilen-Blatt des Geräts. Auf iOS ist das der einzige Weg, der sich
 *      wirklich wie eine Datei anfühlt, und er führt in jede App, die den Typ
 *      annimmt.
 *   2. Ein Download-Verweis. Wo es kein Teilen gibt – am Rechner –, tut der
 *      dasselbe.
 *
 * Rückgabe sagt, was passiert ist: 'geteilt', 'geladen' oder 'abgebrochen'.
 * Der Aufrufer entscheidet, was er dazu meldet.
 */

export async function shareFile(filename, mime, text) {
  // Ein `File` statt eines `Blob`: Das Teilen-Blatt braucht den Namen, sonst
  // heißt der Anhang beim Empfänger „Unbenannt“.
  let file = null;
  try {
    file = new File([text], filename, { type: mime });
  } catch {
    // Sehr alte Browser kennen den File-Konstruktor nicht.
  }

  if (file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'geteilt';
    } catch (err) {
      // Wer das Blatt wegwischt, hat nichts falsch gemacht.
      if (err?.name === 'AbortError') return 'abgebrochen';
      // Alles andere: den Weg über den Download versuchen.
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Nicht sofort freigeben: Der Download läuft noch, wenn der Klick zurückkommt.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'geladen';
}

/** Ein Dateiname mit Datum, damit sich mehrere nicht überschreiben. */
export function stamped(base, ext, when = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  const tag = `${when.getFullYear()}-${p(when.getMonth() + 1)}-${p(when.getDate())}`;
  const zeit = `${p(when.getHours())}${p(when.getMinutes())}`;
  const sauber = String(base).replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'logbuch';
  return `${sauber}-${tag}-${zeit}.${ext}`;
}
