# Phaser Parity Progress

Source of truth: `dodger_py/`
Target: `dodger_js/`

## Milestones

- [x] M1. Core progression skeleton: XP/level-up cards/ability ranks/active slots (no full skill effects yet)
- [x] M2. StageDirector parity: kill-goal stage flow, intermission, wave patterns
- [x] M3. Core actives pass #1: SHOCKWAVE/LASER/GRENADE + cooldown HUD
- [x] M4. Core passives pass #1: ATK/FIRERATE/MOVESPD/SHIELD/XPGain behavior parity
- [x] M5. Remaining actives + synergies
- [x] M6. Miniboss patterns + telegraphs + boss laser behavior
- [x] M7. HUD/pause/settings parity (including mobile UX adjustments)
- [x] M8. Ranking/score persistence + ranking scene

## M1 Results

- Added progression systems:
  - `src/systems/ProgressionSystem.js`
  - `src/data/abilities.js`
  - `src/systems/AbilitySystem.js`
  - `src/systems/LevelUpOverlay.js`
- Integrated in gameplay:
  - XP gain on enemy kill
  - Level-up hard pause overlay with 3 choices
  - Ability rank upgrades with caps and offering rules
  - Active skill auto-slot assignment (1~4)
  - HUD additions: level, XP bar, slot states
- Build status:
  - `npm run build` passed (Vite production build)
  - Note: bundle size warning exists (pre-existing optimization follow-up)

## M2 Results

- Reworked `StageDirector` from time-based to kill-goal flow:
  - stage kill goals
  - 2.2s intermission and stage transition
  - wave patterns (`corners`, `edge_stream`, `ring`, `random`)
  - stage-scaled burst size and wave cadence
- Integrated with `GameScene`:
  - director kill counting on enemy death
  - stage clear callback: heal + pending level-up reward
  - stage HUD now shows kill progress (`stageKills/killGoal`)
  - boss death now advances stage through director API
- Build status:
  - `npm run build` passed
  - chunk size warning remains

## M3 Results

- Added core active skill casting in `GameScene`:
  - Slot hotkeys: `1~4` and numpad `1~4`
  - Implemented: `SHOCKWAVE`, `LASER`, `GRENADE`
  - Other active keys remain non-castable for now (next milestone)
- Added skill cooldown runtime + HUD display:
  - per-skill cooldown timers
  - slot HUD text now shows cooldown seconds while active
- Added basic skill FX + damage application:
  - shockwave ring AoE
  - line laser hit test against segment
  - grenade throw + delayed explosion AoE
- Build status:
  - `npm run build` passed
  - chunk size warning remains

## M4 Results

- Passive behavior parity updates in `GameScene`:
  - Shield regen loop added (delay + interval scaling by shield rank)
  - Shield block now triggers enemy removal through normal kill pipeline
    - grants XP
    - rolls gold drop
    - increments stage kill count
  - HUD shield readout changed to `current/max`
- Existing passive links retained and verified:
  - `ATK` -> base bullet damage scaling
  - `FIRERATE` -> lower fire interval
  - `MOVESPD` -> player speed multiplier
  - `XPGain` -> XP multiplier on enemy kill
- Build status:
  - `npm run build` passed
  - chunk size warning remains

## M5 Results

- Implemented remaining active skills in `GameScene`:
  - `FWD_SLASH`, `DASH`, `SPIN_SLASH`, `CHAIN_LIGHTNING`, `BLIZZARD`, `FIRE_BOLT`
  - slot hotkey casting supports all active keys
- Added ongoing skill effect updates:
  - spin aura ticking damage
  - blizzard AoE tick + temporary slow debuff
  - fire bolt projectile + explosion
- Synergy effects wired:
  - `MECHANIC`: active range multiplier
  - `MAGE`: active cooldown multiplier
  - `SWORDSMAN`: life steal on damage
  - `RANGER`: basic bullet pierce enabled
- Added synergy helpers to `AbilitySystem` and exposed flags in HUD.
- Build status:
  - `npm run build` passed
  - chunk size warning remains

## M6 Results

- StageDirector special spawns added:
  - elite wave injections on stage multiples of 3 (from stage 4+)
  - miniboss spawn events on stage multiples of 5 (with escorts from stage 10+)
- GameScene telegraph systems added:
  - delayed spawn warning circles
  - line telegraphs for dash/laser cues
  - boss laser beam objects with active damage checks
- Boss/miniboss behavior patterns added:
  - phase loop: idle -> dash warn -> dash, idle -> laser warn -> laser
  - dash movement and wall-stop behavior
  - laser beam spawn and player hit handling
- Combat updates for parity:
  - miniboss enemy type support (stats/xp/drop table)
  - contact damage tuned for boss/miniboss (dash vs normal)
  - shield no longer blocks miniboss/boss contact
- Build status:
  - `npm run build` passed
  - chunk size warning remains

## M7 Results

- Added persistent settings system:
  - new `src/systems/SettingsSystem.js` (localStorage-backed)
  - stores: BGM/SFX enabled, BGM/SFX volume, auto-aim
- Added in-game pause/settings overlay in `GameScene`:
  - ESC toggle + mobile-friendly pause button
  - controls: resume, restart, return to lobby
  - toggles: BGM, SFX, Auto Aim
  - volume controls: BGM/SFX +/- with live apply + persistence
- Audio routing now respects settings:
  - `LobbyScene` and `GameOverScene` now read persisted BGM settings
  - `GameScene` SFX playback goes through settings-aware helper
- Auto-aim setting now affects skill/basic firing aim vector selection.
- Build status:
  - `npm run build` passed
  - chunk size warning remains

## M8 Results

- Extended `SaveSystem` with score record persistence:
  - localStorage-backed run records (`getRecords`, `saveRecord`, `getTopRecords`)
  - ranking sort by `totalScore` desc, then `timeSec` desc
- Added `RankingScene`:
  - top records table UI
  - lobby return action
  - scene-level BGM settings respect
- Updated flow integration:
  - `main.js` scene list includes `RankingScene`
  - `LobbyScene` now has explicit `START` and `RANKING` buttons
  - `GameOverScene` now shows run breakdown (level/kills/time/score) and has `RETRY/LOBBY/RANKING` actions
  - `GameScene` now computes score and saves a record on game over
- Build status:
  - `npm run build` passed
  - chunk size warning remains
