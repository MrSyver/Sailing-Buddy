/**
 * Auswahllisten für die Meilenbestätigung.
 *
 * Funktion an Bord und Befähigung waren freie Textfelder. Frei getippt heißt
 * aber: Der eine schreibt „Crew“, der nächste „Mitsegler“, der dritte
 * „Besatzungsmitglied“ – und wer die Bestätigungen später nebeneinanderlegt,
 * sieht drei verschiedene Sachen, wo dreimal dasselbe gemeint war. Auf einem
 * Telefon kommt dazu, dass eine Liste antippen schneller geht als tippen.
 *
 * Die Listen sind bewusst kurz und decken ab, was auf einer Yacht vorkommt.
 * Beide haben zusätzlich „Anderes“ – wer eine Funktion hat, die hier fehlt,
 * schreibt sie hin, statt sich für die falsche zu entscheiden.
 */

/** Was jemand an Bord getan hat. */
export const ROLES = [
  'skipper',
  'coskipper',
  'watchleader',
  'helm',
  'navigator',
  'crew',
  'trainee',
];

/**
 * Womit der Schiffsführer fährt.
 *
 * Die deutschen Scheine in der Reihenfolge, in der man sie macht, dahinter
 * die gängigen internationalen. „Andere“ fängt alles Übrige.
 */
export const QUALIFICATIONS = [
  'sbfBinnen',
  'sbfSee',
  'sks',
  'sss',
  'shs',
  'src',
  'lrc',
  'iccBareboat',
  'yachtmaster',
];

/** Der Schlüssel, hinter dem sich ein freies Textfeld auftut. */
export const OTHER = 'other';
