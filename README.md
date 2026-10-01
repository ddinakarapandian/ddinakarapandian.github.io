# Daniel M. Dinakarapandian — personal site

Static digital CV for GitHub Pages. No build step: plain HTML, CSS and JS.

```
index.html            all content (About, Research, Publications, Experience, Honors, Skills, Contact)
assets/css/style.css  styles, with light and dark themes that follow the system setting
assets/js/main.js     hash router (#about, #research, …) and the leader-line labels on the resting view
assets/js/fibril.js   WebGL2 background: cross-section of the Aβ42 fibril (PDB 5OQV, as in the paper's Fig. 2), still at rest; each section has its own view (top, side, core)
assets/js/abeta-atoms.js  heavy-atom coordinates of one 5OQV subunit (same frame as the Cα trace)
images/og.png         link-preview image (β-sheet emblem)
cv.pdf                the downloadable CV
paravastu-lab/        proposed redesign of the Paravastu Lab website (self-contained page + images)
```

## Editing

- **Content**: edit the matching `<article class="panel" id="...">` in `index.html`.
  Mark your own name in author lists with `<b class="me">…</b>`.
- **New CV**: replace `cv.pdf` with a file of the same name.
- **Emblem**: the β-sheet mark is inline SVG in the hero (`.emblem`); `images/og.png` is its raster copy for link previews.
- **Colors**: change `--accent` and the other tokens at the top of `style.css`.

**Navigation**: the resting view is the fibril cross-section (one subunit from each protofilament, every
heavy atom), as in the paper's Fig. 2. Each section is a callout: an angled line from an amino acid in its
own stretch of the sequence to a short horizontal line with the label on it (placed by `layoutTree` in
`main.js`: a seeded search, so it never moves). Opening one splits the screen 50/50: the content on the
side its label is on, and the structure on the other half, flown to that section's own view (the `VIEWS`
table in `fibril.js`: top, side, or zoomed into the core, turntable or still) with its stretch of the
Aβ42 sequence lit up (equal slices, N → C, in tab order). Without WebGL2 the page falls back to the plain
nav with centered overlay panels. On phones the content is the bottom half.

Preview locally with `python3 -m http.server`, then open http://localhost:8000.

## Publishing

Live at **https://ddinakarapandian.github.io**. GitHub Pages rebuilds from `main` (root)
automatically about a minute after each push.

## Paravastu Lab redesign

`paravastu-lab/index.html` is a proposed redesign of https://sites.gatech.edu/paravastulab/,
live at **https://ddinakarapandian.github.io/paravastu-lab/**. It is one self-contained page;
photos live in `paravastu-lab/images/` (`people/`, `lab/`, and the research figures).
It carries a `noindex` tag and a "proposed redesign" banner so it doesn't compete with the
official site; remove both if the lab adopts it here.
