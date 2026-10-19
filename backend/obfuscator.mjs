const KEYWORDS = new Set([
  'and', 'break', 'continue', 'do', 'else', 'elseif', 'end', 'export', 'false',
  'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
  'strict', 'then', 'true', 'type', 'typeof', 'until', 'while', 'declare', 'const',
]);
const OPERATORS = ['...', '..=', '//=', '+=', '-=', '*=', '/=', '%=', '^=', '::', '//', '..', '==', '~=', '<=', '>=', '->'];
const CONTINUATION = new Set(['.', ':', ',', '=', '+', '-', '*', '/', '%', '^', '//', '..', '..=', '+=', '-=', '*=', '/=', '%=', '^=', 'and', 'or', 'not', '(', '[', '{', '|', '&', '<', '>', '->']);

function isIdStart(ch) { return !!ch && /[A-Za-z_]/.test(ch); }
function isIdPart(ch) { return !!ch && /[A-Za-z0-9_]/.test(ch); }
function longBracketStart(source, index) {
  const match = /^\[(=*)\[/.exec(source.slice(index));
  return match ? { length: match[0].length, close: `]${match[1]}]` } : null;
}

export function tokenize(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const push = (type, value, startLine) => tokens.push({ type, value, line: startLine });

  while (i < source.length) {
    const ch = source[i];
    if (ch === '\n') { line++; i++; continue; }
    if (ch === '\r' || ch === '\t' || ch === ' ' || ch === '\f' || ch === '\v') { i++; continue; }

    if (source.startsWith('--', i)) {
      const commentLine = line;
      const bracket = longBracketStart(source, i + 2);
      if (bracket) {
        i += 2 + bracket.length;
        const end = source.indexOf(bracket.close, i);
        const stop = end === -1 ? source.length : end + bracket.close.length;
        for (; i < stop; i++) if (source[i] === '\n') line++;
      } else {
        i += 2;
        while (i < source.length && source[i] !== '\n') i++;
      }
      // Comments are discarded, but the next token's original line is retained.
      void commentLine;
      continue;
    }

    const startLine = line;
    const bracket = ch === '[' ? longBracketStart(source, i) : null;
    if (bracket) {
      const start = i;
      i += bracket.length;
      const end = source.indexOf(bracket.close, i);
      if (end === -1) throw new Error(`第 ${startLine} 行存在未闭合的长字符串`);
      const stop = end + bracket.close.length;
      for (let cursor = i; cursor < stop; cursor++) if (source[cursor] === '\n') line++;
      push('string', source.slice(start, stop), startLine);
      i = stop;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      const start = i++;
      let closed = false;
      while (i < source.length) {
        const current = source[i++];
        if (current === '\n') line++;
        if (current === '\\') {
          if (i < source.length) {
            if (source[i] === '\n') line++;
            i++;
          }
          continue;
        }
        if (current === quote) { closed = true; break; }
      }
      if (!closed) throw new Error(`第 ${startLine} 行存在未闭合的字符串`);
      push('string', source.slice(start, i), startLine);
      continue;
    }

    if (isIdStart(ch)) {
      const start = i++;
      while (i < source.length && isIdPart(source[i])) i++;
      const value = source.slice(start, i);
      push(KEYWORDS.has(value) ? 'keyword' : 'identifier', value, startLine);
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] || ''))) {
      const match = /^(?:0[xX][\da-fA-F_]*(?:\.[\da-fA-F_]*)?(?:[pP][+-]?[\d_]+)?|0[bB][01_]+|\d[\d_]*(?:\.(?!\.)[\d_]*)?(?:[eE][+-]?[\d_]+)?|\.(?:\d[\d_]*)(?:[eE][+-]?[\d_]+)?)/.exec(source.slice(i));
      if (match) { i += match[0].length; push('number', match[0], startLine); continue; }
    }

    const operator = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (operator) { i += operator.length; push('symbol', operator, startLine); continue; }
    i++;
    push('symbol', ch, startLine);
  }
  return tokens;
}

function parseLocalDeclaration(tokens, index) {
  if (tokens[index + 1]?.value === 'function' && tokens[index + 2]?.type === 'identifier') {
    return { declarations: [{ index: index + 2, name: tokens[index + 2].value }], end: index + 3, functionDeclaration: true };
  }
  const declarations = [];
  let cursor = index + 1;
  let statementLine = tokens[index].line;
  let assignment = -1;
  while (cursor < tokens.length) {
    const first = tokens[cursor];
    if (!first || first.type !== 'identifier') break;
    declarations.push({ index: cursor, name: first.value });
    let depth = 0;
    let previous = first;
    cursor++;
    while (cursor < tokens.length) {
      const token = tokens[cursor];
      if (token.value === '(' || token.value === '[' || token.value === '{' || token.value === '<') depth++;
      else if (token.value === ')' || token.value === ']' || token.value === '}' || token.value === '>') depth = Math.max(0, depth - 1);
      if (depth === 0 && token.value === '=') { assignment = cursor; return { declarations, end: cursor + 1, assignment }; }
      if (depth === 0 && token.value === ',') { cursor++; break; }
      if (depth === 0 && token.line > previous.line && !CONTINUATION.has(previous.value) && !CONTINUATION.has(token.value)) return { declarations, end: cursor };
      previous = token;
      cursor++;
    }
    statementLine = first.line;
    if (cursor >= tokens.length || tokens[cursor - 1]?.value !== ',') break;
    if (tokens[cursor]?.line > statementLine && tokens[cursor - 1]?.line < tokens[cursor].line) break;
  }
  return { declarations, end: cursor, assignment };
}

function expressionEnd(tokens, start) {
  let depth = 0;
  let previous = tokens[start - 1];
  for (let i = start; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.value === '(' || token.value === '[' || token.value === '{') depth++;
    else if (token.value === ')' || token.value === ']' || token.value === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && token.value === ';') return i + 1;
    if (depth === 0 && previous && token.line > previous.line && !CONTINUATION.has(previous.value) && !CONTINUATION.has(token.value)) return i;
    previous = token;
  }
  return tokens.length;
}

function freshName(counter) { return `__l${counter.toString(36)}`; }
function resolve(scopes, name, index) {
  for (let i = scopes.length - 1; i >= 0; i--) {
    const binding = scopes[i].bindings.get(name);
    if (binding && index >= binding.visibleFrom) return binding.replacement;
  }
  return null;
}
function isPropertyOrLabel(tokens, index, braceDepth) {
  const previous = tokens[index - 1]?.value;
  const next = tokens[index + 1]?.value;
  if (previous === '.' || previous === ':' || previous === '::' || next === '::') return true;
  if (braceDepth > 0 && next === '=' && (previous === '{' || previous === ',' || previous === ';')) return true;
  return false;
}

function renameLocals(tokens, includeParameters) {
  let counter = 0;
  let renamed = 0;
  const templateReferences = new Set();
  for (const token of tokens) {
    if (token.type !== 'string' || !token.value.startsWith('`')) continue;
    for (const [, expression] of token.value.matchAll(/\{([^{}]+)\}/g)) {
      for (const name of expression.match(/[A-Za-z_]\w*/g) || []) templateReferences.add(name);
    }
  }
  const scopes = [{ kind: 'root', bindings: new Map() }];
  let braceDepth = 0;
  let pendingRepeatClose = null;
  const bind = (scope, declaration, visibleFrom) => {
    if (!declaration || declaration.type !== 'identifier') return;
    if (templateReferences.has(declaration.value)) return;
    const replacement = freshName(counter++);
    scope.bindings.set(declaration.value, { replacement, visibleFrom });
    declaration.value = replacement;
    renamed++;
  };
  const pop = () => { if (scopes.length > 1) scopes.pop(); };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (pendingRepeatClose && token.line > pendingRepeatClose) { pop(); pendingRepeatClose = null; }
    if (token.value === '{') braceDepth++;
    if (token.value === '}') braceDepth = Math.max(0, braceDepth - 1);

    if (token.value === 'local') {
      const parsed = parseLocalDeclaration(tokens, i);
      for (const declaration of parsed.declarations) {
        const visibleFrom = parsed.functionDeclaration
          ? i + 1
          : parsed.assignment >= 0 ? expressionEnd(tokens, parsed.assignment + 1) : parsed.end;
        bind(scopes[scopes.length - 1], tokens[declaration.index], visibleFrom);
      }
      continue;
    }

    if (token.value === 'for') {
      scopes.push({ kind: 'loop', bindings: new Map() });
      let cursor = i + 1;
      const names = [];
      while (cursor < tokens.length && tokens[cursor].value !== '=' && tokens[cursor].value !== 'in' && tokens[cursor].value !== 'do') {
        if (tokens[cursor].type === 'identifier' && (cursor === i + 1 || tokens[cursor - 1].value === ',')) names.push(cursor);
        cursor++;
      }
      const visibleFrom = tokens.findIndex((entry, index) => index > i && entry.value === 'do');
      for (const nameIndex of names) bind(scopes[scopes.length - 1], tokens[nameIndex], visibleFrom < 0 ? i + 1 : visibleFrom);
      continue;
    }

    if (token.value === 'function' && includeParameters) {
      const functionScope = { kind: 'function', bindings: new Map() };
      scopes.push(functionScope);
      let open = i + 1;
      while (open < tokens.length && tokens[open].value !== '(' && tokens[open].value !== 'do' && tokens[open].value !== 'end') open++;
      if (tokens[open]?.value === '(') {
        let cursor = open + 1;
        let depth = 0;
        let segmentStart = cursor;
        const segments = [];
        for (; cursor < tokens.length; cursor++) {
          const value = tokens[cursor].value;
          if (value === '(' || value === '[' || value === '{' || value === '<') depth++;
          else if (value === ')' || value === ']' || value === '}' || value === '>') {
            if (value === ')' && depth === 0) { segments.push([segmentStart, cursor]); break; }
            depth = Math.max(0, depth - 1);
          } else if (value === ',' && depth === 0) { segments.push([segmentStart, cursor]); segmentStart = cursor + 1; }
        }
        for (const [start, stop] of segments) {
          const declaration = tokens[start];
          if (declaration?.type === 'identifier') bind(functionScope, declaration, (segments.at(-1)?.[1] ?? start) + 1);
        }
      }
      continue;
    }

    if (token.value === 'repeat') { scopes.push({ kind: 'repeat', bindings: new Map() }); continue; }
    if (token.value === 'then') { scopes.push({ kind: 'if-clause', bindings: new Map() }); continue; }
    if (token.value === 'else') {
      if (scopes.at(-1)?.kind === 'if-clause') pop();
      scopes.push({ kind: 'if-clause', bindings: new Map() });
      continue;
    }
    if (token.value === 'do') {
      const kind = scopes.at(-1)?.kind === 'loop' ? 'loop-body' : 'block';
      scopes.push({ kind, bindings: new Map() });
      continue;
    }
    if (token.value === 'until') { pendingRepeatClose = token.line; continue; }
    if (token.value === 'end') {
      const closed = scopes.at(-1)?.kind;
      pop();
      if (closed === 'loop-body' && scopes.at(-1)?.kind === 'loop') pop();
      continue;
    }

    if (token.type === 'identifier' && !isPropertyOrLabel(tokens, i, braceDepth)) {
      const replacement = resolve(scopes, token.value, i);
      if (replacement) token.value = replacement;
    }
  }
  return renamed;
}

function needsSpace(previous, current) {
  const left = previous.value.at(-1) || '';
  const right = current.value[0] || '';
  if ((/[A-Za-z0-9_]/.test(left) && /[A-Za-z0-9_]/.test(right)) || (/[0-9]/.test(left) && right === '.') || (left === '.' && /[0-9]/.test(right))) return true;
  const pair = left + right;
  if (['--', '..', '...', '//', '==', '~=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '^=', '::', '->'].includes(pair)) return true;
  if (left === '.' && current.value.startsWith('..')) return true;
  if (previous.value.endsWith('..') && right === '.') return true;
  return false;
}

export function minify(tokens) {
  let output = '';
  let previous = null;
  for (const token of tokens) {
    if (previous) {
      if (token.line > previous.line) output += '\n';
      else if (needsSpace(previous, token)) output += ' ';
    }
    output += token.value;
    previous = token;
  }
  return output;
}

export function obfuscate(source, level = 'standard') {
  if (!['compact', 'standard', 'strong'].includes(level)) throw new Error('不支持的混淆级别');
  const tokens = tokenize(source);
  const identifiersRenamed = level === 'compact' ? 0 : renameLocals(tokens, level === 'strong');
  const code = minify(tokens);
  const inputBytes = Buffer.byteLength(source, 'utf8');
  const outputBytes = Buffer.byteLength(code, 'utf8');
  return {
    code,
    stats: {
      inputBytes,
      outputBytes,
      savedPercent: inputBytes === 0 ? 0 : Math.round(((inputBytes - outputBytes) / inputBytes) * 100),
      identifiersRenamed,
      tokens: tokens.length,
    },
  };
}
