import {
  MOVED_REASON,
  siteOf,
  type ContentRequest,
  type FieldsChangedMessage,
  type FileFillResult,
  type FillResult,
  type PageLoadedMessage,
  type ResolveOptionMessage,
  type ResolveOptionResult,
  type ScanResult,
  type UndoResult,
} from '../messages';
import type { Resolver } from './cascade';
import { detect, type Registry } from './detector';
import { fillAll, undoAll } from './filler';
import { fillFile } from './upload';
import { startWatch, stopWatch } from './watch';

let registry: Registry = new Map();
/** Upload fields this page got a file for from the phone (Start over empties them). */
const filledFiles = new Set<string>();

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

// Tell the worker where this tab is now: if it holds a form session for another site, the phone is told
// the form tab moved (and stops sending); back on the form's site, the phone can send again.
try {
  void chrome.runtime.sendMessage({ type: 'PAGE_LOADED', site: siteOf(location.href) } satisfies PageLoadedMessage).catch(() => null);
} catch {
  /* extension reloaded: this old content script is orphaned */
}

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
      case 'FILL_FILE': {
        if (msg.site && msg.site !== siteOf(location.href)) return { ok: false, error: MOVED_REASON } satisfies FileFillResult;
        let entry = registry.get(msg.field_key);
        if (!entry?.el.isConnected) {
          scan();
          entry = registry.get(msg.field_key);
        }
        if (!entry?.file) return { ok: false, error: "The upload field isn't on the page" } satisfies FileFillResult;
        const result = await fillFile(entry, { name: msg.name, mime: msg.mime, base64: msg.base64 });
        if (result.ok) filledFiles.add(msg.field_key);
        return result satisfies FileFillResult;
      }
      case 'CLEAR_FILES': {
        if (!registry.size) scan();
        for (const key of filledFiles) {
          const entry = registry.get(key);
          if (entry?.file) await fillFile(entry, null);
        }
        filledFiles.clear();
        return { ok: true };
      }
      case 'WATCH':
        if (msg.off) stopWatch();
        else {
          startWatch(msg.known ?? [], scan, ({ schema, present, newStep }) => {
            const change: FieldsChangedMessage = { type: 'FIELDS_CHANGED', schema, present, new_step: newStep };
            void chrome.runtime.sendMessage(change).catch(() => null);
          });
        }
        return { ok: true };
    }
  })()
    .then(sendResponse)
    .catch((e) => sendResponse({ error: String(e) }));
  return true; // async response
});
