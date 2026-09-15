# Referencia de diseño — ITADAKI

Fuente: proyecto Claude Design `9c542ad1-77c0-4a24-bdb4-f719dabf7210`,
archivo `ITADAKI.dc.html`. Leído vía `DesignSync.get_file`.

El prototipo es un mockup interactivo en un DSL propio (`<sc-for>`, `<sc-if>`,
`DCLogic`). No es código de producción — se traduce a Angular, no se copia.
Los tokens extraídos viven en `libs/shared/ui-tokens/`.

## Identidad

- **Wordmark**: ITADAKI, letra por letra con animación `wiggle` escalonada (0.09s por letra).
- **Tipografía display**: Unbounded (400–800). Títulos, precios, botones, wordmark.
- **Tipografía cuerpo**: Onest (400–800). Descripciones, labels, inputs.
- **Tono de voz**: todo en minúsculas, español rioplatense. "escaneá", "armá tu pedido",
  "itadakimasu!", "gochisousama!". Mantener ese registro en la UI real.

## Paleta

Autoría en `oklch`. El acento terracota (`50% 0.17 33`) marca precio, estado activo
y CTA primario. La tinta (`24% 0.02 40`) es un negro cálido, no `#000`. El fondo es
crema (`96.5% 0.02 80`), nunca blanco puro — el blanco queda para tarjetas elevadas.

Estados KDS: nuevo = terracota, en cocina = ámbar, listo = verde.

## Pantallas del comensal (6)

1. **bienvenida** — bowl con vapor animado, "mesa 07", CTA "ver la carta →"
2. **carta** — chips de categoría con scroll horizontal, tarjetas de producto con
   thumbnail 64×64, barra inferior fija con contador y total del carrito
3. **producto** — hero 180px, precio, descripción, extras seleccionables con borde
   terracota al activarse, stepper de cantidad + CTA "agregar", toast de confirmación
4. **carrito** — líneas con cantidad/nombre/nota, input de nota para cocina,
   subtotal + total, CTA "enviar pedido a cocina →"
5. **estado** — timeline vertical de 4 pasos con dot pulsante en el activo,
   ETA en tarjeta inferior
6. **cuenta** — desglose, total ARS, stepper "dividir entre N personas",
   monto por persona, CTA "pagar en caja"

## Panel admin (KDS)

Panel oscuro (`ink`) sobre el fondo crema. Tres columnas: nuevo / en cocina / listo.
Cada ticket es una tarjeta crema con mesa, tiempo transcurrido, ítems, nota en itálica
terracota, y un botón que lo avanza de columna. Indicador "actualizando en vivo" con
dot verde pulsante.

## Notas de implementación

- **Imágenes**: el mockup usa placeholders a rayas (`repeating-linear-gradient`).
  En producción van `ImageSet` reales con `srcset` + LQIP.
- **Grid del KDS**: `repeat(3, 1fr)` fijo. En la implementación real debe colapsar
  a scroll vertical por columna en tablet, y a una sola columna en teléfono.
- **Motion**: todas las animaciones del prototipo son decorativas. `tokens.css`
  las anula bajo `prefers-reduced-motion`.
- **Contraste**: `ink-disabled` (`65% 0.02 40`) sobre crema queda por debajo de
  WCAG AA para texto chico. Revisar antes de usarlo en labels de pasos inactivos.

## El logo

`itadaki-logo-original.jpeg` es lo que nos pasaron: 1600×338, sin
transparencia, fondo `#f7f7f7` plano. Todo lo demás sale de ahí.

| archivo | para qué |
|---|---|
| `itadaki-logo.png` | logo completo, fondo transparente, tinta original |
| `itadaki-logo-oscuro.png` | igual pero con la palabra en crema |
| `itadaki-logo@2x.png` · `-oscuro@2x.png` | los dos anteriores a 440px, para web |
| `itadaki-isotipo.png` | sólo la campana, cuadrado, 485×485 |
| `itadaki-isotipo-180.png` | ícono de iOS |
| `itadaki-isotipo-512.png` | favicon |

**Cuál usar.** La palabra es casi negra, así que sobre un fondo oscuro
desaparece: ahí va la versión `-oscuro`, que repinta la tinta a crema y deja
la campana roja. Sobre fondo claro va la normal. Elegir mal no rompe nada,
sólo deja la mitad del logo invisible — que es peor, porque no se nota hasta
que alguien lo mira.

**A 16 píxeles** el logo entero es una mancha. Por eso el favicon es el
isotipo solo.

**Las piezas en blanco.** El plato y el mango del isotipo eran casi negros y
sobre el fondo oscuro de la landing no se veían. `itadaki-isotipo-blanco.png`
los pasa a crema dejando la cúpula roja; es el que usan la landing y las tres
apps del personal.

`itadaki-ios.png` es ese mismo con el fondo oscuro pegado: iOS no compone
transparencia para el acceso directo, y el plato blanco sobre una pantalla
clara desaparecía.

`hero-campanita-plato.png` le agrega a la campanita el plato que no tenía. La
forma sale del isotipo, escalada: ahí el plato mide 403 contra una cúpula de
300, o sea que es más ancho que la campana. La primera versión lo escaló
contra el lienzo en vez de contra la cúpula y quedó al revés, más angosto.

**Falta el vector.** El original es un JPEG, así que estas versiones se
recortaron por color: el fondo era perfectamente uniforme y salió limpio,
pero ampliado mucho se ve el ruido del JPEG alrededor de las letras. Para
imprimir —carteles, los QR de las mesas— conviene conseguir el SVG y
regenerar todo desde ahí.
