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
 * Hier steht nur, was jemanden befähigt, ein Fahrzeug zu führen – denn genau
 * das ist die Frage, die eine Prüfungsstelle an dieses Feld stellt: Durfte
 * der, der unterschreibt, das Schiff überhaupt führen?
 *
 * Deshalb sind das Funkzeugnis (SRC, LRC) und der Binnenschein wieder heraus.
 * Ein SRC sagt, dass jemand ein Funkgerät bedienen darf, und kein Wort
 * darüber, ob er ein Schiff führen darf; der SBF Binnen gilt auf Flüssen und
 * Seen und damit auf keiner einzigen der Seemeilen, um die es auf diesem
 * Blatt geht. Beide standen hier und haben nur Platz gekostet.
 *
 * Die deutschen Scheine in der Reihenfolge, in der man sie macht, dahinter
 * die gängigen internationalen und die beruflichen. „Anderes“ fängt den Rest.
 */
export const QUALIFICATIONS = [
  'sbfSee',
  'sks',
  'sss',
  'shs',
  'iccBareboat',
  'yachtmaster',
  'instructor',
  'professional',
];

/** Der Schlüssel, hinter dem sich ein freies Textfeld auftut. */
export const OTHER = 'other';
