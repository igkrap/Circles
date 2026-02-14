import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    // Improve touch responsiveness
    this.input.mouse?.disableContextMenu?.();
    this.input.addPointer(2);

    this.scene.start('Preload');
  }
}
