// Teclas del teclado para las acciones que no son de movimiento básico. Están juntas
// para que un futuro menú de opciones pueda cambiarlas (y guardarlas) en un solo sitio.
export const BINDINGS = {
  cavityUse: ['KeyC'],  // usa el consumible de la cavidad activa
  cavityNext: ['KeyX'], // pasa a la siguiente cavidad
};

// Nombre corto de la primera tecla de una acción, para los textos ("C", "X"...).
export const keyName = (action) => (BINDINGS[action]?.[0] ?? '?').replace(/^Key|^Digit/, '');
