# FashionDex for GitHub Pages

This is the public/static FashionDex build. It does **not** bundle or fetch `coop_service.py`, `mastery.py`, or any other private server script.

## Expected repository layout

Put these files in your GitHub Pages branch/repo:

```text
/index.html
/app.js
/style.css
/.nojekyll
/FashionItems.xml
/FashionLevelXp.xml
/langs/Fashion_en.xml
/clothingicons/Basic_Clothes_Blackpantfemale.png
/clothingicons/Basic_Clothes_Dancingchefdress.png
/clothingicons/Basic_Clothes_Dancingchefsweater.png
...
```

The app reads XML directly from the repo at runtime:

- `FashionItems.xml` from the repository root.
- `FashionLevelXp.xml` from the repository root.
- `langs/Fashion_en.xml` from the `langs` folder.
- icons from `clothingicons` at the repository root.

## Icon filename fallback order

For a clothing item whose internal key is `Blackpantfemale`, the app tries:

```text
clothingicons/Basic_Clothes_Blackpantfemale.png
clothingicons/Basic_Clothes_Blackpantfemale.webp
clothingicons/Blackpantfemale.png
clothingicons/Blackpantfemale.webp
clothingicons/blackpantfemale.png
clothingicons/blackpantfemale.webp
```

So your existing `Basic_Clothes_...` naming should work.

## Homepage modes

- MyDex
- Full FashionDex
- My Time
- Co-Op Planner
- My Profile
- My Labels

## Notes

- Profile and Label progress are stored only in the browser with `localStorage`.
- Co-Op planning uses the public `clothes="id+amount#..."` requirements from `FashionItems.xml`.
- Label thresholds are planner estimates built into the static app. They are not read from private backend scripts.
- If you open `index.html` directly by double-clicking, XML loading may fail because browsers block `fetch()` for local files. Use GitHub Pages or a local server.
