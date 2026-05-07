const ISSUE_CODE_RE = /\b([A-Z][A-Z0-9]{1,7})-(\d+)\b/g;

function linkPlainIssueCodes(text: string): string {
  return text.replace(ISSUE_CODE_RE, (code: string, projectCode: string) => {
    return `[${code}](/projects/${projectCode}/issues/${code})`;
  });
}

function findMatchingBracket(text: string, openIndex: number): number {
  let depth = 0;

  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '[') depth++;
    if (char === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function findClosingParen(text: string, openIndex: number): number {
  let depth = 0;

  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '(') depth++;
    if (char === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function findClosingBacktickRun(text: string, openIndex: number): number {
  const marker = text[openIndex] ?? '';
  if (!marker) return -1;
  let runLength = 0;
  while (text[openIndex + runLength] === marker) runLength++;

  for (let i = openIndex + runLength; i < text.length; i++) {
    if (text[i] !== marker) continue;

    let closeRunLength = 0;
    while (text[i + closeRunLength] === marker) closeRunLength++;
    if (closeRunLength === runLength) return i + closeRunLength;
    i += closeRunLength - 1;
  }

  return -1;
}

function shouldSkipAutolink(content: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(content) || /^[^\s@<>]+@[^\s@<>]+$/.test(content);
}

function linkInlineIssueCodes(line: string): string {
  let result = '';
  let plainStart = 0;
  let i = 0;

  const flushPlain = (end: number) => {
    if (end > plainStart) result += linkPlainIssueCodes(line.slice(plainStart, end));
  };

  while (i < line.length) {
    if (line[i] === '`') {
      const end = findClosingBacktickRun(line, i);
      if (end !== -1) {
        flushPlain(i);
        result += line.slice(i, end);
        i = end;
        plainStart = i;
        continue;
      }
    }

    const bracketStart = line[i] === '!' && line[i + 1] === '['
      ? i + 1
      : line[i] === '['
        ? i
        : -1;

    if (bracketStart !== -1) {
      const closeBracket = findMatchingBracket(line, bracketStart);
      const next = closeBracket + 1;

      if (closeBracket !== -1 && line[next] === '(') {
        const closeParen = findClosingParen(line, next);
        if (closeParen !== -1) {
          flushPlain(i);
          result += line.slice(i, closeParen + 1);
          i = closeParen + 1;
          plainStart = i;
          continue;
        }
      }

      if (closeBracket !== -1 && line[next] === '[') {
        const closeReference = findMatchingBracket(line, next);
        if (closeReference !== -1) {
          flushPlain(i);
          result += line.slice(i, closeReference + 1);
          i = closeReference + 1;
          plainStart = i;
          continue;
        }
      }
    }

    if (line[i] === '<') {
      const close = line.indexOf('>', i + 1);
      if (close !== -1 && shouldSkipAutolink(line.slice(i + 1, close))) {
        flushPlain(i);
        result += line.slice(i, close + 1);
        i = close + 1;
        plainStart = i;
        continue;
      }
    }

    i++;
  }

  flushPlain(line.length);
  return result;
}

export function linkIssueCodes(markdown: string | null | undefined): string | null {
  if (!markdown) return markdown ?? null;

  let inFence = false;
  let fenceMarker = '';
  let fenceLength = 0;

  return markdown.split('\n').map((line) => {
    const fence = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1] ?? '';
      const markerChar = marker[0] ?? '';

      if (!inFence) {
        inFence = true;
        fenceMarker = markerChar;
        fenceLength = marker.length;
      } else if (markerChar === fenceMarker && marker.length >= fenceLength) {
        inFence = false;
      }

      return line;
    }

    return inFence ? line : linkInlineIssueCodes(line);
  }).join('\n');
}
