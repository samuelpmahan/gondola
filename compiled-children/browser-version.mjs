const versionPart = "(?:0|[1-9]\\d*)";
const chromiumVersionPattern = new RegExp(
  `^(?:Chromium|Google Chrome for Testing) (${versionPart})\\.(${versionPart})\\.(${versionPart})\\.(${versionPart})$`,
);

export function isChromiumVersionOutput(value) {
  if (typeof value !== "string") return false;
  const match = chromiumVersionPattern.exec(value);
  if (!match) return false;
  const components = match.slice(1).map(Number);
  return components.every(Number.isSafeInteger) && components[0] > 0;
}
