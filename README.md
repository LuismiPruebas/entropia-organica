# Entropía Orgánica

Metroidvania de terror biológico en 16 bits para navegador. Three.js sin motor,
arquitectura dirigida por datos.

## Ejecutar

```
npm start          # http://localhost:8080  (servidor sin dependencias, Node 18+)
npm run check      # valida niveles, salidas, enemigos y sprites
```

### Editor de niveles

`http://localhost:8080/editor.html` (con `npm start`). Carga las salas de
`src/data/levels.js` y el mapa del mundo; permite:

- **Pintar tiles**: pincel, masa orgánica (pincel redondo), rectángulo, relleno y
  cuentagotas, con la paleta de todos los tiles y objetos. Vista esquemática o **vista de
  juego** (G: la sala pintada con el mismo pintor del juego).
- **Colocar y editar elementos** con su inspector: enemigos, nódulos, objetos ocultos, sacos
  vitelinos, compuertas, ganglios reflejo, sacos en orden, pústulas-válvula, balsas,
  **plataformas móviles** (`movers`, con su ruta), cubetas de fluido, bocas, goteras,
  pistas, salidas y **zonas etiquetadas** (`zones`: rectángulos con nombre, color y nota,
  para organizarte; el juego las ignora).
- **Ampliar o recortar** la sala por cualquier lado (tile a tile o por celdas de 16x14):
  todo lo de dentro y las llegadas desde otras salas se desplazan solos. Crear, duplicar y
  eliminar salas; ajustar su posición y tamaño en el mapa.
- **Comprobar**: validación de datos y **alcance** con la física real (Mayús+clic en un
  suelo), con o sin doble salto y con las membranas abiertas o cerradas.
- **Probar ▶**: abre el juego en esa sala con los cambios sin guardar (Alt+clic marca el
  punto de inicio). El juego los lee con `?editor`.
- **Guardar** (Ctrl+S): escribe en `levels.js` solo las salas tocadas, conservando los
  comentarios del resto (o lo descarga si el navegador no deja escribir archivos).

Ctrl+Z / Ctrl+Y deshacen y rehacen; rueda = zoom; botón central o Espacio = desplazar.

Los módulos ES no funcionan abriendo `index.html` con `file://`; hace falta el servidor
(si lo abres así, la pantalla de inicio te lo avisa). Three.js r160 va incluido en
`vendor/`, no necesita conexión.

### Atajos de desarrollo (URL)

| Parámetro | Efecto |
|---|---|
| `?play` | Salta la pantalla de título |
| `?room=C&spawn=20,12` | Empieza en una sala y tile concretos |
| `?mut=tendon,alveolos,quitina` | Instala mutaciones al empezar |
| `?map` | Abre el minimapa del HUD |
| `?aim=1,-0.5` | Fija la dirección de la mirada (relativa al personaje) |
| `?light=30` | Fija la energía lumínica del ojo |
| `?steps=90` | Avanza N pasos lógicos al cargar (capturas deterministas) |

En la consola del navegador, `game` expone todo: `game.state.biomass = 100`.

### Menú de desarrollo (F9 o º)

Pausa el juego y permite: activar/desactivar cualquier mutación (con o sin cobrar
sus costes), modo dios (invulnerable y recursos infinitos), congelar el rechazo,
fijar el rechazo, aplicar cualquier objeto (incluidos los acumulativos: Timo,
Quiste, Tejido sano), dejar el cuerpo limpio y viajar a cualquier sala (agrupadas por
bioma, con el color de su mapa; las secretas, marcadas).
Para quitarlo de una versión pública: `DEV_TOOLS = false` en `src/ui/DevMenu.js`.

## Controles

| Tecla | Acción |
|---|---|
| A / D | Mover |
| W / Espacio | Saltar (doble salto con Alveolos) |
| M | Mostrar / ocultar el minimapa (con el Ganglio Cartógrafo) |
| Ratón | Apuntar linterna y arma. Las teclas A/D giran al personaje y apuntan al frente; en cuanto mueves el ratón, vuelve a mandar él |
| Clic | Disparar · con el Cañón Simbionte, mantener = ráfagas automáticas |
| F | Encender / apagar linterna |
| E | Usar Nodo Seguro |
| Q / clic derecho | Tendón Elástico: hacia un anclaje te balanceas; hacia un sello lo desgarras; hacia una criatura la arponeas. Q sin objetivo te suelta |
| Colgado del Tendón | A / D impulsan el balanceo · W recoge cuerda · S la suelta · Espacio te desengancha con la inercia |
| Doble toque A / D | Embestida (Pistones): revienta membranas y atraviesa criaturas hiriéndolas. Para volver a Shift: `DASH_INPUT = 'shift'` en Player.js |
| Contra una pared en el aire | Aferrarse (Garras): W trepa, S baja, Espacio salta |
| P | Pantalla completa |
| Menús (nodo, genoma, desarrollo) | Flechas o WASD eligen · Intro / Espacio marcan · Esc sale (el ratón y las teclas 1..n siguen valiendo) |

**Auto-apuntado con luz:** si no apuntas a mano (stick derecho o ratón), el arma se fija
en la criatura más cercana que alumbra tu ojo en la dirección en que miras, la sigue y
la marca con cuatro esquinas de luz. Sin luz (ojo apagado o sin energía) no hay
fijado: toca apuntar a mano. Mover el stick derecho o el ratón te devuelve el control.
Como la luz ahora vale más, se gasta antes: 1 por segundo encendida (`LIGHT_DRAIN` en
`state/State.js`, antes 0,7), unos 100 s con el ojo lleno.

### Móvil y tableta (táctil)

Se activa solo en pantallas táctiles (`src/ui/Touch.js`): una cruceta de carne translúcida
abajo a la izquierda y botones orgánicos a la derecha. Como el mando, cada botón se
traduce a la tecla que ya usa el juego.

| Control | Qué hace |
|---|---|
| Cruceta | Mover (se puede deslizar el pulgar, también en diagonal). Arriba/abajo trepan y recogen o sueltan el tendón; no saltan |
| SALTAR | Saltar y soltarse del tendón |
| DISPARAR | **Tocar**: dispara a lo que alumbra el ojo (auto-apuntado). **Mantener y arrastrar**: apuntas tú hacia donde arrastras (una marca lo indica) |
| Embestida / Tendón | Aparecen al tener la mutación. El tendón se lanza al soltar: tocar lo lanza al frente; arrastrar y soltar, hacia ahí |
| Fila de arriba | Ojo · arma (si tienes más de una) · genoma · mapa · ✕ (cerrar menús) |
| USAR | Aparece latiendo sobre un Nodo Seguro |

En los menús las opciones se tocan directamente (o se eligen con la cruceta; SALTAR
acepta y ✕ sale). En vertical pide girar el móvil. Si se usa el teclado o el ratón, la
capa táctil se aparta y vuelve con el siguiente toque.

### Mando

Cualquier mando que reconozca el navegador (DualSense, DualShock, Xbox, genéricos con
mapeo estándar) vía la API Gamepad, en `core/Gamepad.js`. Se conecta solo: pulsa un
botón y aparece un aviso. Cada botón se traduce a la tecla del juego, así que todo lo que
va con teclado va con mando. De momento solo vibra al morir (si el mando lo admite); `RUMBLE` en
`core/Gamepad.js` queda para la futura pantalla de opciones.

| PlayStation / Xbox | Acción |
|---|---|
| Stick izq. / cruceta | Mover · arriba/abajo recogen o sueltan el tendón y trepan (no saltan) · doble toque = embestida |
| Stick der. | Apuntar la mirada y el arma en 360°; al soltarlo mira al frente y vuelve el auto-apuntado |
| R1 / RB | Disparar (mantener = cargado) |
| X / A | Saltar · soltarse del tendón con la inercia · aceptar en los menús |
| L2 / LT | Tendón |
| L1 / LB · L3 | Embestida |
| R2 / RT | Libre |
| △ / Y | Usar Nodo Seguro |
| ○ / B | Salir de los menús |
| □ / X | Ojo fotóforo |
| Options / Menu · Create / View | Genoma · Mapa |

El pulgar derecho está siempre en el stick de apuntar: disparo, tendón y embestida van
en gatillos y bumpers.

Aún no hay pantalla de configuración: el mapeo vive en `BUTTONS` de `core/Gamepad.js`,
preparado para hacerse editable.

## Arquitectura

```
src/
├── main.js                 Punto de entrada, escalado píxel perfecto
├── Game.js                 Orquestador: reglas que cruzan sistemas
├── core/                   MOTOR (no sabe qué nivel o habilidad hay)
│   ├── Loop.js             1. Ciclo vital: paso fijo 60 Hz + render
│   ├── Input.js               Teclado y ratón
│   ├── Visual.js           2. Escena, cámara, render a 384x216
│   ├── shaders.js             Linterna con sombras, color 15 bits, latido
│   ├── Sprites.js             Pixel art indexado -> texturas
│   ├── Particles.js           Partículas de 1px
│   ├── Physics.js          3. Colisión AABB contra tiles, línea de visión
│   └── Audio.js               Sonido procedimental WebAudio con paneo
├── state/State.js          4. Estado global: recursos, mutaciones, rechazo
├── data/                   5. BASE DE DATOS (aquí se añade contenido)
│   ├── levels.js              Salas en ASCII
│   ├── mutations.js           Mutaciones y sus costes
│   ├── enemies.js             Estadísticas de enemigos
│   └── sprites.js             Pixel art y paleta
├── factory/                6. FÁBRICA
│   ├── EntityFactory.js       Datos -> objetos de Three.js
│   └── TilePainter.js         Pintado procedimental de tiles
├── entities/               Player, PlayerBody (cuerpo articulado), Enemy (+ IAs),
│                           Creatures (criaturas modulares), Rig (piezas, contornos,
│                           articulaciones de dos huesos), Hazards, Projectile, Pickup
└── ui/                     HUD y menú del Nodo Seguro
```

### Render

Dos escenas se dibujan en texturas de 384x216: el **mundo** (que solo se ve
donde llega la luz) y el **brillo** (ojos, ácido, nodos: visibles en la
oscuridad). Un shader final las combina:

- Cono de linterna de 60º con **sombras proyectadas** (recorre la cuadrícula de
  sólidos de la sala desde la lámpara hasta cada píxel).
- Hasta 8 luces puntuales sin sombra (disparos, nodo, óptico, gas, Corazón).
- Luz cuantizada con tramado Bayer y color final de 15 bits, como la SNES.
- Aberración cromática muy sutil (un ribete de 1 píxel al 35 % como mucho), solo al ritmo del latido cuando la integridad está baja o el rechazo es crítico; viñeta roja con cada latido.
- Paleta por zona, oscura pero intensa como un bodegón de carne: luz ambiente teñida con la familia de color de cada bioma (vino y violeta en el Nervioso, verde azulado con rosa en el Pulmonar, ámbar y óxido en el Digestivo, rojo en el Corazón) y el haz del ojo casi blanco cuando está lleno, para que la carne conserve su color.

## Añadir contenido

**Una sala:** añade una entrada en `data/levels.js` (cuadrícula, enemigos,
salidas) y enlázala desde la `exits` de otra. Ejecuta `npm run check`.

**Un enemigo:** entrada en `data/enemies.js` con un `behavior` existente
(`crawler`, `floater`, `pod`...) y una `creature` de `entities/Creatures.js`.
Una IA nueva es una función más en `BEHAVIORS` (`entities/Enemy.js`).

**Una mutación:** entrada en `data/mutations.js` con un carácter de ADN, sus
costes y modificadores. Si da una habilidad nueva, impleméntala en
`entities/Player.js` preguntando `state.has('tuHabilidad')`. Su aspecto va en
`entities/PlayerBody.js`: una función `part('id', ...)` que sustituye o añade la
parte del cuerpo que reescribe. `tools/morphology.html` muestra todas las etapas.

**Un recurso recogible:** entrada en `PICKUPS` (`entities/Pickup.js`) y un
carácter en `PICKUP_CHARS` (`factory/EntityFactory.js`).

## Sistemas implementados

- **Integridad:** cada mutación corrompe salud máxima de forma permanente.
- **Biomasa:** munición del Cañón Simbionte y moneda para sanar (10 → +15 de
  integridad en un Nodo). El cañón dispara ráfagas de tres espinas mientras mantienes (1 de
  biomasa cada dos ráfagas; cada cuarta, un glóbulo incandescente). El hambre del cañón no la baja de 10.
- **Culatazo:** sin munición, el mismo botón de disparo lanza un golpe cuerpo a cuerpo
  (14 de daño, alcance corto): aparta y aturde un instante a la criatura (no a los jefes
  ni a lo que está anclado), arranca +3 de biomasa y tiene un 25% de infectarte. El brazo sale
  disparado con el torso algo inclinado (sin desplazarte), un arco de luz tenue barre
  por delante y, al acertar, el juego se congela 35 ms (hit-stop) con chispas y temblor. Suena a aire
  cortado (`swing`) y, si acierta, a impacto carnoso (`smack`).
- **Hueso:** cada pieza recogida da 12 (`SCRAP_PER_PIECE` en Pickup.js). Munición de las astillas
  (Cañón I) y de la escopeta (Cañón III), y material de los supresores de rechazo. Los Acorazados lo sueltan al perder la coraza.
- **Escasez:** los enemigos muertos no vuelven hasta que descansas en un Nodo o
  mueres, así que no se puede farmear sin límite.
- **Oxígeno (aliento):** se gasta en movimientos especiales (doble salto 18,
  embestida 25, salto de pared 8) y se recupera solo al dejar de esforzarte
  (6/s tras un breve jadeo; los Alveolos lo aceleran un 60%). Sin aliento, el
  movimiento no sale. En los Nodos se recupera al instante.
- **Fauces (`^` y abismo `v`):** encías con colmillos de marfil aserrados en gancho,
  animados: se flexionan despacio, la encía respira y se agitan si te acercas
  (`Fangs` en entities/Puzzles.js, dibujados con `paintFangTile`). Las púas muerden
  si los pies bajan hasta ellas. En el fondo del abismo, la mandíbula te muerde (15)
  y te escupe con un rebote justo, que asoma medio tile sobre el último suelo firme
  y te deja en él. Tras cuatro mordiscos seguidos sin pisar suelo, te devuelve a él
  directamente (Game.#hazards, `ABYSS_VX`).
- **Luz (el ojo fotóforo):** la luz nace del ojo del protagonista y gasta energía.
  Su color fluoresce según la carga (cian lleno, ámbar a media, rojo agónico); con
  poca, parpadea; a 0, solo ves un radio diminuto y los enemigos van al doble.
  Sin mutar el ojo **no hay cono**: solo un halo redondo alrededor del cuerpo
  (52 px, `HALO_R` en Game.js), como cuando se va la luz. El Ojo Despierto (I) abre el
  haz cónico, que alumbra y fija tu arma en lo que ilumina, y llega
  poco lejos (145 px, `LIGHT_RANGE` en Game.js). El Ojo Pineal lo alarga un 12% y el
  Tercer Ojo un 30% más (mod `lightRange`): en lo más alto de la línea, la penumbra se
  abre mucho más allá. La
  **línea del Ojo** le da poder: el Ojo Despierto (I) delata las paredes falsas, hace
  titilar los objetos ocultos y deja ver a las criaturas camufladas; el Ojo Pineal (II)
  materializa los **objetos ocultos** (`hidden` en levels.js) para poder cogerlos,
  ahuyenta a las criaturas lucífugas (`lucifugo` en enemies.js) y abre las
  **membranas fotosensibles** (`f`), que se cierran poco después sin luz. No
  cambian de golpe: tiemblan mientras cargan, se deshacen desde el centro en
  hebras con un borde húmedo y, al cerrarse, vuelven a crecer desde los bordes
  (`PhotoMembrane` en entities/Puzzles.js). El paso se abre a media apertura y
  nunca se cierra con el cuerpo dentro.
- **Contrapartidas:** cada mutación tiene ventaja y precio (campo `drawback`):
  velocidad, aliento, O2 máximo, gasto de luz, biomasa máxima, hambre, cadencia,
  daño recibido o visibilidad ante los enemigos. Además, los órganos que compiten por
  lo mismo **chocan** y agravan esas desventajas (ver *Líneas de órganos*).
- **Rechazo y carga genética:** cada mutación ocupa carga genética (1; los niveles III,
  2) y tu cuerpo tolera 8 (`CAPACITY_BASE` en State.js). El rechazo crece con el
  tiempo según la carga (0,03/s por punto), se dispara por encima de tu tolerancia
  (+0,08/s por punto de sobrecarga) y con los choques entre órganos (+0,05/s por
  nivel de choque); cada sinergia lo calma (-0,03/s). Al mutar sube de golpe (cada
  mutación instalada encarece un 15% la siguiente, y un 25% más por punto de
  sobrecarga). Los **supresores** del útero lo bajan 35 al instante; los
  **extensores** amplían la tolerancia (+1 cada uno: los Timos Necróticos dan uno y
  el útero los vende por biomasa, cada vez más caros: 30, 45, 65, 90…). Al 100%, las
  mutaciones fallan a veces y pierdes integridad.
- **Disparos:** astillas a 540 y espinas a 560 (el plasma, a 300); las esquirlas de la
  escopeta salen a 360-450 y caen enseguida. El proyectil sale de la boca del arma y
  va justo hacia el cursor. Cada disparo da un leve retroceso de cámara; la escopeta,
  uno de verdad (te empuja hacia atrás y levanta el brazo).
- **Proyectiles con personalidad** (`data/projectiles.js`): cada `kind` tiene su sprite
  animado, su física, lo que suelta al volar y lo que deja al chocar. Por ejemplo:
  - Saliva infectada que gotea pus.
  - Semillas de espora con vilano que frenan y flotan derivando hacia ti.
  - Cálculos de sarro que rebotan en parábola y se hacen añicos.
  - Cargas neurales que vibran.
  - Coágulos que lo salpican todo de sangre.
  - Notas del Coro que ondulan.
  - Grumos de ácido que botan una vez.
  - Tus astillas, espinas, plasma y esquirlas.

  La física se compone con `gravity`, `drag`, `sink` (flota), `bounce`/`restitution`/`friction`,
  `wobble` (oscila a los lados de su rumbo), `home` (deriva hacia ti) y `shards`
  (esquirlas al romperse). La ejecuta `entities/Projectile.js`. Un `kind` sin entrada
  se dibuja como un bloque de color.
- **Dificultad por profundidad:** `room.tier` (0..1) son las salas que te separan del
  inicio, divididas entre 10 (`roomTier` en factory/EntityFactory.js). El Ojo de Techo
  escupe según el órgano en que creció (`ammo` por bioma) y apunta según el tier:
  - Cerca del inicio, ráfagas francas con un aviso largo.
  - Más adentro, adelanta tu movimiento, lanza más semillas que derivan con más fuerza y
    cálculos que rebotan corto, a ti y largo, y en lo más hondo estallan en esquirlas.
- **El cañón (línea Cañón):** empiezas sin arma, solo con la culata. Cada nivel añade un
  arma y se cambia entre las que tengas con **R** (R2 en el mando) o desde el Genoma
  (Intro sobre un cañón activo):
  - **Cañón de Astillas (I):** astillas de hueso, 1 de hueso cada una. Su ADN está en
    el Ganglio Basal (A2): hasta entonces, solo el culatazo.
  - **Cañón Simbionte (II):** ráfagas de espinas y glóbulos de plasma con tu biomasa.
  - **Escopeta de Esquirlas (III):** siete esquirlas a quemarropa que empujan; 2 de
    biomasa y 1 de hueso por disparo, 0,8 s de recarga y retroceso.

  Los disparos del Simbionte y la Escopeta revientan las membranas agrietadas (`X`),
  como la embestida.
- **Revelado:** los enemigos son indistinguibles de la pared hasta que la
  linterna los toca; solo sus ojos brillan en la oscuridad. Los jefes no: siempre
  se les ve y emiten su propia luz.
- **Cuerpo mutante:** el protagonista es un esqueleto articulado de unos 28 px (cabe en su caja: nada asoma)
  (`entities/PlayerBody.js`) con la cabeza pintada a mano (pelo rapado, oreja, nariz, boca y el
  implante rojo del ojo); el brazo del arma sigue
  la mira y los disparos nacen en su boca (si hay pared delante, justo antes de ella). El salto tiene fases
  (encoge al subir, se recoge arriba, estira al caer y se agacha al aterrizar) y, colgado
  del Tendón, el cuerpo se inclina hacia el anclaje con las piernas a la zaga del balanceo. Cada mutación
  sustituye una parte del cuerpo (piernas de émbolo, brazo-tentáculo, brazo de
  hueso, cañón de carne, sacos alveolares, placas, cráneo abierto) y cada una añade
  masa tumoral: con todas sigue siendo casi humano, pero carnoso y deforme. Además
  pierde el pelo a calvas y el cráneo se le abomba con bultos venosos (`HAIR` y
  `SKULL_LUMPS` en PlayerBody.js).
  Referencia visual: `referencias/morfologia_protagonista.png`.
- **Tendón (péndulo):** la cuerda no se estira; el balanceo conserva la inercia y
  soltarte en lo alto del arco te lanza lejos (y te devuelve el doble salto). Un
  golpe te desengancha.

## El mundo

34 salas en cuatro biomas más el Corazón, siete de ellas **secretas** (seis cavidades y un pasadizo), y una **red profunda** bajo los dos primeros sistemas. **El mundo es puramente orgánico**: solo el protagonista es biomecánico. Cada bioma tiene su **familia de color** (bien distinta de la de los demás, sin negros ni grises), **material de pared** (fibras, tejido esponjoso, mucosa con vellosidades, hueso poroso, músculo), **brotes** (lo que cuelga de techos y paredes), paisaje sonoro y enemigos propios (`src/data/biomes.js`).

| Bioma | Familia de color | Fondo lejano | Plano medio (animado) | Brotes |
|---|---|---|---|---|
| Nervioso | violeta y magenta | tejido con neuronas estrelladas, glía y axones mielinizados | neuronas con impulsos que recorren las dendritas y destellan en el soma | fibras nerviosas con bulbos sinápticos, vainas de mielina |
| Pulmonar | turquesa y verde agua, acentos coral | racimos de alvéolos con capilares coral y esporas | árbol bronquial anillado con racimos de alvéolos que respira; esporas a la deriva | sacos alveolares, penachos de cilios |
| Digestivo | ámbar, mostaza y oliva; bilis verde-amarilla | bosque de vellosidades, criptas y gotas de bilis | asa de intestino con la onda peristáltica que la recorre; burbujas de bilis que suben | vellosidades colgantes, poros que gotean bilis |
| Hueso | sepia, marfil y sangre reseca | hueso esponjoso de poros redondos, costillas, campos de espolones y vasos resecos | arcos de costillas y una columna con la médula que fluye por dentro; polvo de hueso en suspensión | espolones con muñones de costilla y cuerdas |
| Corazón | carmesí y escarlata | miocardio estriado con discos intercalares y grasa | trabéculas que laten con el corazón y cuerdas tendinosas; glóbulos rojos que fluyen | cuerdas tendinosas |

Profundidad: **fondo lejano** (parallax 0.3, `src/factory/Backdrop.js`: una textura de
tejido de 256 px que se repite sin costuras), **plano medio** con estructuras gigantes
animadas y **plano frontal** de siluetas teñidas del bioma (`src/core/Scenery.js`). La
**luz ambiente** de cada bioma (`ambient`) deja ver la carne sin el ojo, con un tinte
suave de su familia, pero en penumbra: lo que revela el haz contrasta y se ve vivo (un tinte fuerte apagaría los acentos de color complementario); con el
ojo sin energía, la penumbra se cierra a la mitad. La penumbra es honda a propósito: lo bello y vivo del mundo está detrás de ella, y solo el ojo lo enseña. Las criaturas sin alumbrar se
camuflan con un tono hondo de su bioma (`camo`).
La colisión es de tiles, pero el dibujo no: una **silueta orgánica** (la máscara de paredes
desenfocada y cortada por la mitad) redondea las esquinas salientes, rellena los
rincones y afila las puntas de las repisas, con un contorno continuo. El interior de las
paredes es **carne maciza** (`paintMasses`): se oscurece con la profundidad sin perder el
color de su zona, con vetas, grasa y venas de ruido suave. En los bordes brotan
dendritas, cilios, vellosidades y pliegues, y sus venas laten al ritmo del bioma. Los Nodos Seguros son úteros vivos (`src/entities/Womb.js`).

| Bioma | Salas | Brotes | Enemigos | Sonido |
|---|---|---|---|---|
| Sistema Nervioso | A, A2 Ganglio Basal, A3 Médula Espinal, A4 Plexo Sacro, *A5 Cisura Olvidada*, A6 Fibra Nerviosa, A7 Cauda Equina | fibras nerviosas y sinapsis | Reptante, Neurona Errante, Enjambre Sináptico, Ojo de Techo | silencio con chasquidos sinápticos aleatorios |
| Cavidad Pulmonar | B, B2 Bronquiolos, B3 Alvéolo Central, B4 Diafragma, B5 Tráquea Superior, *B6 Saco Alveolar Olvidado*, T1 Conducto Torácico, B7 Hilio Pulmonar, T2 Cisterna del Quilo | alvéolos y cilios | Saco Esporífero, Fauce Colgante (planta que cae del techo), Colonia Bacilar | respiración y un arpegio siniestro |
| Sistema Digestivo | C, C2 Fundus Gástrico, C3 Intestino Delgado, C4 Cloaca, C5 Vesícula Biliar, *C6 Divertículo*, C7 Duodeno, *C8 Ampolla Rectal*, C9 Colon Sigmoide | vellosidades y poros de bilis | Ciervo Acorazado, Vestigio, Anguila Ácida; cubetas de ácido, bocas que escupen, goteras y salas que se inundan | peristalsis que gorgotea y fluidos |
| Territorio del Hueso | O1 Foramen Óseo, O2 Caja Torácica, O3 Médula Roja, O4 Osario, *O5 Fémur Hueco*, O6 Canal de Havers, O7 Cartílago Articular, *O8 Cámara de los Osteoclastos* | espolones y muñones de costilla | Escarabajo Rinoceronte, Vestigio, Reptante; empalizadas de hueso | un osario con viento: huesos huecos que silban (a veces dos notas en tritono), campanillas de hueso, crujidos lentos, médula que gotea y, de tarde en tarde, dos golpes enormes desde lo hondo |
| El Corazón | D (prueba final: ácido, membrana, pared, anclaje y sello) | — | Vestigios | latido |

### Diseño de salas: coherencia espacial

El mapa es una rejilla de celdas de **16x14 tiles**: cada sala ocupa un rectángulo entero de
celdas (`map` en `data/levels.js`) y sus huecos coinciden con los de la sala vecina, así
que lo que ves en el minimapa es lo que hay (un pozo del techo da justo al suelo de la sala
de encima). Las salas varían mucho de altura (cuevas bajas, catedrales verticales, canales
que serpentean) y no hay muros flotantes: la carne son masas unidas al suelo, al techo o a
las paredes (terrazas, lenguas que se afinan hacia la punta, estalactitas, vértebras), y
cada repisa está ahí para algo (subir, esconder, cerrar con una mutación).

Rediseñado así el **Sistema Nervioso**: A (cueva baja del despertar), A2 (catedral vertical
de tres celdas), A3 (médula de cinco celdas que serpentea entre vértebras), A4 (arena en
dos alturas a la que se entra desde un saliente), A5, A6 y A7. Las salas se tallan con un
kit de modelado (perfiles de techo y suelo, masas, lenguas) y se comprueban con la física
real (`tools/reach.mjs`, que acepta una cuadrícula en borrador). Los demás biomas siguen.

### Capítulos: un bioma cada vez

El mundo se recorre por bloques. Cada bioma se explora entero antes de pasar al
siguiente, y solo hay tres pasos entre biomas:

| Capítulo | Salas | Se sale por | Requiere |
|---|---|---|---|
| 1. Sistema Nervioso | A → A2 → A3 → A4 | membrana agrietada de A4 → B2 | vencer al Ganglio Madre (Pistones) |
| 2. Cavidad Pulmonar | B2 → B3 → B4, y B por el pozo desde B2; B5 por la pared colgante de B | bloque trepable de B → C | Garras (Matriarca Esfinge) |
| 3. Sistema Digestivo | C → C2 → C3 → C4, y C5 desde C3 | abismo de C → D | Tendón (Glándula Gástrica) para los sellos del techo |
| 4. El Corazón | D | — | Garras, Tendón y **todas las líneas de órganos a nivel I** (el sello del Corazón no reconoce un cuerpo incompleto) |

### Barreras dentro de cada capítulo

| Paso | Requiere |
|---|---|
| A → A2 (grieta del techo) | doble salto (Alveolos, en la propia sala A) |
| B2 (lago de ácido) | Quitina I (o aguantar el daño) |
| B2 → B (pozo) | doble salto |
| B3 → B4 (membrana agrietada) | Embestida o Cañón II |
| B4 (abismo del diafragma) | Garras: tres pilares de hueso que se trepan; en lo alto del central, los Alveolos Hipertrofiados |
| B → C (bloque alto) y B → B5 (pared colgante bajo el pozo del techo) | Garras |
| B5 (gran abismo) | Tendón con balanceo y suelta, o doble salto + embestida |
| C → C2 (hueco del techo) | Garras para subir y Tendón para desgarrar el sello |
| C3 → C5 (conducto del techo) | Garras (pilar trepable) y Tendón para el sello |
| C5 (pozo que se inunda) | subir más rápido que la bilis |
| D (el Corazón, tras un sello en lo alto) | Garras para la pared, Tendón para el anclaje y el sello |

### Territorio del Hueso

Detrás de la Médula Espinal (A3), una membrana agrietada en su costado izquierdo
(Embestida o Cañón II) se abre a la región que la médula sostiene por detrás: hueso
compacto y esponjoso, costillas y espolones. Es una rama opcional, para explorar a
la vuelta, con ocho salas repartidas para que nada quede amontonado. Se entra ya con
doble salto y Embestida; lo más hondo se abre al volver con Garras, Tendón y Ojo II:

| Sala | Qué es | Qué guarda |
|---|---|---|
| O1 Foramen Óseo | Pasillo de entrada con una joroba de hueso y una repisa alta (doble salto) | Fragmento en la repisa, hueso, un rinoceronte y un Vestigio |
| O2 Caja Torácica | Cavidad vertical: las costillas, alternas, son escalones | Nicho alto con tejido sano, batería en la repisa de la salida a O3, dos fragmentos y biomasa abajo |
| O3 Médula Roja | Hueso esponjoso con trabéculas y espolones en el suelo; dos rinocerontes | Un quiste en lo alto, solo con Garras; fragmento entre trabéculas |
| O4 Osario | Galería larga de restos con un altar de huesos | **Timo Necrótico** en el altar; la pared del fondo suena hueca |
| *O5 Fémur Hueco* | Cavidad secreta dentro de un fémur (pared falsa de O4: la luz la delata) | Dos fragmentos, tejido sano, biomasa y hueso |
| O6 Canal de Havers | Túnel largo bajo el Osario: se cae por el agujero del suelo de O2 (se vuelve a subir con doble salto). Dos membranas que pide la **Embestida**, una zanja de espolones, un abismo y un techo falso (**luz**) | Fragmento en el hueco alto, otro en el fondo de la zanja, batería sobre el abismo, tejido sano tras el techo falso, hueso oculto |
| O7 Cartílago Articular | Articulación vertical: escalera de repisas hacia abajo (doble salto); una chimenea lisa que solo se sube con **Garras** (con tramos de mucosa: hay que cambiar de pared); un sello (**Tendón**); arriba, un abismo que se cruza con los **anclajes** (Tendón) | Fragmento y hueso en lo alto de la chimenea, quiste tras el sello, fragmento y tejido sano al otro lado del abismo |
| *O8 Cámara de los Osteoclastos* | Secreta: membrana fotosensible de la repisa alta de O3 (**Garras** para llegar, **Ojo II** para abrirla). Repisas en zigzag sobre lagunas de espolones | **Timo Necrótico** oculto (solo lo enseña el haz), dos fragmentos, tejido sano, batería |

En el Foramen Óseo (O1) hay además una **muestra de reserva de los Alveolos** (doble salto): solo aparece si aún no los tienes (ni asimilados ni latentes), para que nadie se quede encerrado en el hueso. Cualquier muestra de ADN de una mutación que ya llevas deja de aparecer (EntityFactory).

Los fragmentos fijos del hueso son sobre todo **óseos** (Cañón) y **dérmicos**.

### Cavidades secretas

| Cavidad | Acceso | Recorrido | Qué guarda |
|---|---|---|---|
| A5 Cisura Olvidada | Sello (Y) de la Médula (A3): Tendón | Cortina fotosensible (luz) → sima oscura que se cruza balanceándose de dos sinapsis → islote para coger carrerilla y embestir la membrana del ganglio | Fragmento oculto en la repisa del ganglio, batería oculta sobre la sima y, en el pozo de encima, un quiste que solo se alcanza con Garras (al volver) |
| B6 Saco Alveolar Olvidado | Sello del techo de la Tráquea (B5) | Pulmón vertical: jardín de esporas → repisa → cadena de anclajes con una fauce acechando → sello del bronquiolo terminal → septo fotosensible | Dos fragmentos, batería oculta, tejido sano |
| C6 Divertículo | Pozo bajo la Cloaca (C4) | Saco que se inunda a ritmo: repisas de cartílago en escalera antes de que suba el ácido (gratis con Quitina I), boca lateral, repisa larga con una boca que escupe y un Vestigio → embestir la pared agrietada de la cámara | Timo Necrótico, hueso, tejido oculto |

**Fibra Nerviosa (A6):** un pasadizo largo, de cámaras anchas y túneles de mielina,
que corre sobre el Ganglio Basal con tres accesos: un techo falso de A2 (la luz lo
delata), una membrana fotosensible en el techo de A3 y, al fondo y tras un sello
(Tendón), una sima de un solo sentido que cae a la Tráquea (B5): un atajo de vuelta
entre biomas. La primera parte (y su fragmento) se explora en el capítulo 1; lo
profundo, al volver con el Tendón.
### La red profunda y los mecanismos vivos

Bajo los dos primeros sistemas corre un conducto linfático que los une por debajo: un
atajo de vuelta, lleno de guaridas, que se explora a trozos según las mutaciones que
lleves (backtracking). Y a la derecha del Digestivo, una poza de mucosa y una ampolla de ácido.

| Sala | Acceso | Recorrido | Qué guarda |
|---|---|---|---|
| A7 Cauda Equina | Rincón al pie de la Médula (A3), tras una membrana agrietada (Embestida) y un pozo | Dos galerías entre raíces nerviosas. Un **ganglio reflejo** en la galería alta abre durante 8 s una compuerta-esfínter al fondo de la galería baja: corre, déjate caer por la brecha y cruza (escalón, túnel bajo, púas) a tiempo; la Embestida da margen | Fragmento tras la compuerta, batería oculta en la galería alta |
| T1 Conducto Torácico | Desde A7 o desde B7 | Tubo estrecho que late → membrana agrietada (Embestida) → ganglio linfático con un pozo de linfa ácida y dos anclajes (Tendón, o aguantar el ácido) → arteria con un ramal hacia un nicho fotosensible (luz) → cámara con un sello lateral (Tendón) | Quiste en lo alto del ganglio (Garras), fragmento tras la membrana fotosensible, tejido sano y batería tras el sello |
| B7 Hilio Pulmonar | Pozo en el suelo del Diafragma (B4) o desde T1 | Tres **sacos vitelinos** cuelgan del techo y laten por turnos mostrando un orden. Reventarlos en ese orden abre la guarida; uno equivocado y se vuelven a hinchar todos | Quiste y hueso |
| C7 Duodeno | Boca alta en la pared derecha de la Cloaca (C4) | Una poza de **mucosa resbaladiza** (las Garras no se agarran). Dispara a la **pústula** del fondo de la galería: la cuba se inunda 11 s y las **balsas de grasa** suben con el ácido. Hay que cruzar saltando de balsa en balsa antes de que vacíe. Si caes al fondo vacío, otra pústula en la pared te saca | Fragmento y hueso en el fondo de la cuba |
| C8 Ampolla Rectal | Agujero del techo de C7 (doble salto desde la repisa) | Ácido estancado sobre una fosa. Un **esfínter hinchado** en la pared del fondo: reviéntalo y evacúa el ácido para siempre (o bucea con la Quitina, que corroe cada vez más) | Timo Necrótico y fragmento en el fondo |

**Mecanismos** (`entities/Puzzles.js`, en `data/levels.js`): compuertas-esfínter que se
recogen hacia arriba (las abiertas a tiempo laten en rojo antes de cerrarse y no se
cierran sobre tu cuerpo), ganglios reflejo, sacos vitelinos en orden, pústulas-válvula
que llenan o vacían una cubeta y balsas que flotan en ella (plataformas que solo se
pisan desde arriba y te llevan). Las pústulas y los sacos se revientan a tiros o a
golpes, y el auto-apuntado los fija si los alumbras. Lo que se abre para siempre queda
abierto.

### Líneas de órganos (builds)

Las mutaciones se organizan en seis **líneas**, una por órgano, con tres niveles cada
una (`LINES` y `MUTATIONS` en `data/mutations.js`). Cada nivel exige el anterior. Hay
dos **fusiones**, mutaciones que beben de dos líneas a la vez:

| Línea | I | II | III |
|---|---|---|---|
| **Cerebro** | Ganglio Cartógrafo (mapa visitado) | Órgano Ecolocador (salas vecinas) | **Tercer Ojo** (**fusión** con el Ojo: secretos en el mapa y viaje entre Nodos; exige Ecolocador y Ojo Pineal) |
| **Ojo** | Ojo Despierto (intuye lo oculto) | Ojo Pineal (revela, disuelve el tejido fotosensible, ahuyenta) | ↑ el Tercer Ojo cuenta como Ojo III |
| **Dermis** | Placas de Quitina (ácido) | Quitina Reforzada (-30% daño) | Dermis Nanocutánea (espinas, infección) |
| **Extremidades** | Pistones (embestida) | Garras de Hueso (trepar) | Tendón Elástico (**fusión** con Torso: exige Garras y Alveolos Hipertrofiados) |
| **Torso** | Alveolos Filtrantes (doble salto) | Alveolos Hipertrofiados (O2 150, saltos baratos) | ↑ el Tendón cuenta como Torso III |
| **Cañón** | Cañón de Astillas | Cañón Simbionte | Escopeta de Esquirlas |

**Sinergias** (desde nivel I en las dos líneas; `SYNERGIES`): Cerebro + Ojo (*Nervio
óptico*: -20% de gasto de luz), Dermis + Extremidades (*Exoesqueleto*: las placas ya no
frenan), Extremidades + Torso (*Fuelle motor*: embestida y saltos de gas -20% de
aliento) y Dermis + Cañón (*Astillas de placa*: +25% de daño de tus disparos). Cada una
calma el rechazo.

**Choques** (`CLASHES`): crecen con el nivel común de las dos líneas (k = el menor):
Dermis + Torso (*Coraza opresiva*: -10% de O2 máximo por k), Dermis + Ojo (*Piel
fotófaga*: +12% de gasto de luz por k) y Cañón + Cerebro (*Hambre doble*: +30% de
hambre por k). Cada nivel de choque acelera el rechazo.

Para terminar el juego basta con tener **todas las líneas a nivel I** (lo exige el
sello del Corazón, `heartSeal` en levels.js). El mutante perfecto, con todo a nivel
III, ocupa 21 de carga: hay que encontrar los Timos y comprar muchos extensores.

### Cómo se consiguen las mutaciones

**Llaves de progreso** (abren caminos; nunca dependen de la suerte):

| Llave | Dónde |
|---|---|
| Cañón de Astillas (Cañón I) | Restos de la cápsula médica, abajo del Ganglio Basal (A2), nada más entrar desde A |
| Alveolos (Torso I, doble salto) | Plataforma alta de A |
| Pistones (Extremidades I, embestida) | Los suelta el jefe **Ganglio Madre** (A4, Plexo Sacro) |
| Garras (Extremidades II, trepar) | Las suelta el jefe **Matriarca Esfinge** (B3, Alvéolo Central) |
| Alveolos Hipertrofiados (Torso II) | En lo alto del pilar central de B4 (Diafragma), con las Garras |
| Tendón (fusión, péndulo) | Lo suelta el jefe **Glándula Gástrica** (C, Esófago); se asimila con Garras y Alveolos Hipertrofiados |

**Fragmentos de ADN** (`*`): cada criatura suelta el fragmento de lo que es (30%;
`frag` en enemies.js): las neuronas, **neural**; los ojos, las fauces, la colonia y la
Matriarca, **ocular**; los sacos, el Ciervo, las anguilas, **dérmico**; los reptantes,
los vestigios y las aberraciones, **óseo**. Los fragmentos fijos del mapa rotan entre
los tipos de su bioma (`fragments` en biomes.js). Con 3 del mismo tipo se completa el
siguiente nivel de su línea:

| Fragmento | Línea que hace crecer |
|---|---|
| neural | Cerebro (I → III) |
| ocular | Ojo (I → III) |
| dérmico | Dermis (I → III) |
| óseo | Cañón (II → III) |

Si la línea ya está completa, cada 3 fragmentos amplían la biomasa máxima (+5). Como
las criaturas vuelven al descansar, cazar a las de un órgano concreto es la forma de
empujar una build.

### Jefes de zona

No reaparecen nunca y todos recompensan: una **memoria** del protagonista (se
lee en el Genoma), su **bioma grabado en el mapa** y algo más:

| Jefe | Sala | Recompensa | Cómo se lucha |
|---|---|---|---|
| Ganglio Madre | A4 | Pistones | Flota a distancia, ráfagas de orbes, invoca neuronas |
| Matriarca Esfinge | B3 | Garras y un fragmento; **la plaga de esporas muere** para siempre | Esfinge de las esporas, mitad polilla y mitad mantis (entities/Moth.js, se dibuja por partes y se gira con muestreo de píxel exacto). Corre por el suelo, las paredes y el techo (recorrido `crawl` en levels.js) y desde el techo deja caer vainas de esporas. Despega, revolotea sacudiendo polvo de las alas y, con los ocelos encendidos, prepara el picado: recula alzando y recogiendo las alas, se pliega de perfil, curva el abdomen para adelantar el aguijón y va girando hacia ti; luego se lanza de perfil con las alas plegadas (infecta). Al lanzarse estira el aguijón como un arpón (asta de hueso con punta barbada, unida por una hebra de tendón). Si falla, se le queda clavado y aletea desesperada: vulnerable al doble. El ritmo es continuo (`MOTH_T` en entities/Enemy.js): encadena dos picados por ciclo, tres enfurecida |
| Glándula Gástrica | C | Tendón; **todas las bocas del Digestivo se sellan** | Una masa cerebral pálida (entities/Gland.js) que cuelga de una bóveda del techo por tubos anillados elásticos. Respira subiendo y bajando, se balancea y te sigue. Sus lóbulos y vesículas se inflan, mastica con una boca vertical de colmillos y los cilios se estiran hacia ti. Se hincha y escupe ácido en abanico; enfurecida, rocía un chorro que barre el suelo. Si estás debajo, se descuelga de golpe estirando los tubos y latiguea con los cilios. Cada pocos segundos se exprime e inunda la arena (sube a las repisas). Solo es vulnerable con la boca abierta |
| **Quimera del Quilo** | T2 Cisterna del Quilo (pozo en el suelo del Conducto Torácico) | Tejido sano y dos fragmentos | Una masa de cuerpos fundidos: cabeza de perro, patas de perro y brazos humanos, patas de dedos y un torso humano en el lomo. Se encabrita y embiste hasta chocar con la pared (queda aturdida), abre la cabeza en pétalos y escupe tentáculos, barre el suelo con un látigo; a media vida se le desprende la cabeza humana como **cabeza-araña** y salta para aplastar levantando ondas. Abierta o aturdida recibe casi el doble |
| **Coro de Carne** | C9 Colon Sigmoide (techo de la galería del Duodeno) | Quiste y dos fragmentos | **Jefe grande: conviene llegar con el Cañón Simbionte y las mejores mutaciones.** Una bestia esbelta de varios cuerpos: tronco segmentado de insecto con protuberancias que laten, patas traseras de saltamontes, patas medias de araña y brazos humanos con garras. Cuatro cabezas cuelgan de cuellos de módulos anillados que se mecen cada uno a su ritmo y se estiran al atacar. Se mueve a tirones (lento y, de pronto, acelera), con espasmos, salta y vuelve a su sitio. Cada cabeza tiene su ataque y solo es vulnerable mientras lo usa: la grande muerde estirando el cuello, la de colmillos vomita **anguilas** que reptan, la de antenas escupe un chorro de ácido y la del hombre canta anillos. Herida, electrifica el suelo (a las repisas) |

**Jefes aberración** (`entities/Aberrations.js`): cuerpos de varias especies fundidos, como
en La Cosa de Carpenter, dibujados por piezas articuladas como el protagonista y con
ataques anunciados al estilo de los jefes de Treasure. El auto-apuntado se fija en una pieza concreta (la cabeza abierta, la mano clavada) con una marca pequeña. Cada uno tiene **música propia**
(`core/BossMusic.js`), sintetizada en el momento, que rompe el silencio de las salas:
al estilo de la Mega Drive (FM de dos operadores, arpegio de onda cuadrada y batería de ruido), lenta y siniestra, con un leitmotiv de cuatro compases que se repite igual para que se quede y un eco fantasma: la Quimera en re menor a 88 ppm (un motivo que gira sobre el semitono La-Sib); el Coro a 76 ppm, un suspiro que baja con melodía de campana y un coro FM. El latido nunca se rompe; solo a veces una nota se tuerce, suena un trino breve o un pitido del chip. Al empezar, el fondo de la zona (zumbido y capas del bioma) se apaga despacio y vuelve al acabar. Arranca al empezar la pelea
y se apaga al morir el jefe o al salir.

**Timos Necróticos** (cada uno, un extensor de tolerancia gratis): B (repisa alta, con
el Tendón), C (sobre los esfínteres, con el Tendón), C3 (pared derecha, con Garras) y
C6 (cavidad secreta).

**Esfínter sellado (`Y`):** pared de músculo anular con un anillo rosado; el Tendón
lo desgarra y queda abierto para siempre.

**HUD orgánico:** arriba a la izquierda, sin barras ni textos. Una placenta ovalada,
unida a un cordón umbilical, contiene una vejiga de fluido viva por parámetro
(`Placenta` en `ui/Bladders.js`): integridad (sangre roja, verde si te infectas), biomasa (rosa carne),
oxígeno, luz (del color de tu ojo) y rechazo (violeta, burbujea más cuanto más sube).
Cada vejiga crece al llenarse y se arruga al vaciarse (su radio es proporcional al contenido), y se empujan entre ellas dentro de
la membrana, así que el espacio de cada una cambia en directo. Con todo al máximo
llenan la placenta; si entre todas no caben, se aprietan a la vez en proporción. La corrupción es un bulto
necrosado que crece y les roba sitio. Las reservas bajas laten y enrojecen la membrana.
Al lado, la bolsa de hueso con su número.

**Nodo Seguro:** cada útero guarda 4 curas (+15 integridad) que se regeneran solas,
una cada 75 s de juego: curar ya no es infinito. Además, **cada útero es distinto**
(`data/nodes.js`): qué ofrece y con qué cobra depende de la zona, para compensar su
escasez. En la zona nerviosa, llena de nódulos, se cobra en hueso; en la pulmonar,
en biomasa. Algunos digieren un recurso en el otro.

| Nodo | Sanar | Ojo (+35 luz) | Supresor (-35 rechazo) | Intercambio |
|---|---|---|---|---|
| A · Útero joven | 15 bio | 4 hueso | — | — |
| A3 · Útero medular | 8 hueso | — | 6 hueso | 6 hueso → +15 bio |
| B · Útero alveolar | 15 bio | 12 bio | 20 bio | — |
| B2 · Útero bronquial | 12 bio | 3 hueso | — | 15 bio → +6 hueso |

El menú es una membrana viva: a la izquierda late el útero con un bulbo por cura (lleno,
gastado o regenerándose). Si una opción no se puede usar, dice por qué (integridad al
máximo, útero vacío, no te alcanza...). Curas y regeneración en `NODE_*` de `state/State.js`.

**Garras de Hueso:** el salto de pared empuja poco (`WALL_KICK`) y, si sigues empujando
hacia el muro, te devuelve a él (`WALL_RETURN*`) para volver a agarrarte aún subiendo:
se puede trepar encadenando saltos en una sola pared. Al clavar las garras el cuerpo da
un tirón contra el muro y salta esquirla; al resbalar quedan arañazos en la pared.

**Tendón Elástico:** la cuerda es el propio tentáculo de la espalda: sale disparado,
se estira desde su raíz con la misma carne y clava su punta (ventosa, o garras si
tienes las Garras) en el anclaje.

**Genoma (I):** el espécimen (tu cuerpo) y tus constantes en vejigas; en el centro, el
árbol genético con el icono del órgano de cada mutación (activa brilla, ADN latente
late, desconocida es una silueta), los fragmentos como hélices y las memorias; a la
derecha, lo señalado en pocas líneas.

**Mapa (M):** un minimapa arriba a la derecha, centrado en ti, con el nombre de la
sala; M lo muestra u oculta sin pausar el juego. Cerebro I dibuja las salas visitadas (y las que graban los jefes);
II añade las vecinas sin visitar; III marca lo que queda por recoger.

**Lo que desvela la luz:** enemigos camuflados, objetos ocultos (`hidden`), membranas
fotosensibles (`f`), **paredes falsas** (`z`: parecen roca pero el haz las atraviesa;
alumbradas medio segundo, o al tocarlas, se delatan para siempre) y **nódulos
óseos** (solo existen y solo revientan bajo el haz). Hay paredes falsas en el techo del
Ganglio Basal (entrada a la Fibra Nerviosa), en la Fundus Gástrico (un suelo hueco) y en
el Alvéolo Central (un escondrijo en la pared).

**Sacos vitelinos** (`sacs` en levels.js, `entities/YolkSac.js`): guardan un objeto
unido por un cordón al jefe de la sala. Se ve dentro, pero no cede hasta que el jefe
muere; entonces se marchita y revienta. Fragmentos del Ganglio Madre (A4) y de la
Matriarca (B3).

**Pasos de habilidad:** dos repisas solo se alcanzan balanceándose del Tendón,
soltándose en lo alto del arco y rematando con el doble salto en la cima del vuelo:
la del sello hacia el Saco Alveolar (Tráquea, B5). `tools/skill-gates.html` comprueba con la física real que son posibles.

**Nódulos óseos:** protuberancias del suelo (`nodules` en levels.js,
`entities/Nodule.js`), una por bioma: bulbo ganglionar, ampolla alveolar, quiste
calcificado erizado de esquirlas, coágulo. Al pisarlos revientan y sueltan hueso
(y, según el bioma, batería, oxígeno, más hueso o biomasa). Vuelven a crecer al
descansar en un Nodo Seguro.
### Gore

`entities/Gore.js`. Cada golpe saca un chorro de fluido hacia donde empuja el impacto;
las gotas manchan suelo y paredes (y escurren por ellas) y las manchas se quedan en la
sala. Al morir, la criatura revienta en **trozos de su propio cuerpo**
(`Gore.shatter` corta su dibujo real en pedazos desgarrados con el borde del corte en
carne viva), más carne suelta: rebotan, ruedan dejando un reguero, se quedan en el
suelo y se pudren a los 14-18 s. **El protagonista también:** al morir, su cuerpo (con
todas sus mutaciones) se parte en unos nueve trozos reconocibles: la cabeza con la
lente, el torso, los miembros. El color
del fluido y de los trozos va en `gore` de cada enemigo (sangre roja, icor violeta de
las neuronas, pus de los sacos, savia de las fauces, ácido de la anguila...).

**Sonido orgánico:** `AudioSys.creature()` es una voz (sierra con vibrato irregular y
aspereza a través de un formante) con tono aleatorio en cada llamada; los golpes son
palmadas húmedas con chapoteo y quejido, las muertes un aullido que se apaga con un
reventón líquido, y los trozos al caer suenan a `splat`.

**Voces:** cada criatura emite sola, cada pocos segundos y si estás a distancia de
oírla, sus propios ruidos (`voice` en enemies.js): gruñidos (`growl`), chasquidos de
mandíbulas o quitina (`click`), crepitar eléctrico de las neuronas (`crackle`),
burbujeo de sacos y ácidos (`bubble`), siseos (`hiss`) y el gemido casi humano del
Vestigio (`moan`). A oscuras se las oye antes de verlas; cuando te han visto, más a menudo.

Cada criatura tiene además una **voz propia** inconfundible (castañeteo del Reptante,
gorjeo eléctrico de la Neurona, zumbido del Enjambre, pitidos de la Célula, chapoteo
del Ojo, inspiración del Saco, dientes de la Fauce, bullir de la Colonia, patitas del
Ciervo, respiración rota del Vestigio, borboteo de la Anguila).

**Volúmenes:** las voces pasan por filtros estrechos que se comen energía; la tabla
`GAIN` de `Audio.js` lo compensa sonido a sonido para que queden a un nivel
comparable al de los disparos. `tools/sound-meter.html?n=nail,growl,...` reproduce
los sonidos indicados y mide su pico y su energía (RMS) para ajustarla.

**Jefes:** cada uno tiene una **presencia** (`sounds.aura`, que suena sola cada `auraPeriod`
segundos mientras estás cerca) y sonidos propios de ataque, invocación, dolor y muerte.
Ganglio Madre: zumbido eléctrico que late y descargas neurales. Matriarca Esfinge:
una respiración enorme al ritmo de sus lóbulos y una tos húmeda. Glándula Gástrica:
rugido de tripas, arcadas y un eructo que anuncia la inundación.

### Patrones de ataque

Ningún enemigo se limita a ir hacia ti en línea recta (`BEHAVIORS` en `entities/Enemy.js`):

| Patrón | Quién | Qué hace |
|---|---|---|
| `stalker` | Reptante | Acecha agazapado; se detiene, tiembla y salta; al caer queda aturdido |
| `darter` | Neurona, Enjambre, Célula | Ronda en círculos; se contrae (aviso) y embiste en línea recta |
| `centaur` | Ciervo Acorazado | Centauro escarabajo erguido (entities/StagBeetle.js), lento y todo coraza: se encabrita, embiste con las mandíbulas (si se clava en una pared queda atascado) y jadea con los **élitros abiertos** (vulnerable); pegado a ti, cierra las mandíbulas. El Tendón le arranca la coraza |
| `rhino` | Escarabajo Rinoceronte | Un escarabajo hecho de esqueleto (entities/RhinoBeetle.js, por piezas: jaula de costillas con púas, pronoto poroso con un cuerno-fémur, cráneo con ojo de ámbar, cuerno en hoz y un brazo humano en medio con el que escarba), pesado y con **coraza frontal**: de frente todo le rebota, por la espalda recibe un 60% más. Al verte escarba el suelo y baja el cuerno; carga, y si te alcanza **te lanza por los aires**. Si choca con una pared se queda clavado (aturdido: todo le hiere); si falla, derrapa y tarda en girarse: es cuando se le ve la espalda |
| `ceilingEye` | Ojo de Techo | Carga, ráfaga de tres y cierra el párpado (**endurecido**) |
| `golem` | Colonia Bacilar | Coloso de bacterias encorvado (entities/Golem.js, por partes con textura de células) que **te imita**: camina hacia ti, te apunta con el brazo, salta cuando saltas y le arde un ojo del color de tu luz; pegado a ti, lanza un puñetazo que se estira. **A distancia** se echa la mano a la espalda, se arranca una bola de células (primero la joroba, luego la barriga) y te la arroja en parábola: el grumo hiere al dar, te persigue a saltos y a los 4 s vuelve a fundirse con el coloso; mientras, la bola que le falta vuelve a crecer (4,5 s) hasta recobrar su forma. Cada 20 de daño suelta un grumo y pierde partes del cuerpo (brazo, huecos en la carne, la cabeza se hunde); al morir se deshace en grumos que saltan y cada grumo en pulpa que corretea |
| `shambler` | Vestigio | Arrastra los pies; latigazo de cabeza y carrera repentina que acaba en zarpazo |
| `leaper` | Anguila Ácida | Salta desde el ácido; a veces hace un amago antes |

**Subdivisión:** el Enjambre suelta Células Desprendidas al ser herido y al morir;
cada Célula se parte en dos más pequeñas antes de deshacerse. Las crías no sueltan
ADN y solo un 35% suelta algo (biomasa, a veces oxígeno o una batería; `OFFSPRING_DROP`
en Enemy.js, o `offspringDrop` por enemigo), y hay un tope de criaturas por sala (`Game.spawnOffspring`).
**Endurecido** (`e.hard`): todo rebota menos el ácido.

### Bestiario

Cada enemigo es una criatura procedural (`src/entities/Creatures.js`) con nombre,
bioma y lore en `src/data/enemies.js`. `tools/bestiary.html` (con el servidor en marcha)
los muestra todos con su lore y cómo atacan (`?pose=accion` los muestra en pleno ataque);
los diseños exportados están en `referencias/bestiario/`. `tools/voices.html` deja escuchar
las voces de cada criatura (llamada, alerta, dolor, ataque, muerte) y el paisaje de cada bioma.

**Voces** (`src/core/Voices.js`): cada criatura tiene una firma reconocible a oscuras y su
quejido al recibir daño, hechos con una garganta sintetizada (curva de entonación,
vocales, gruñido grave y aliento, sin golpes secos): el motivo de tres notas de la
Neurona, el "piu-piu" de la Célula, el "mmm" del Ojo, el "hm-hm-HMMM" de la Colonia, la
berrea del Ciervo, el sollozo del Vestigio, los resoplidos y el traqueteo de costillas
del Rinoceronte... El Reptante conserva sus sonidos de siempre.

Peligros de fluidos por sala (`fluids`, `mouths`, `drips` en `levels.js`):
`src/entities/Hazards.js`.

**Empalizadas de hueso** (`traps`, Territorio del Hueso; `src/entities/Traps.js`): estacas de
hueso astillado que brotan del suelo, del techo o de una pared. Si pisas su tramo, avisan
(tiemblan, sueltan polvo, la junta enrojece y cruje) y medio segundo después brotan: te
ensartan (14) y te lanzan en su dirección, y sus puntas salen despedidas en abanico
(esquirlas de 6). También ensartan a las criaturas que pillen encima. Con `period`
saltan a ritmo (el Osario tiene dos alternas). En O1, O4, O6 y O7.

**Corrientes de aire** (`winds`, Cavidad Pulmonar; `src/entities/Traps.js`): `up` te eleva
(flotas al llegar arriba), `left`/`right` soplan de lado y `swap` cambia de sentido (el
aire arrastra; en el suelo, menos). Se reconocen por vetas y esporas tenues que siguen el
aire, y las que cambian de sentido se oyen soplar. Pocas y con intención: en **B** una
corriente tibia sube por la cavidad de la izquierda hasta el quiste de lo alto; en **B5**
la tráquea respira a bocanadas sobre la sima; en **T1** una columna sube hasta el quiste
encima del bloque.

### Diseñar salas nuevas

`node tools/reach.mjs <sala> <col,fila> [doble] [abierto]` simula con la física
real todos los saltos posibles y dibuja los apoyos alcanzables, las salidas y los
objetos. `abierto` trata las membranas y sellos (X, f, Y) como abiertos. `npm run check`
comprueba además que todo spawn deje sitio a la cabeza y que las salidas laterales
midan al menos 2 tiles de alto. Usa la caja real
del jugador (12x28); no simula trepar ni el Tendón. Úsalo para
comprobar que cada barrera exige exactamente la habilidad prevista.
## Pendiente (siguientes pasos naturales)

- Paredes falsas / alucinaciones al quedarte sin luz.
- Inventario limitado de mutaciones activas.
- Mapa del mundo y guardado en `localStorage`.
- Más salas, jefes y la fase de componentes electrónicos del arte conceptual.
