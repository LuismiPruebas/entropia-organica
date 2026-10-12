// Núcleo de Ciclo Vital: paso fijo para la lógica (determinista), render libre.
export class Loop {
  constructor(update, render, step = 1 / 60) {
    this.update = update;
    this.render = render;
    this.step = step;
    this.acc = 0;
    this.last = 0;
  }

  start() {
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  tick = (now) => {
    const dt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.acc += dt;
    while (this.acc >= this.step) {
      this.update(this.step);
      this.acc -= this.step;
    }
    this.render(dt);
    requestAnimationFrame(this.tick);
  };
}
