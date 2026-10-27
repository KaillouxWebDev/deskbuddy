import fs from 'node:fs';
import { DEBUG } from '../lib/fsx.js';
import path from 'node:path';
import zlib from 'node:zlib';
import { Writable } from 'node:stream';
import { Client } from 'basic-ftp';

/*
 * Lit le fichier de l'impression en cours sur l'A1 (FTPS implicite, port 990, mêmes identifiants que MQTT)
 * pour récupérer ce que le slicer a calculé : poids de filament par couleur et durée estimée.
 * Tout est en lecture seule. Avec DEBUG=1 dans .env, chaque tentative est notée dans data/printfile-debug.log pour pouvoir
 * ajuster les chemins si l'A1 range ses fichiers ailleurs.
 */

const DIRS = ['/', '/cache', '/model'];

function zipEntry(buf, name) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const entryName = buf.toString('utf8', p + 46, p + 46 + nameLen);
    if (entryName === name) {
      const lNameLen = buf.readUInt16LE(local + 26);
      const lExtraLen = buf.readUInt16LE(local + 28);
      const start = local + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      return method === 8 ? zlib.inflateRawSync(data) : data;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

/** Extrait les filaments de la bonne plaque dans Metadata/slice_info.config. */
export function parseSliceInfo(xml, plateIdx) {
  const plates = [...xml.matchAll(/<plate>([\s\S]*?)<\/plate>/g)].map((m) => {
    const body = m[1];
    const meta = (key) => (body.match(new RegExp(`<metadata key="${key}" value="([^"]*)"`)) || [])[1];
    const filaments = [...body.matchAll(/<filament ([^>]*)\/>/g)].map((f) => {
      const attr = (k) => (f[1].match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
      return {
        id: Number(attr('id')),
        type: attr('type') || null,
        color: (attr('color') || '').toUpperCase().slice(0, 7) || null,
        usedG: Number(attr('used_g')) || 0,
        usedM: Number(attr('used_m')) || 0
      };
    });
    return { index: Number(meta('index')), predictionS: Number(meta('prediction')) || null, weightG: Number(meta('weight')) || null, filaments };
  });
  return plates.find((p) => p.index === plateIdx) || plates.find((p) => p.filaments.length) || null;
}

export async function fetchPrintInfo({ host, accessCode, subtask, gcodeFile, dataDir }) {
  const logFile = path.join(dataDir, 'printfile-debug.log');
  const lines = [];
  const log = (s) => lines.push(`${new Date().toISOString()} ${s}`);
  const client = new Client(15_000);
  try {
    log(`début : subtask="${subtask}" gcode_file="${gcodeFile}"`);
    await client.access({ host, port: 990, user: 'bblp', password: accessCode, secure: 'implicit', secureOptions: { rejectUnauthorized: false } });
    const candidates = [];
    for (const dir of DIRS) {
      try {
        const list = await client.list(dir);
        log(`${dir} : ${list.length} entrées (${list.slice(0, 15).map((f) => f.name).join(', ')})`);
        for (const f of list) {
          if (f.isFile && /\.3mf$/i.test(f.name)) candidates.push({ path: `${dir.replace(/\/$/, '')}/${f.name}`, name: f.name, date: f.modifiedAt?.getTime() || 0 });
        }
      } catch (err) {
        log(`${dir} : illisible (${err.message})`);
      }
    }
    const base = (s) => (s || '').split('/').pop().replace(/\.gcode\.3mf$|\.3mf$/i, '').toLowerCase();
    const wanted = [base(subtask), base(gcodeFile)].filter(Boolean);
    candidates.sort((a, b) => b.date - a.date);
    const pick = candidates.find((c) => wanted.some((w) => base(c.name) === w)) || candidates.find((c) => wanted.some((w) => base(c.name).includes(w))) || candidates[0];
    if (!pick) {
      log('aucun fichier .3mf trouvé');
      return null;
    }
    log(`fichier retenu : ${pick.path}`);
    const chunks = [];
    await client.downloadTo(
      new Writable({
        write(chunk, _enc, cb) {
          chunks.push(chunk);
          cb();
        }
      }),
      pick.path
    );
    const xml = zipEntry(Buffer.concat(chunks), 'Metadata/slice_info.config');
    if (!xml) {
      log('slice_info.config absent du fichier');
      return null;
    }
    const plateIdx = Number(((gcodeFile || '').match(/plate_(\d+)/) || [])[1]) || 1;
    const plate = parseSliceInfo(xml.toString('utf8'), plateIdx);
    log(`plaque ${plate?.index} : ${JSON.stringify(plate?.filaments || [])}`);
    return plate ? { file: pick.name, ...plate } : null;
  } catch (err) {
    log(`erreur : ${err.message}`);
    return null;
  } finally {
    client.close();
    // Détail complet seulement avec DEBUG=1 ; les erreurs vont toujours dans les logs Docker (bornés).
    if (lines.some((l) => l.includes(' erreur : '))) console.error(`[printfile] ${lines.filter((l) => l.includes(' erreur : ')).join(' | ')}`);
    if (DEBUG) {
      try {
        fs.appendFileSync(logFile, `${lines.join('\n')}\n`);
      } catch {
        /* journal facultatif */
      }
    }
  }
}
