# Banner Generator — Figma Plugin

A Figma plugin that batch-generates banner variations from a template frame and a CSV file. Design one banner, upload a spreadsheet, and get dozens of variations in seconds.

## Quick Start

```bash
git clone https://github.com/musharrafff/figma-banner-generator.git
cd figma-banner-generator
npm install
npm run build
```

Then import the plugin in Figma:
- Figma menu > Plugins > Development > Import plugin from manifest
- Select the `manifest.json` file

## How It Works

1. **Select a template** — Pick any frame in Figma that contains text layers
2. **Upload a CSV** — Each row becomes a banner variation
3. **Map columns to layers** — Match CSV columns to text layers (auto-detected by name)
4. **Generate** — Creates cloned frames with swapped text, arranged in a grid
5. **Export** — Download all banners as PNG or JPG at 1x/2x/3x

## Development

```bash
npm run watch
```

This watches for file changes and rebuilds automatically.

## Project Structure

```
src/
  code.ts      — Plugin sandbox (runs in Figma)
  ui.ts        — UI logic (CSV parsing, mapping, export)
  ui.html      — UI layout
  styles.css   — UI styles
dist/           — Built output (gitignored)
test-data/      — Sample CSV for testing
```

## CSV Format

Your CSV needs a header row. Column names that match text layer names in your template will be auto-mapped.

Example:
```csv
headline,subtext,cta
Summer Sale,Up to 50% off,Shop Now
New Arrivals,Fresh styles,Explore
```

## License

MIT
