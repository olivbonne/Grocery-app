# Adding a language

Since v2.55 the languages the app speaks are a registry, `LANGS` in `js/i18n.js`. Adding one takes three steps:

1. **Write its table** in `js/i18n.js`, like `FR`: the keys are the English text, the values that language's text.
   Keep every `{placeholder}` exactly as it is in the key.
2. **Add one line to `LANGS`**: `{ code, name, locale, table }` — `code` is the stored choice (`ml_lang`) and the
   page's `lang`, `name` is the button's label (written in that language), `locale` is what dates are formatted with.
3. **Nothing else.** The Settings › Language buttons, the stored choice and the date format all read `LANGS`.

A key missing from a table falls back to English; the v2.45 / v2.55 suites check every table for missing keys and list them.

## What is translated
- The screens and the messages (everything shown through `t()` / `tf()`).
- Category names, through `catLabel`.

## What is NOT translated
- Item names people type, and list names — stored data is never translated.
- The item dictionary used for icons and categories.
- The AI readers' prompts (Smart add, recipes, receipts, aisle signs, cards): they read any language, but answer in
  the list's own words.
- Receipts, and any text sent to the server.
