# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

El `README.md` documenta bien cómo levantar el proyecto, el despliegue, los
respaldos y las variables de entorno. Esto no lo repite: cubre lo que hace
falta saber para **cambiar** el código sin romper algo que no se ve.

Dos cosas del README están desactualizadas y conviene no seguirlas: los puertos
(abajo están los reales) y "395 tests" (hoy son más de 1500).

## Comandos

```bash
npm test                        # toda la suite
npx jest <patrón>               # un archivo o un subconjunto
npx jest -t "nombre del caso"   # un solo caso por su nombre
npm run lint                    # eslint .
npm run typecheck               # tsc del workspace
```

`npm run typecheck` usa `tsconfig.base.json` y **no cubre la API**: tiene su
propio `tsconfig.app.json`, con otro conjunto de archivos. Un import que falta
puede pasar el typecheck y romper `npm run build:api`. Antes de dar por buena
una tarea que tocó `apps/api`, correr los dos.

### Levantar

```bash
npm run db:up && npm run db:seed    # Postgres en :5433, con carta de ejemplo
npm run start:api                   # :3000
npm run start:admin                 # panel del dueño     :4400
npm run start:kds                   # cocina              :4500
npm run start:salon                 # salón / mozo        :4600
npm start                           # comensal            :4200
```

La API sirve a `libs/` compilado, así que `start:api` corre `build:api` antes.
Un cambio en `libs/` no llega a la API sin recompilar.

Sin Docker se puede levantar con `USE_POSTGRES=false`, que usa adaptadores en
memoria. Sirve para mirar una pantalla, no para probar nada que dependa de la
base: esos adaptadores no implementan todo (por ejemplo, `listActive` no
descarta los envíos de una mesa cerrada, que en Postgres sí).

## Arquitectura

Monorepo Nx: `apps/` (una API NestJS + cinco frontends Angular) y `libs/` por
dominio, en capas `domain` → `application` → `infra`. `eslint-plugin-boundaries`
verifica que las dependencias apunten sólo hacia adentro.

El README explica las decisiones de fondo (dinero en enteros, precios
congelados, estado por plato, RLS). Lo que sigue es lo que hay que tener
presente al editar.

### Autorización: cinco guards globales, en orden

```
RateLimitGuard → AuthGuard → TableScopeGuard → TrialGuard → ServicioActivoGuard
```

Todo endpoint está protegido salvo que use `@Public()`. Los decoradores viven
en `apps/api/src/auth.ts`:

| Decorador | Para qué |
|---|---|
| `@Public()` | Saltea el AuthGuard **entero** — también `@RequirePermission` |
| `@RequirePermission('x')` | Exige un permiso de la tabla de `role.ts` |
| `@TableScoped()` | Resuelve la mesa desde el token del QR |
| `@Scope()` | Inyecta `{ tenantId, tableId }` ya verificado |
| `@TenantId()` | El tenant; con `{publicFallback:true}` lo acepta de `?tenant=` |
| `@Auth()` | El staff autenticado |

Cuidado con dos cosas:

**`@Public()` no significa "sin identidad".** Una ruta `@Public() @TableScoped()`
sigue aceptando un Bearer de personal: `resolveDinerScope` lo vuelve a mirar y
devuelve `tableId: null`, lo que **desactiva** el chequeo de mesa de los
handlers. O sea que un token de staff vale como scope de tenant entero ahí.

**La UI escondiendo un botón no es autorización.** Varias rutas de cobro piden
`orders:advance` (que el mozo tiene) aunque la pantalla las gatee con
`bills:close`. Si el cambio importa, verificarlo del lado del servidor.

### Roles

`OWNER · MANAGER · KITCHEN · WAITER · CAJA · SOPORTE`, con la tabla de permisos
en `libs/identity/domain/src/lib/role.ts`. Agregar un rol o un permiso se hace
ahí y en ningún otro lado.

`entraConPin(role)` decide qué ofrece la **pantalla de login**, no quién tiene
PIN: el panel le da usuario y PIN a todo el personal que crea, incluido CAJA.

### Persistencia y aislamiento

RLS en modo **FORCE**. Una consulta sin `app.tenant_id` en alcance no falla:
devuelve cero filas y reporta éxito. Es el modo de error más común acá — un
INSERT que "funcionó" y no escribió nada.

- `Database.withTenant(tenantId, …)` abre transacción y fija el GUC con
  `set_config(..., true)` — transaction-local, así que no se filtra entre
  peticiones. **Es el camino normal.**
- `Database.unscoped(…)` no fija nada y sirve para migraciones y barridos. Ahí
  hay que recorrer los tenants a mano.

Lo mismo vale al depurar con `psql`: un `DELETE` sin el tenant puesto borra
cero filas sin decirlo. Hay que envolverlo en una transacción con
`set_config('app.tenant_id', '<tenant>', true)`.

El login pasa por funciones `SECURITY DEFINER` (migración 009) porque ocurre
antes de saber el tenant.

### Migraciones

En `libs/shared/persistence/src/lib/migrations/`, se descubren solas por nombre
de archivo y **corren una sola vez** (`schema_migrations` guarda un checksum).

- Editar una ya aplicada no hace nada; el cambio va en un archivo nuevo. Al
  migrar avisa cuáles cambiaron — incluso si sólo cambió un comentario, porque
  el hash cubre el archivo entero.
- El número tiene que ser único: si dos archivos comparten prefijo, el orden lo
  decide el desempate alfabético del sufijo. Antes de crear una, mirar el
  último número **en `main`**, no en la rama propia.

### Frontends

Angular standalone con signals, `ChangeDetectionStrategy.OnPush`, y sintaxis
`@if`/`@for`. Los tokens de diseño compartidos están en
`libs/shared/ui-tokens/src/lib/tokens.css`; cambiarlos afecta a las cinco apps.

`input()` devuelve su **valor por defecto** dentro del `constructor` — los
valores del template llegan después. Leerlos ahí adentro de un `effect()`.

## Al hacer cambios

**Los comentarios explican por qué, no qué.** Casi todos documentan un problema
real que alguien vivió. Antes de "simplificar" uno, leerlo: suele ser la única
memoria de por qué el código no es más simple. Escribir en ese mismo tono.

**Los tests que leen el código fuente como texto** existen para fijar
decisiones de diseño, no comportamiento. Si un cambio los rompe, casi siempre
hay que reescribirlos contra la estructura nueva —cuidan lo mismo— en vez de
borrarlos.

**Antes de afirmar que algo falla, reproducirlo.** Este código tiene varios
modos de error silenciosos: RLS que no escribe, el endpoint de reenvío de mail
que contesta `{"enviado":true}` aunque la cuenta no exista, y las herramientas
de línea de comandos que caen en `localhost` cuando falta `DATABASE_ADMIN_URL`.
En los tres casos el síntoma aparece lejos de la causa.

**Al probar en el navegador**, el caché muerde: un arreglo en un `.js` puede
parecer que no funciona. Usar un perfil limpio o desactivar el caché antes de
concluir que el código está mal.
