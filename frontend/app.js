const $ = (id) => document.getElementById(id);
const sourceInput = $('sourceCode');
const outputInput = $('outputCode');
const runButton = $('runButton');
const configuredApi = (window.LUAUGUARD_CONFIG?.apiBaseUrl || '').trim().replace(/\/+$/, '');
const sample = `-- Luau Guard quick sample\nlocal function greet(playerName: string)\n    local message = \`Hello, {playerName}!\`\n    print(message)\n    return message\nend\n\nlocal result = greet("Builder")`;
sourceInput.value = sample;

function apiUrl(path) { return `${configuredApi}${path}`; }
function bytes(text) { return new TextEncoder().encode(text).length; }
function formatBytes(value) { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`; }
function updateEditor(source, output = outputInput.value) {
  $('sourceBytes').textContent = formatBytes(bytes(source));
  $('sourceLines').textContent = Array.from({ length: Math.max(1, source.split('\n').length) }, (_, i) => i + 1).join('\n');
  if (output) {
    $('outputLines').textContent = Array.from({ length: Math.max(1, output.split('\n').length) }, (_, i) => i + 1).join('\n');
    $('outputBytes').textContent = formatBytes(bytes(output));
  } else {
    $('outputLines').textContent = '·';
    $('outputBytes').textContent = '—';
  }
}
function setMessage(message, state = 'idle') {
  $('resultMessage').textContent = message;
  $('resultDot').className = `result-dot ${state}`;
}
function setService(ok, text) {
  $('serviceStatus').textContent = text;
  $('serviceDot').className = `live-dot ${ok ? 'online' : 'offline'}`;
}

async function checkService() {
  if (!configuredApi && location.hostname.endsWith('github.io')) {
    setService(false, 'API 地址未配置');
    return;
  }
  try {
    const response = await fetch(apiUrl('/api/health'), { cache: 'no-store' });
    if (!response.ok) throw new Error('unavailable');
    const health = await response.json();
    setService(Boolean(health.ok), health.ok ? 'API 在线' : 'API 不可用');
  } catch {
    setService(false, configuredApi ? 'API 暂不可达' : 'API 未连接');
  }
}

async function obfuscate() {
  const source = sourceInput.value;
  if (!source.trim()) { setMessage('请先输入 Luau 源码', 'error'); sourceInput.focus(); return; }
  if (bytes(source) > 256 * 1024) { setMessage('源码超过 256 KiB，请缩小输入后重试', 'error'); return; }
  runButton.disabled = true;
  $('runLabel').textContent = '处理中…';
  $('inputHint').textContent = '正在发送本次请求';
  setMessage('正在处理源码…', 'working');
  try {
    const response = await fetch(apiUrl('/api/obfuscate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, level: $('level').value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `请求失败 (${response.status})`);
    outputInput.value = result.code;
    $('emptyState').hidden = true;
    $('copyButton').disabled = false;
    $('downloadButton').disabled = false;
    $('inputHint').textContent = '处理完成';
    $('outputHint').textContent = `${result.stats.tokens} 个词法单元`;
    $('statIn').textContent = formatBytes(result.stats.inputBytes);
    $('statOut').textContent = formatBytes(result.stats.outputBytes);
    $('statSaved').textContent = `${result.stats.savedPercent}%`;
    $('statRenamed').textContent = `${result.stats.identifiersRenamed}`;
    updateEditor(source, result.code);
    setMessage('处理完成 — 本次请求结束后，服务器不会保留源码', 'success');
    setService(true, 'API 在线');
  } catch (error) {
    setMessage(error.message || '请求失败，请检查后端地址或网络连接', 'error');
    $('inputHint').textContent = '处理未完成';
    setService(false, configuredApi ? 'API 暂不可达' : 'API 未连接');
  } finally {
    runButton.disabled = false;
    $('runLabel').textContent = '开始混淆';
  }
}

sourceInput.addEventListener('input', () => {
  updateEditor(sourceInput.value);
  $('inputHint').textContent = sourceInput.value.trim() ? '编辑中' : '就绪，等待源码';
});
runButton.addEventListener('click', obfuscate);
$('clearButton').addEventListener('click', () => {
  sourceInput.value = '';
  outputInput.value = '';
  $('emptyState').hidden = false;
  $('copyButton').disabled = true;
  $('downloadButton').disabled = true;
  $('outputHint').textContent = '尚无结果';
  $('inputHint').textContent = '就绪，等待源码';
  ['statIn', 'statOut', 'statSaved', 'statRenamed'].forEach((id) => { $(id).textContent = '—'; });
  updateEditor('');
  setMessage('已清空 — 输入源码以开始处理');
});
$('copyButton').addEventListener('click', async () => {
  if (!outputInput.value) return;
  try {
    await navigator.clipboard.writeText(outputInput.value);
    $('copyButton').textContent = '已复制';
    setTimeout(() => { $('copyButton').textContent = '复制'; }, 1400);
  } catch {
    outputInput.focus(); outputInput.select(); document.execCommand('copy');
    $('copyButton').textContent = '已复制';
    setTimeout(() => { $('copyButton').textContent = '复制'; }, 1400);
  }
});
$('downloadButton').addEventListener('click', () => {
  const blob = new Blob([outputInput.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = 'script.obfuscated.luau'; anchor.click();
  URL.revokeObjectURL(url);
});
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); obfuscate(); }
});
updateEditor(sourceInput.value);
checkService();
