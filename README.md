# Látigo

Un látigo físico sobre el escritorio de Windows. Lo agarrás del mango, lo sacudís y chasquea, con el resto de tus ventanas visibles detrás. El látigo, sus efectos, la oficina y hasta los íconos se dibujan por código, sin imágenes. El sonido es una grabación real de un látigo (cuatro tomas que se alternan), también cuando le pega a un agentito de la oficina; no hay sonido sintetizado.

## La oficina de agentes

En una esquina de la pantalla aparece la oficina. Cada sesión de Claude Code abierta tiene su **jefe**: el Claude de esa sesión, con corona, en un escritorio doble con dos monitores y una planta. Teclea cuando trabaja, se duerme cuando te espera a vos y levanta la mano cuando necesita tu permiso. Al lado se sientan sus agentes reales (subagentes, compañeros de equipo, agentes de workflow), con su nombre y el tiempo que llevan.

- **Pasá el mouse** por arriba de uno (en modo interactivo, `Ctrl+Alt+L`) y aparece un cartel con quién es, qué está haciendo, el archivo o comando, hace cuánto y cuántos golpes se llevó este mes.
- **Si alguien espera tu permiso**, salta con la mano levantada y el marco de la oficina parpadea en amarillo.
- **Pegales con el látigo**: si la parte baja del látigo los cruza rápido, reaccionan (sobresalto, salto, salen volando y ven estrellas, o se cubren si les pegás seguido) y suena el chasquido real, más fuerte cuanto más fuerte el golpe. Lo que mejor funciona es golpear de arriba para abajo, con el mango unos 400 px por encima.
- **Golpe crítico**: si la punta les pega a velocidad de chasquido, salen volando el doble de lejos y ven más estrellas.
- **Contador**: abajo, los golpes de hoy, los críticos y el **empleado del mes** (el que más cobró). Se guarda entre reinicios; el día y el mes empiezan de cero solos.

- **Esquivan:** un látigo lento lo ven venir y se agachan; no cuenta como golpe. Contra uno rápido no pueden.
- **Los demás reaccionan:** si le pegás al jefe, sus agentes festejan; si le pegás a uno, el de al lado se ríe.
- **Combos y logros:** golpes seguidos muestran "×N"; los logros ("Primer crítico", "Le pegaste al jefe", "Triple crítico", "Cien en un día"…) aparecen arriba al desbloquearse y quedan guardados.
- **Cada uno con lo suyo:** el Explore con sombrero de explorador, el Plan con un rollo de planos, el que revisa con anteojos.
- **Lo que gasta cada sesión:** el cartel del jefe dice el contexto usado, los tokens y el costo. Con el contexto casi lleno (80 % o más), el jefe suda.
- **Temas:** de noche (de 20 a 7) con lámparas prendidas, y de fiesta los viernes, con guirnaldas. Se puede fijar uno desde la bandeja.
- **Lugares por rol:** los exploradores, los que planifican, los que implementan, los que revisan y los que prueban se sientan siempre en su zona.

**Para entender el trabajo** (pasá el mouse por arriba de cada uno para el detalle):
- **Organigrama:** una línea punteada une a cada agente con quien lo lanzó (otro agente, o el jefe); al nacer, una carpeta viaja por la línea.
- **Mismo archivo:** si dos agentes escribieron el mismo archivo en los últimos 10 minutos, aparece una hoja naranja sobre sus monitores. Es una pista para revisar, no un conflicto seguro.
- **Rastro de herramientas:** puntitos bajo el escritorio, verdes o rojos, con cómo terminaron sus últimas herramientas. El cartel dice si la última salió bien; nunca da por "resuelto" un error.
- **Frentes:** abajo, las carpetas del proyecto más tocadas en la última media hora.
- **Conexión congelada:** si una sesión deja de escribir más de 12 segundos, el jefe muestra "sin conexión" en rojo y cuánto hace, y el título lo cuenta.

**Para jugar:**
- **Objetos:** cada escritorio tiene una taza, un lápiz y una carpeta. El látigo los tira; la carpeta suelta hojas; el lápiz rueda. Con la punta del látigo, despacio, enganchás lo que quedó en el piso; un sacudón lo lanza. Cuando todo se calma, un **robot de limpieza** (gris, con una lucecita) vuelve a poner cada cosa en su lugar y tira las hojas.
- **Blancos de precisión** (bandeja → *Látigo*): aparece un aro dorado arriba de la oficina; tocalo con la punta. Cuenta la racha y el tiempo.
- **Trucos:** una vuelta completa, un ocho o un doble latigazo con la punta se reconocen y aparecen en pantalla.
- **Tipos de látigo** (bandeja → *Látigo*): clásico, corto y rápido, largo y pesado o flexible.

Desde la bandeja, *Oficina de agentes*: mostrarla u ocultarla, la esquina, el tamaño (chica, mediana, grande), el tema, el **parte del día** (quién trabajó hoy, cuánto y cómo terminó), el **chasquido** cuando alguien espera tu permiso y los **avisos de Windows** cuando un agente espera tu permiso, termina o falla. Con más de un monitor, *Pantalla* elige en cuál viven el látigo y la oficina. *Abrir al iniciar Windows* la abre al prender la compu (viene activado). También ahí: la **distribución** (horizontal, torre de pisos o dos alas), el **modo de baja distracción** (sin chispas, sin estela, sin que se muevan de más) y las **escenas de demo** (*Equipo de seis*, *Entrega accidentada*, *Oficina caótica*), que la app arma sola sin abrir Claude, marcadas como DEMO y sin avisos.

**Gasto por proyecto y sesión** (bandeja → *Oficina de agentes* → *Gasto por proyecto y sesión*): cuánto tiempo y cuántos tokens usaste en cada proyecto y en cada sesión, hoy, en 7 días, en 30 días o en total. Sale de las transcripciones que Claude Code guarda en `~\.claude\projects`, así que incluye las sesiones viejas. La app las lee una vez y después solo lo que crece, cada minuto, y guarda solo números (no lo que se dijo) en `%APPDATA%\latigo-overlay\ledger.json`.
- **Tiempo activo:** el tiempo entre mensajes de la sesión, sin contar pausas de más de 5 minutos. Los subagentes no lo duplican.
- **Entrada y salida:** tokens nuevos de cada respuesta (subagentes incluidos), cada respuesta contada una sola vez.
- **Caché leída:** aparte, porque es el contexto que se vuelve a leer en cada respuesta y es mucho más barato.
- **Costo:** el que informó Claude Code, solo de las sesiones que el mod Oficina vio en vivo; las demás muestran "—".
- **Proyecto:** la raíz del repositorio git de la carpeta de la sesión; los worktrees cuentan como su repositorio y las sesiones sin carpeta van como "Sin carpeta" con su fecha.

El cartel del jefe también muestra el tiempo y los tokens de su sesión.

En el mismo panel:
- **Límites de uso en vivo:** cuánto usaste de la ventana de 5 horas y de la semanal, y cuándo se renueva cada una (los informa Claude Code a las sesiones con el mod nuevo). Al pasar el 80 % llega un aviso de Windows, una vez por ventana; también se ven al pie de la oficina, y con la de 5 horas por encima del 90 % el jefe suda.
- **Gráfico de 30 días:** barras con el tiempo activo de cada día y una línea con los tokens nuevos.
- **Mapa de horarios:** en qué días de la semana y a qué horas trabajás, para el período elegido.
- **Por cliente:** una sesión cuenta para el cliente cuya carpeta aparece en su ruta (`clients
ombre` o `clientes
ombre`); las demás, por proyecto y "sin cliente".
- **Por modelo:** respuestas y tokens de cada modelo (Opus, Sonnet, Haiku…). El tiempo no se reparte por modelo.
- **Resumen semanal:** los viernes desde las 17, un aviso con tus horas, tokens y proyectos de la semana; al tocarlo se abre el panel.

**Grabar** (bandeja → *Grabar*): guarda la oficina como datos, nunca como video de tu pantalla, así que no se graba nada más del escritorio. Podés guardar un **clip** de los últimos 12 segundos o un **timelapse** de la sesión (en video WebM), o exportar un **replay** (un archivo que otra copia de la app abre desde *Abrir un replay…*). Van a `Videos\Latigo`. Guardan los nombres bajo los escritorios, pero no qué hacía cada agente, ni sus archivos, ni la sesión.


Pegarles no toca a los agentes reales y nada de esto llama a un modelo ni gasta tokens. Los agentes los publica el mod **Oficina** de Claude Code (`~\.claude\mods\oficina`): cada sesión escribe los suyos en `~\.claude\oficina-live` y la app los lee cada 0,7 s. Una sesión que deja de escribir por 45 s desaparece.

## Usarlo

Ejecutable ya compilado: `release\Latigo-portable.exe` (un solo archivo) o `release\win-unpacked\Latigo.exe` (abre más rápido).

Desde el código:

```bash
npm install
npm start
```

## Controles

| Acción | Cómo |
| --- | --- |
| Entrar o salir del modo interactivo | `Ctrl+Alt+L`, o clic en el ícono de la bandeja |
| Ocultar o mostrar el látigo | `Ctrl+Alt+H` |
| Agarrar | En modo interactivo, botón izquierdo sobre el mango (se ilumina) |
| Chasquear | Sacudir rápido y frenar o cambiar de dirección |
| Silenciar, volumen, ocultar, volver a trabajar | Píldora de botones bajo el mango (solo en modo interactivo) o menú de la bandeja |
| Volver a colocar el látigo, salir | Menú de la bandeja (clic derecho en el ícono) |

Dos estados:

- **Pasivo** (al abrir): la ventana ignora el mouse por completo. Escribís, seleccionás y hacés clic como si no estuviera.
- **Interactivo**: solo el mango y la píldora de botones reciben clics; el resto de la pantalla los sigue dejando pasar. La ventana nunca toma el foco del teclado, así que la terminal sigue recibiendo lo que escribís incluso mientras arrastrás.

Ocultar el látigo siempre lo devuelve a pasivo, y los dos atajos son globales: funcionan aunque otra ventana tenga el foco.

## Cambiar los atajos

Menú de la bandeja → *Abrir configuración (atajos)…*. Se abre `config.json` (en `%APPDATA%\latigo-overlay`); editá `shortcuts.interactive` y `shortcuts.visible` con el formato de Electron (`Control+Alt+L`, `Alt+Shift+W`…) y reiniciá la app. Si otro programa ya tiene el atajo, el menú de la bandeja lo avisa como "Atajo ocupado".

## Cómo está hecho

| Archivo | Qué hace |
| --- | --- |
| `electron/main.ts` | Ventana transparente siempre encima, paso de clics, atajos globales, bandeja, configuración |
| `electron/preload.ts` | Puente mínimo entre la ventana y el proceso principal |
| `src/sim.ts` | Física: cadena de 40 puntos con integración Verlet, masa decreciente hacia la punta, 240 pasos fijos por segundo |
| `src/crack.ts` | Detección del chasquido: umbral de velocidad de la punta, pico, histéresis e intervalo mínimo |
| `src/audio.ts` | Sonido con Web Audio: reproduce las grabaciones reales del chasquido, con limitador |
| `src/sounds/` | Las cuatro grabaciones del chasquido (CC0, de BigSoundBank) |
| `src/draw.ts` | Dibujo en Canvas 2D: curva suavizada, cuerpo trenzado y sombreado, mango |
| `src/fx.ts` | Estela, destello, anillo y chispas |
| `src/main.ts` | Une todo: un mismo evento de chasquido dispara el sonido y el destello |
| `src/office/` | La oficina: personajes y reacciones (los del mod), dibujo en píxeles escalados y golpes del látigo |

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm start` | Compila y abre la app |
| `npm test` | Pruebas de la física y del detector, sin ventana |
| `npm run selftest` | Abre la app 12 segundos con una mano simulada (sin sonido audible) y escribe `selftest-out/report.json` y dos capturas |
| `npm run typecheck` | Verifica los tipos |
| `npm run dist` | Dibuja el ícono (`scripts/make-icon.mjs`) y genera `release\Latigo-portable.exe` |

## Limitaciones

- **Un monitor a la vez:** el látigo y la oficina viven en la pantalla elegida en la bandeja (la principal, si no elegiste otra). No cruzan de una pantalla a otra.
- **Carpeta de ruta corta:** Electron no arranca si la ruta completa del proyecto supera los 260 caracteres de Windows.
- **Pantalla completa exclusiva:** los juegos y videos en pantalla completa exclusiva pueden tapar el látigo.
- **Ejecutable sin firmar:** Windows SmartScreen puede pedir confirmación la primera vez que abras el `.exe`.
- **npm 11:** bloquea el script de instalación de Electron; el `postinstall` del proyecto lo ejecuta por vos. Si faltara el binario: `node node_modules/electron/install.js`.
