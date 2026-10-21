import type { ContentRequest, FillResult, ScanResult, UndoResult } from '../messages';
import { detect, type Registry } from './detector';
import { fillAll, undoAll } from './filler';

let registry: Registry = new Map();

const scan = () => {
  const r = detect(document);
  registry = r.registry;
  return r.schema;
};

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  (async () => {
    switch (msg.type) {
      case 'PING':
        return 'pong';
      case 'SCAN':
        return { schema: scan() } satisfies ScanResult;
      case 'FILL': {
        if (!registry.size || [...registry.values()].some((e) => !e.el.isConnected)) scan();
        const report = await fillAll(msg.values, registry, {
          highlight: msg.highlight,
          redetect: () => {
            scan();
            return registry;
          },
        });
        registry = report.registry;
        return { filled: report.filled, skipped: report.skipped } satisfies FillResult;
      }
      case 'UNDO':
        return { restored: await undoAll() } satisfies UndoResult;
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e) }));
  return true; // async response
});
