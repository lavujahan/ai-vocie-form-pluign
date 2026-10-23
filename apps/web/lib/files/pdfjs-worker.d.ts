// pdf.js ships no types for its worker module; it is only loaded to run pdf.js on the page (see pdf-shrink.ts).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
