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

const ROOT = __dirname;
const BASE_PORT = Number(process.env.PORT || 5173);

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

const server = http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
  } catch (e) {
    return send(res, 400, 'text/plain; charset=utf-8', '400 Bad Request');
  }
  if (urlPath === '/') urlPath = '/index.html';

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
