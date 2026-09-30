# Changing CityCut’s fonts and colours

You do not need to write code. Fonts, font sizes, and the main colours live in one file:

`src/theme.css`

Each line has a name, then a value. Change the value. Leave the name alone, including the two dashes at the start.

```css
--background: #EBEBEB;
```

The name is `--background`. The value is `#EBEBEB`.

## What each setting does

| Name | What you see on screen | Current value |
| --- | --- | --- |
| `--background` | The grey used by the page, the top bar, the area around the map, the 3D view, and the drawing. Change this one and all of those follow, unless you have given one of them its own colour. | `#EBEBEB` |
| `--page-bg` | The page behind the header and the map. | `var(--background)` |
| `--landing-bg` | The top bar on the landing page and on the model. | `var(--background)` |
| `--map-bg` | The colour behind the map while the streets are still loading. | `var(--background)` |
| `--model-bg` | The sky colour of the 3D model. | `var(--background)` |
| `--drawing-bg` | The on-screen site plan and figure-ground. | `var(--background)` |
| `--panel-bg` | Drawers, panels, and cards. | `#FFFCF8` |
| `--panel-border` | The line around panels, cards, inputs, and under the top bar. | `#C8C8C8` |
| `--text` | Main text, icons, and the Create model button. | `#1A1916` |
| `--muted-text` | Notes, credits, and other secondary text. | `#6E685E` |
| `--font-sans` | The font for buttons, labels, and ordinary text. | `"Outfit", "Avenir Next", "Segoe UI", sans-serif` |
| `--font-serif` | The font for the large “Your model is ready” title. | `"Fraunces", "Iowan Old Style", Georgia, serif` |
| `--font-size` | The size of ordinary text. | `15px` |
| `--font-size-brand` | The size of the CityCut name in the top bar. | `18px` |
| `--font-size-drawer` | The size of a drawer title, such as Exports. | `15px` |
| `--font-size-card` | The size of an export card title, such as Site plan. | `16px` |
| `--font-size-stat` | The size of the big numbers in the model summary. | `22px` |
| `--font-size-title` | The size of the large title in the model summary. | `28px` |

`var(--background)` means “use whatever `--background` is set to”. That is why one edit recolours the page, the header, the model, and the drawing together.

Downloaded Illustrator and PNG files do not use these colours. They keep the colours they had before this file existed.

## How to edit it on GitHub

1. Open the CityCut repository on github.com.
2. Click through to the file `src/theme.css`. On github.com the path looks like the repository, then the `src` folder, then `theme.css`.
3. Click the pencil icon. It is near the top right of the file and is labelled “Edit this file”.
4. Change the value you want. For a colour, replace the six characters after `#`. For a size, replace the number before `px`. Do not delete the semicolon at the end of the line.
5. Scroll down to **Commit changes**. Leave the commit on the `main` branch.
6. Click **Commit changes**.
7. GitHub Pages rebuilds the site. That takes about 2 minutes.
8. Open the site and hard-refresh so the browser does not show the old copy. On a Mac that is Command Shift R. On Windows it is Ctrl F5.

## Colours

Write a colour as `#` plus six characters, like `#EBEBEB`. The characters are `0`–`9` and `A`–`F`. The first pair is red, the second is green, the third is blue. `#000000` is black. `#FFFFFF` is white. `#EBEBEB` is a light grey.

Use capital or lowercase letters. `#ebebeb` and `#EBEBEB` are the same colour.

## Fonts

The safest choices are fonts the app already loads, or a common font that is already on the computer:

- Outfit, for ordinary text. The app loads this.
- Fraunces, for the large title. The app loads this.
- Avenir Next, Segoe UI, Georgia, and the words `sans-serif` or `serif`. These are fallbacks. The browser uses the first one it can find.

Keep the quotes around a name that has a space, and keep the commas. A good ordinary-text line is:

```css
--font-sans: "Outfit", "Avenir Next", "Segoe UI", sans-serif;
```

A name the app does not load, such as a font from your computer only, will show for you and not for other people.

## How to undo a change

1. Open `src/theme.css` on github.com.
2. Click **History**. It is near the pencil icon.
3. Open the last good version of the file.
4. Click the pencil, copy that version’s values back if you need to, or use GitHub’s revert on that history entry if you are comfortable with it. The simple way is to edit the file again and put the old value back, then commit to `main` as above.
5. Wait about 2 minutes and hard-refresh the site.
