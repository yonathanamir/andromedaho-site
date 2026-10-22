# andromedaho.com

The "Coming Soon" site for **Andromeda, Ho!** by Gadolinium Games, served by GitHub Pages (custom domain in `CNAME`).

- `index.html`: the landing page, an in-game "Incoming Transmission" comm panel with the live sector-transit galaxy and the three faction themes. It is the single source.
- `privacy/index.html`: **generated**. It is the same page with the privacy modal already open, so the full policy is in the static HTML. After any change to `index.html`, run `python tools/build.py`.
- `assets/galaxy.js`: the game's galaxy in WebGL. It ports `Shaders/spiral_galaxy.gdshader`, `SpiralGalaxyVisual` (seed roll, palettes, `ProjectDisc`) and Godot's `RandomNumberGenerator` (pcg32, bit-exact), so a seed gives the same galaxy as the game.
- `assets/site.js`: faction switching, the seed row, and the privacy modal routing (`/privacy/`, `#privacy`, back button). Without JavaScript the page still shows the text and the policy.
- `assets/fonts/`: the game's Tomorrow font (SIL OFL 1.1, see `Tomorrow-OFL.txt`), subset for Latin. The site loads nothing from other domains.

Preview locally: `python -m http.server` in this folder, then open http://localhost:8000/.
