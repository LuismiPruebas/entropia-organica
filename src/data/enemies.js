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
    lucifugo: true, // huye del haz del Ojo Pineal
    frag: 'ocular', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Colonia Bacilar',
    biome: 'pulmonar',
    creature: 'colonia',
    gore: { blood: '#8a9a3a', flesh: ['#7a9a50', '#9ab868', '#c8e890'] },
    voice: ['colonySquirm', 'colonySquirm', 'bubble'],
    behavior: 'golem',
    hp: 40, w: 24, h: 42,
    speed: 8, chaseSpeed: 19, pulpSpeed: 62, sight: 200, lightFear: 0.6, darkMult: 1.8,
    punchRange: 42, punchWindup: 0.5, punchDamage: 13, punchCool: 1.8,
    // A distancia se arranca una bola de células y te la arroja; la regenera despacio
    // y el grumo, si sobrevive, vuelve a fundirse con él.
    throwRange: 190, throwWindup: 0.7, throwDamage: 9, throwCool: 3.2, regrowTime: 4.5, rejoinAfter: 4,
    sheds: 'colonia', cellHp: 20, shedGen: 1, // cada 20 de daño suelta un grumo
    contactDamage: 7,
    habits: 'Imita lo que tiene cerca: camina como tú, te apunta con el brazo y salta cuando saltas. Pegado a ti, lanza un puñetazo que se estira. A distancia se arranca una bola de células de la espalda y te la arroja en parábola: el grumo te persigue a saltos y al rato vuelve a fundirse con él, que mientras tanto se regenera hasta recobrar su forma. Cada herida le arranca un grumo; al morir se deshace en grumos que saltan, y cada grumo en pulpa pequeña que corretea.',
    drop: { biomass: 6 },
    sounds: { reveal: 'colonyAlert', die: 'colonyDie', hurt: 'colonyHurt' },
    lore: 'Bacilos que se apiñan hasta formar un cuerpo, y el único cuerpo que conocen es el que tienen delante. Copian tu forma y la exageran: un gigante encorvado, con la cabeza hundida entre los hombros y la luz de tu ojo en la cara. Cuanto más los golpeas, menos se parecen a ti: al final solo queda pulpa que sigue queriendo alcanzarte.',
  },


  // ===================== SISTEMA DIGESTIVO =====================
  acorazado: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Ciervo Acorazado',
    biome: 'digestivo',
    creature: 'ciervo',
    gore: { blood: '#5a0a14', flesh: ['#3e3650', '#262230', '#8a3040', '#c09a62'] },
    voice: ['stagHuff', 'stagBellow', 'stagHuff'],
    behavior: 'centaur',
    hp: 60, w: 26, h: 34,
    speed: 9, chaseSpeed: 16, sight: 140, lightFear: 0.7, darkMult: 1.6,
    armored: true, // la coraza solo cede al Tendón... o con los élitros abiertos (aturdido)
    goreRange: 110, goreSpeed: 125, goreTime: 0.55, goreDamage: 16,
    pinchRange: 30, pinchDamage: 14,
    dazed: 1.3, stuck: 2.2, attackCool: 2.4,
    contactDamage: 10,
    habits: 'Camina erguido, despacio, y casi todo en él es coraza. Se encabrita abriendo las mandíbulas y embiste; si se clava en una pared queda atascado. Tras embestir jadea con los élitros abiertos: dispara a la carne del abdomen. Pegado a ti, cierra las mandíbulas de golpe. El Tendón le arranca la coraza.',
    drop: { biomass: 14 },
    sounds: { reveal: 'stagBellow', attack: 'stagGrunt', die: 'isopodDie', hurt: 'stagGrunt' },
    lore: 'Se cubrió con la quitina de todo lo que digería hasta que las placas fueron su piel, y se irguió para vigilar el estómago como un guardia. Las mandíbulas le crecieron como astas. Solo un tirón de tendón deja ver la carne que todavía tiene debajo.',
  },
  vestigio: {
    frag: 'balistico', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Vestigio',
    biome: 'digestivo',
    creature: 'vestigio',
    gore: { blood: '#8a0a14', flesh: ['#9a7a6a', '#6a5048', '#8a6a5a', '#e8dcc8'] },
    voice: ['vestigioBreath', 'moan', 'vestigioBreath'],
    behavior: 'shambler',
    hp: 50, w: 14, h: 32,
    speed: 12, chaseSpeed: 28, sight: 150,
    reach: 26, swingDamage: 12,
    lurch: 0.4, sprintSpeed: 115, sprintTime: 0.7, sprintCool: 2.8,
    contactDamage: 6,
    habits: 'Arrastra los pies. A media distancia se queda quieto, le da un latigazo la cabeza y arranca en una carrera torpe que acaba en zarpazo.',
    drop: { biomass: 10 },
    sounds: { reveal: 'vestigioAlert', die: 'vestigioDie', hurt: 'vestigioHurt' },
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
    hp: 22, w: 14, h: 14,
    range: 130, feint: 0.4,
    contactDamage: 10,
    habits: 'Bajo el ácido solo se ven sus burbujas. A veces asoma y se hunde: es un amago. El salto de verdad llega justo después.',
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
    light: { color: [0.34, 0.14, 0.3], r: 150 },
    hp: 130, w: 30, h: 30,
    contactDamage: 8,
    crawlSpeed: 150, diveSpeed: 420, stingDamage: 16, exposedBonus: 2,
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
    boss: true,
    exposedOnly: true, // solo vulnerable con la boca abierta
    hp: 120, w: 62, h: 50,
    light: { color: [0.34, 0.2, 0.24], r: 170 },
    contactDamage: 10,
    drop: { dna: 'tendon' },
    reward: {
      revealBiome: 'digestivo',
      flag: 'mouthsSealed',
      lore: ['MEMORIA: EL HAMBRE', 'Recuerdas el comedor del laboratorio. Te daban de comer algo que todavía se movía. "Es para que tu cuerpo aprenda", dijeron. Tu cuerpo aprendió.'],
      text: 'El Sistema Digestivo se cierra: todas sus bocas se sellan.',
    },
    sounds: { reveal: 'glandRumble', aura: 'glandRumble', attack: 'glandRetch', flood: 'glandFlood', hurt: 'glandHurt', die: 'glandDie' },
    auraPeriod: 3.2,
    habits: 'Sube y baja colgada de sus tubos y se balancea. Se hincha y escupe grumos de ácido; enfurecida, rocía un chorro que barre el suelo. Si te pones debajo, se descuelga de golpe y te latiguea con los cilios. Solo se la puede herir con la boca abierta.',
    lore: 'El estómago del organismo, colgado del techo de su propia cavidad por los conductos que lo alimentan. Mastica en vacío lo que ya no le llega. Escupe lo que no puede digerir y, cuando se exprime, inunda la sala de ácido.',
  },
  // ======================= JEFES ABERRACIÓN =======================
  // Cuerpos de distintas especies fundidos en uno. Tienen música propia (`music`,
  // core/BossMusic.js) que suena mientras luchas contra ellos.
  quimera: {
    frag: 'balistico', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Quimera del Quilo',
    biome: 'pulmonar',
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
    biome: 'pulmonar',
    creature: 'cabeza',
    gore: { blood: '#8a0a1a', flesh: ['#d89a80', '#c08068', '#8a2a3c'] },
    voice: ['headScream'],
    behavior: 'stalker',
    hp: 16, w: 16, h: 12,
    speed: 30, chaseSpeed: 75, sight: 220,
    pounceRange: 90, windup: 0.4, leapSpeed: 190, leapV: 240, recover: 0.6, pounceCool: 1.2,
    contactDamage: 7,
    drop: { biomass: 3 },
    fragmentChance: 0,
    sounds: { reveal: 'headScream', windup: 'headScream', lunge: 'stalkerLunge', die: 'eyeDie' },
    habits: 'Corre sobre seis dedos larguísimos. Se agazapa, grita y se abalanza.',
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
  // la espalda, en celdas de carne; cuando revientan, brotan sanguijuelas.
  sapo: {
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Sapo Partero',
    biome: 'digestivo',
    creature: 'sapo',
    gore: { blood: '#6a9a1a', flesh: ['#5a7a2a', '#3a5018', '#c8c070', '#9be06a'] },
    voice: ['toadCroak', 'toadCroak', 'eelGurgle'],
    behavior: 'bossToad',
    boss: true,
    music: 'coro',
    exposedBonus: 1.6, // al caer de un salto queda aturdido y la panza al aire
    hp: 320, w: 64, h: 42,
    light: { color: [0.36, 0.32, 0.42], r: 190 }, // luz cenicienta: que no se confunda con el ácido
    contactDamage: 12,
    leapDamage: 18,   // el topetazo del salto
    biteDamage: 16,   // el bocado a quemarropa (la cabeza sale disparada)
    drop: { biomass: 25, fragments: 2, items: ['thymus'] },
    reward: {
      lore: ['MEMORIA: LA CRIADORA', 'En el laboratorio había una cámara húmeda donde lo criaban todo. Alguien dijo que lo que crecía allí no debía salir nunca. Lo que crecía allí te miraba cuando pasabas por delante del cristal.'],
      text: 'La charca se aquieta. Las crías que quedaban se deshacen en el ácido.',
    },
    sounds: { reveal: 'toadCroak', attack: 'spit', summon: 'choirRetch', hurt: 'toadHurt', die: 'toadDie' },
    auraPeriod: 3,
    habits: 'Se agazapa, tiembla y salta con las patas traseras para toparte: apártate cuando se encoja. Si te tiene pegado, echa la cabeza atrás y la dispara hacia ti con unas fauces enormes. Al caer queda aturdido con la panza al aire, y ahí es cuando más le duele. De vez en cuando le revientan las celdas de la espalda y brotan sanguijuelas. La charca se inunda a ratos: súbete a las repisas.',
    lore: 'Un sapo que el intestino dejó crecer demasiado. Carga a sus crías en la espalda, hundidas en celdas de su propia piel, y las suelta cuando tiene hambre. Salta como si el suelo le quemara... y aquí el suelo quema.',
  },
  larva: {
    lucifugo: true, // huye del haz del Ojo Pineal
    frag: 'dermal', // fragmento de ADN que suelta (data/mutations.js -> FRAGMENTS)
    name: 'Sanguijuela de Charca',
    biome: 'digestivo',
    creature: 'larva',
    gore: { blood: '#4a8a1a', flesh: ['#4a7a2a', '#2a4a18', '#9be06a'] },
    voice: ['eelGurgle'],
    behavior: 'stalker',
    hp: 10, w: 16, h: 10,
    speed: 36, chaseSpeed: 80, sight: 260,
    pounceRange: 70, windup: 0.35, leapSpeed: 170, leapV: 200, recover: 0.6, pounceCool: 1.3,
    contactDamage: 6,
    drop: { biomass: 2 },
    fragmentChance: 0,
    sounds: { reveal: 'eelGurgle', windup: 'eelGurgle', lunge: 'spit', die: 'eelDie', hurt: 'leechHurt' },
    habits: 'Repta ondulando y se abalanza con las fauces abiertas.',
    lore: 'Crías del Sapo Partero: crecen hundidas en las celdas de su espalda y, cuando revientan, se descuelgan a buscar algo caliente que chupar.',
  },
};
