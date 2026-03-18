"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // src/code.ts
  var require_code = __commonJS({
    "src/code.ts"() {
      figma.showUI(__html__, { width: 450, height: 550 });
      function findTextNodes(node) {
        const textNodes = [];
        if (node.type === "TEXT") {
          textNodes.push(node);
        } else if ("children" in node) {
          for (const child of node.children) {
            textNodes.push(...findTextNodes(child));
          }
        }
        return textNodes;
      }
      function sendSelectionInfo() {
        const selection = figma.currentPage.selection;
        if (selection.length !== 1) {
          figma.ui.postMessage({
            type: "selection-error",
            error: "Please select exactly one frame as your banner template."
          });
          return;
        }
        const selected = selection[0];
        if (selected.type !== "FRAME" && selected.type !== "COMPONENT" && selected.type !== "INSTANCE") {
          figma.ui.postMessage({
            type: "selection-error",
            error: "Selected node must be a Frame, Component, or Instance."
          });
          return;
        }
        const textNodes = findTextNodes(selected);
        if (textNodes.length === 0) {
          figma.ui.postMessage({
            type: "selection-error",
            error: "No text layers found in the selected frame."
          });
          return;
        }
        const textLayers = textNodes.map((node) => ({
          id: node.id,
          name: node.name,
          characters: node.characters
        }));
        figma.ui.postMessage({ type: "selection-info", textLayers });
      }
      figma.on("selectionchange", sendSelectionInfo);
      figma.ui.onmessage = async (msg) => {
        if (msg.type === "request-selection") {
          sendSelectionInfo();
        }
        if (msg.type === "generate") {
          try {
            const selection = figma.currentPage.selection;
            if (selection.length !== 1) {
              figma.ui.postMessage({ type: "generate-error", error: "No frame selected." });
              return;
            }
            const template = selection[0];
            const csvRows = msg.csvData;
            const layerMapping = msg.mapping;
            const generatedFrames = [];
            const allTextNodes = findTextNodes(template);
            const textNodeById = /* @__PURE__ */ new Map();
            for (const tn of allTextNodes) {
              textNodeById.set(tn.id, tn);
            }
            const fontsToLoad = /* @__PURE__ */ new Set();
            for (const layerId of Object.keys(layerMapping)) {
              const textNode = textNodeById.get(layerId);
              if (textNode) {
                const len = textNode.characters.length;
                for (let i = 0; i < len; i++) {
                  const font = textNode.getRangeFontName(i, i + 1);
                  fontsToLoad.add(JSON.stringify(font));
                }
              }
            }
            for (const fontStr of fontsToLoad) {
              await figma.loadFontAsync(JSON.parse(fontStr));
            }
            for (let i = 0; i < csvRows.length; i++) {
              const row = csvRows[i];
              const clone = template.clone();
              clone.name = `${template.name} - Variation ${i + 1}`;
              const cols = 4;
              const gap = 40;
              const col = i % cols;
              const rowIdx = Math.floor(i / cols);
              clone.x = template.x + (template.width + gap) * (col + 1);
              clone.y = template.y + (template.height + gap) * rowIdx;
              const cloneTextNodes = findTextNodes(clone);
              for (const cloneTextNode of cloneTextNodes) {
                const originalNode = allTextNodes.find((n) => n.name === cloneTextNode.name);
                if (!originalNode) continue;
                const csvColumn = layerMapping[originalNode.id];
                if (!csvColumn || !row[csvColumn]) continue;
                cloneTextNode.characters = row[csvColumn];
              }
              generatedFrames.push(clone);
            }
            figma.root.setPluginData(
              "generatedFrameIds",
              JSON.stringify(generatedFrames.map((f) => f.id))
            );
            figma.currentPage.selection = generatedFrames;
            figma.viewport.scrollAndZoomIntoView(generatedFrames);
            figma.ui.postMessage({ type: "generate-done", count: generatedFrames.length });
          } catch (err) {
            figma.ui.postMessage({
              type: "generate-error",
              error: `Generation failed: ${err.message}`
            });
          }
        }
        if (msg.type === "export") {
          try {
            const storedIds = figma.root.getPluginData("generatedFrameIds");
            if (!storedIds) {
              figma.ui.postMessage({ type: "export-error", error: "No generated banners to export. Generate first." });
              return;
            }
            const frameIds = JSON.parse(storedIds);
            const format = msg.format || "PNG";
            const scale = msg.scale || 2;
            const images = [];
            for (const id of frameIds) {
              const node = figma.getNodeById(id);
              if (!node || !("exportAsync" in node)) continue;
              const bytes = await node.exportAsync({
                format,
                constraint: { type: "SCALE", value: scale }
              });
              images.push({
                name: `${node.name}.${format.toLowerCase()}`,
                bytes: Array.from(bytes)
              });
            }
            figma.ui.postMessage({ type: "export-done", count: images.length, imageData: images });
          } catch (err) {
            figma.ui.postMessage({
              type: "export-error",
              error: `Export failed: ${err.message}`
            });
          }
        }
        if (msg.type === "close") {
          figma.closePlugin();
        }
      };
      sendSelectionInfo();
    }
  });
  require_code();
})();
