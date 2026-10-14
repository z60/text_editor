'use strict';
/**
 * 文本编辑器 —— 本地静态服务器（零依赖）
 * 作用：把工作目录通过 http://127.0.0.1:PORT 提供出来。
 * 之所以需要它，是因为「文件系统访问 API」(showOpenFilePicker / showDirectoryPicker)
 * 只在安全上下文(http://localhost)下可用，直接用 file:// 打开会失去本地读写和 Grep 目录能力。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const translate = require('./translate');

const ROOT = __dirname;
const BASE_PORT = Number(process.env.PORT || 5173);

// 给托盘 / 诊断用的自述信息：静态文件是每次请求现读磁盘的，但「进程里」的代码是启动时载入的。
// 托盘拿 startedAt 和 server.js / translate.js 的修改时间一比，就知道自己复用的服务是不是旧代码。
const APP_ID = 'sakura-like-editor';
const STARTED_AT = new Date().toISOString();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, 'application/json; charset=utf-8', JSON.stringify(obj));
}

/* ---------- 翻译接口 ----------
 * 页面不直接连翻译服务（跨域会被挡），统一走这里：
 * POST /api/translate  { text, from?, to? }  →  { text, provider, from, to }
 * 服务端按「腾讯 → 有道 → Google → MyMemory」的顺序重试，全挂才报 502。
 */
const MAX_TRANSLATE_CHARS = 4000;

function readJsonBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('请求内容过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', (e) => reject(e));
  });
}

async function handleTranslate(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req, 256 * 1024);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }
  const text = String(payload.text == null ? '' : payload.text);
  if (!text.trim()) return sendJson(res, 400, { error: '没有要翻译的文字' });
  if (text.length > MAX_TRANSLATE_CHARS) {
    return sendJson(res, 413, { error: '单次翻译的文字过长（上限 ' + MAX_TRANSLATE_CHARS + ' 字符）' });
  }
  try {
    const r = await translate.translateText(text, payload.from || 'auto', payload.to || 'zh-CN');
    console.log('翻译成功：' + r.provider + '，' + text.length + ' 字符');
    return sendJson(res, 200, { text: r.text, provider: r.provider, from: r.from, to: r.to });
  } catch (e) {
    console.error('翻译失败：' + (e && e.message ? e.message : e) + (e && e.detail ? ' | ' + e.detail : ''));
    return sendJson(res, 502, {
      error: (e && e.message) || '翻译失败',
      detail: (e && e.detail) || ''
    });
  }
}

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch (e) {
    return send(res, 400, 'text/plain; charset=utf-8', '400 Bad Request');
  }
  if (urlPath === '/') urlPath = '/index.html';

  if (urlPath === '/api/translate') {
    if (req.method !== 'POST') return sendJson(res, 405, { error: '请用 POST 调用' });
    return handleTranslate(req, res);
  }

  if (urlPath === '/api/version') {
    const addr = server.address();
    return sendJson(res, 200, {
      app: APP_ID,
      pid: process.pid,
      startedAt: STARTED_AT,
      node: process.version,
      port: addr && addr.port ? addr.port : port
    });
  }

  const target = path.resolve(ROOT, '.' + urlPath);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return send(res, 403, 'text/plain; charset=utf-8', '403 Forbidden');
  }

  fs.stat(target, (err, st) => {
    if (err || !st.isFile()) {
      return send(res, 404, 'text/plain; charset=utf-8', '404 Not Found: ' + urlPath);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(target).pipe(res);
  });
});

let port = BASE_PORT;
let retries = 0;
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && retries < 20) {
    retries++;
    port++;
    console.log('端口被占用，改用 ' + port + ' ...');
    server.listen(port, '127.0.0.1');
    return;
  }
  console.error('启动失败：' + err.message);
  process.exit(1);
});

server.listen(port, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + port + '/';
  // 把实际端口写下来，托盘程序据此打开正确的地址（端口被占用时会自动换端口）
  try { fs.writeFileSync(path.join(ROOT, '.server-port'), String(port), 'utf8'); } catch (e) { }
  console.log('');
  console.log('  文本编辑器已启动');
  console.log('  地址: ' + url);
  console.log('  关闭本窗口即退出程序。');
  console.log('');
  if (!process.env.NO_OPEN) {
    execFile('cmd', ['/c', 'start', '', url], () => {});
  }
});

function cleanup() {
  try { fs.unlinkSync(path.join(ROOT, '.server-port')); } catch (e) { }
}
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);
