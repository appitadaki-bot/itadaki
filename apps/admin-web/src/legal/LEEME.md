# Documentos legales de ITADAKI

Cuatro documentos, escritos para lectores distintos.

| Documento | Quién lo lee | Dónde va |
|---|---|---|
| `terminos.md` | El dueño del restaurante | Landing y panel |
| `privacidad.md` | El dueño, y quien pregunte por sus datos | Landing y panel |
| `tratamiento-de-datos.md` | El restaurante que quiere garantías por escrito | Anexo, enlazado desde los Términos |
| `../../../diner-pwa/src/legal/aviso-comensal.md` | El comensal en la mesa | App del comensal, al pie |

## Antes de publicar: completar los marcadores

Aparecen entre corchetes en todos los documentos.

| Marcador | Qué va | Dónde conseguirlo |
|---|---|---|
| `[RAZÓN SOCIAL]` | Nombre o razón social del titular | Definirlo con el contador |
| `[CUIT]` | CUIT del titular | Constancia de inscripción |
| `[DOMICILIO LEGAL]` | Domicilio fiscal | Constancia de inscripción |
| `[MAIL DE CONTACTO]` | Casilla para ejercer derechos | Conviene una propia del proyecto |
| `[WHATSAPP]` | Número de atención | — |
| `[LINK A PRIVACIDAD]` | URL pública de la política | Cuando esté la landing |

Para encontrarlos todos:

```bash
grep -rn "\[.*\]" apps/*/src/legal/*.md | grep -v "^.*:.*|" 
```

## Advertencia

Esto es una **base de trabajo redactada sobre lo que el sistema realmente
hace** — cada afirmación técnica está verificada contra el código. No reemplaza
el asesoramiento de un abogado.

Antes de publicar conviene una revisión profesional, sobre todo de:

- Las cláusulas fiscales y de facturación (Términos, §3 y §5).
- El límite de responsabilidad (Términos, §9).
- La transferencia internacional de datos (Privacidad, §5).

## Si el sistema cambia, estos documentos cambian

Afirmaciones que hoy son ciertas y que dejarían de serlo:

- **"No procesamos pagos"** — si se integra Mercado Pago, cambia todo el
  tratamiento de datos financieros.
- **"No pedimos datos personales al comensal"** — si se agrega la reseña de
  Google, el comensal pasa a interactuar con un tercero.
- **"No emitimos comprobantes fiscales"** — si se integra facturación
  electrónica.
- **Los servidores en Estados Unidos** — si se migra de proveedor.
