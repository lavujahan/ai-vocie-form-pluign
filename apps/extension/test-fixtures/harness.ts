// Dev-only: fill the page from values.json without the extension or backend.
import { detect } from '../src/content/detector';
import { fillAll, undoAll } from '../src/content/filler';
import values from './values.json';

const bar = document.createElement('div');
bar.setAttribute('data-vff-ignore', '');
bar.style.cssText = 'position:fixed;right:12px;bottom:12px;display:flex;gap:8px;font:13px system-ui';
const btn = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  bar.append(b);
};
btn('Detect', () => console.table(detect(document).schema.fields));
btn('Fill from values.json', async () => {
  const report = await fillAll(values, detect(document).registry, { highlight: true, redetect: () => detect(document).registry });
  console.log(report);
});
btn('Undo', () => undoAll());
document.body.append(bar);
