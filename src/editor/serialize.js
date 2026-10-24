// Escritura de salas en data/levels.js con el mismo estilo del archivo: una fila de la
// cuadrícula por línea y los elementos de una lista, uno por línea. Al guardar solo se
// sustituyen los bloques de las salas tocadas (se conservan los comentarios del resto).
import { KEY_ORDER } from './schema.js';

const ident = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : `'${k}'`);
const str = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const flat = (v) => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((y) => typeof y !== 'object'))));

export function lit(v, ind = '') {
  if (typeof v === 'string') return str(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000);
  if (typeof v === 'boolean' || v === null) return String(v);
  if (Array.isArray(v)) {
    if (v.every(flat)) return `[${v.map((x) => lit(x)).join(', ')}]`;
    return `[\n${v.map((x) => `${ind}  ${lit(x, ind + '  ')},`).join('\n')}\n${ind}]`;
  }
  const parts = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${ident(k)}: ${lit(x, ind)}`);
  return parts.length ? `{ ${parts.join(', ')} }` : '{}';
}

export function roomBlock(id, room) {
  const keys = [...KEY_ORDER.filter((k) => k in room), ...Object.keys(room).filter((k) => !KEY_ORDER.includes(k))];
  const lines = [`  ${ident(id)}: {`];
  for (const k of keys) {
    const v = room[k];
    if (v === undefined || (Array.isArray(v) && !v.length && k !== 'grid')) continue;
    if (k === 'grid') lines.push('    grid: [', ...v.map((r) => `      ${str(r)},`), '    ],');
    else lines.push(`    ${ident(k)}: ${lit(v, '    ')},`);
  }
  lines.push('  },');
  return lines.join('\n');
}

// Sustituye (o añade, o quita) bloques de sala en el texto de levels.js.
export function patchLevels(text, changed, removed = [], start = null) {
  // Saltos de línea de Windows (git con autocrlf los pone al sacar el archivo): sin
  // normalizarlos no se encuentra el bloque de la sala y se añadía otra copia al final.
  let s = text.replace(/\r\n/g, '\n');
  for (const id of removed) {
    const a = s.indexOf(`\n  ${ident(id)}: {\n`);
    if (a < 0) continue;
    const b = s.indexOf('\n  },\n', a) + '\n  },'.length;
    s = s.slice(0, a) + s.slice(b);
  }
  for (const [id, room] of Object.entries(changed)) {
    const block = roomBlock(id, room);
    const a = s.indexOf(`\n  ${ident(id)}: {\n`);
    if (a >= 0) {
      const b = s.indexOf('\n  },\n', a) + '\n  },'.length;
      s = s.slice(0, a + 1) + block + s.slice(b);
    } else {
      const end = s.lastIndexOf('\n};');
      s = `${s.slice(0, end)}\n\n${block}${s.slice(end)}`;
    }
  }
  if (start) s = s.replace(/export const START = \{[^}]*\};/, `export const START = { room: ${str(start.room)}, spawn: [${start.spawn.join(', ')}] };`);
  return s;
}
