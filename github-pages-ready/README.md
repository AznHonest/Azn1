# Riyadh Coffee Dashboard

Static GitHub Pages dashboard for cleaned and classified Riyadh coffee, roastery, bakery, tea, sweets, chocolate, and donut locations.

## Local Preview

```powershell
python -m http.server 8010
```

Open:

```text
http://127.0.0.1:8010
```

## GitHub Pages Upload

Upload the prepared contents from:

```text
github-pages-ready
```

Required files:

- `index.html`
- `app.js`
- `styles.css`
- `.nojekyll`
- `data/`

The dashboard already includes Google Analytics:

```text
G-51BHDKHK15
```

## Rebuild Data

```powershell
python .\tools\build_data.py
```
