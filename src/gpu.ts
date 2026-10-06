// `navigator.gpu` existing does not mean WebGPU works (headless browsers, many Android phones).
let probe: Promise<boolean> | null = null;

export function hasWebGpu(): Promise<boolean> {
  probe ??= (async () => {
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      return !!(gpu && (await gpu.requestAdapter()));
    } catch {
      return false;
    }
  })();
  return probe;
}
