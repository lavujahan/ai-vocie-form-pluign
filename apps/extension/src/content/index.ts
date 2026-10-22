import {
  MOVED_REASON,
  siteOf,
  type ContentRequest,
  type FillResult,
  type ResolveOptionMessage,
  type ResolveOptionResult,
  type ScanResult,
  type UndoResult,
} from '../messages';
import type { Resolver } from './cascade';
import { detect, type Registry } from './detector';
import { fillAll, undoAll } from './filler';

let registry: Registry = new Map();

/** Unclear dropdown matches go to the AI through the service worker (it holds the session and token). */
const resolve: Resolver = async (field_key, spoken, options) => {
  const msg: ResolveOptionMessage = { type: 'RESOLVE_OPTION', field_key, spoken, options };
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 20_000));
  return Promise.race([chrome.runtime.sendMessage(msg) as Promise<ResolveOptionResult>, timeout]).catch(() => null);
};

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
        // The tab moved to another site since it was scanned: never type this form's values here.
        if (msg.site && msg.site !== siteOf(location.href)) {
          return { filled: [], skipped: Object.keys(msg.values).map((field_key) => ({ field_key, reason: MOVED_REASON })) } satisfies FillResult;
        }
        if (!registry.size || [...registry.values()].some((e) => !e.el.isConnected)) scan();
        const report = await fillAll(msg.values, registry, {
          highlight: msg.highlight,
          edges: msg.edges,
          resolve,
          redetect: () => {
            scan();
            return registry;
          },
        });
        registry = report.registry;
        const { registry: _r, ...result } = report;
        return result satisfies FillResult;
      }
      case 'UNDO':
        return { restored: await undoAll() } satisfies UndoResult;
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e) }));
  return true; // async response
});
