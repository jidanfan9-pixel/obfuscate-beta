import test from 'node:test';
import assert from 'node:assert/strict';
import { obfuscate, tokenize } from '../obfuscator.mjs';

test('removes comments and compresses spaces without changing quoted text', () => {
  const source = '-- header\nlocal text = "a -- b" -- trailing\nprint(text)';
  const result = obfuscate(source, 'compact');
  assert.match(result.code, /"a -- b"/);
  assert.doesNotMatch(result.code, /header|trailing/);
  assert.match(result.code, /\n/);
});

test('keeps long strings, escaped quotes, backtick strings and Luau operators', () => {
  const source = 'local a = [=[line one\n-- still string]=]\nlocal b = "a\\\"b"\nlocal c = `Hi {name}`\nlocal n = 7 // 2';
  const result = obfuscate(source, 'compact');
  assert.match(result.code, /\[=\[line one\n-- still string\]=\]/);
  assert.match(result.code, /"a\\\"b"/);
  assert.match(result.code, /`Hi \{name\}`/);
  assert.match(result.code, /7\/\/2/);
});

test('renames simple local variables and uses while preserving member names and table keys', () => {
  const source = 'local value = 2\nlocal t = { value = value }\nt.value = value\nprint(value)';
  const result = obfuscate(source, 'standard');
  assert.ok(result.stats.identifiersRenamed >= 2);
  assert.match(result.code, /\.value/);
  assert.match(result.code, /\{value=/);
  assert.ok(!result.code.includes('print(value)'));
});

test('strong level renames function parameters and loop variables', () => {
  const result = obfuscate('local function add(left, right)\n for i = 1, 2 do print(left + right + i) end\nend', 'strong');
  assert.ok(result.stats.identifiersRenamed >= 4);
  assert.doesNotMatch(result.code, /\\b(left|right|i)\\b/);
});

test('does not rename identifiers referenced from Luau interpolated strings', () => {
  const result = obfuscate('local function greet(playerName)\n local message = `Hello, {playerName}!`\n print(playerName)\nend', 'strong');
  assert.match(result.code, /`Hello, \{playerName\}!`/);
  assert.match(result.code, /print\(playerName\)/);
});

test('does not rename a same-named member after dot or colon', () => {
  const result = obfuscate('local thing = obj\nreturn thing.value, thing:method()', 'standard');
  assert.match(result.code, /\.value/);
  assert.match(result.code, /:method\(/);
});

test('reports malformed strings and unknown levels', () => {
  assert.throws(() => tokenize('local x = "open'), /未闭合/);
  assert.throws(() => obfuscate('print(1)', 'unknown'), /不支持/);
});
