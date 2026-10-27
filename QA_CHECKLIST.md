# Wordbound — Final QA Checklist

Use this checklist before presenting the game or publishing it. A few browser spot checks have been completed, but the items below are not all verified yet.

## Core gameplay
- [ ] Start a new game and complete the opening dialogue.
- [ ] Tap three or more adjacent tiles, then press **Restore Word**.
- [ ] Tap the last selected tile again to submit a valid word.
- [ ] Drag across adjacent tiles and confirm the word submits on release.
- [ ] Type a visible word with the keyboard and press **Enter**.
- [ ] Try an invalid word and confirm it is rejected with feedback.
- [ ] Confirm selected tiles clear after submission and the board refills correctly.
- [ ] Submit two 4+ letter words in a row and confirm the combo multiplier appears.
- [ ] Submit a shorter word and confirm the combo streak resets.

## Menus and settings
- [ ] Open Options and change difficulty; start a fresh level to confirm it applies.
- [ ] Toggle sound and confirm the setting is respected.
- [ ] Use a hint, shuffle, and other available power-ups.
- [ ] Pause and resume a level.
- [ ] Refresh the page and confirm saved progress/settings behave as expected.

## Visual and responsive checks
- [ ] Check the title screen and gameplay at desktop width.
- [ ] Check the board and Restore Word button at phone width.
- [ ] Check the game with reduced motion enabled.
- [ ] Confirm no images, fonts, or styles are missing.
- [x] Confirm the board fits at 280px and 355px viewport widths.
- [x] Confirm keyboard tile selection and word submission work in the browser.

## Publish checks
- [ ] Upload the *contents* of this folder to the repository root (not the ZIP itself).
- [ ] Confirm `index.html` is in the root.
- [ ] Enable GitHub Pages from `main` and `/(root)`.
- [ ] Open the published URL in a private/incognito window and test one level.
- [ ] Form 3 valid words of 4+ letters in a row and confirm the Word Streak celebration appears.
- [ ] Continue to a 5-word streak and confirm the Magic Chain celebration and sound.
- [ ] If practical, reach an 8-word streak and confirm the Word Master celebration.
- [ ] Confirm combo milestone celebrations do not add unintended score bonuses.
