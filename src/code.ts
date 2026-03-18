// Types shared between code.ts and ui.ts
interface TextLayerInfo {
  id: string;
  name: string;
  characters: string;
}

interface PluginMessage {
  type: string;
  textLayers?: TextLayerInfo[];
  csvData?: Record<string, string>[];
  mapping?: Record<string, string>;
  format?: 'PNG' | 'JPG';
  scale?: number;
  error?: string;
  count?: number;
  imageData?: { name: string; bytes: number[] }[];
}

figma.showUI(__html__, { width: 450, height: 550 });

// Find all text nodes recursively inside a node
function findTextNodes(node: SceneNode): TextNode[] {
  const textNodes: TextNode[] = [];
  if (node.type === 'TEXT') {
    textNodes.push(node);
  } else if ('children' in node) {
    for (const child of node.children) {
      textNodes.push(...findTextNodes(child as SceneNode));
    }
  }
  return textNodes;
}

// Send text layers from selected frame to UI
function sendSelectionInfo(): void {
  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    figma.ui.postMessage({
      type: 'selection-error',
      error: 'Please select exactly one frame as your banner template.',
    });
    return;
  }

  const selected = selection[0];
  if (selected.type !== 'FRAME' && selected.type !== 'COMPONENT' && selected.type !== 'INSTANCE') {
    figma.ui.postMessage({
      type: 'selection-error',
      error: 'Selected node must be a Frame, Component, or Instance.',
    });
    return;
  }

  const textNodes = findTextNodes(selected);
  if (textNodes.length === 0) {
    figma.ui.postMessage({
      type: 'selection-error',
      error: 'No text layers found in the selected frame.',
    });
    return;
  }

  const textLayers: TextLayerInfo[] = textNodes.map((node) => ({
    id: node.id,
    name: node.name,
    characters: node.characters,
  }));

  figma.ui.postMessage({ type: 'selection-info', textLayers });
}

// Listen for selection changes
figma.on('selectionchange', sendSelectionInfo);

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === 'request-selection') {
    sendSelectionInfo();
  }

  if (msg.type === 'generate') {
    try {
      const selection = figma.currentPage.selection;
      if (selection.length !== 1) {
        figma.ui.postMessage({ type: 'generate-error', error: 'No frame selected.' });
        return;
      }

      const template = selection[0] as FrameNode;
      const csvRows = msg.csvData as Record<string, string>[];
      const layerMapping = msg.mapping as Record<string, string>;
      const generatedFrames: FrameNode[] = [];

      // Build a lookup from layer ID to text node in the template
      const allTextNodes = findTextNodes(template);
      const textNodeById = new Map<string, TextNode>();
      for (const tn of allTextNodes) {
        textNodeById.set(tn.id, tn);
      }

      // Load all fonts used by mapped text nodes
      const fontsToLoad = new Set<string>();
      for (const layerId of Object.keys(layerMapping)) {
        const textNode = textNodeById.get(layerId);
        if (textNode) {
          const len = textNode.characters.length;
          for (let i = 0; i < len; i++) {
            const font = textNode.getRangeFontName(i, i + 1) as FontName;
            fontsToLoad.add(JSON.stringify(font));
          }
        }
      }

      for (const fontStr of fontsToLoad) {
        await figma.loadFontAsync(JSON.parse(fontStr) as FontName);
      }

      // Generate one frame per CSV row
      for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        const clone = template.clone();
        clone.name = `${template.name} - Variation ${i + 1}`;

        // Position: arrange in a grid (4 columns)
        const cols = 4;
        const gap = 40;
        const col = i % cols;
        const rowIdx = Math.floor(i / cols);
        clone.x = template.x + (template.width + gap) * (col + 1);
        clone.y = template.y + (template.height + gap) * rowIdx;

        // Replace text in mapped layers
        const cloneTextNodes = findTextNodes(clone);
        for (const cloneTextNode of cloneTextNodes) {
          // Match by name since IDs change after clone
          const originalNode = allTextNodes.find((n) => n.name === cloneTextNode.name);
          if (!originalNode) continue;
          const csvColumn = layerMapping[originalNode.id];
          if (!csvColumn || !row[csvColumn]) continue;

          cloneTextNode.characters = row[csvColumn];
        }

        generatedFrames.push(clone);
      }

      // Store generated frame IDs for export
      figma.root.setPluginData(
        'generatedFrameIds',
        JSON.stringify(generatedFrames.map((f) => f.id))
      );

      // Select all generated frames and zoom to fit
      figma.currentPage.selection = generatedFrames;
      figma.viewport.scrollAndZoomIntoView(generatedFrames);

      figma.ui.postMessage({ type: 'generate-done', count: generatedFrames.length });
    } catch (err) {
      figma.ui.postMessage({
        type: 'generate-error',
        error: `Generation failed: ${(err as Error).message}`,
      });
    }
  }

  if (msg.type === 'export') {
    try {
      const storedIds = figma.root.getPluginData('generatedFrameIds');
      if (!storedIds) {
        figma.ui.postMessage({ type: 'export-error', error: 'No generated banners to export. Generate first.' });
        return;
      }

      const frameIds: string[] = JSON.parse(storedIds);
      const format = (msg.format || 'PNG') as 'PNG' | 'JPG';
      const scale = msg.scale || 2;
      const images: { name: string; bytes: number[] }[] = [];

      for (const id of frameIds) {
        const node = figma.getNodeById(id);
        if (!node || !('exportAsync' in node)) continue;

        const bytes = await (node as FrameNode).exportAsync({
          format,
          constraint: { type: 'SCALE', value: scale },
        });

        images.push({
          name: `${(node as FrameNode).name}.${format.toLowerCase()}`,
          bytes: Array.from(bytes),
        });
      }

      figma.ui.postMessage({ type: 'export-done', count: images.length, imageData: images });
    } catch (err) {
      figma.ui.postMessage({
        type: 'export-error',
        error: `Export failed: ${(err as Error).message}`,
      });
    }
  }

  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// Send initial selection info
sendSelectionInfo();
