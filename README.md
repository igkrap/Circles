# Dodger Shooter (Phaser)

This is a Phaser 3 + Vite starter port of the original pygame build.

## Run locally

```bash
npm install
npm run dev
```

Open the URL printed by Vite (default: http://localhost:5173).

## Controls

- Desktop: WASD / Arrow keys to move, mouse to aim.
- Mobile/touch:
  - Left half drag: movement
  - Right half drag: aiming

## Notes

- Audio files are in `public/assets/`.
- Save data uses `localStorage` (persists across runs) for `totalGold`.
- This port currently includes:
  - Stage progression (linear difficulty)
  - Boss every 5 stages
  - Enemy variety from early stages
  - Gold drops + persistent total gold
  - Floating damage numbers

You can extend it with your ability system, synergy, and shop meta later.
