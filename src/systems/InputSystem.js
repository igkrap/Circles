import Phaser from 'phaser';

export default class InputSystem {
  /**
   * @param {Phaser.Scene} scene
   * @param {{x:number,y:number}} getPlayerPosFn
   */
  constructor(scene, getPlayerPosFn) {
    this.scene = scene;
    this.getPlayerPos = getPlayerPosFn;

    this.keys = scene.input.keyboard.addKeys({
      up: 'W',
      down: 'S',
      left: 'A',
      right: 'D',
      up2: 'UP',
      down2: 'DOWN',
      left2: 'LEFT',
      right2: 'RIGHT',
      fire: 'SPACE'
    });

    this.movePointerId = null;
    this.aimPointerId = null;
    this.moveStart = new Phaser.Math.Vector2();
    this.moveCur = new Phaser.Math.Vector2();
    this.aimStart = new Phaser.Math.Vector2();
    this.aimCur = new Phaser.Math.Vector2();

    this.moveVec = new Phaser.Math.Vector2(0, 0);
    this.aimVec = new Phaser.Math.Vector2(1, 0);
    this.locked = false;
    this.isTouchDevice = !!scene?.sys?.game?.device?.input?.touch;
    this.touchPads = null; // { left:{x,y}, right:{x,y}, radius:number, deadZone:number }

    // Touch controls
    scene.input.on('pointerdown', (p) => {
      if (this.touchPads) {
        const r = this.touchPads.radius * 1.2;
        const inLeft = Phaser.Math.Distance.Between(p.x, p.y, this.touchPads.left.x, this.touchPads.left.y) <= r;
        const inRight = Phaser.Math.Distance.Between(p.x, p.y, this.touchPads.right.x, this.touchPads.right.y) <= r;
        if (inLeft && this.movePointerId === null) {
          this.movePointerId = p.id;
          this.moveStart.set(this.touchPads.left.x, this.touchPads.left.y);
          this.moveCur.set(p.x, p.y);
          return;
        }
        if (inRight && this.aimPointerId === null) {
          this.aimPointerId = p.id;
          this.aimStart.set(this.touchPads.right.x, this.touchPads.right.y);
          this.aimCur.set(p.x, p.y);
          return;
        }
        return;
      }

      const w = scene.scale.width;
      const isLeft = p.x < w * 0.5;
      if (isLeft && this.movePointerId === null) {
        this.movePointerId = p.id;
        this.moveStart.set(p.x, p.y);
        this.moveCur.set(p.x, p.y);
      } else if (!isLeft && this.aimPointerId === null) {
        this.aimPointerId = p.id;
        this.aimStart.set(p.x, p.y);
        this.aimCur.set(p.x, p.y);
      }
    });

    scene.input.on('pointermove', (p) => {
      if (p.id === this.movePointerId) {
        this.moveCur.set(p.x, p.y);
      }
      if (p.id === this.aimPointerId) {
        this.aimCur.set(p.x, p.y);
      }
    });

    scene.input.on('pointerup', (p) => {
      if (p.id === this.movePointerId) {
        this.movePointerId = null;
        this.moveVec.set(0, 0);
      }
      if (p.id === this.aimPointerId) {
        this.aimPointerId = null;
      }
    });
  }

  update() {
    if (this.locked) {
      this.moveVec.set(0, 0);
      return;
    }

    // Movement: touch takes precedence, otherwise keyboard.
    if (this.movePointerId !== null) {
      const v = this.moveCur.clone().subtract(this.moveStart);
      const len = v.length();
      const dead = this.touchPads?.deadZone ?? 6;
      const maxLen = this.touchPads?.radius ?? 60;
      if (len > dead) {
        v.scale(1 / Math.min(len, maxLen));
        this.moveVec.copy(v);
      } else {
        this.moveVec.set(0, 0);
      }
    } else {
      const x = (this.keys.right.isDown || this.keys.right2.isDown ? 1 : 0) - (this.keys.left.isDown || this.keys.left2.isDown ? 1 : 0);
      const y = (this.keys.down.isDown || this.keys.down2.isDown ? 1 : 0) - (this.keys.up.isDown || this.keys.up2.isDown ? 1 : 0);
      this.moveVec.set(x, y);
      if (this.moveVec.lengthSq() > 1) this.moveVec.normalize();
    }

    // Aiming:
    // - Touch device: only right-stick touch updates aim.
    // - Desktop: mouse updates aim when no touch aim pointer is active.
    if (this.aimPointerId !== null) {
      const v = this.aimCur.clone().subtract(this.aimStart);
      const dead = this.touchPads?.deadZone ?? 6;
      if (v.length() > dead) {
        this.aimVec.copy(v.normalize());
      }
    } else if (!this.isTouchDevice) {
      const p = this.scene.input.activePointer;
      const player = this.getPlayerPos();
      const v = new Phaser.Math.Vector2(p.worldX - player.x, p.worldY - player.y);
      if (v.length() > 0.001) this.aimVec.copy(v.normalize());
    }
  }

  getMoveVec() { return this.moveVec; }
  getAimVec() { return this.aimVec; }
  getMovePadState() {
    return {
      active: this.movePointerId !== null,
      start: this.moveStart.clone(),
      cur: this.moveCur.clone(),
      radius: this.touchPads?.radius ?? 60
    };
  }
  getAimPadState() {
    return {
      active: this.aimPointerId !== null,
      start: this.aimStart.clone(),
      cur: this.aimCur.clone(),
      radius: this.touchPads?.radius ?? 60
    };
  }
  setLocked(v) { this.locked = !!v; }
  setTouchPads(cfg) {
    this.touchPads = cfg ? {
      left: new Phaser.Math.Vector2(cfg.left.x, cfg.left.y),
      right: new Phaser.Math.Vector2(cfg.right.x, cfg.right.y),
      radius: cfg.radius ?? 56,
      deadZone: cfg.deadZone ?? 8
    } : null;
    if (this.touchPads) {
      this.moveStart.copy(this.touchPads.left);
      this.aimStart.copy(this.touchPads.right);
      this.moveCur.copy(this.touchPads.left);
      this.aimCur.copy(this.touchPads.right);
    }
  }

  isFiring() {
    if (this.locked) return false;
    // Python reference behavior:
    // - Desktop: hold SPACE to fire, mouse is aim-only.
    // - Mobile: fire while right-aim touch is active.
    if (this.aimPointerId !== null) return true;
    return !!this.keys.fire?.isDown;
  }
}
