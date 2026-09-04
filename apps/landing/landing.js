/**
 * Lo que se mueve en la landing.
 *
 * Cada animación muestra algo que si no habría que explicar con texto: el
 * pedido viajando a la cocina, la regla de un llamado a la vez, la diferencia
 * entre veinte mesas en columnas y todo de un golpe.
 */
(() => {
  'use strict';

  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── WhatsApp ── */

  /*
   * El número vive acá y en un solo lugar.
   *
   * Va con código de país y sin espacios ni signos, que es como lo pide wa.me:
   * 5491155555555 para un celular de Buenos Aires. Si queda vacío, los enlaces
   * siguen apuntando al formulario en vez de abrir un chat roto — un botón que
   * lleva a un número inexistente es peor que no tenerlo.
   */
  const WHATSAPP = '5492645135540';

  if (WHATSAPP !== '') {
    for (const enlace of document.querySelectorAll('[data-wa]')) {
      const texto = enlace.getAttribute('data-wa') ?? '';
      enlace.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(texto)}`;
    }
  } else {
    // Sin número configurado no se abre una pestaña vacía: cae al formulario,
    // que es la otra forma de dejar el contacto.
    for (const enlace of document.querySelectorAll('[data-wa]')) {
      enlace.removeAttribute('target');
    }
  }

  /* ── El título, palabra por palabra ── */

  /*
   * Las palabras ya vienen separadas desde el HTML. El script sólo reparte el
   * retardo de cada una.
   *
   * Antes las envolvía él, y eso obligaba a reconstruir a mano el espacio
   * entre elementos inline-block — que el navegador colapsa. El título se leía
   * "Elpedidollegaalacocina". Con el texto ya partido en el HTML no hay nada
   * que reconstruir: el espacio es texto normal y se ve bien aunque el script
   * no llegue a correr.
   */
  const tituloHero = document.querySelector('.hero-titulo');

  if (tituloHero !== null && !quieto) {
    for (const [i, palabra] of [...tituloHero.querySelectorAll('.palabra')].entries()) {
      palabra.style.animationDelay = `${180 + i * 90}ms`;
    }

    // La clase enciende la animación. Sin ella las palabras ya están visibles,
    // así que el título se lee igual si el script no llega a correr.
    //
    // En el siguiente cuadro y no ahora mismo: aplicar el estado inicial y el
    // final en el mismo cuadro hace que el navegador no vea el cambio y no
    // anime nada — el título aparecería de golpe.
    requestAnimationFrame(() => tituloHero.classList.add('anima'));
  }

  /* ── La demo del pedido, en loop ── */
  const enviar = document.getElementById('botonEnviar');
  const punto = document.getElementById('punto');
  const ticket = document.getElementById('ticket');
  const reloj = document.getElementById('reloj');
  const estado = document.getElementById('estadoFlotante');
  const pausa = document.getElementById('pausa');

  let corriendo = !quieto;
  let paso = 0;
  let segundos = 1;
  let temporizador = null;

  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  function ciclo() {
    if (!corriendo) return;

    paso = (paso + 1) % 4;

    if (paso === 1) {
      enviar?.classList.add('tocado');
      if (estado) estado.textContent = 'Enviando…';
      return;
    }
    if (paso === 2) {
      punto?.classList.add('viaja');
      return;
    }
    if (paso === 3) {
      ticket?.classList.add('llego');
      segundos = 1;
      if (reloj) reloj.textContent = mmss(segundos);
      if (estado) estado.textContent = 'En cocina';
      return;
    }
    // Vuelve al principio, con una pausa para que el ojo alcance a leer.
    enviar?.classList.remove('tocado');
    punto?.classList.remove('viaja');
    ticket?.classList.remove('llego');
    if (estado) estado.textContent = 'Armando el pedido';
  }

  function arrancar() {
    if (temporizador !== null) return;
    temporizador = setInterval(() => {
      ciclo();
      if (paso === 3) {
        segundos += 1;
        if (reloj) reloj.textContent = mmss(segundos);
      }
    }, 1400);
  }

  function frenar() {
    if (temporizador === null) return;
    clearInterval(temporizador);
    temporizador = null;
  }

  pausa?.addEventListener('click', () => {
    corriendo = !corriendo;
    pausa.textContent = corriendo ? '⏸' : '▶';
    pausa.setAttribute(
      'aria-label',
      corriendo ? 'Pausar la demostración' : 'Reanudar la demostración',
    );
    if (corriendo) arrancar();
    else frenar();
  });

  if (corriendo) arrancar();
  else if (pausa) pausa.textContent = '▶';

  // No gastar batería con la pestaña de fondo.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) frenar();
    else if (corriendo) arrancar();
  });

  /* ── El timbre: un llamado a la vez ── */
  const timbre = document.getElementById('timbre');
  const timbreNota = document.getElementById('timbreNota');

  timbre?.addEventListener('click', (evento) => {
    const boton = evento.target.closest('.timbre-btn');
    if (boton === null || boton.classList.contains('bloqueado')) return;

    const botones = [...timbre.querySelectorAll('.timbre-btn')];
    const yaPedido = boton.classList.contains('pedido');

    // Tocar el que ya está pedido lo cancela: quien tocó por error no queda
    // trabado esperando a un mozo que no quería llamar.
    for (const b of botones) {
      b.classList.remove('pedido', 'bloqueado');
    }

    if (yaPedido) {
      if (timbreNota) {
        timbreNota.textContent = 'Cancelado. Ahora podés pedir cualquiera de los tres.';
      }
      return;
    }

    boton.classList.add('pedido');
    for (const b of botones) {
      if (b !== boton) b.classList.add('bloqueado');
    }
    if (timbreNota) {
      timbreNota.textContent =
        'Ya avisamos. Los otros dos se apagan: al mozo le llega un pedido claro, no tres. Tocá de nuevo para cancelar.';
    }
  });

  /* ── Antes / después de la cocina ── */
  const slider = document.getElementById('slider');
  const despues = document.getElementById('despues');

  slider?.addEventListener('input', () => {
    if (despues) despues.style.clipPath = `inset(0 0 0 ${slider.value}%)`;
  });

  /* ── Los números del panel, que se mueven como un turno real ── */
  const ventas = document.getElementById('ventas');
  const mesas = document.getElementById('mesas');
  const ticketProm = document.getElementById('ticket');
  const vendidas = document.getElementById('vendidas');

  const pesos = (n) => '$' + n.toLocaleString('es-AR');

  if (!quieto && ventas !== null) {
    let totalVentas = 487_200;
    let totalMesas = 38;
    let totalVendidas = 23;

    setInterval(() => {
      if (document.hidden) return;

      // Sube todo junto y el ticket se recalcula: si los números no cierran
      // entre sí, un dueño de restaurante deja de creer el resto de la página.
      totalMesas += 1;
      totalVentas += 11_000 + Math.floor(Math.random() * 6000);
      if (Math.random() > 0.5) totalVendidas += 1;

      ventas.textContent = pesos(totalVentas);
      if (mesas) mesas.textContent = String(totalMesas);
      if (ticketProm) ticketProm.textContent = pesos(Math.round(totalVentas / totalMesas));
      if (vendidas) vendidas.textContent = String(totalVendidas);
    }, 4000);
  }

  /* ── El formulario ── */
  const form = document.getElementById('form');
  const listo = document.getElementById('listo');

  const MENSAJES = {
    local: 'Poné el nombre de tu restaurante',
    nombre: 'Poné tu nombre',
    whatsapp: 'Necesitamos un WhatsApp para escribirte',
    cartaLink: 'Pegá el link de tu carta, o elegí otra opción',
    mesas: 'Poné un número entre 1 y 500',
  };

  /*
   * Dónde está la API.
   *
   * En localhost gana la de la máquina, no la del meta: probando la landing
   * servida en el 4300, apuntar a producción hace que el navegador bloquee la
   * llamada por CORS y se vea "sin conexión" — un error que no dice nada de
   * lo que pasó. Es la misma regla que usan las cuatro apps.
   */
  const enLaMaquina = ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname ?? '');
  const boton = document.getElementById('enviar');

  const api = enLaMaquina
    ? `${globalThis.location.protocol}//${globalThis.location.hostname}:3000`
    : (document.querySelector('meta[name="itadaki-api"]')?.content ?? '');
  function revisar(input) {
    const campo = input.closest('.campo');
    if (campo === null) return true;

    const vacio = input.value.trim() === '';
    const malNumero =
      input.type === 'number' && !vacio && (Number(input.value) < 1 || Number(input.value) > 500);
    // Un mail sin arroba o una contraseña corta se rechazan acá y no después:
    // el servidor los rechaza igual, y enterarse recién ahí es peor.
    // El mail es opcional: sólo se revisa si escribió algo.
    const malMail = input.type === 'email' && !vacio && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.value);
    const mal = (input.required && vacio) || malNumero || malMail;

    campo.classList.toggle('mal', mal);
    const error = campo.querySelector('.error');
    if (error !== null) {
      error.textContent = mal
        ? malNumero
          ? 'Poné un número entre 1 y 500'
          : malMail
            ? 'Ese mail no parece válido'
            : (MENSAJES[input.name] ?? 'Falta completar esto')
        : '';
    }
    return !mal;
  }

  /**
   * Si el formulario está listo para mandar.
   *
   * Mira los valores sin tocar la pantalla: `revisar` pinta el campo en rojo,
   * y eso mientras alguien todavía está escribiendo es corregirlo a mitad de
   * la frase. Acá sólo se pregunta.
   */
  function completo() {
    if (form === null) return false;

    // Una de las tres opciones de la carta, sí o sí: es lo que decide qué
    // hacemos después de recibirlo.
    if (form.querySelector('input[name="carta"]:checked') === null) return false;

    return [...form.querySelectorAll('input')].every((input) => {
      if (input.type === 'radio') return true;
      const valor = input.value.trim();
      if (input.required && valor === '') return false;
      // El mail es opcional; si lo escribió, que sea un mail.
      if (input.type === 'email' && valor !== '' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)) return false;
      if (input.type === 'number' && valor !== '' && (Number(valor) < 1 || Number(valor) > 500)) return false;
      return true;
    });
  }

  /*
   * El botón apagado hasta que esté todo.
   *
   * Dice de un vistazo que falta algo, sin tener que tocarlo para enterarse.
   * `aria-disabled` y no `disabled`: un botón deshabilitado de verdad no
   * recibe foco ni anuncia nada, así que quien navega con teclado o lector no
   * se entera de que existe. Así se puede llegar a él, y al tocarlo el
   * formulario marca en rojo lo que falta.
   */
  function refrescarBoton() {
    const listoParaMandar = completo();
    boton?.setAttribute('aria-disabled', String(!listoParaMandar));
    boton?.classList.toggle('apagado', !listoParaMandar);
  }

  // Al salir del campo, no mientras escribe: marcar en rojo lo que todavía se
  // está tipeando es corregir a alguien a mitad de la frase.
  for (const input of form?.querySelectorAll('input') ?? []) {
    input.addEventListener('blur', () => revisar(input));
    input.addEventListener('input', () => {
      const campo = input.closest('.campo');
      if (campo?.classList.contains('mal')) revisar(input);
      // El botón sí se actualiza mientras escribe: se prende solo al
      // completar el último campo, que es la señal de que ya está.
      refrescarBoton();
    });
  }

  /*
   * El campo del link, sólo cuando hace falta.
   *
   * Suelto y siempre visible parece obligatorio, y el que no tiene carta
   * online —que es justamente el cliente— se frena ahí. Aparece al elegir esa
   * opción y se va con cualquier otra, para que nadie mande un link pegado
   * por error en la respuesta equivocada.
   */
  const campoLink = document.getElementById('campoLink');
  const inputLink = campoLink?.querySelector('input') ?? null;

  for (const opcion of form?.querySelectorAll('input[name="carta"]') ?? []) {
    opcion.addEventListener('change', () => {
      const conLink = opcion.value === 'link' && opcion.checked;
      if (campoLink !== null) campoLink.hidden = !conLink;
      if (inputLink !== null) {
        inputLink.required = conLink;
        if (!conLink) {
          inputLink.value = '';
          campoLink?.classList.remove('mal');
        } else {
          inputLink.focus();
        }
      }
      refrescarBoton();
    });
  }

  refrescarBoton();

  /** Un error que no es de un campo puntual: sin red, el mail ya usado. */
  function errorGeneral(texto) {
    let aviso = form?.querySelector('.error-envio');
    if (aviso === null || aviso === undefined) {
      aviso = document.createElement('p');
      aviso.className = 'error-envio';
      aviso.setAttribute('role', 'alert');
      boton?.insertAdjacentElement('beforebegin', aviso);
    }
    aviso.textContent = texto;
  }

  form?.addEventListener('submit', async (evento) => {
    evento.preventDefault();

    const inputs = [...form.querySelectorAll('input')];
    const todosBien = inputs.map((i) => revisar(i)).every(Boolean);

    if (!todosBien) {
      // El botón está apagado pero se puede tocar: acá es donde se entera de
      // qué le falta, marcado en el campo y con el foco puesto ahí.
      form.querySelector('.campo.mal input')?.focus();
      return;
    }

    if (api === '') {
      errorGeneral('No podemos recibirlo ahora. Escribinos por WhatsApp.');
      return;
    }

    const datos = Object.fromEntries(new FormData(form));

    // Bloqueado mientras se manda: dos toques seguidos son dos pedidos, y del
    // otro lado alguien escribe dos veces al mismo restaurante.
    if (boton !== null) {
      boton.disabled = true;
      boton.textContent = 'Enviando…';
    }
    form.querySelector('.error-envio')?.remove();

    try {
      const mesas = Number(datos.mesas);
      const respuesta = await fetch(`${api}/api/interesados`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          local: datos.local,
          nombre: datos.nombre,
          whatsapp: datos.whatsapp,
          ...(String(datos.email ?? '').trim() === '' ? {} : { email: datos.email }),
          ...(Number.isFinite(mesas) && mesas > 0 ? { mesas } : {}),
          carta: datos.carta,
          ...(datos.carta === 'link' ? { cartaLink: datos.cartaLink } : {}),
        }),
      });

      if (!respuesta.ok) {
        errorGeneral(
          // 429: probó varias veces seguidas. Decir "probá de nuevo" sin más
          // invita justamente a lo que está bloqueado.
          respuesta.status === 429
            ? 'Probaste varias veces seguidas. Esperá un minuto y volvé a intentar.'
            : 'No pudimos recibir tus datos. Probá de nuevo o escribinos por WhatsApp.',
        );
        if (boton !== null) {
          boton.disabled = false;
          boton.textContent = 'Quiero que me armen la carta';
        }
        return;
      }

      form.hidden = true;
      if (listo !== null) {
        // El número a la vista: si se tipeó mal, este es el momento de darse
        // cuenta y no dos días después, cuando no llegó ningún mensaje.
        const donde = document.getElementById('whatsappDejado');
        if (donde !== null) donde.textContent = String(datos.whatsapp);
        listo.hidden = false;
        listo.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'center' });
      }
    } catch {
      /*
       * Un `fetch` que tira no siempre es falta de red.
       *
       * También tira cuando el navegador bloquea la llamada por CORS, y ahí
       * decir "fijate la red" manda a revisar el wifi por un problema
       * nuestro. El texto ofrece la salida que sirve en los dos casos.
       */
      errorGeneral(
        navigator.onLine === false
          ? 'Sin conexión. Fijate la red y probá de nuevo.'
          : 'No pudimos recibir tus datos. Escribinos por WhatsApp y lo resolvemos ahí.',
      );
      if (boton !== null) {
        boton.disabled = false;
        boton.textContent = 'Quiero que me armen la carta';
      }
    }
  });

  /* ── Aparecer al scrollear ── */
  if (!quieto && 'IntersectionObserver' in globalThis) {
    const mirador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          entrada.target.style.opacity = '1';
          entrada.target.style.transform = 'none';
          mirador.unobserve(entrada.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );

    for (const [i, nodo] of [
      ...document.querySelectorAll('.tarjeta, .dia, .pieza, .numeros'),
    ].entries()) {
      nodo.style.opacity = '0';
      nodo.style.transform = 'translateY(16px)';
      nodo.style.transition = `opacity 500ms cubic-bezier(0.16,1,0.3,1) ${(i % 6) * 60}ms, transform 500ms cubic-bezier(0.16,1,0.3,1) ${(i % 6) * 60}ms`;
      mirador.observe(nodo);
    }
  }
})();
