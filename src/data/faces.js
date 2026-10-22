// Rostros del Anfitrión (entities/Face.js): en cada bioma, un bulbo de carne con cara
// humanoide cosido al sistema. Es la voz del organismo ancestral al que has venido a
// defender... pero mientras el jefe de la zona sigue vivo, lo que habla por esa boca es
// el parásito que lo invade y le suplanta la identidad: te critica, te amenaza y te
// invita a irte. Cuando el jefe cae, el rostro se libera: cambia, se magnifica, te lo
// agradece, abre las membranas selladas de su bioma (casillas 'Z') y te da pistas.
//
// Por bioma:
//   boss     jefe que lo libera (sin jefe, el rostro está libre desde el principio)
//   taunts   lo que dice el parásito (el primero, al verte por primera vez)
//   thanks   lo primero que dice al liberarse
//   opens    al abrir las membranas de su bioma
//   hints    pistas, en orden, cada vez que te acercas después
// En la sala, faces: [{ x, y }] (el centro del rostro) y, si se quiere, boss: 'id'
// para cambiar el jefe que lo libera.

export const FACES = {
  nervioso: {
    boss: 'gangliomadre',
    taunts: [
      'Otro intruso. Mi cuerpo te rechaza: lo sientes en cada injerto, ¿verdad?',
      'No eres un defensor. Eres una infección más, y te expulsaré como a las demás.',
      'Estos nervios me obedecen a mí. Cada impulso te buscará hasta quemarte.',
      'Vuelve por donde viniste. Aquí no queda nada que salvar.',
      'Te miro con mil ojos. Ninguno es tuyo.',
      'Qué cuerpo tan torpe te has cosido. Ni siquiera sabes lo que eres.',
    ],
    thanks: 'El Ganglio Madre calla... y por fin oigo mi propia voz. Gracias, pequeño injerto. Lo que te hablaba no era yo: es lo que crece dentro de mí y se pone mi cara.',
    opens: 'Abro para ti las membranas que el intruso selló en mis nervios. Sigue adelante.',
    hints: [
      'Lo que arrancas a mis criaturas es ADN latente: asimílalo en el útero de un Nodo Seguro y será tuyo.',
      'Mi luz no es solo luz: hay tejidos que solo se abren ante ella, y paredes que no son paredes.',
      'Cada injerto pesa. Si tu cuerpo los rechaza, mis úteros saben calmarlo.',
      'Lo que me parasita está más hondo. Cruza mis pulmones y mis entrañas: allí quedan más pedazos de mí.',
    ],
  },
  pulmonar: {
    boss: 'matriarca',
    taunts: [
      'Respira, intruso. Cada bocanada que tomas aquí es mía, y está envenenada.',
      'Mis esporas ya anidan en ti. Cuando florezcan, serás parte de mi jardín.',
      'Este aire no te pertenece. Vete antes de que se te pudra en el pecho.',
      'Te ahogarás despacio, entre alas y polvo.',
      'Mi Matriarca te ha visto. No necesita más.',
    ],
    thanks: 'Ya no zumban las alas... Respiro. Respiro de verdad. Gracias por arrancarme ese polvo de los pulmones.',
    opens: 'Las membranas que cerraban mis bronquios se retiran. El aire vuelve a correr para ti.',
    hints: [
      'Las membranas agrietadas no resisten una buena embestida. Golpéalas con todo tu cuerpo.',
      'Un tendón bien tenso se agarra a los garfios de hueso... y arranca los esfínteres sellados.',
      'Bajo el agua o el ácido, el aliento se acaba. Los filtros de oxígeno te lo devuelven.',
      'Tus órganos se entienden entre ellos, o se pelean. Mira en el Genoma qué injertos se ayudan.',
    ],
  },
  digestivo: {
    boss: 'glandula',
    taunts: [
      'Bienvenido a mis entrañas. Todo lo que entra aquí acaba digerido.',
      'Huelo tu miedo. Sabe a ácido.',
      'Te disolveré capa a capa, y con lo que quede alimentaré a mis crías.',
      'Lárgate mientras aún tengas piel.',
      'Mi Glándula te espera con la boca abierta. Ve. Entra.',
    ],
    thanks: 'Mi vientre ya no arde contra sí mismo... Gracias. La Glándula me estaba devorando desde dentro.',
    opens: 'Abro las membranas de mis entrañas. Pasa: ya no te digeriré.',
    hints: [
      'La mucosa resbala: no te quedes quieto sobre ella.',
      'Los Timos Necróticos hacen que tu cuerpo olvide pelear: con cada uno, el rechazo te pesa menos.',
      'Si tu reserva de biomasa se queda corta, mis úteros pueden ampliar tu tolerancia con extensores.',
      'Hay quistes que guardan carne de reserva. Búscalos: tu cuerpo podrá almacenar más.',
    ],
  },
  oseo: {
    boss: null,
    taunts: [
      'Mis huesos son una jaula. Y tú ya estás dentro.',
      'Aquí todo cruje. Tú también crujirás.',
      'No hay salida en el hueso, intruso. Solo médula y silencio.',
    ],
    thanks: 'El hueso deja de crujir contra mí... Gracias. Ahora puedo sostenerme otra vez.',
    opens: 'Mis membranas óseas se abren para ti.',
    hints: [
      'Las esquirlas de hueso son munición: los nódulos que rompes vuelven a crecer cuando descansas.',
      'Las empalizadas de hueso tienen ritmo. Espera, mira, pasa.',
      'Lo que no puedes romper, quizá puedas rodearlo trepando.',
    ],
  },
  circulatorio: {
    boss: 'coro',
    taunts: [
      'Mi sangre corre contra ti. Cada latido es una orden de matarte.',
      'Escucha mi Coro. Canta tu nombre... y lo olvida.',
      'Te arrastraré por mis venas hasta que no quede nada que sangrar.',
      'Vete. Mi corazón ya no reconoce a nadie, y menos a ti.',
    ],
    thanks: 'El Coro calla y mi sangre vuelve a ser mía. Gracias. Puedo sentir cómo late de nuevo hacia donde debe.',
    opens: 'Abro las membranas de mis vasos. Deja que mi corriente te lleve.',
    hints: [
      'Mis válvulas y ventrículos se abren y se cierran: aprende su ritmo y no te atraparán.',
      'Una Célula Madre regenera tu tejido un rato; una Perla de Nácar te hace intocable. Llévalas en tus cavidades y úsalas cuando quieras.',
      'El Corazón solo se abre a un cuerpo completo: al menos un injerto de cada órgano.',
    ],
  },
  corazon: {
    boss: null,
    taunts: [
      'Has llegado hasta mi centro. Qué inútil.',
      'Este corazón ya es mío. Lo mío no se devuelve.',
      'Mírate: un parásito más, cosido con pedazos de mis hijos. Somos iguales.',
    ],
    thanks: 'Lo siento... ya no está. Por primera vez desde que llegó, estoy solo en mi cuerpo. Gracias, defensor.',
    opens: 'Mis últimas membranas se abren. Ven a mi centro.',
    hints: [
      'Todo lo que has injertado ahora es parte de mí. Y yo, de ti.',
    ],
  },
};

// Datos del rostro de un bioma (con valores vacíos si no existe).
export function faceData(biome) {
  return FACES[biome] ?? { boss: null, taunts: ['...'], thanks: '...', opens: '', hints: [] };
}
