# FashionDex

GitHub Pages build for Cappuccino Fashion.

Expected repository layout:

```text
/FashionItems.xml
/FashionLevelXp.xml
/langs/Fashion_en.xml
/clothingicons/...
/fashiondex/index.html
/fashiondex/app.js
/fashiondex/style.css
```

Replace the files in `/fashiondex/` with this package and open:

```text
https://ant-spl.github.io/Cappuccino-Fashion/fashiondex/
```


## v5 fix

Wraps app.js in a private scope so browser globals such as `window.top` cannot collide with internal helper names.
