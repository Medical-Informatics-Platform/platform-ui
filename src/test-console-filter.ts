const noisyMessagePatterns = [
  /^geo3D exists\.?$/,
  /^No algorithm selected\.?$/,
  /^✘ mock_algo:/,
  /^✘ mock_notblank_algo:/,
];

function isNoisyMessage(args: unknown[]): boolean {
  if (!args.length) return false;
  const first = args[0];
  if (typeof first !== 'string') return false;
  return noisyMessagePatterns.some((pattern) => pattern.test(first));
}

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);

console.warn = (...args: unknown[]) => {
  if (isNoisyMessage(args)) return;
  originalWarn(...args);
};

console.error = (...args: unknown[]) => {
  if (isNoisyMessage(args)) return;
  originalError(...args);
};
