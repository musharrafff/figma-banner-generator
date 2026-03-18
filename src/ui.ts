// --- CSV Parser (handles quoted fields, no external deps) ---
function parseCSV(text: string): Record<string, string>[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else {
      current += char;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return [];

  const splitRow = (line: string): string[] => {
    const fields: string[] = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        fields.push(field.trim());
        field = '';
      } else {
        field += c;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = splitRow(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = splitRow(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] || '';
    });
    rows.push(row);
  }

  return rows;
}

// --- Download helper ---
function downloadImages(images: { name: string; bytes: number[] }[], format: string) {
  if (images.length === 1) {
    const blob = new Blob([new Uint8Array(images[0].bytes)], {
      type: format === 'PNG' ? 'image/png' : 'image/jpeg',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = images[0].name;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  for (const img of images) {
    const blob = new Blob([new Uint8Array(img.bytes)], {
      type: format === 'PNG' ? 'image/png' : 'image/jpeg',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = img.name;
    a.click();
    URL.revokeObjectURL(url);
  }
}

// --- State ---
interface TextLayerInfo {
  id: string;
  name: string;
  characters: string;
}

let textLayers: TextLayerInfo[] = [];
let csvHeaders: string[] = [];
let csvData: Record<string, string>[] = [];
let mapping: Record<string, string> = {}; // layerId -> csvColumn

// --- DOM Helpers ---
const $ = (id: string) => document.getElementById(id)!;

function show(id: string) { $(id).classList.remove('hidden'); }
function hide(id: string) { $(id).classList.add('hidden'); }
function enable(id: string) { $(id).classList.remove('disabled'); }
function disable(id: string) { $(id).classList.add('disabled'); }

// --- Step 1: Selection ---
function updateSelection(layers: TextLayerInfo[]) {
  textLayers = layers;

  const status = $('selection-status');
  status.className = 'status status--success';
  status.textContent = `Found ${layers.length} text layer${layers.length > 1 ? 's' : ''}.`;

  const preview = $('text-layers-preview');
  preview.innerHTML = layers
    .map((l) => `<div class="layer-tag">${l.name}<span class="layer-preview">${l.characters.substring(0, 30)}${l.characters.length > 30 ? '...' : ''}</span></div>`)
    .join('');
  show('text-layers-preview');

  enable('step-csv');

  if (csvData.length > 0) {
    buildMapping();
  }
}

function showSelectionError(error: string) {
  textLayers = [];
  const status = $('selection-status');
  status.className = 'status status--warning';
  status.textContent = error;
  hide('text-layers-preview');
  disable('step-csv');
  disable('step-mapping');
  disable('step-generate');
  disable('step-export');
}

// --- Step 2: CSV Upload ---
$('csv-input').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    const text = event.target?.result as string;
    csvData = parseCSV(text);

    if (csvData.length === 0) {
      const info = $('csv-info');
      info.textContent = 'No data rows found in CSV.';
      info.className = 'status status--warning';
      show('csv-info');
      return;
    }

    csvHeaders = Object.keys(csvData[0]);

    const info = $('csv-info');
    info.textContent = `${file.name} — ${csvData.length} rows, ${csvHeaders.length} columns`;
    info.className = 'status status--success';
    show('csv-info');

    buildMapping();
  };
  reader.readAsText(file);
});

// --- Step 3: Mapping ---
function buildMapping() {
  if (textLayers.length === 0 || csvHeaders.length === 0) return;

  enable('step-mapping');
  const container = $('mapping-container');

  // Auto-detect: match layer name (lowercase) to CSV header (lowercase)
  mapping = {};
  const headerLower = csvHeaders.map((h) => h.toLowerCase().trim());

  container.innerHTML = textLayers
    .map((layer) => {
      const autoMatch = headerLower.indexOf(layer.name.toLowerCase().trim());
      if (autoMatch !== -1) {
        mapping[layer.id] = csvHeaders[autoMatch];
      }

      const options = csvHeaders
        .map(
          (h) =>
            `<option value="${h}" ${h === csvHeaders[autoMatch] ? 'selected' : ''}>${h}</option>`
        )
        .join('');

      return `
        <div class="mapping-row">
          <span class="mapping-layer" title="${layer.characters}">${layer.name}</span>
          <span class="mapping-arrow">&#8594;</span>
          <select class="mapping-select" data-layer-id="${layer.id}">
            <option value="">-- skip --</option>
            ${options}
          </select>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.mapping-select').forEach((select) => {
    select.addEventListener('change', (e) => {
      const el = e.target as HTMLSelectElement;
      const layerId = el.dataset.layerId!;
      if (el.value) {
        mapping[layerId] = el.value;
      } else {
        delete mapping[layerId];
      }
      updateGenerateButton();
    });
  });

  updateGenerateButton();
}

function updateGenerateButton() {
  const hasMappings = Object.keys(mapping).length > 0;
  enable('step-generate');
  const btn = $('btn-generate') as HTMLButtonElement;
  btn.disabled = !hasMappings;
  btn.textContent = `Generate ${csvData.length} Banner${csvData.length > 1 ? 's' : ''}`;
}

// --- Step 4: Generate ---
$('btn-generate').addEventListener('click', () => {
  const btn = $('btn-generate') as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = 'Generating...';

  const status = $('generate-status');
  status.textContent = 'Working...';
  status.className = 'status status--info';
  show('generate-status');

  parent.postMessage(
    {
      pluginMessage: {
        type: 'generate',
        csvData,
        mapping,
      },
    },
    '*'
  );
});

// --- Step 5: Export ---
$('btn-export').addEventListener('click', () => {
  const status = $('export-status');
  status.textContent = 'Exporting...';
  status.className = 'status status--info';
  show('export-status');

  parent.postMessage(
    {
      pluginMessage: {
        type: 'export',
        format: ($('export-format') as HTMLSelectElement).value,
        scale: Number(($('export-scale') as HTMLSelectElement).value),
      },
    },
    '*'
  );
});

// --- Messages from plugin ---
window.onmessage = (event) => {
  const msg = event.data.pluginMessage;

  if (msg.type === 'selection-info') {
    updateSelection(msg.textLayers);
  }

  if (msg.type === 'selection-error') {
    showSelectionError(msg.error);
  }

  if (msg.type === 'generate-done') {
    const btn = $('btn-generate') as HTMLButtonElement;
    btn.disabled = false;
    btn.textContent = `Generate ${csvData.length} Banner${csvData.length > 1 ? 's' : ''}`;

    const status = $('generate-status');
    status.textContent = `Generated ${msg.count} banner${msg.count > 1 ? 's' : ''} successfully.`;
    status.className = 'status status--success';

    enable('step-export');
  }

  if (msg.type === 'generate-error') {
    const btn = $('btn-generate') as HTMLButtonElement;
    btn.disabled = false;
    btn.textContent = `Generate ${csvData.length} Banner${csvData.length > 1 ? 's' : ''}`;

    const status = $('generate-status');
    status.textContent = msg.error;
    status.className = 'status status--warning';
  }

  if (msg.type === 'export-done') {
    downloadImages(msg.imageData, ($('export-format') as HTMLSelectElement).value);
    const status = $('export-status');
    status.textContent = `Exported ${msg.count} image${msg.count > 1 ? 's' : ''}.`;
    status.className = 'status status--success';
  }

  if (msg.type === 'export-error') {
    const status = $('export-status');
    status.textContent = msg.error;
    status.className = 'status status--warning';
  }
};

// Request current selection when UI loads
parent.postMessage({ pluginMessage: { type: 'request-selection' } }, '*');
