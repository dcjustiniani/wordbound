# Wordbound: The Letter Quest — Enhanced Build

## New in this build
- Added **Casual, Normal, and Challenge** difficulty options under Options → Gameplay.
- Casual gives more moves, more time, and more Lumi hints.
- Normal keeps the balanced default experience.
- Challenge gives fewer moves and hints, less bonus time, and introduces glowing fuse tiles that must be included in a word before their countdown expires.
- Added pulsing danger feedback to fuse tiles and a clear notification when new fuse tiles appear.
- Added responsive styling for the difficulty picker and small touch screens.
- Updated the How to Play panel to explain difficulty and fuse tiles.

## Existing features retained
- Story chapters, character art, 6×6 adjacent-letter puzzle board, keyboard word entry, hints, shuffle, power-ups, Lumens, shop, inventory, relics, trophies, combos, Endless Mode, sound controls, fullscreen, and reduced-motion support.
- Boards use randomized letters and are checked to retain playable words, including longer options.

## Run
Extract the ZIP and open `index.html` in Chrome, Edge, or Firefox. No server or internet connection is required for local play. For GitHub Pages, upload the extracted project files with `index.html` at the repository root.

## Note
Changing difficulty affects the next level started; restart the current level or start another level to apply it cleanly.


## Final gameplay polish
- Added **tap-to-build word selection**: tap adjacent letters one by one, then press Restore Word or Enter. Drag-to-spell and keyboard typing remain available.
- Added a large Restore Word button for touch screens and players who prefer not to drag.
- Made combo streaks award an actual score bonus (up to a 1.5× multiplier, capped at 20 points per word) instead of displaying a multiplier without applying it.
- Improved touch handling and focus visibility for the main action button.

## Testing note
- JavaScript syntax and archive contents should be checked before release. This build has not been fully playtested across browsers/devices; please test tap selection, drag selection, keyboard input, and challenge mode before presenting.

## Combo celebration polish
- Added special visual celebrations at 3-, 5-, and 8-word streak milestones.
- The 5-word and 8-word milestones trigger stronger screen-flash and sound feedback.
- These are visual/audio rewards only; the existing score multiplier and scoring balance are unchanged.
- Added reduced-motion handling for the combo banner pulse.

## Pre-deployment polish
- Removed guaranteed horizontal seed words so valid words are less immediately obvious.
- Improved keyboard access to letter tiles and focus handling for modal dialogs.
- Enlarged the board while keeping it within narrow phone viewports.
