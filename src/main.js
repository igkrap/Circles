import Phaser from 'phaser';

import BootScene from './scenes/BootScene.js';
import PreloadScene from './scenes/PreloadScene.js';
import LobbyScene from './scenes/LobbyScene.js';
import GameScene from './scenes/GameScene.js';
import GameOverScene from './scenes/GameOverScene.js';
import RankingScene from './scenes/RankingScene.js';
import ShopScene from './scenes/ShopScene.js';
import CodexScene from './scenes/CodexScene.js';
import PvpScene from './scenes/PvpScene.js';
import PvpGameOverScene from './scenes/PvpGameOverScene.js';
import { isMobileDevice } from './utils/device.js';

const isMobile = isMobileDevice();

async function tryLockLandscape() {
  if (!isMobile) return;
  const canLock = !!(screen.orientation && screen.orientation.lock);
  if (!canLock) return;
  try {
    await screen.orientation.lock('landscape');
  } catch {
    // Browser policies may block orientation lock unless in fullscreen/user gesture.
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'app',
  width: 1280,
  height: 720,
  backgroundColor: '#0b0f17',
  antialias: true,
  antialiasGL: true,
  pixelArt: false,
  roundPixels: false,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [BootScene, PreloadScene, LobbyScene, ShopScene, CodexScene, PvpScene, GameScene, GameOverScene, PvpGameOverScene, RankingScene]
};

new Phaser.Game(config);

if (isMobile) {
  window.addEventListener('pointerdown', () => {
    tryLockLandscape();
  }, { once: true });
}
