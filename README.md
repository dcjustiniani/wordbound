# Wordbound: The Letter Quest (improved build)

Open `index.html` in any modern browser (Chrome, Edge, Firefox), or in VS Code use "Open Folder" and the Live Server extension. No internet needed.

## Folder layout
- `index.html` - page markup
- `css/style.css` - all styling
- `js/game.js` - game code
- `js/words.js` - word lists
- `js/art.js` - image paths
- `assets/img`, `assets/fonts` - art and fonts

## What's new
- **Real magazine art**: the official logo, Aria and Veyra on the title screen, character portraits (Aria, Rowan, Veyra, Lumi) and the Forest, Caverns and Library backdrops, taken from the PDF. The world still fades to grey and regains colour as you restore it.
- **Combo system**: chain words of 4+ letters to build a streak and earn extra moves.
- **Lumens, Shop, Inventory**: earn Lumens from words and levels, buy power-ups, craft Crystal Shuffles from shards. Inventory has Items, Relics, Materials and Key Items tabs like the magazine UI.
- **Relics**: finish an area to earn a permanent perk (Quill of Echoes, Shard of Stillness, Lumi's Lantern, Heart of the Wordwell).
- **Aria levels (XP)** and **15 trophies** with pop-up notifications.
- **Endless Mode** in Lexiconia City with a saved high score.
- **Keyboard play**: select adjacent tiles with the keyboard or type a word and press Enter. Hotkeys: 1/2/3 power-ups, Space = Lumi hint, Esc = clear/pause.
- **Auto submit word** option (from the magazine's settings screen).
- **Effects**: particles and floating letters, praise text for long words, Veyra flash, danger glow before she acts.
- **Cleaner word list**: removed names, brand words and mature words; hints now prefer everyday words.
- **Cleaner word list**: removed names, brand words and mature words; hints now prefer everyday words.

## Team
Justiniani, Dave Cleo G. (Project Manager / Programmer) · Borces, Karylle MJ A. (Programmer) · Ardina, Mark Wayne Z. (UI/UX) · Torres, Jude C. (Audio) · Borres, Kim C. (QA)


## Presentation polish update
This build keeps the core Wordbound design: an adjacent-letter word puzzle, story areas, scoring, progression, Veyra encounters, power-ups, and the Lexiconia setting. The current game uses a 6x6 letter grid.

Additional polish added:
- Animated screen transitions and title-screen entrance effects.
- More tactile letter tiles with hover, selection glow, and word-completion animations.
- Combo/HUD pulse feedback when the player restores words.
- Confetti-style victory particles and a Wordwell restoration celebration.
- Animated “The Wordwell Responds” level-completion banner.
- Smoother chapter, inventory, and level-card hover feedback.
- More noticeable toast feedback.
- Reduced-motion support remains available and respects the existing game option.
- Removed a duplicated opening +50 score event in the word submission flow.

## Accessibility and board update
- New boards use randomized letters rather than guaranteed horizontal seed words. The generator checks that each board still has playable words, including longer options. Words can be formed horizontally, vertically, or diagonally.
- Improved tile contrast, layered lighting, selection feedback and board glow.
- Reduced-motion preferences disable the added board animation.
- The project excludes the uploaded Windows `.venv` directory because the browser game does not need Python.

## Difficulty options (new)
Open **Options → Gameplay** to choose:
- **Casual** — extra moves, extra time, and 7 hints per level.
- **Normal** — balanced default with 5 hints per level.
- **Challenge** — fewer moves, less extra time, 3 hints, and glowing fuse tiles. Include a fuse tile in a word before its countdown reaches zero.

The difficulty selection is saved in your browser and applies when you start the next level. For a clean test, choose a mode and then start or restart a level.

## Hosting on GitHub Pages
Upload the extracted contents of this folder to a repository, making sure `index.html` is in the repository root. In **Settings → Pages**, choose deployment from the `main` branch and `/ (root)`. The game is static HTML/CSS/JavaScript and does not need a backend.


## Final handoff
- `QA_CHECKLIST.md` contains the manual checks to run before presenting the game.
- `DEPLOY_GITHUB_PAGES.md` explains how to publish the static game.
- The page now includes browser description/theme metadata, accessible tile labels and keyboard selection, and modal focus handling.
