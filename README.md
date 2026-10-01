# Daniel M. Dinakarapandian — personal site

Static digital CV for GitHub Pages. No build step: plain HTML, CSS and JS.

```
index.html            all content (About, Research, Publications, Experience, Honors, Skills, Contact)
assets/css/style.css  styles, with light and dark themes that follow the system setting
assets/js/main.js     hash router (#about, #research, …), which tab opens on which half of the screen
assets/js/fibril.js   WebGL2: the fibril at rest and each section's view of it (cartoon, ball-and-stick with hydrogens, H-bonds)
assets/js/abeta-atoms.js  every atom of one 5OQV subunit incl. hydrogens, plus its β-strand ranges
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

**Navigation**: the name and tabs sit top-centre in front of the PDB 5OQV fibril, which turns slowly
behind them as its Cα backbone (one protofilament gold, the other blue) and fades out toward its ends.
Opening a section splits the screen 50/50: the content on the side of its tab (left of centre opens left,
right of centre opens right) and that section's own view of the structure on the other half, from the
`VIEWS` table in `fibril.js` (top, side, or zoomed into the core, turntable or still). The views draw the
real structure: a cartoon (strands as arrows, coils as tubes), the section's stretch of the Aβ42 sequence
as ball-and-stick with every hydrogen, and the backbone N–H···O=C hydrogen bonds between stacked
subunits as dashes. About is the cross-section (one subunit from each protofilament, as in the paper's
Fig. 2). Without WebGL2 the page falls back to the plain nav with centered overlay panels. On phones the
content is the bottom half.

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
