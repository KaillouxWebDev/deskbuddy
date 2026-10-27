import fs from 'node:fs';
import path from 'node:path';

/**
 * Écriture sûre face aux coupures de courant (Pi sur batterie) : on écrit un fichier temporaire,
 * on force son passage sur la carte SD, puis on le renomme. Le renommage est atomique : le fichier
 * final est soit l'ancienne version complète, soit la nouvelle, jamais un fichier à moitié écrit.
 */
export function writeAtomic(file, content) {
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.tmp`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, content);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

export const writeJson = (file, data, pretty = false) => writeAtomic(file, JSON.stringify(data, null, pretty ? 2 : 0));

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Journaux de diagnostic : seulement avec DEBUG=1 dans .env (évite d'user la carte SD pour rien). */
export const DEBUG = process.env.DEBUG === '1';
