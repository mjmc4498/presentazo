# Registro de cambios

Todas las versiones de Presentazo: la extensión de Chrome y la app de escritorio. En la
extensión, el número de versión de cada paquete debe ser mayor que el anterior para que
la Chrome Web Store lo acepte.

## Extensión 1.2.1 y app de escritorio 1.1.1 (31 de octubre de 2026)

- **La diapositiva siguiente se ve desde la primera, en Presentaciones de Google.** La extensión la
  lee del panel de miniaturas de la propia página (que tiene dibujada cada diapositiva) y la envía
  al celular, así que ya no hace falta haberla visitado antes. Todo ocurre dentro de la página:
  no se descarga nada de Google ni se pide ningún permiso nuevo. En la última diapositiva el
  celular lo indica. Con otros programas la siguiente se sigue aprendiendo al verla.
- **Corrección importante en la vista previa:** el canal de datos pierde en silencio los mensajes
  de más de 16 KB, así que las miniaturas de diapositivas con muchos detalles no llegaban al
  celular (solo llegaban las livianas). Ahora los mensajes grandes se parten en trozos y el celular
  los junta. Afecta a la extensión y a la app, por eso hay versión nueva de las dos.
- Prueba manual con una presentación real de Google (`npm run test:slides`, necesita internet).

## Extensión 1.2.0 y app de escritorio 1.1.0 (31 de octubre de 2026)

Las dos versiones traen lo mismo, porque comparten el control del celular.

- **Mapa de la pantalla en el celular.** En Puntero y en Mouse se ve una miniatura de la pantalla
  con un punto que sigue al puntero real, con la forma y el tamaño de la herramienta elegida.
- **Tamaño del láser, el foco y el lápiz** desde el celular, con los botones **+ y −** (7 niveles;
  mantener pulsado repite). Cada herramienta recuerda su tamaño.
- **Vista previa en el celular:** en Diapositivas aparece lo que está en pantalla y la diapositiva
  siguiente. Presentazo aprende cuál es la siguiente viendo qué aparece después de cada
  «Siguiente» (un programa cualquiera no lo informa), así que tras recorrer la presentación una vez
  la miniatura queda disponible. La extensión captura la pestaña con el permiso `activeTab` (sin
  permisos nuevos) y la app, la pantalla donde se presenta (en Mac pide «Grabación de pantalla»).
  Se puede desactivar en el celular y en Ajustes de la extensión o de la app.
- **Modo aire renovado:** funciona con el celular plano, inclinado o de pie (antes solo plano),
  filtra el temblor de la mano, es más preciso al moverse despacio y recorre la pantalla rápido
  al moverse rápido. Nuevo botón **Centrar** y sensibilidad propia.
- Cada computadora declara al celular lo que sabe hacer: con una versión anterior de la extensión o
  de la app, el celular oculta lo nuevo en lugar de mostrar controles que no funcionan.
- Política de privacidad actualizada con la vista previa.

## App de escritorio 1.0.1 (17 de octubre de 2026)

- El repositorio ahora se llama `presentazo`: el control del celular se abre desde
  `mjmc4498.github.io/presentazo`. La dirección anterior redirige a la nueva, así que
  la versión 1.0.0 sigue funcionando.
- El enlace «Sitio web» de Ajustes lleva a presentazo.com.

## App de escritorio 1.0.0 (16 de octubre de 2026)

- **Primera versión para Windows y Mac** (Intel y chip M). Controla desde el celular
  PowerPoint, Keynote, Acrobat, Vista Previa, Presentaciones de Google o cualquier
  programa: el celular usa el mismo control remoto que la extensión.
- **Elige qué controlar:** una pantalla, un programa o una pestaña del navegador
  (Chrome, Edge, Brave, Firefox o Safari). Presentazo los trae al frente antes de
  cada orden; en automático controla lo que esté al frente.
- Puntero láser, foco, lápiz y pantalla negra encima de cualquier programa. Con un
  proyector o monitor externo conectado, el puntero aparece en esa pantalla.
- Mouse remoto y teclado con tildes y ñ.
- Reconoce el programa al frente para iniciar la presentación con el atajo correcto
  y muestra en el celular qué se está controlando.
- Queda en la barra de menú (Mac) o junto al reloj (Windows), con opción de abrirse
  al encender la computadora.
- Instaladores en `instaladores/`, separados por sistema y por tipo.

## 1.1.0 (15 de octubre de 2026)

- **Nuevo nombre: Presentazo** (antes «Mando»). El control del celular pasa a
  `mjmc4498.github.io/presentazo` (la dirección anterior redirige a la nueva) y el
  sitio web es presentazo.com.
- **Más privada:** ya no pide acceso a todos los sitios al instalarse. Actúa
  solo en la pestaña donde pulsas su ícono (`activeTab`). El acceso amplio es
  opcional y se pide con un clic solo para «Seguir la pestaña activa» o para
  presentaciones incrustadas desde otro sitio (p. ej. PowerPoint para la web).
- Enlaces a las redes oficiales de Presentazo en la página de Ajustes.
- **Funciona en redes restrictivas.** Si una red (de empresa, de un hotel o un
  Wi-Fi público) bloquea la conexión directa, Presentazo usa el servidor de
  retransmisión de Cloudflare. El tráfico sigue cifrado de extremo a extremo.
  Para evitar cobros, la retransmisión se pausa sola si el consumo del mes se
  acerca a la cuota gratuita de Cloudflare, y se reactiva el mes siguiente.
- **Código QR nuevo en cada sesión** (opción activada por defecto en Ajustes):
  el código anterior deja de servir cada vez que inicias una sesión.
- La extensión ya no muestra el aviso «Lost connection to server» en la página
  de Extensiones de Chrome: es un corte breve que Presentazo resuelve solo.
- Reconexión más segura: si el servidor tarda en liberar la sesión, Presentazo
  reintenta sin desconectar a los celulares que ya están conectados.

## 1.0.0 (15 de octubre de 2026)

Primera versión, publicada con el nombre «Mando»: control de diapositivas, puntero láser, foco, lápiz, mouse
remoto y teclado desde el celular, conectado por código QR.
