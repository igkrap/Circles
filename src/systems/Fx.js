export class FloatingText {
  /**
   * @param {Phaser.Scene} scene
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {object} opts
   */
  constructor(scene, x, y, text, opts = {}) {
    const {
      fontSize = 16,
      color = '#ffffff',
      duration = 600,
      rise = 22,
      stroke = '#000000',
      strokeThickness = 3,
      depth = 2600
    } = opts;
    const safeDepth = Number.isFinite(depth) ? depth : 2600;

    this.scene = scene;
    this.textObj = scene.add.text(x, y, text, {
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: `${fontSize}px`,
      color,
      stroke,
      strokeThickness
    }).setOrigin(0.5, 0.5).setDepth(safeDepth);

    scene.tweens.add({
      targets: this.textObj,
      y: y - rise,
      alpha: 0,
      duration,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.textObj.destroy();
      }
    });
  }
}
