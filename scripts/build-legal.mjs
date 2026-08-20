/**
 * Convierte los documentos legales de Markdown a páginas HTML.
 *
 * El texto vive en Markdown porque es lo que se edita y se revisa: un abogado
 * puede leerlo y corregirlo sin tocar etiquetas. La página se genera de ahí,
 * así no hay dos copias del mismo texto que se separan el día que una cambia.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const PAGINAS = [
  { md: 'apps/admin-web/src/legal/terminos.md', out: 'apps/admin-web/src/legal/terminos.html', title: 'Términos y Condiciones' },
  { md: 'apps/admin-web/src/legal/privacidad.md', out: 'apps/admin-web/src/legal/privacidad.html', title: 'Política de Privacidad' },
  { md: 'apps/admin-web/src/legal/tratamiento-de-datos.md', out: 'apps/admin-web/src/legal/tratamiento-de-datos.html', title: 'Tratamiento de Datos' },
  { md: 'apps/diner-pwa/src/legal/aviso-comensal.md', out: 'apps/diner-pwa/src/legal/privacidad.html', title: 'Cómo cuidamos tus datos' },
];

/** El bloque de "pendiente de completar" no va a la página publicada. */
function sinNotaInterna(md) {
  return md.replace(/^> \*\*PENDIENTE[\s\S]*?\n\n---\n/m, '').replace(/^>.*\n/gm, '');
}

const escapar = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function enLinea(t) {
  return escapar(t)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function aHtml(md) {
  const out = [];
  let enTabla = false;
  let enLista = false;

  const cerrar = () => {
    if (enTabla) { out.push('</tbody></table></div>'); enTabla = false; }
    if (enLista) { out.push('</ul>'); enLista = false; }
  };

  for (const linea of md.split('\n')) {
    const l = linea.trim();

    if (l === '') { cerrar(); continue; }
    if (l === '---') { cerrar(); out.push('<hr />'); continue; }

    // Tablas: la fila de guiones separa el encabezado del cuerpo.
    if (l.startsWith('|')) {
      const celdas = l.split('|').slice(1, -1).map((c) => c.trim());
      if (celdas.every((c) => /^-+$/.test(c))) continue;
      if (!enTabla) {
        cerrar();
        out.push('<div class="tabla"><table><thead><tr>' +
          celdas.map((c) => `<th>${enLinea(c)}</th>`).join('') +
          '</tr></thead><tbody>');
        enTabla = true;
        continue;
      }
      out.push('<tr>' + celdas.map((c) => `<td>${enLinea(c)}</td>`).join('') + '</tr>');
      continue;
    }
    if (enTabla) { out.push('</tbody></table></div>'); enTabla = false; }

    const titulo = /^(#{1,4})\s+(.*)$/.exec(l);
    if (titulo) {
      cerrar();
      const n = titulo[1].length;
      out.push(`<h${n}>${enLinea(titulo[2])}</h${n}>`);
      continue;
    }

    if (/^[-*]\s+/.test(l)) {
      if (!enLista) { out.push('<ul>'); enLista = true; }
      out.push(`<li>${enLinea(l.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (enLista) { out.push('</ul>'); enLista = false; }

    if (/^\d+\.\s+/.test(l)) {
      out.push(`<p class="num">${enLinea(l)}</p>`);
      continue;
    }

    out.push(`<p>${enLinea(l)}</p>`);
  }
  cerrar();
  return out.join('\n');
}

const ESTILO = `
:root{--bg:oklch(96.5% 0.02 80);--surface:white;--ink:oklch(24% 0.02 40);
--ink-soft:oklch(45% 0.02 40);--ink-subtle:oklch(54% 0.03 40);
--accent:oklch(50% 0.17 33);--border:oklch(90% 0.02 70);--radius:14px}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){
--bg:oklch(22% 0.015 60);--surface:oklch(27% 0.015 60);--ink:oklch(95% 0.01 80);
--ink-soft:oklch(78% 0.01 80);--ink-subtle:oklch(66% 0.01 80);
--accent:oklch(68% 0.15 45);--border:oklch(35% 0.02 60)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
font-size:1rem;line-height:1.65;-webkit-text-size-adjust:100%}
.hoja{max-width:680px;margin:0 auto;padding:2.5rem 1.25rem 5rem}
.volver{display:inline-block;margin-bottom:2rem;color:var(--ink-subtle);
font-size:.85rem;font-weight:600;text-decoration:none}
.volver:hover{color:var(--accent)}
h1{font-size:clamp(1.7rem,5vw,2.3rem);font-weight:800;letter-spacing:-.02em;
line-height:1.15;margin:0 0 1.5rem}
h2{font-size:1.2rem;font-weight:700;letter-spacing:-.01em;
margin:2.5rem 0 .75rem;padding-top:1.25rem;border-top:1px solid var(--border)}
h3{font-size:1rem;font-weight:700;margin:1.75rem 0 .5rem}
h4{font-size:.92rem;font-weight:700;margin:1.25rem 0 .4rem;color:var(--ink-soft)}
p{margin:0 0 1rem;color:var(--ink-soft)}
p.num{margin:0 0 .6rem}
strong{color:var(--ink);font-weight:700}
ul{margin:0 0 1.25rem;padding-left:1.3rem;color:var(--ink-soft)}
li{margin-bottom:.45rem}
a{color:var(--accent)}
code{background:var(--surface);border:1px solid var(--border);border-radius:6px;
padding:.1rem .4rem;font-size:.86em;font-family:ui-monospace,monospace;
color:var(--ink);overflow-wrap:anywhere}
hr{border:0;border-top:1px solid var(--border);margin:2rem 0}
.tabla{overflow-x:auto;margin:0 0 1.5rem;border:1px solid var(--border);
border-radius:var(--radius);background:var(--surface)}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th,td{padding:.7rem .85rem;text-align:left;border-bottom:1px solid var(--border);
vertical-align:top}
th{font-weight:700;font-size:.78rem;letter-spacing:.05em;text-transform:uppercase;
color:var(--ink-subtle)}
tbody tr:last-child td{border-bottom:0}
td{color:var(--ink-soft)}
@media(max-width:560px){.hoja{padding:1.75rem 1rem 4rem}}
`;

for (const { md, out, title } of PAGINAS) {
  const fuente = await readFile(md, 'utf8');
  const cuerpo = aHtml(sinNotaInterna(fuente));
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${title} · ITADAKI</title>
<meta name="robots" content="index,follow" />
<style>${ESTILO}</style>
</head>
<body>
<main class="hoja">
<a class="volver" href="/">← Volver</a>
${cuerpo}
</main>
</body>
</html>
`;
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, html, 'utf8');
  // eslint-disable-next-line no-undef -- script de Node, corre fuera del navegador
  console.log('generado', out);
}
