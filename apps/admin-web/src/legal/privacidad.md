# Política de Privacidad de ITADAKI

**Última actualización:** 19 de agosto de 2026
**Versión:** 1.0

---

> **PENDIENTE DE COMPLETAR ANTES DE PUBLICAR**
> `[RAZÓN SOCIAL]` · `[CUIT]` · `[DOMICILIO LEGAL]` · `[MAIL DE CONTACTO]` · `[WHATSAPP]`

---

## Lo esencial, en tres líneas

**Al comensal no le pedimos ningún dato personal.** Ni nombre real, ni correo,
ni teléfono, ni tarjeta. Solo el apodo que elige al sentarse y lo que pide.

Del Restaurante guardamos lo necesario para prestarle el servicio: su contacto,
su carta, su equipo y sus ventas.

Los datos de cada restaurante están **separados de los de los demás a nivel de
base de datos**, no por una configuración que se pueda cambiar por error.

---

## 1. Quién es responsable de los datos

`[RAZÓN SOCIAL]`, CUIT `[CUIT]`, con domicilio en `[DOMICILIO LEGAL]`, es
responsable del tratamiento de los datos descriptos en esta política, conforme
a la **Ley 25.326 de Protección de los Datos Personales** de la República
Argentina y su reglamentación.

**Una aclaración importante sobre los roles:** respecto de los datos que un
Restaurante carga en su cuenta, el Restaurante actúa como responsable y
nosotros como **encargados del tratamiento**: los alojamos y procesamos
siguiendo sus instrucciones, para prestarle el servicio.

## 2. Qué datos tratamos

### 2.1 Del comensal que escanea el QR

| Dato | Para qué | Cuánto tiempo |
|---|---|---|
| Apodo elegido al sentarse | Que el resto de la mesa vea quién pidió qué | Se borra a los 30 días de cerrada la mesa |
| Platos pedidos y notas | Enviar el pedido a la cocina y armar la cuenta | Se conserva como registro de venta del Restaurante |
| Identificador técnico de sesión | Reconocer el mismo teléfono si se recarga la página | Hasta que se cierra la mesa |

**No pedimos ni almacenamos:** nombre real, apellido, documento, correo
electrónico, teléfono, domicilio, datos de tarjeta ni ningún medio de pago.

**No hacemos perfilado ni publicidad.** No cruzamos la actividad de un comensal
entre distintos restaurantes ni entre distintas visitas.

El apodo es de elección libre. Si alguien escribe su nombre real, ese dato
queda asociado a su pedido; sugerimos usar un apodo.

### 2.2 Del Restaurante y su personal

| Dato | Para qué |
|---|---|
| Nombre del local, contacto y datos de facturación | Prestar el servicio y facturarlo |
| Correo, nombre y rol de cada integrante del equipo | Dar acceso a las pantallas según su función |
| Contraseñas | Se guardan **cifradas con `scrypt`**, nunca en texto legible. Ni siquiera nosotros podemos verlas |
| Carta, fotos, precios, mesas | Mostrar la carta al comensal |
| Historial de pedidos y ventas | Estadísticas del panel |

### 2.3 Datos técnicos

Registramos direcciones IP y datos de conexión en los registros del servidor,
por seguridad y para diagnosticar fallas. Se conservan por un plazo máximo de
**90 días**.

## 3. Para qué usamos los datos y con qué fundamento legal

- **Ejecución del contrato:** prestar el servicio contratado, mostrar la carta,
  transmitir pedidos, calcular cuentas, generar estadísticas.
- **Obligación legal:** conservar registros que exija la normativa fiscal o
  comercial aplicable.
- **Interés legítimo:** seguridad de la plataforma, prevención de fraude y
  diagnóstico de fallas.

**No vendemos, alquilamos ni cedemos datos a terceros con fines comerciales o
publicitarios.** Nunca.

## 4. Con quién compartimos datos

Solo con proveedores necesarios para que el servicio funcione:

| Proveedor | Para qué | Dónde |
|---|---|---|
| **Render** | Servidores de aplicación y base de datos | Estados Unidos |
| **Vercel** | Alojamiento de las aplicaciones web | Estados Unidos |
| **Resend** | Envío de correos (recuperación de contraseña, avisos) | Estados Unidos |
| **Google** | Verificación del inicio de sesión con cuenta de Google, si el Restaurante la usa | Estados Unidos |

También podemos compartir datos ante **requerimiento de autoridad competente**,
en el marco de un proceso judicial o administrativo.

## 5. Transferencia internacional de datos

**Los datos se alojan en servidores ubicados en los Estados Unidos de América.**

Conforme al artículo 12 de la Ley 25.326, informamos que esto constituye una
transferencia internacional. Nuestros proveedores adhieren a estándares de
protección reconocidos y mantenemos con ellos acuerdos de tratamiento de datos
con garantías adecuadas.

Al usar el servicio, el Restaurante presta conformidad a esta transferencia.

## 6. Cuánto tiempo conservamos los datos

- **Sesiones de mesa abiertas:** se cierran automáticamente tras un período de
  inactividad.
- **Apodos de comensales:** se borran a los **30 días** de cerrada la mesa. Es
  el único dato personal del comensal, y pasado ese plazo no cumple ninguna
  función. La venta queda —qué se pidió y cuánto salió— porque es el registro
  comercial del Restaurante y no identifica a nadie.
- **Historial de pedidos y ventas:** mientras la cuenta esté activa, ya que son
  el registro comercial del Restaurante.
- **Cuenta suspendida por falta de pago o fin de prueba:** al menos **90 días**,
  para permitir la reactivación sin pérdida de trabajo.
- **Baja definitiva:** eliminamos los datos dentro de los **30 días** de
  solicitada la supresión, salvo lo que debamos conservar por obligación legal.
- **Registros técnicos:** máximo 90 días.

## 7. Seguridad

Medidas concretas que aplicamos:

- **Aislamiento por restaurante a nivel de base de datos** (Row Level Security),
  no por una configuración de la aplicación que pueda fallar.
- **Contraseñas cifradas** con `scrypt`. No son recuperables ni legibles.
- **Cifrado en tránsito** (HTTPS) en todas las comunicaciones.
- **Códigos QR firmados criptográficamente**, con secreto propio por mesa y
  posibilidad de renovarlos.
- **Permisos por rol:** la cocina no accede a precios ni a datos del equipo; el
  personal de salón no edita la carta.
- **Límites de frecuencia** para prevenir abusos automatizados.

Ningún sistema es infalible. Ante un incidente de seguridad que afecte datos
personales, notificaremos a los Restaurantes afectados y a la autoridad de
control cuando corresponda, sin demora indebida.

## 8. Almacenamiento en el dispositivo

**No usamos cookies de publicidad ni de seguimiento de terceros.**

Guardamos información en el almacenamiento local del navegador únicamente para
que la aplicación funcione:

- **En el teléfono del comensal:** el identificador de su mesa y de su sesión,
  para que al recargar la página no pierda su pedido, y los pedidos hechos sin
  señal, hasta poder enviarlos.
- **En el dispositivo del personal:** el token de sesión, para no tener que
  iniciar sesión en cada pantalla.

Todo esto se borra al cerrar sesión o limpiar los datos del navegador.

## 9. Tus derechos

Toda persona tiene derecho a **acceder, rectificar, actualizar y suprimir** sus
datos personales, y a oponerse a su tratamiento.

Para ejercerlos, escribinos a `[MAIL DE CONTACTO]` o por WhatsApp al
`[WHATSAPP]`. Respondemos dentro de los **10 días corridos** para el acceso y
**5 días hábiles** para la rectificación o supresión, según los artículos 14 y
16 de la Ley 25.326.

> El titular de los datos personales tiene la facultad de ejercer el derecho de
> acceso al mismo en forma gratuita a intervalos no inferiores a seis meses,
> salvo que se acredite un interés legítimo al efecto, conforme lo establecido
> en el artículo 14, inciso 3 de la Ley Nº 25.326.

> **La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA**, en su carácter de Órgano de
> Control de la Ley Nº 25.326, tiene la atribución de atender las denuncias y
> reclamos que interpongan quienes resulten afectados en sus derechos por
> incumplimiento de las normas vigentes en materia de protección de datos
> personales.

**Si sos comensal:** los pedidos que hiciste quedan como registro de venta del
Restaurante donde comiste. Para pedir su supresión, contactá directamente a ese
Restaurante, que es el responsable de esos datos; nosotros lo asistiremos en lo
que técnicamente corresponda.

## 10. Menores de edad

El servicio está dirigido a establecimientos gastronómicos y a su personal
mayor de edad.

Un menor puede escanear un QR y pedir en un restaurante, como podría pedirle a
un mozo. Como **no recolectamos datos personales del comensal**, esa
interacción no implica el tratamiento de datos de un menor identificable.

## 11. Cambios en esta política

Podemos actualizarla. Los cambios sustanciales se avisan con **30 días de
anticipación** por correo electrónico a los Restaurantes registrados.

La fecha de última actualización figura al comienzo de este documento.

## 12. Contacto

`[MAIL DE CONTACTO]` · WhatsApp `[WHATSAPP]` · `[DOMICILIO LEGAL]`
