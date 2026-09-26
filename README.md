# Daniel M. Dinakarapandian — personal site

Static digital CV for GitHub Pages. No build step: plain HTML, CSS and JS.

```
index.html            all content (About, Research, Publications, Experience, Honors, Skills, Contact)
assets/css/style.css  styles, with light and dark themes that follow the system setting
assets/js/main.js     opens each section as an overlay panel (#about, #research, …)
assets/js/fibril.js   animated background: Aβ42 fibril Cα backbone from PDB 5OQV (canvas)
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
