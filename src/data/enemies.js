// Registro de enemigos (bestiario). `behavior` elige la IA en entities/Enemy.js
// (BEHAVIORS) y `creature` su dibujo procedural en entities/Creatures.js.
// Añadir un monstruo nuevo con una IA y un dibujo existentes = solo una entrada aquí.
//
// Fragmentos de ADN: al morir, cada enemigo normal puede soltar un fragmento del
// bioma de su sala (`fragmentChance`, 0.18 por defecto: Enemy.js FRAGMENT_CHANCE). Los jefes (`boss`) no
// reaparecen nunca y dan su `reward` (ver Game.onBossDefeated).
//
// `biome` y `lore` alimentan el bestiario (tools/bestiary.html -> referencias/).
// `gore`: color de su fluido y de los trozos en que revienta (entities/Gore.js).
// `voice`: sonidos que emite sola mientras vive (gruñidos, chasquidos, crepitar...).

export const ENEMIES = {
  // ======================= SISTEMA NERVIOSO =======================
  acechador: {
    lucifugo: true, // huye del haz del Ojo Pineal
    frag: 'balistico', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Reptante',
    biome: 'nervioso',
    creature: 'reptante',
    gore: { blood: '#7a0a1a', flesh: ['#7a2a34', '#a8424e', '#4a1418', '#d8b48a'] },
    voice: ['stalkerChitter', 'stalkerChitter', 'growl'],
    behavior: 'stalker',
    hp: 30, w: 30, h: 14,
    speed: 22, chaseSpeed: 58, sight: 150,
    pounceRange: 80, windup: 0.5, leapSpeed: 175, leapV: 250, recover: 0.75, pounceCool: 1.4,
    lightFear: 0.35, darkMult: 2,
    contactDamage: 8,
    habits: 'Acecha pegado al suelo. A distancia de salto se detiene, tiembla y se abalanza. Al caer queda aturdido un instante.',
    drop: { biomass: 7 },
    sounds: { reveal: 'screech', windup: 'stalkerWindup', lunge: 'stalkerLunge', die: 'stalkerDie' },
    lore: 'Fue un técnico de mantenimiento. El injerto nervioso le reescribió la médula y ahora camina con seis patas que nunca le crecieron del todo bien: cada rodilla se dobla hacia un lado distinto, como si no recordara cuál era el correcto.',
  },
  neurona: {
    lucifugo: true, // huye del haz del Ojo Pineal
    frag: 'neural', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Neurona Errante',
    biome: 'nervioso',
    creature: 'neurona',
    gore: { blood: '#5a3a9a', flesh: ['#4a3a6a', '#8a6ab8', '#ffd25a'] },
    voice: ['neuronWarble', 'neuronWarble', 'crackle'],
    behavior: 'darter',
    hp: 14, w: 12, h: 12,
    sight: 140, chaseSpeed: 30, lightFear: 0.4, darkMult: 2,
    keep: 50, dashRange: 115, windup: 0.55, dashSpeed: 230, dashTime: 0.45, recover: 0.9, dashCool: 1.8,
    contactDamage: 7,
    habits: 'Te ronda en círculos. Se contrae, brilla y sale disparada en línea recta: apártate del eje.',
    drop: { biomass: 4 },
    sounds: { reveal: 'neuronAlert', die: 'neuronDie', hurt: 'neuronHurt' },
    lore: 'Una célula que se soltó del sistema y aprendió a nadar por el aire. Busca calor y luz para cerrarse sobre ellos, como haría con cualquier otra sinapsis.',
  },
  enjambre: {
    frag: 'neural', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Enjambre Sináptico',
    biome: 'nervioso',
    creature: 'enjambre',
    gore: { blood: '#5a3a9a', flesh: ['#4a3a6a', '#8a6ab8', '#ffd25a', '#e8dcc8'] },
    voice: ['swarmBuzz', 'swarmBuzz', 'crackle'],
    behavior: 'darter',
    hp: 42, w: 26, h: 22,
    sight: 140, chaseSpeed: 22, lightFear: 0.5, darkMult: 1.8,
    keep: 60, dashRange: 120, windup: 0.8, dashSpeed: 170, dashTime: 0.6, recover: 1.2, dashCool: 2.4,
    sheds: 'celula', cellHp: 14, shedGen: 1, // cada 14 de daño suelta una célula viva (que aún se divide una vez)
    contactDamage: 9,
    habits: 'Embiste despacio. Cada herida le arranca una célula que sigue luchando por su cuenta; al morir suelta las últimas.',
    drop: { biomass: 9 },
    sounds: { reveal: 'swarmAlert', die: 'swarmDie', hurt: 'swarmHurt' },
    lore: 'Varias neuronas errantes que se encontraron y decidieron pensar juntas. Orbitan un núcleo con un único ojo. Cada célula que le arrancas la hace más pequeña y más desesperada.',
  },
  celula: {
    lucifugo: true, // huye del haz del Ojo Pineal
    frag: 'neural', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Célula Desprendida',
    biome: 'nervioso',
    creature: 'celula',
    gore: { blood: '#6a4aa8', flesh: ['#5a4a7a', '#8a6ab8'] },
    voice: ['cellChirp'],
    behavior: 'darter',
    hp: 6, w: 9, h: 9,
    sight: 160, chaseSpeed: 42, lightFear: 0.6, darkMult: 1.6,
    keep: 24, dashRange: 90, windup: 0.35, dashSpeed: 210, dashTime: 0.35, recover: 0.6, dashCool: 1.3,
    splitsInto: 'celula', maxGen: 2, // se divide en dos, y esas en dos, hasta agotarse
    contactDamage: 4,
    drop: { biomass: 1 },
    fragmentChance: 0,
    sounds: { reveal: 'flicker', die: 'neuronDie', hurt: 'cellHurt' },
    habits: 'Rápida y frágil. Al morir se divide en dos más pequeñas, que se dividen otra vez, hasta deshacerse.',
    lore: 'Un trozo del enjambre que no aceptó morir. Al partirse se reparte en dos, y otra vez, cada vez más pequeña y más rabiosa, hasta que ya no queda nada que dividir.',
  },
  ojo: {
    infects: true, // su saliva (Sistema Nervioso) infecta; tocar su tejido, también
    frag: 'ocular', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Ojo de Techo',
    biome: 'nervioso',
    creature: 'ojo',
    gore: { blood: '#7a0a1a', flesh: ['#e8dcc8', '#5a1a2a', '#c03028'] },
    voice: ['eyeSquelch'],
    behavior: 'ceilingEye',
    hp: 18, w: 14, h: 16,
    range: 150, fireRate: 2.6, projectileSpeed: 110, projectileDamage: 5,
    shut: 1.4,
    // Lo que escupe según el órgano en que creció (entities/Enemy.js -> eyeVolley).
    ammo: { nervioso: 'spit', pulmonar: 'seed', digestivo: 'tartar', corazon: 'spit' },
    contactDamage: 6,
    habits: 'Carga dilatando el iris y escupe una ráfaga. En los nervios, saliva infectada; en los pulmones, semillas de espora que flotan hacia ti; en el estómago, cálculos de sarro que rebotan. Después cierra el párpado: mientras está cerrado, todo le rebota.',
    drop: { biomass: 5 },
    sounds: { reveal: 'eyeAlert', die: 'eyeDie', hurt: 'eyeHurt' },
    lore: 'Racimos de ojos que el organismo hace crecer en sus techos para vigilarse a sí mismo. Escupen saliva infectada a lo que no reconocen. A ti no te reconocen.',
  },

  // ======================= CAVIDAD PULMONAR =======================
  espora: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Saco Esporífero',
    biome: 'pulmonar',
    creature: 'saco',
    gore: { blood: '#9a9a2a', flesh: ['#7a8a2a', '#5a6a28', '#d8d070'] },
    voice: ['sacInhale', 'bubble'],
    behavior: 'spore',
    hp: 8, w: 13, h: 12,
    trigger: 72, fuse: 0.7, radius: 56, burstDamage: 6, infects: true, // sus esporas infectan
    rotatable: true, // en el editor se gira: suelo, techo o paredes
    contactDamage: 0,
    drop: { biomass: 3 },
    sounds: { reveal: 'spit', die: 'sacDie', hurt: 'sacHurt' },
    lore: 'Un pulmón diminuto que solo sabe hacer una cosa: inspirar hasta reventar. La nube que suelta lleva la misma infección que cubre las paredes de la Cavidad.',
  },
  polinizador: {
    lucifugo: 3, // huye del haz solo con el ojo muy desarrollado (línea del ojo a nivel 3)
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Polinizador',
    biome: 'pulmonar',
    creature: 'polinizador',
    gore: { blood: '#8a0a14', flesh: ['#5a3420', '#7e4c2c', '#7e7638', '#a87458'] },
    voice: ['pollBuzz'],
    behavior: 'pollinator',
    hp: 36, w: 16, h: 18,
    sight: 170, speed: 70, lightFear: 0.75, darkMult: 1.4,
    // Embestida si estás cerca; si no, se pasea por encima de ti soltando vainas de esporas
    // o, a ratos, se lanza en picado.
    ramRange: 64, ramReachY: 40, windup: 0.5, ramSpeed: 235, ramTime: 0.42, recover: 0.75, ramCool: 2.2, ramDamage: 15,
    height: 76, sweep: 46, dropEvery: 1.0, sporeDamage: 7,
    diveChance: 0.55, diveRange: 160, diveTime: 0.65, // a ratos se lanza en picado desde arriba
    meleeResist: 0.6, knockResist: 0.5, // caparazón duro: los golpes le hacen poco y apenas lo mueven
    counterChance: 0.4, counterWindup: 0.22, // golpeado de frente cuerpo a cuerpo, a veces embiste enseguida
    contactDamage: 9,
    habits: 'Vuela alto y se pasea de lado a lado por encima de ti, cagando vainas de esporas que revientan al caer; a ratos, en vez de eso, se lanza en picado. Si te acercas, se encoge alzando las garras y embiste; y si le golpeas de frente, a veces te devuelve la embestida a bocajarro. Aguanta bastante; solo un ojo muy desarrollado le hace huir.',
    drop: { biomass: 10 },
    sounds: { reveal: 'pollBuzz', windup: 'pollScream', ram: 'whip', attack: 'bubble', die: 'pollDie', hurt: 'pollHurt' },
    lore: 'Fumigador de la planta en 1984. Lo bajaron a la Cavidad a sellar los conductos con un traje de goma que no aguantó. Las esporas no lo mataron: le enseñaron a volar. Aún pone cara de disculpa antes de lanzarse contra ti.',
  },
  zancudo: {
    frag: 'ocular', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Zancudo Alveolar',
    biome: 'pulmonar',
    creature: 'zancudo',
    gore: { blood: '#8a0a14', flesh: ['#b04048', '#8a2a32', '#4c2c54', '#d8707a'] },
    voice: ['sacInhale', 'click'],
    behavior: 'inflater',
    hp: 30, w: 14, h: 36,
    sight: 190, speed: 82,
    keepFar: 130, keepNear: 70, // anda rápido hasta quedarse a esa distancia
    inflateTime: 1.1, spines: 5, spread: 0.5, spineSpeed: 330, spineDamage: 6, fireCool: 2.2, recoil: 0.55,
    floatChance: 0.35, hoverH: 34, floatTime: 2.6, // a ratos hincha la cabeza a medias y levita para amenazarte
    contactDamage: 7,
    meleeResist: 0.6, knockResist: 0.5, // los golpes le hacen poco y apenas lo mueven
    counterChance: 0.4, counterInflate: 0.35, // golpeado de frente cuerpo a cuerpo, a veces se hincha de golpe y escupe
    habits: 'Corre sobre sus patas larguísimas y se queda a media distancia. Se agacha e hincha la cabeza de alvéolos hasta ponerla al rojo, y la vacía de golpe: el esfínter del pecho escupe un abanico de espinas. A veces la hincha a medias y levita sobre el suelo, con las patas colgando, para acercarse amenazante y disparar desde arriba. Aguanta bien los golpes, y si le pegas de frente a veces se hincha de golpe y te escupe las espinas a bocajarro.',
    drop: { biomass: 8 },
    sounds: { reveal: 'sacInhale', windup: 'sacInhale', attack: 'spine', die: 'sacDie', hurt: 'sacHurt' },
    lore: 'Los pulmones de la Cavidad aprendieron a andar. Respira por la cabeza y dispara por el pecho; entre una cosa y otra solo hay un tubo y cuatro patas de alambre.',
  },
  hierofante: {
    frag: 'ocular', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Hierofante',
    biome: 'pulmonar',
    creature: 'hierofante',
    gore: { blood: '#2a8a8a', flesh: ['#26302f', '#3c4a48', '#a8823a', '#4af0f0'] },
    voice: ['flicker'],
    behavior: 'mothSpin',
    rotatable: true, // en el editor se gira: pegada al techo o a una pared
    hp: 16, w: 9, h: 9,
    sight: 240, wakeRange: 210, wakeTime: 0.22, faceDist: 64, faceTime: 0.25, seekSpeed: 130, restTime: 1.4,
    spinUp: 0.25, spinSpeed: 175, spinTime: 3.2, spinCool: 1.6, dizzyTime: 1.1, spinDamage: 9,
    contactDamage: 0, // en reposo no hace daño; girando, spinDamage
    habits: 'Descansa pegada a la pared o al techo más cercano con las alas abiertas, como una polilla, y va tomando su color hasta casi confundirse con ella. Si te ve, las pliega como una túnica, se te pone delante y, de pronto, las despliega y gira como una peonza rebotando por la sala. Al parar queda mareada un instante, vuelve a pegarse a una pared y repite.',
    drop: { biomass: 5 },
    sounds: { reveal: 'matSummon', windup: 'whip', spin: 'swing', bounce: 'clack', die: 'sacDie', hurt: 'cellHurt' },
    lore: 'Los mineros del 84 juraban haber visto a un cura en los conductos, con su capucha y su cruz de luz. Nadie bajó a confesarse.',
  },
  fauce: {
    frag: 'ocular', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Fauce Colgante',
    biome: 'pulmonar',
    creature: 'fauce',
    gore: { blood: '#6a8a2a', flesh: ['#5a7a2a', '#8aa040', '#a8424e'] },
    voice: ['podChatter', 'hiss'],
    behavior: 'pod',
    hp: 26, w: 14, h: 12,
    period: 2.6,
    contactDamage: 14,
    drop: { biomass: 6 },
    sounds: { reveal: 'spit', die: 'podDie', hurt: 'podHurt' },
    lore: 'Plantas carnívoras que brotan del techo de los bronquios, colgadas de un tallo de nudos. Abren los pétalos dentados un instante antes de dejarse caer. Lo que atrapan, lo respiran.',
  },
  colonia: {
    frag: 'ocular', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Colonia Bacilar',
    biome: 'digestivo',
    creature: 'colonia',
    gore: { blood: '#8a9a3a', flesh: ['#7a9a50', '#9ab868', '#c8e890'] },
    voice: ['colonySquirm', 'colonySquirm', 'bubble'],
    behavior: 'golem',
    hp: 60, w: 24, h: 42,
    speed: 8, chaseSpeed: 19, pulpSpeed: 62, sight: 200, darkMult: 1.8, // la luz no la frena
    punchRange: 42, punchWindup: 0.5, punchDamage: 13, punchCool: 1.8, counterWindup: 0.22,
    noStagger: true, // los golpes no lo paran: se revuelve con el puño
    // A distancia se arranca una bola de células y te la arroja; la regenera despacio
    // y el grumo, si sobrevive, vuelve a fundirse con él.
    throwRange: 190, throwWindup: 0.7, throwDamage: 9, throwCool: 3.2, regrowTime: 4.5, rejoinAfter: 4,
    // Cada bola que arroja le resta cohesión (y vida): se encoge, se hunde y se le abren
    // huecos. Si un grumo vuelve a fundirse con él, la recupera; sin cohesión se desmorona
    // y queda reducido a un grumo más.
    cohesion: 5, throwCost: 9,
    sheds: 'colonia', cellHp: 25, shedGen: 1, // cada 25 de daño suelta un grumo
    contactDamage: 7,
    habits: 'Imita lo que tiene cerca: camina como tú, te apunta con el brazo y salta cuando saltas. Pegado a ti, lanza un puñetazo que se estira. A distancia se arranca una bola de células de la espalda y te la arroja en parábola: el grumo te persigue a saltos y al rato vuelve a fundirse con él. Cada bola le cuesta cohesión: se encoge, se hunde y se agujerea, y si lanza demasiadas se desmorona y queda en un grumo más. Mata los grumos antes de que vuelvan y se deshará solo. Cada herida le arranca un grumo; al morir se deshace en grumos que saltan, y cada grumo en pulpa pequeña que corretea.',
    drop: { biomass: 6 },
    sounds: { reveal: 'colonyAlert', die: 'colonyDie', hurt: 'colonyHurt' },
    lore: 'Bacilos que se apiñan hasta formar un cuerpo, y el único cuerpo que conocen es el que tienen delante. Copian tu forma y la exageran: un gigante encorvado, con la cabeza hundida entre los hombros y la luz de tu ojo en la cara. Cuanto más los golpeas, menos se parecen a ti: al final solo queda pulpa que sigue queriendo alcanzarte.',
  },


  // ===================== SISTEMA DIGESTIVO =====================
  gloton: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Glotón',
    biome: 'digestivo',
    creature: 'gloton',
    gore: { blood: '#8a7020', flesh: ['#8a4e2c', '#c09a4a', '#c86478', '#efe4cc'] },
    voice: ['growl', 'bubble', 'growl'],
    behavior: 'glutton',
    hp: 140, w: 30, h: 46,
    meleeResist: 0.7, knockResist: 0.15, noStagger: true, // duro: los golpes no lo paran
    speed: 14, chaseSpeed: 26, sight: 220,
    smashRange: 46, smashWindup: 0.5, smashDamage: 20, smashCool: 1.2, counterWindup: 0.28, counterDamage: 26,
    hopRange: [70, 170], hopCool: 3, squatTime: 0.4, hopPower: 270, hopSpeed: 170, backHop: 120, landRange: 42, landDamage: 12,
    contactDamage: 8,
    drop: { biomass: 16 },
    sounds: { reveal: 'growl', attack: 'growl' },
    habits: 'Avanza pesado, a empujones. Pegado a ti alza los dos brazos y descarga un mazazo contra el suelo de delante. A media distancia se agacha en una sentadilla y salta hacia ti: al caer hace temblar el suelo y hiere a quien esté pegado a él. Los golpes no lo paran: si le pegas se revuelve, y a los dos golpes seguidos se gira y te devuelve un mazazo rápido y brutal que te lanza lejos, o se aparta de un salto hacia atrás y cae haciendo temblar el suelo. Los golpes casi no lo mueven y el cuerpo a cuerpo le hace algo menos de daño.',
    lore: 'Lo que el estómago no pudo deshacer se apelmaza y se levanta: huesos, carne, pan, la tarta de un cumpleaños que nadie celebró. Una calavera le corona y por la barriga abierta sigue tragando.',
  },
  acorazado: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Ciervo Acorazado',
    biome: 'oseo',
    creature: 'ciervo',
    gore: { blood: '#5a0a14', flesh: ['#9a94a4', '#5e5868', '#8a3040', '#d4c098'] },
    voice: ['stagChitter', 'stagChitter', 'stagHiss'], // estridula la quitina, sisea
    behavior: 'stagCrawl',     // trepa por suelo, paredes y techo
    rotatable: true, // en el editor se gira: suelo, techo o paredes
    noStagger: true,
    hp: 60, w: 14, h: 14,      // pequeño...
    speed: 15, chaseSpeed: 28, sight: 170, lightFear: 0.7, darkMult: 1.6, // ...y más rápido
    armored: true, // la coraza solo cede del todo al Tendón o con los élitros abiertos (aturdido);
    armorShare: 0.25, provokeHits: 3, // si no, deja pasar 1/4 del daño; 3 aciertos seguidos y se revuelve
    goreRange: 150, goreSpeed: 175, goreTime: 0.5, goreDamage: 16,
    pinchRange: 24, pinchDamage: 14,
    dazed: 1.1, stuck: 1.8, attackCool: 1.8,
    rollSpeed: 150, rollTime: 2.2, rollDamage: 14, // hecho bola: rueda por suelos y paredes
    contactDamage: 10,
    habits: 'Pequeño, rápido y molesto, casi todo coraza. Trepa por cualquier superficie: suelo, paredes y techo. Desde donde esté se encabrita abriendo las mandíbulas y se lanza recto hacia ti; al chocar se agarra a lo que toque, y si se clava queda atascado. Tras embestir jadea con los élitros abiertos: dispara a la carne del abdomen. Pegado a ti, cierra las mandíbulas de golpe. Otras veces se enrolla en una bola de placas y rueda muy deprisa por suelos, paredes y techos, arrollándote; hecho bola todo le rebota, pero al desenrollarse queda un instante vulnerable. Fuera de la bola, la coraza amortigua casi todo pero algo entra; si le aciertas varias veces seguidas se revuelve: te muerde o se hace bola. El Tendón le arranca la coraza.',
    drop: { biomass: 14 },
    sounds: { reveal: 'stagHiss', attack: 'stagHiss', die: 'stagShatter', hurt: 'stagPing' },
    lore: 'Se cubrió con la quitina de todo lo que digería hasta que las placas fueron su piel, y se irguió para vigilar el estómago como un guardia. Las mandíbulas le crecieron como astas. Solo un tirón de tendón deja ver la carne que todavía tiene debajo.',
  },
  relicario: {
    frag: 'balistico', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'El Relicario',
    biome: 'oseo',
    creature: 'relicario',
    gore: { blood: '#8a1a10', flesh: ['#a8906c', '#6e5a42', '#cfb88e', '#ff6a2a'] },
    voice: ['reaperBellow'],
    behavior: 'bossReaper',
    boss: true,
    music: 'coro',
    weakOnly: true,    // solo el núcleo...
    exposedOnly: true, // ...y solo con las costillas abiertas (tras clavar la guadaña)
    hp: 560, w: 100, h: 150,   // duro: hace falta ir sobrado de recursos
    light: { color: [0.5, 0.3, 0.2], r: 230 },
    contactDamage: 0,          // acercarse no duele: duelen sus ataques
    head: 'cabezaRelicario',   // su cabeza de babuino, que se le cae y te persigue
    bonkTime: 3.6,             // caja abierta al caerle encima un racimo de hueso
    requiemEvery: 22, spentTime: 3.4, waveDamage: 20, rainDamage: 14,
    reach: 180,        // hasta dónde llegan sus guadañas desde el centro
    drift: 10,         // se desliza despacio hacia ti
    sweepDamage: 20, slamDamage: 26, geyserDamage: 12,
    stuckTime: 2.2,    // segundos con la guadaña clavada y el núcleo al aire
    drop: { biomass: 40, fragments: 3, items: ['thymus'] },
    reward: {
      lore: ['MEMORIA: EL RELICARIO', 'Te enseñaron una caja de cristal con un corazón dentro que todavía latía. Dijeron que era del primero. Dijeron que algún día el tuyo estaría al lado.'],
      text: 'Las costillas se cierran por última vez sobre un núcleo apagado.',
    },
    sounds: { reveal: 'reaperBellow', attack: 'reaperBellow', hurt: 'reaperCore', die: 'reaperDie' },
    auraPeriod: 3,
    habits: 'El esqueleto colosal de un babuino, agazapado sobre sus piernas, que empuña dos guadañas de mango de hueso. Apenas se mueve: avanza despacio hacia ti. Alza una guadaña temblando y barre el suelo de fuera adentro por tu lado: sáltala. O la alza sobre la cabeza y la clava donde estás: al clavarla el suelo se resquebraja a los lados, la guadaña se queda atascada y se le abren las costillas. Su único punto débil es el núcleo que late dentro, y solo con la caja abierta. Si te alejas, raspa el suelo con la guadaña y una onda de hueso corre hacia ti. Su cabeza, un cráneo de babuino enorme que te sigue con la mirada, va unida al cuello, pero tras unos cuantos ataques se le cae, saca patas de hueso y te persigue a mordiscos un rato; luego vuelve sola a su sitio. Si le tiras encima uno de los racimos de hueso del techo se tambalea con la caja abierta. A ratos entona su Réquiem: siega el suelo desde las paredes, hace llover huesos y clava las dos guadañas a la vez lanzando ondas por el suelo; después queda agotado y abierto. Herido, más deprisa, y a veces clava una guadaña tras otra.',
    lore: 'La caja torácica de algo que fue enorme, y que el parásito no ha dejado morir. Guarda dentro un núcleo que late como un corazón ajeno, y siega todo lo que se acerca a él.',
  },
  // La cabeza del Relicario (la saca su cuerpo, entities/Enemy.js: reaperHead).
  cabezaRelicario: {
    name: 'Testa del Relicario',
    biome: 'oseo',
    creature: 'babuino',
    gore: { blood: '#8a1a10', flesh: ['#d8cfb0', '#a89e80', '#b8402e', '#f6f0dc'] },
    behavior: 'reaperHead',
    alwaysVisible: true,       // parte del jefe: nunca en sombra
    hp: 70, w: 64, h: 50,
    noDeath: true,             // no muere ni se aturde: golpeada, se revuelve
    speed: 115, lungeRange: 72, biteDamage: 18, biteCool: 0.9, chaseTime: 7, knockedTime: 3,
    sounds: { attack: 'boneShriek', hurt: 'boneCrack', scream: 'reaperCore', growl: 'boneRasp' },
    habits: 'Un cráneo de babuino de morro rojizo y colmillos enormes. Va unida al cuello del Relicario y te sigue con la mirada; tras unos cuantos ataques se le cae, saca patas de hueso y te persigue: se agacha, abre las fauces y salta a morderte. En el cuello se gira hacia ti (de perfil, de tres cuartos o de frente), grita y gruñe. Golpearla no la aturde: se revuelve y te muerde. Al rato vuelve corriendo y trepa a su cuello.',
    lore: 'Lo que queda de la cabeza del Relicario no se resigna a ser un adorno.',
  },
  vestigio: {
    frag: 'balistico', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Vestigio',
    biome: 'oseo',
    creature: 'vestigio',
    gore: { blood: '#8a0a14', flesh: ['#9a7a6a', '#6a5048', '#8a6a5a', '#e8dcc8'] },
    voice: ['boneChatter', 'boneRasp', 'boneChatter'], // dientes que castañetean, resuello entre costillas
    behavior: 'shambler',
    hp: 30, w: 16, h: 34,      // frágil: se desmorona enseguida...
    reforms: true,             // ...pero es inmortal: siempre se recompone
    reformTime: 5, reformWarn: 1.4, // segundos en el suelo; los últimos, tiembla y se le enciende el cráneo
    speed: 12, chaseSpeed: 28, sight: 150,
    reach: 30, swingDamage: 14, swingDamage2: 16, // dos estocadas seguidas: pegan fuerte
    swingTime: 0.5, swing2Time: 0.32, chainDelay: 0.08, comboCool: 1.9, // la 2.ª, nada más clavar la 1.ª
    lurch: 0.4, sprintSpeed: 115, sprintTime: 0.7, sprintCool: 2.8,
    contactDamage: 6,
    habits: 'Arrastra los pies apoyándose en sus brazos-estaca. A media distancia se queda quieto, le da un latigazo el cráneo y arranca en una carrera torpe. De cerca echa un brazo atrás y te lo clava, y enseguida el otro: dos estocadas que hacen mucho daño. Se rompe con poco, pero no muere: se desmorona en un montón de huesos y a los pocos segundos tiembla, se le enciende el cráneo y se recompone. Es inmortal: golpear el montón solo retrasa un poco que vuelva a levantarse.',
    drop: { biomass: 10 },
    sounds: { reveal: 'boneShriek', die: 'boneCollapse', hurt: 'boneCrack' },
    lore: 'Lo que el estómago no terminó de digerir. Todavía camina erguido a ratos, todavía tiene un ojo que brilla como el tuyo. Una pierna le creció más larga que la otra mientras esperaba a que alguien viniera a buscarlo.',
  },
  anguila: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Anguila Ácida',
    biome: 'digestivo',
    creature: 'anguila',
    gore: { blood: '#4a8a1a', flesh: ['#4a7a2a', '#2a4a18', '#9be06a'] },
    voice: ['eelGurgle'],
    behavior: 'leaper',
    hp: 32, w: 14, h: 14,
    range: 130, feint: 0.4,
    contactDamage: 10,
    habits: 'Bajo el ácido solo se ven sus burbujas. A veces asoma y se hunde: es un amago. El salto de verdad llega justo después, y puede caer fuera de la charca: entonces repta hacia ti a coletazos y al rato vuelve de un salto al ácido. Si tarda en volver, se seca. Si vacías su cubeta, muere.',
    drop: { biomass: 6 },
    sounds: { reveal: 'spit', die: 'eelDie', hurt: 'eelHurt' },
    lore: 'Un intestino que se desprendió y aprendió a cazar. Vive bajo el ácido gástrico, donde solo delatan sus burbujas, y salta con las fauces abiertas sobre lo que se acerca a la orilla.',
  },

  // ===================== TERRITORIO DEL HUESO =====================
  rinoceronte: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    fragmentChance: 0.3, // conoce la quitina: suelta tejido dérmico más a menudo (era 0.5)
    name: 'Escarabajo Rinoceronte',
    biome: 'oseo',
    creature: 'rhino',
    gore: { blood: '#6a2a14', flesh: ['#5a2a14', '#2a140c', '#a0582a', '#e8dcc0'] },
    voice: ['rhinoSnort', 'rhinoRattle', 'rhinoSnort'],
    behavior: 'rhino',
    hp: 40, w: 34, h: 24,
    speed: 12, chaseSpeed: 20, sight: 150, lightFear: 0.8, darkMult: 1.5,
    frontArmor: true, backBonus: 1.6,
    pawTime: 0.7, chargeSpeed: 165, chargeTime: 1.3, hornDamage: 14,
    stunned: 1.4, brake: 0.6, turnTime: 0.7, attackCool: 2.2,
    contactDamage: 8,
    habits: 'De frente, su coraza lo para todo. Escarba el suelo, baja el cuerno y carga: si te alcanza, te lanza por los aires. Si choca con una pared se queda clavado; si falla, derrapa y tarda en girarse. Dispárale a la espalda.',
    drop: { biomass: 10 },
    sounds: { reveal: 'rhinoBellow', attack: 'rhinoBellow', die: 'rhinoDie', hurt: 'rhinoHurt' },
    lore: 'Los escarabajos del hueso conocen la quitina mejor que nadie: la mastican, la ablandan y la vuelven a endurecer sobre su propio cuerpo, capa sobre capa. El cuerno les crece de marfil robado al esqueleto. Embisten a todo lo que no tiene coraza.',
  },

  // ============================ JEFES ============================
  gangliomadre: {
    frag: 'neural', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Ganglio Madre',
    biome: 'nervioso',
    creature: 'gangliomadre',
    gore: { blood: '#5a3a9a', flesh: ['#5a3a6a', '#8a6ab8', '#ffd25a', '#e8dcc8'] },
    voice: ['crackle', 'moan'],
    behavior: 'bossGanglion',
    boss: true,
    light: { color: [0.18, 0.2, 0.45], r: 170 },
    hp: 100, w: 44, h: 42, // era 30x28 (y 120 de vida)
    weakTo: { spine: 1.25, acid: 1.25 }, // las espinas del simbionte le hieren un poco más
    music: 'ganglio',
    speed: 26,
    contactDamage: 10,
    drop: { biomass: 20, dna: 'pistones' },
    reward: {
      revealBiome: 'nervioso',
      lore: ['MEMORIA: EL PRIMER NERVIO', 'Recuerdas un laboratorio. Cables cosidos a una médula que no era tuya. Alguien dijo: "el sistema aceptará el injerto si le damos un dueño". El dueño eras tú.'],
      text: 'El Sistema Nervioso se aquieta. Su mapa se graba en tu memoria.',
    },
    sounds: { reveal: 'gangZap', aura: 'gangAura', attack: 'gangZap', summon: 'gangSummon', hurt: 'gangHurt', die: 'gangDie', charge: 'gangCharge', blink: 'gangBlink' },
    auraPeriod: 2.2,
    lore: 'La neurona de la que nacieron todas las demás. Sus ramas siguen disparando impulsos hacia ninguna parte. Tiene un ojo en el soma y lleva demasiado tiempo esperando que algo lo mire de vuelta.',
  },
  matriarca: {
    frag: 'ocular', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Matriarca Esfinge',
    biome: 'pulmonar',
    creature: 'matriarca',
    gore: { blood: '#9a9a2a', flesh: ['#3a3040', '#2a2430', '#6a5a68', '#d8c8b0'] },
    voice: ['hiss', 'bubble'],
    behavior: 'bossMoth',
    boss: true,
    music: 'matriarca', // «Red de Niebla»
    light: { color: [0.34, 0.14, 0.3], r: 150 },
    hp: 130, w: 30, h: 30,
    contactDamage: 8,
    crawlSpeed: 150, diveSpeed: 420, stingDamage: 16, exposedBonus: 2,
    meleeResist: 0.5, // los golpes cuerpo a cuerpo le hacen la mitad
    weakTo: { spine: 0.5, splinter: 0.7 }, // aguanta las espinas del simbionte y algo las astillas
    drop: { biomass: 20, fragments: 1, dna: 'garras' },
    reward: {
      revealBiome: 'pulmonar',
      flag: 'sporesCleared',
      lore: ['MEMORIA: RESPIRAR POR DOS', 'El aire de 1984 sabía a metal. Te pusieron una mascarilla y te dijeron que no tuvieras miedo: "los pulmones crecerán solos". Crecieron. Y siguieron creciendo.'],
      text: 'Sin su madre, las esporas de la Cavidad Pulmonar se marchitan para siempre.',
    },
    sounds: { reveal: 'matCough', aura: 'matBreath', attack: 'matCough', summon: 'matSummon', hurt: 'matHurt', die: 'matDie' },
    auraPeriod: 4.8,
    habits: 'Corre por el suelo, las paredes y el techo; si pasas por debajo deja caer vainas de esporas. Luego despega, revolotea sacudiendo polvo de las alas y, cuando se le encienden los ocelos, se lanza en picado con el aguijón. Si falla, se le queda clavado: es el momento. Enfurecida encadena dos picados.',
    lore: 'La madre de cada espora de la Cavidad. Las escamas de sus alas son esporas: cada vez que las sacude, la plaga cae como polvo sobre los bronquios. Se mueve por las paredes como si la gravedad fuera una sugerencia. Mientras viva, la plaga no se detiene.',
  },
  glandula: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Glándula Gástrica',
    biome: 'digestivo',
    creature: 'glandula',
    gore: { blood: '#6aa02a', flesh: ['#7a2f50', '#5e1e3c', '#9be06a', '#e8dcc8'] },
    voice: ['bubble', 'growl'],
    behavior: 'bossGland',
    boss: true, // semijefe: el jefe de la zona es el Sapo Partero
    exposedOnly: true, // solo vulnerable con la boca abierta (y flotando en el ácido)
    hp: 300, w: 62, h: 50,
    meleeResist: 0.4, // el cuerpo a cuerpo apenas la hiere (y la espanta al techo)
    beachedTime: 8,   // varada en el tanque vacío: segundos indefensa
    beachedBonus: 1.6, // y cuánto más le duele (el cuerpo a cuerpo le entra entero)
    light: { color: [0.34, 0.2, 0.24], r: 170 },
    contactDamage: 10,
    lashDamage: 12,  // el latigazo del tentáculo (flotando)
    poolBase: 0.35,  // el ácido que siempre queda en su arena (las anguilas viven en él)
    deflates: true,  // no revienta al morir: se desinfla, habla y se deshace
    headName: 'El que vino antes',
    lastWords: [
      'Ah... Por fin se calla. Hacía tanto que no oía mi propia voz...',
      'Yo también bajé hasta aquí, como tú. Con mis injertos y mi luz, a arrancarle el parásito a este cuerpo.',
      'Llegué hasta el estómago. Él me encontró antes. No me mató: me dejó dentro, digiriendo para él.',
      'Cada gota de ácido que te escupía, te la escupía yo. No podía dejar de hacerlo.',
      'Más abajo está la criadora. Lo que él quiere de este cuerpo nace allí.',
      'Toma lo que me queda. A mí ya no me sirve... No dejes que te haga lo mismo.',
    ],
    drop: { items: ['thymus'] },
    reward: {
      lore: ['MEMORIA: EL HAMBRE', 'Recuerdas el comedor del laboratorio. Te daban de comer algo que todavía se movía. "Es para que tu cuerpo aprenda", dijeron. Tu cuerpo aprendió.'],
      text: 'De la glándula no queda más que un charco.',
    },
    sounds: { reveal: 'glandRumble', aura: 'glandRumble', attack: 'glandRetch', flood: 'glandFlood', hurt: 'glandHurt', die: 'glandDie' },
    auraPeriod: 3.2,
    habits: 'Colgada del techo por sus tubos, escupe grumos de ácido (enfurecida, rocía un chorro) y pare anguilas que caen a la charca; si subes hasta ella, te latiguea con su tentáculo. Si te quedas abajo, baja colgada de sus tubos y se balancea sobre ti como un péndulo, latigueándote una y otra vez. Cada poco se exprime, se le rompen los tubos y cae al ácido, que inunda la sala: flota meneando cilios y tentáculo, se arrastra hacia ti y te latiguea sin descanso. Luego lanza sus flagelos al techo y se iza. Si mientras flota abres los sumideros del fondo (las válvulas de las paredes), el tanque se vacía y se queda varada: unos segundos indefensa, boqueando en el suelo (ni te hace daño al tocarla); ahí sí le entra todo. Aguanta mal el cuerpo a cuerpo: si le pegas, se iza deprisa al techo y te bombardea con ácido. Solo se la puede herir con la boca abierta (y cuando ataca la tiene abierta).',
    lore: 'El estómago del organismo, colgado del techo de su propia cavidad por los conductos que lo alimentan. Pero no siempre fue un estómago: el parásito encontró dentro a alguien que había bajado a buscarlo, y lo puso a digerir.',
  },
  // ======================= JEFES ABERRACIÓN =======================
  // Cuerpos de distintas especies fundidos en uno. Tienen música propia (`music`,
  // core/BossMusic.js) que suena mientras luchas contra ellos.
  quimera: {
    frag: 'balistico', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Quimera del Quilo',
    biome: 'circulatorio',
    creature: 'quimera',
    gore: { blood: '#8a0a1a', flesh: ['#6a4a2a', '#d89a80', '#8a2a3c', '#e8dcc8'] },
    voice: ['chimBark', 'growl', 'headScream'],
    behavior: 'bossChimera',
    boss: true,
    music: 'quimera',
    exposedBonus: 1.8, // con la cabeza abierta o aturdida, recibe casi el doble
    hp: 520, w: 56, h: 34,
    speed: 34, chargeSpeed: 240,
    light: { color: [0.55, 0.15, 0.15], r: 170 },
    contactDamage: 12,
    drop: { biomass: 25, fragments: 2, items: ['tissue'] },
    reward: {
      lore: ['MEMORIA: EL PERRO DEL LABORATORIO', 'Había un perro en la base. Le dábamos las sobras de la cantina. Un día no vino a comer y alguien dijo que lo habían usado para probar la primera cepa. Nadie volvió a nombrarlo. Ahora sé dónde estaba.'],
      text: 'La red linfática se queda en silencio.',
    },
    sounds: { reveal: 'chimHowl', aura: 'chimAura', windup: 'chimBark', lunge: 'chimHowl', bloom: 'chimBloom', attack: 'chimSpit', hurt: 'chimHurt', die: 'chimDie' },
    auraPeriod: 3.5,
    habits: 'Se arrastra sobre patas de perro y brazos humanos. Se encabrita antes de embestir (choca contra la pared y queda aturdida), abre la cabeza en pétalos para escupir tentáculos, barre el suelo con un látigo y, herida, salta para aplastar. Abierta o aturdida recibe el doble.',
    lore: 'Un perro grande, dos hombres y algo con demasiados dedos, fundidos en la cisterna donde desembocaba la linfa del organismo. La cabeza del perro sigue mirando como miraba un perro. Lo demás no.',
  },
  cabeza: {
    lucifugo: true, // huye del haz del Ojo Pineal
    frag: 'neural', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Cabeza-Araña',
    biome: 'digestivo', // también del Sistema Óseo (biomes)
    biomes: ['digestivo', 'oseo'],
    creature: 'cabeza',
    gore: { blood: '#8a0a1a', flesh: ['#d89a80', '#c08068', '#8a2a3c'] },
    voice: ['headScream'],
    behavior: 'stalker',
    hp: 30, w: 16, h: 12,
    speed: 30, chaseSpeed: 75, sight: 220,
    pounceRange: 90, windup: 0.4, leapSpeed: 190, leapV: 240, recover: 0.6, pounceCool: 1.2,
    contactDamage: 7,
    // Su salto muerde (más daño e infecta); a veces se te agarra y te drena biomasa y un
    // poco de vida durante unos segundos.
    bite: 11,
    latch: { chance: 0.4, time: 3, biomass: 3, life: 1.2 },
    drop: { biomass: 3 },
    fragmentChance: 0,
    sounds: { reveal: 'headScream', windup: 'headScream', lunge: 'stalkerLunge', die: 'eyeDie' },
    habits: 'Corre sobre seis dedos larguísimos. Se agazapa, grita y se abalanza: su mordisco infecta. A veces se te queda agarrada al cuerpo y te chupa biomasa y algo de vida durante unos segundos; se suelta si le pegas o si embistes.',
    lore: 'La cabeza de uno de los hombres de la Quimera. Cuando el cuerpo la suelta, no muere: le crecen patas y se va por su cuenta.',
  },
  coro: {
    frag: 'balistico', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Coro de Carne',
    biome: 'circulatorio',
    creature: 'coro',
    gore: { blood: '#9a1020', flesh: ['#d89a80', '#8a2a3c', '#e8dcc8', '#c08068'] },
    voice: ['choirMoan'],
    behavior: 'bossChoir',
    boss: true,
    music: 'coro',
    weakOnly: true, // solo la cabeza que canta (o la mano clavada tras el zarpazo)
    exposedBonus: 1.5, // la cabeza que canta recibe más
    hp: 380, w: 90, h: 64,
    speed: 14, burstSpeed: 170,
    light: { color: [0.6, 0.3, 0.55], r: 230 },
    contactDamage: 10,
    drop: { biomass: 25, fragments: 2, items: ['cyst'] },
    reward: {
      lore: ['MEMORIA: LOS QUE CANTABAN', 'En el laboratorio había otros como tú. Un caballo de carga, el que los vigilaba, los que no aguantaron el injerto. Cantaban para no dormirse. Cuando sellaron la sala, dicen que se les oyó cantar durante tres días.'],
      text: 'El coro se calla. La sangre vuelve a correr sin tropiezos.',
    },
    sounds: { reveal: 'choirScream', aura: 'choirMoan', attack: 'choirSing', sing: 'choirSing', windup: 'choirRetch', vomit: 'choirVomit', summon: 'choirScream', shock: 'choirShock', hurt: 'choirHurt', die: 'choirDie' },
    auraPeriod: 4,
    habits: 'Se mueve a tirones, sacudido por espasmos, y salta como un saltamontes. Cada cabeza tiene su ataque y solo es vulnerable mientras lo usa: la grande estira el cuello y muerde, la de colmillos vomita anguilas, la de antenas escupe un chorro de ácido y la del hombre canta anillos. El resto rebota. Herido, electrifica el suelo: súbete a las repisas.',
    lore: 'Los otros sujetos del injerto, fundidos en una sola bestia en el fondo del intestino: la espalda del que los vigilaba hace de lomo y las cabezas de los demás le cuelgan delante, cada una de algo distinto. Cantan juntas, pero ninguna en la misma nota.',
  },
  // SAPO PARTERO: jefe de la charca de ácido (Colon Sigmoide). Lleva a sus crías en
  // la espalda, en celdas de carne; cuando revientan, brotan renacuajos.
  sapo: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Sapo Partero',
    biome: 'digestivo',
    creature: 'sapo',
    gore: { blood: '#6a9a1a', flesh: ['#5a7a2a', '#3a5018', '#c8c070', '#9be06a'] },
    voice: ['toadCroak', 'toadCroak', 'eelGurgle'],
    behavior: 'bossToad',
    boss: true,
    music: 'sapo', // «Diseased Machine»
    exposedBonus: 1.6, // al caer de un salto (o escaldado) queda con la panza al aire
    armor: 0.25,       // piel curtida y empapada en su charca: casi no le duele... hasta que se la vacías
    dryArmor: 0.32,    // fuera de una cubeta llena, algo menos duro (no mucho)
    weakArmor: 0.5,    // con las tres secas, resentido: le entra más, pero sigue siendo duro
    weakShare: 0.36,   // lo más que pierde cada vez que lo dejas seco (hay que repetirlo unas tres veces)
    meleeResist: 0.5,  // y a golpes, aún menos
    weakTime: 12,      // segundos resentido con las tres cubetas vacías (luego las vejigas le devuelven la bilis)
    scaldStun: 2.0,    // segundos que convulsiona al quedarse sin una gota
    hp: 320, w: 64, h: 42,
    light: { color: [0.36, 0.32, 0.42], r: 190 }, // luz cenicienta: que no se confunda con el ácido
    contactDamage: 12,
    leapDamage: 18,   // el topetazo del salto
    biteDamage: 16,   // el bocado a quemarropa (la cabeza sale disparada)
    rushDamage: 14,   // la embestida a ras de suelo
    biteIframes: 0.5, // tras su mordisco, menos invulnerabilidad (la normal: 0,9 s; ver iframes)
    drop: { dna: 'tendon', biomass: 25, fragments: 2, items: ['thymus'] },
    reward: {
      revealBiome: 'digestivo',
      flag: 'mouthsSealed',
      lore: ['MEMORIA: LA CRIADORA', 'En el laboratorio había una cámara húmeda donde lo criaban todo. Alguien dijo que lo que crecía allí no debía salir nunca. Lo que crecía allí te miraba cuando pasabas por delante del cristal.'],
      text: 'La charca se aquieta y las crías se deshacen en el ácido. El Sistema Digestivo se cierra: todas sus bocas se sellan.',
    },
    sounds: { reveal: 'toadCroak', attack: 'spit', summon: 'choirRetch', hurt: 'toadHurt', die: 'toadDie' },
    auraPeriod: 3,
    habits: 'Nunca está quieto mucho rato. Se agazapa y tiembla (aviso) y salta con las patas traseras para toparte, a veces dos o tres veces seguidas; al caer salpica ácido a los lados y, si te tiene cerca, te muerde al momento. Otras veces se agazapa con la mirada fija y sale disparado a ras de suelo con las fauces abiertas: te arrolla y remata con un mordisco. Si te tiene pegado, echa la cabeza atrás y la dispara hacia ti con unas fauces enormes; y si le encadenas golpes, se revuelve y te muerde enseguida. Si le disparas de lejos, no se queda a recibir: salta hacia ti. Cada poco le revientan las celdas de la espalda y brotan renacuajos que escupen ácido (más cuando está herido). Vive en una charca de bilis partida en tres cubetas, y mientras la tiene su piel curtida casi no siente los golpes. Sobre cada cubeta, en el techo, hay una cámara cerrada, su reflejo, con un esfínter al lado: dispárale y la bilis de la cubeta sube por el caño y llena la cámara. Solo pone huevos dentro de una cubeta llena: vaciarlas le corta los refuerzos. Si le vacías la suya, se queja, sigue peleando algo menos duro y a ratos salta a otra llena. Con las tres vacías convulsiona, pierde sus crías y queda resentido unos segundos (le entra más, pero sigue siendo duro); luego las vejigas se exprimen y le devuelven la bilis. Hay que dejarlo seco varias veces.',
    lore: 'Un sapo que el intestino dejó crecer demasiado. Carga a sus crías en la espalda, hundidas en celdas de su propia piel, y las suelta cuando tiene hambre. Salta como si el suelo le quemara... y aquí el suelo quema.',
  },
  larva: {
    lucifugo: true, // huye del haz del Ojo Pineal
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Renacuajo de Charca',
    biome: 'digestivo',
    creature: 'larva',
    gore: { blood: '#4a8a1a', flesh: ['#5a7a2a', '#2a4a18', '#c8d870'] },
    voice: ['eelGurgle', 'bubble'],
    behavior: 'puffer',
    hp: 32, w: 18, h: 12,
    sight: 260, hopSpeed: 95, hopV: 190,
    // Se hincha y escupe un chorro de ácido a presión (una ráfaga de gotas rápidas).
    spitRange: 150, inflateTime: 0.55, spitTime: 0.5, spitSpeed: 250, spitDamage: 5, recover: 0.5, spitCool: 1.4,
    contactDamage: 6,
    drop: { biomass: 2 },
    fragmentChance: 0,
    sounds: { reveal: 'eelGurgle', windup: 'eelGurgle', lunge: 'spit', die: 'eelDie', hurt: 'leechHurt' },
    habits: 'Avanza a saltos de rana. Cuando te tiene a tiro se hincha (la papada le brilla y tiembla) y escupe un chorro de ácido a presión; luego se deshincha y vuelve a la carga enseguida. Nada en el ácido sin quemarse y escupe desde la superficie; si vacías la cubeta, sigue en tierra. Huye de la luz del Ojo Pineal.',
    lore: 'Crías del Sapo Partero: crecen hundidas en las celdas de su espalda y, cuando revientan, saltan al mundo con la panza llena del mismo ácido que las gestó.',
  },
};
