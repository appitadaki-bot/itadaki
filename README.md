# ITADAKI

Pedidos desde la mesa por QR, para restaurantes. El comensal escanea, arma su
pedido y lo sigue en vivo; la cocina lo recibe plato por plato; el mozo ve quién
lo llama y qué hay listo para llevar.

## Cómo levantarlo

Requiere Node 22+ y Docker (para Postgres).

```bash
npm install
npm run db:up      # levanta postgres en el puerto 5433 (docker compose)
npm run db:seed    # aplica las migraciones y carga una carta de ejemplo
npm run start:api  # API en :3000
```

`db:up` crea la base desde cero, rol de aplicación incluido: no hace falta
ningún paso manual. Si algo quedó raro, `npm run db:reset` la rehace vacía.

Después, cada app en su terminal:

```bash
npx ng serve diner-pwa  --port 4200   # comensal
npx ng serve kds-web    --port 4300   # cocina
npx ng serve admin-web  --port 4400   # dueño
npx ng serve floor-web  --port 4500   # mozo
```

### Entrar como comensal

La app del comensal necesita el token de la mesa, que en producción viene del
QR. Para desarrollo, el panel del dueño lo genera: entrá a `:4400`, abrí
**Mesas y códigos QR** y copiá el link de una mesa.

### Cuentas del seed

El seed crea el restaurante `itadaki`. Para tener un usuario, usá:

```bash
node dist/api/apps/api/src/create-staff.js itadaki tu@email.ar TuClave123! OWNER
```

Roles: `OWNER`, `MANAGER`, `KITCHEN`, `WAITER`.

## Las cuatro apps

| App | Puerto | Quién la usa |
|-----|--------|--------------|
| `diner-pwa` | 4200 | El comensal, desde su teléfono tras escanear el QR |
| `kds-web` | 4300 | La cocina: tickets por estación, un botón por plato |
| `admin-web` | 4400 | El dueño: carta, fotos, mesas, equipo, métricas |
| `floor-web` | 4500 | El mozo: llamadas de mesa y platos listos para llevar |

## Arquitectura

Hexagonal, en `libs/` por dominio:

```
libs/<dominio>/domain       reglas puras, sin framework ni IO
libs/<dominio>/application  casos de uso y puertos
libs/<dominio>/infra        adaptadores (Postgres, HTTP, cripto)
```

Las dependencias sólo apuntan hacia adentro — `eslint-plugin-boundaries` lo
verifica en cada build. Los dominios son `identity`, `catalog`, `ordering`,
`billing`, `analytics` y `shared`.

Decisiones que conviene conocer antes de tocar el código:

- **El dinero vive en unidades menores** (centavos) como enteros, nunca en
  punto flotante. Dividir una cuenta reparte el resto, no lo pierde.
- **Los precios se congelan al pedir.** Cambiar un precio en la carta no altera
  un pedido ya hecho: la orden guarda su propia copia.
- **Cada mesa tiene su propio secreto** y su QR va firmado con él, así un
  código no sirve para otra mesa ni para otro restaurante.
- **El estado vive en cada plato**, no en el pedido: la cocina termina las
  empanadas mientras el asado sigue, y el ticket va al ritmo del más lento.
- **Aislamiento entre restaurantes** por row-level security en Postgres; el
  tenant sale siempre de un token firmado, nunca de un parámetro.

## Comandos

```bash
npm test           # 395 tests
npm run lint
npm run typecheck
npm run db:trial   # administrar las pruebas gratis (list | extend | pay)
```

## Variables de entorno

En desarrollo funcionan los valores por defecto. Para producción:

| Variable | Para qué |
|----------|----------|
| `AUTH_SECRET` | Firma las sesiones del personal. Obligatoria; la API no arranca sin ella. |
| `CORS_ORIGINS` | Los orígenes que pueden llamar a la API, separados por coma. Obligatoria. |
| `DATABASE_URL` | Conexión de la app (rol sin privilegios, con RLS aplicada). |
| `DATABASE_ADMIN_URL` | Sólo para migraciones y seed. |
| `GOOGLE_CLIENT_ID` | Habilita el ingreso con Google. Sin ella, el botón no aparece. |
| `SESSION_STALE_HOURS` | Cuánto puede quedar abierta una mesa antes de cerrarse sola (8 por defecto). |
| `RESEND_API_KEY` | Envía los mails de recuperación de contraseña. Obligatoria en producción. |
| `MAIL_FROM` | Remitente verificado, p. ej. `Itadaki <hola@tudominio.com>`. Obligatoria en producción. |
| `NODE_ENV=production` | Endurece el arranque: exige los secretos, falla si Postgres no responde y agrega HSTS. |
| `IMAGE_BASE_URL` | Prefijo de las URLs de las fotos, p. ej. `https://api.tudominio.com/api/images`. Se guarda dentro de cada registro: definila antes de la primera subida. |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Guarda las fotos en un bucket. Sin ellas van al disco local, que no sirve con más de una instancia. `S3_REGION` es opcional (`auto`). |
| `SENTRY_DSN` | Opcional. Manda cada error no controlado a Sentry, con el mismo `incident` que ya se loguea. Sin ella la API arranca y anda igual, sólo que un error nuevo no avisa solo. |
| `AXIOM_TOKEN`, `AXIOM_DATASET` | Opcionales, van juntas. Además de a consola, cada línea de log se manda también a Axiom — sirve para buscar después de que se pierda la retención corta del log de Render. |

Las apps del navegador no llevan la URL de la API compilada: la leen en runtime
del `<meta name="itadaki-api">` de su `index.html`. El mismo build sirve para
cualquier despliegue; el entorno completa la etiqueta.

## Respaldos

```bash
scripts/backup.sh                    # dump a ./backups, guarda los últimos 14
scripts/restore.sh backups/<archivo> # restaura (pide confirmación)
```

El restore está probado de punta a punta: restaura los datos, reaplica los
permisos del rol de la app y deja la API operativa sin pasos manuales.

Un respaldo en el mismo disco que la base no es un respaldo. Copialo afuera —
un cron diario con `rclone`, `scp` o lo que uses — y **probá una restauración
antes de necesitarla**: un dump que nunca se restauró es una suposición, no
una copia de seguridad.

### La base hosteada

Los dos de arriba corren `pg_dump` dentro del contenedor de Docker, así que
sirven para la base de la laptop y no para Neon ni Render.

```bash
DATABASE_ADMIN_URL='postgresql://...' npm run db:backup:hosted
```

Es la misma variable con la que se migra: respaldar pide el rol dueño, porque
leer todas las tablas de todos los restaurantes no lo puede hacer el rol de la
app. También acepta `DATABASE_URL`, pero si las dos están puestas y apuntan a
bases distintas se niega a correr: respaldar desarrollo creyendo que es
producción deja un archivo con nombre de respaldo y datos de otra base.

Antes de nada dice a dónde se conectó:

```
respaldando itadaki_db en dpg-xxxxx.oregon-postgres.render.com
```

Para volver atrás:

```bash
DATABASE_ADMIN_URL='postgresql://...' npm run db:restore:hosted backups/archivo.json
```

Repone lo que falta y no toca lo que está. Una restauración que vacía la base
para dejarla igual al archivo es lo que hace falta cuando se perdió todo; el
caso de todos los días es que alguien borró un plato y lo quiere de vuelta, y
ahí reponer no puede empeorar nada.

Restaurar sobre una base distinta de la que salió el respaldo pide
`--a-otra-base`. Cargar los datos de desarrollo sobre producción es de las
cosas que no se deshacen.

**Probá la vuelta completa antes de necesitarla.** Borrá algo en desarrollo,
restaurá, y fijate que haya vuelto. Un respaldo que nunca se restauró es una
suposición.

Copia todo a un JSON, restaurante por restaurante. Recorrerlos de a uno no es
una vuelta larga: las tablas tienen RLS en modo FORCE, y una consulta sin
`app.tenant_id` devuelve cero filas incluso para el dueño de la base. Un
respaldo vacío que parece correcto se descubre el día que hay que restaurar,
así que el script cuenta las filas y se niega a guardar un archivo vacío.

## Desplegar

```bash
docker build -t itadaki-api .
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e AUTH_SECRET=<32+ caracteres> \
  -e DATABASE_URL=<conexión del rol de la app> \
  -e CORS_ORIGINS=https://pedi.tudominio.com,https://cocina.tudominio.com \
  -e IMAGE_BASE_URL=https://api.tudominio.com/api/images \
  -e RESEND_API_KEY=<clave> -e MAIL_FROM='Itadaki <hola@tudominio.com>' \
  -e S3_ENDPOINT=<...> -e S3_BUCKET=<...> \
  -e S3_ACCESS_KEY_ID=<...> -e S3_SECRET_ACCESS_KEY=<...> \
  itadaki-api
```

Con `NODE_ENV=production` la API se niega a arrancar sin `AUTH_SECRET`, sin
proveedor de correo o con Postgres caído, y avisa si las fotos quedan en disco
local.

Contra una base que ya tiene datos, el comando es `npm run db:migrate` con
`DATABASE_ADMIN_URL` apuntando a ella: aplica el esquema y nada más. `db:seed`
hace lo mismo pero después carga la carta de ejemplo, que en la base de un
restaurante de verdad es basura que alguien tiene que ir a borrar.

Cada migración se aplica **una sola vez** por base. La tabla
`schema_migrations` guarda cuáles corrieron; las demás se saltean. Antes
corrían todas en cada despliegue, y eso hacía que un archivo viejo se
reaplicara sobre datos nacidos después — una restricción rechazando un valor
que ella misma autorizó más adelante, una función cuyo tipo de retorno ya había
cambiado, un UPDATE marcando verificadas cuentas que esperaban su mail.

Dos consecuencias para el día a día:

- **Editar una migración ya aplicada no hace nada.** Si el cambio tiene que
  llegar a la base, va en un archivo nuevo. `db:migrate` avisa cuáles cambiaron
  después de haberse aplicado, para que no sea un error mudo.
- **La primera corrida sobre una base que ya existía las aplica todas una vez
  más**, porque el registro arranca vacío. Es el comportamiento de siempre por
  última vez; de ahí en adelante sólo corre lo nuevo.

El rol `itadaki_app` no se crea al migrar: en la laptop lo crea
`scripts/init-db.sql` al levantar Docker, y en una base hosteada la app se
conecta con el usuario del proveedor.

Las cuatro apps del navegador son estáticas: `npm run build:<app>` y servir
`dist/<app>/browser` desde donde quieras. La URL de la API se lee en runtime
del `<meta name="itadaki-api">` de cada `index.html`, así que el mismo build
sirve para cualquier despliegue.

### Vercel

Cuatro proyectos sobre este mismo repositorio. El `vercel.json` de la raíz
vale para los cuatro — trae el rewrite que hace falta porque son SPA: entrar
directo a `/bienvenida?t=...`, que es lo que hace un QR, tiene que servir el
`index.html` en vez de buscar un archivo con ese nombre.

Sólo `main` se despliega. Cada rama abierta construía las cuatro apps y
publicaba una URL de previsualización que nadie miraba, así que un PR con tres
commits gastaba doce builds. La regla apaga todas las ramas y vuelve a
prender `main`: si una rama coincide con dos reglas y alguna es `true`, se
despliega, y por eso no alcanza con nombrar sólo `main` — lo no especificado
queda habilitado.

Lo que cambia en cada proyecto va en la interfaz de Vercel, porque un solo
archivo no puede describir cuatro apps:

| Proyecto | Build Command | Output Directory |
|----------|---------------|------------------|
| comensal | `npm run build:comensal` | `dist/diner-pwa/browser` |
| cocina   | `npm run build:cocina`   | `dist/kds-web/browser` |
| admin    | `npm run build:admin`    | `dist/admin-web/browser` |
| salón    | `npm run build:salon`    | `dist/floor-web/browser` |

El `/browser` del final es obligatorio: Angular deja ahí el `index.html`, y
apuntar un nivel más arriba publica una carpeta sin índice — la raíz da 404.
Framework Preset en **Other**; el preset de Angular adivina otra carpeta.

#### El Build Command lo pone el repositorio

`vercel-build` está en el `package.json`, y Vercel lo prefiere sobre `build`
cuando existe. Construye lo que diga la variable `APP` y nada más.

Existe porque el campo Build Command de los proyectos estaba vacío, y ahí
Vercel usa el `build` de siempre: ese construye el comensal, la cocina, el
admin y la API de una sola vez. Un proyecto terminaba construyendo casi todo
el repositorio en cada despliegue, y el filtro de más abajo no se notaba.

Sin `APP` construye todo, que es lo que se hacía antes. La primera versión
fallaba ahí —publicar la app equivocada se ve como un despliegue que anduvo—
pero la variable no llegaba y eso dejó producción sin desplegar. El que no
publica es peor que el que publica de más.

Lo que sigue en cada proyecto es el **Output Directory**, que no puede salir
de acá — Vercel necesita saberlo antes de correr nada.

#### Cada proyecto construye sólo lo suyo

Un merge disparaba los cinco: un cambio de CSS en el panel construía también
el comensal, la cocina, el salón y la landing.

El `ignoreCommand` del `vercel.json` corre `scripts/hace-falta-construir.mjs`,
que compara los archivos del commit contra la carpeta de esa app. Para saber
cuál es, **cada proyecto necesita la variable `APP`** en Settings → Environment
Variables, con uno de estos valores: `comensal`, `cocina`, `admin`, `salon`,
`landing`.

Sin esa variable el script construye igual, así que un proyecto mal
configurado se comporta como antes en vez de dejar de desplegarse.

Un cambio en `libs/`, `package.json`, `angular.json`, `vercel.json` o los
`tsconfig` construye las cinco: no vale la pena adivinar qué app usa qué parte
de `libs/`, y equivocarse deja una app vieja en producción sin que nadie se
entere. Lo mismo cuando el clon de Vercel no tiene con qué comparar.

Los legales son el caso raro: se escriben en Markdown dentro de `admin-web` y
los publican también el comensal y la landing, así que un cambio ahí construye
a los tres.

`npm run check:despliegue` prueba estas reglas, y corre en CI.

#### Los headers, y por qué el CSS crítico está apagado

El `vercel.json` manda una `Content-Security-Policy` que vale para los cinco
proyectos. Lo que deja pasar además del propio dominio: las fuentes de Google,
el botón de "entrar con Google" del personal, y la API —por HTTPS y por
WebSocket, porque socket.io arranca por uno y sigue por el otro—.

`script-src` no lleva `'unsafe-inline'`, que es lo que hace que la política
sirva de algo. Por eso `inlineCritical` está en `false` en las cuatro apps del
`angular.json`: con él prendido el builder mete el CSS crítico en el HTML y
engancha el resto con `onload="this.media='all'"`, un handler inline que la
política bloquea. No se rompe nada a la vista —la página carga— pero la hoja
diferida nunca se activa y queda con la mitad de los estilos. Se paga un pedido
más antes del primer pintado, de una hoja de 5 kB del mismo dominio.

Si algún día se agrega un servicio de terceros —métricas, un chat, un
procesador de pagos— hay que sumarle el dominio a la directiva que corresponda
o el navegador lo bloquea sin más aviso que una línea en la consola.

## Pendiente antes de producción

- No hay integración de cobro ni facturación ARCA. Decisión tomada: el
  restaurante cobra con su propio sistema.
