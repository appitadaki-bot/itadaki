/**
 * Arma la landing lista para publicar.
 *
 * Es HTML plano: no hay nada que compilar. Lo único que hace falta es copiar
 * las páginas legales al lado, porque el pie las enlaza con /legal/... y sin
 * ellas esos enlaces darían 404 justo en la página donde alguien se da de alta.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

const SALIDA = 'dist/landing';

/** El texto de un fragmento de HTML, sin las etiquetas ni los espacios de más. */
function sinEtiquetas(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

await rm(SALIDA, { recursive: true, force: true });
await mkdir(SALIDA, { recursive: true });

/*
 * Un @keyframes dentro de un @media rompe el parser: el navegador descarta
 * todo lo que sigue en la hoja, sin decir nada. Se ve como estilos que "no se
 * aplican" y cuesta horas encontrarlo, así que se revisa antes de publicar.
 */
const hoja = await readFile('apps/landing/landing.css', 'utf8');
let profundidad = 0;

for (const [numero, linea] of hoja.split('\n').entries()) {
  for (const caracter of linea) {
    if (caracter === '{') profundidad += 1;
    if (caracter === '}') profundidad -= 1;
  }

  if (linea.includes('@keyframes') && profundidad > 1) {
    console.error(
      `landing.css:${numero + 1} — @keyframes anidado dentro de otra regla. ` +
        'Todo el CSS que sigue se descarta. Sacalo al primer nivel.',
    );
    process.exit(1);
  }
}

if (profundidad !== 0) {
  console.error(`landing.css — quedan ${profundidad} llaves sin cerrar`);
  process.exit(1);
}

/*
 * Que el JSON-LD de las preguntas diga lo mismo que la página.
 *
 * Google puede mostrar esas respuestas directamente en el resultado, así que
 * un texto viejo ahí es una respuesta equivocada dada en nuestro nombre. Se
 * regenera en cada build desde las preguntas reales, en vez de confiar en que
 * alguien se acuerde de actualizar las dos cosas.
 */
const html = await readFile('apps/landing/index.html', 'utf8');

const preguntas = [
  ...html.matchAll(
    /<details class="pregunta">\s*(?:<!--[\s\S]*?-->\s*)?<summary[^>]*>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g,
  ),
].map(([, titulo, cuerpo]) => ({
  '@type': 'Question',
  name: sinEtiquetas(titulo),
  acceptedAnswer: { '@type': 'Answer', text: sinEtiquetas(cuerpo) },
}));

if (preguntas.length === 0) {
  console.error('index.html — no se encontró ninguna pregunta frecuente');
  process.exit(1);
}

const faq = JSON.stringify(
  { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: preguntas },
  null,
  2,
);

const MARCADOR = /(<script type="application\/ld\+json" data-faq>)[\s\S]*?(<\/script>)/;

if (!MARCADOR.test(html)) {
  console.error('index.html — falta el <script data-faq> donde va la FAQ');
  process.exit(1);
}

const conFaq = html.replace(
  MARCADOR,
  (_entero, apertura, cierre) => `${apertura}\n${faq}\n${cierre}`,
);

await cp('apps/landing', SALIDA, { recursive: true });
await writeFile(`${SALIDA}/index.html`, conFaq);
console.log(`  ${preguntas.length} preguntas frecuentes en el JSON-LD`);
await cp('apps/admin-web/src/legal', `${SALIDA}/legal`, {
  recursive: true,
  filter: (origen) => !origen.endsWith('.md'),
});

 
console.log('landing lista en', SALIDA);
