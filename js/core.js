/* ===== 文本编辑器 · 核心工具 / 设置 / 编码 / 文件读写 / 弹窗 ===== */
window.SAK = window.SAK || {};
(function (SAK) {
  'use strict';

  /* ---------- DOM 小工具 ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
        var v = attrs[k];
        if (v === null || v === undefined) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v);
      }
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  SAK.$ = $; SAK.$$ = $$; SAK.el = el;
  SAK.escapeHtml = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  SAK.debounce = function (fn, wait) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, wait);
    };
  };

  /* ---------- 设置 ---------- */
  var SETTINGS_KEY = 'sakura.settings.v2';
  var DEFAULT_SETTINGS = {
    theme: 'light',
    fontSize: 14,
    tabSize: 4,
    insertSpaces: true,
    wordWrap: true,
    lineNumbers: true,
    highlightActiveLine: true,
    autoDetect: true,
    printWidth: 100,
    keymap: {}          // 快捷键覆盖：{ 命令id: "Ctrl-Alt-A" }，空串表示已清空
  };
  var settings = Object.assign({}, DEFAULT_SETTINGS);
  try {
    var raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) Object.assign(settings, JSON.parse(raw));
  } catch (e) { /* 忽略损坏的设置 */ }
  SAK.settings = settings;
  SAK.saveSettings = function () {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { }
  };
  // 老版本存档里可能没有 keymap 字段
  if (!settings.keymap || typeof settings.keymap !== 'object') settings.keymap = {};

  /* ---------- 状态栏消息 ---------- */
  var msgTimer = null;
  SAK.msg = function (text, ms) {
    var node = $('#st-msg');
    if (!node) return;
    node.textContent = text || '';
    if (msgTimer) clearTimeout(msgTimer);
    if (text) msgTimer = setTimeout(function () { node.textContent = ''; }, ms || 4000);
  };
  SAK.error = function (text) { SAK.msg('⚠ ' + text, 7000); };

  /* ---------- 弹窗 ---------- */
  // SAK.modal({title, body, buttons, width, onClose}) -> {close}
  SAK.modal = function (opts) {
    opts = opts || {};
    var root = $('#modal-root');
    var overlay = el('div', { class: 'overlay' });
    var modal = el('div', { class: 'modal', style: opts.width ? { width: opts.width } : null });

    function close(result) {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (opts.onClose) opts.onClose(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    }

    var head = el('div', { class: 'modal-head' }, [
      el('span', { text: opts.title || '' }),
      el('span', { class: 'spacer' }),
      el('button', { class: 'xbtn', title: '关闭', onclick: function () { close(null); } }, '✕')
    ]);
    var body = el('div', { class: 'modal-body' });
    if (typeof opts.body === 'string') body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);
    modal.appendChild(head);
    modal.appendChild(body);

    var api = { close: close, body: body, modal: modal };
    if (opts.buttons && opts.buttons.length) {
      var foot = el('div', { class: 'modal-foot' });
      opts.buttons.forEach(function (b) {
        if (b.el) { foot.appendChild(b.el); return; }   // 允许直接传入按钮元素
        foot.appendChild(el('button', {
          class: 'btn' + (b.primary ? ' primary' : ''),
          text: b.label,
          onclick: function () { b.onClick ? b.onClick(api) : close(null); }
        }));
      });
      modal.appendChild(foot);
    }
    overlay.appendChild(modal);
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay && !opts.sticky) close(null);
    });
    document.addEventListener('keydown', onKey, true);
    root.appendChild(overlay);
    setTimeout(function () {
      var focusable = modal.querySelector('input, select, textarea, button.primary');
      if (focusable) { focusable.focus(); if (focusable.select) try { focusable.select(); } catch (e) { } }
    }, 0);
    return api;
  };

  /** 简易确认框，返回 Promise<boolean> */
  SAK.confirm = function (title, message, okLabel) {
    return new Promise(function (resolve) {
      var done = false;
      SAK.modal({
        title: title,
        body: el('div', { style: { maxWidth: '460px', lineHeight: '1.6' }, text: message }),
        sticky: true,
        buttons: [
          { label: '取消', onClick: function (m) { done = true; m.close(null); resolve(false); } },
          { label: okLabel || '确定', primary: true, onClick: function (m) { done = true; m.close(null); resolve(true); } }
        ],
        onClose: function () { if (!done) resolve(false); }
      });
    });
  };

  /* ---------- 编码定义 ---------- */
  var ENCODINGS = [
    { id: 'UTF-8', label: 'UTF-8', write: true, decoder: 'utf-8' },
    { id: 'UTF-8BOM', label: 'UTF-8 (BOM)', write: true, decoder: 'utf-8' },
    { id: 'UTF-16LE', label: 'UTF-16 LE', write: true, decoder: 'utf-16le' },
    { id: 'UTF-16BE', label: 'UTF-16 BE', write: true, decoder: 'utf-16be' },
    { id: 'SJIS', label: 'Shift_JIS', write: true, jis: 'SJIS' },
    { id: 'EUCJP', label: 'EUC-JP', write: true, jis: 'EUCJP' },
    { id: 'GBK', label: 'GBK / GB2312（只读）', write: false, decoder: 'gbk' },
    { id: 'BIG5', label: 'Big5（只读）', write: false, decoder: 'big5' },
    { id: 'WIN1252', label: 'Windows-1252（只读）', write: false, decoder: 'windows-1252' }
  ];
  var ENC_MAP = {};
  ENCODINGS.forEach(function (e) { ENC_MAP[e.id] = e; });

  SAK.ENCODINGS = ENCODINGS;
  SAK.encodingInfo = function (id) { return ENC_MAP[id] || ENC_MAP['UTF-8']; };
  SAK.encodingLabel = function (id) { return SAK.encodingInfo(id).label; };

  function toBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(data);
  }

  function hasBom(bytes) {
    if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'UTF-8BOM';
    if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return 'UTF-16LE';
    if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return 'UTF-16BE';
    return null;
  }

  function strictDecode(bytes, label) {
    try { return new TextDecoder(label, { fatal: true }).decode(bytes); }
    catch (e) { return null; }
  }

  // 用「假名 / 半角片假名 / 控制字符」判定多字节编码，避免把中文读成日文乱码
  function scoreText(text) {
    if (text === null) return -1e9;
    var score = 0, halfKana = 0, ctrl = 0, len = Math.min(text.length, 4000);
    for (var i = 0; i < len; i++) {
      var code = text.charCodeAt(i);
      if (code < 0x20 && code !== 9 && code !== 10 && code !== 13) ctrl++;
      else if (code < 0x80) score += 1;
      else if (code >= 0x3040 && code <= 0x30FF) score += 6;
      else if (code >= 0xFF61 && code <= 0xFF9F) halfKana++;
      else if (code >= 0x4E00 && code <= 0x9FFF) score += 4;
      else if (code >= 0x3000 && code <= 0x303F) score += 4;
      else if (code >= 0xFF00 && code <= 0xFF60) score += 3;
      else if (code === 0xFFFD) score -= 40;
      else score += 1;
    }
    return score - halfKana * 5 - ctrl * 8;
  }

  function guessCjk(bytes) {
    var cands = [['SJIS', strictDecode(bytes, 'shift_jis')], ['GBK', strictDecode(bytes, 'gbk')],
    ['BIG5', strictDecode(bytes, 'big5')], ['EUCJP', strictDecode(bytes, 'euc-jp')]];
    var best = 'GBK', bestScore = -Infinity;
    for (var i = 0; i < cands.length; i++) {
      var s = scoreText(cands[i][1]);
      if (s > bestScore) { bestScore = s; best = cands[i][0]; }
    }
    return best;
  }

  SAK.encoding = {
    isValidUtf8: function (data) {
      try { new TextDecoder('utf-8', { fatal: true }).decode(toBytes(data)); return true; }
      catch (e) { return false; }
    },
    detect: function (data) {
      var bytes = toBytes(data);
      var bom = hasBom(bytes);
      if (bom) return bom;
      if (bytes.length === 0) return 'UTF-8';
      if (SAK.encoding.isValidUtf8(bytes)) return 'UTF-8';
      if (typeof Encoding !== 'undefined') {
        var d = Encoding.detect(bytes);
        if (d === 'EUCJP') return 'EUCJP';
        if (d === 'SJIS') return 'SJIS';
        if (d === 'UTF16') return 'UTF-16LE';
      }
      return guessCjk(bytes);
    },
    decode: function (data, encId) {
      var bytes = toBytes(data);
      var info = SAK.encodingInfo(encId);
      var body = bytes;
      if (info.id === 'UTF-8BOM') body = bytes.subarray(3);
      else if (info.id === 'UTF-16LE' || info.id === 'UTF-16BE') {
        if (bytes.length >= 2 && ((bytes[0] === 0xFF && bytes[1] === 0xFE) || (bytes[0] === 0xFE && bytes[1] === 0xFF))) {
          body = bytes.subarray(2);
        }
      }
      if (info.jis && typeof Encoding !== 'undefined') {
        var codes = Encoding.convert(body, { to: 'UNICODE', from: info.jis, type: 'array' });
        return Encoding.codeToString(codes);
      }
      try { return new TextDecoder(info.decoder || 'utf-8', { fatal: false }).decode(body); }
      catch (e) { return new TextDecoder('utf-8').decode(body); }
    },
    encode: function (text, encId) {
      var info = SAK.encodingInfo(encId);
      if (info.jis) {
        if (typeof Encoding === 'undefined') throw new Error('缺少 encoding-japanese 库');
        var arr = Encoding.convert(Encoding.stringToCode(text), { to: info.jis, from: 'UNICODE', type: 'array' });
        return new Uint8Array(arr);
      }
      if (info.id === 'UTF-16LE' || info.id === 'UTF-16BE') {
        var le = info.id === 'UTF-16LE';
        var out = new Uint8Array(2 + text.length * 2);
        out[0] = le ? 0xFF : 0xFE;
        out[1] = le ? 0xFE : 0xFF;
        for (var i = 0; i < text.length; i++) {
          var code = text.charCodeAt(i);
          out[2 + i * 2] = le ? (code & 0xFF) : (code >> 8);
          out[3 + i * 2] = le ? (code >> 8) : (code & 0xFF);
        }
        return out;
      }
      var utf8 = new TextEncoder().encode(text);
      if (info.id === 'UTF-8BOM') {
        var withBom = new Uint8Array(utf8.length + 3);
        withBom[0] = 0xEF; withBom[1] = 0xBB; withBom[2] = 0xBF;
        withBom.set(utf8, 3);
        return withBom;
      }
      return utf8;
    },
    isBinary: function (data) {
      var bytes = toBytes(data);
      var bom = hasBom(bytes);
      if (bom === 'UTF-16LE' || bom === 'UTF-16BE') return false;
      var n = Math.min(bytes.length, 8192);
      for (var i = 0; i < n; i++) if (bytes[i] === 0) return true;
      return false;
    }
  };

  /* ---------- 换行符 ---------- */
  SAK.NEWLINES = [
    { id: 'CRLF', label: 'CRLF (Windows)', seq: '\r\n' },
    { id: 'LF', label: 'LF (Unix)', seq: '\n' },
    { id: 'CR', label: 'CR (Mac)', seq: '\r' }
  ];
  SAK.newlineSeq = function (id) {
    for (var i = 0; i < SAK.NEWLINES.length; i++) if (SAK.NEWLINES[i].id === id) return SAK.NEWLINES[i].seq;
    return '\r\n';
  };
  SAK.detectNewline = function (text) {
    var crlf = (text.match(/\r\n/g) || []).length;
    var lf = (text.match(/(^|[^\r])\n/g) || []).length;
    var cr = (text.match(/\r(?!\n)/g) || []).length;
    if (crlf === 0 && lf === 0 && cr === 0) return 'CRLF';
    if (crlf >= lf && crlf >= cr) return 'CRLF';
    if (lf >= cr && lf >= crlf) return 'LF';
    return 'CR';
  };
  SAK.normalizeNewline = function (text) { return text.replace(/\r\n?/g, '\n'); };
  SAK.applyNewline = function (text, nlId) {
    var seq = SAK.newlineSeq(nlId);
    return seq === '\n' ? text : text.replace(/\n/g, seq);
  };

  /* ---------- 文件读写 ---------- */
  var hasFsAccess = typeof window.showOpenFilePicker === 'function';

  function readBlob(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(new Uint8Array(fr.result)); };
      fr.onerror = function () { reject(fr.error || new Error('读取失败')); };
      fr.readAsArrayBuffer(blob);
    });
  }

  SAK.fs = {
    supported: hasFsAccess,
    readBlob: readBlob,

    pickOpen: async function () {
      if (hasFsAccess) {
        var handles = await window.showOpenFilePicker({ multiple: true });
        var out = [];
        for (var i = 0; i < handles.length; i++) {
          var file = await handles[i].getFile();
          out.push({ name: file.name, bytes: await readBlob(file), handle: handles[i], size: file.size });
        }
        return out;
      }
      return SAK.fs.pickOpenFallback();
    },

    pickOpenFallback: function () {
      return new Promise(function (resolve) {
        var input = el('input', { type: 'file', multiple: 'multiple', style: { display: 'none' } });
        document.body.appendChild(input);
        input.addEventListener('change', async function () {
          var out = [];
          for (var i = 0; i < input.files.length; i++) {
            var f = input.files[i];
            out.push({ name: f.name, bytes: await readBlob(f), handle: null, size: f.size });
          }
          input.remove();
          resolve(out);
        });
        input.addEventListener('cancel', function () { input.remove(); resolve([]); });
        input.click();
      });
    },

    pickSave: async function (suggestedName) {
      if (!hasFsAccess) return null;
      try {
        return await window.showSaveFilePicker({ suggestedName: suggestedName || 'untitled.txt' });
      } catch (e) {
        if (e && e.name === 'AbortError') return undefined;
        throw e;
      }
    },

    write: async function (handle, bytes, name) {
      if (handle && handle.createWritable) {
        var w = await handle.createWritable();
        await w.write(bytes);
        await w.close();
        return true;
      }
      var blob = new Blob([bytes], { type: 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: name || 'untitled.txt' });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
      return false;
    }
  };

  /* ---------- 粘贴进来的文件（可点击路径） ---------- */
  var linkSeq = 0;
  var linkStore = {};
  SAK.fileLinks = {
    add: function (file, display) {
      var id = ++linkSeq;
      linkStore[id] = { file: file, display: display || file.name || ('文件' + id) };
      return id;
    },
    get: function (id) { return linkStore[id] || null; },
    /** 取真实路径：Electron 等环境才有，浏览器只能拿到文件名 */
    pathOf: function (file) { return file && (file.path || file.webkitRelativePath) || ''; }
  };

  /* ---------- 动态加载脚本（格式化库按需加载） ---------- */
  // 应用根目录：以 core.js 自身的 URL 为基准，这样从任意层级页面打开都能正确加载
  SAK.BASE = (function () {
    try {
      var s = document.currentScript;
      if (s && s.src) return s.src.replace(/\/js\/core\.js(\?.*)?$/, '');
    } catch (e) { }
    return '.';
  })();

  function resolveUrl(src) {
    if (/^[a-z]+:/i.test(src) || src.charAt(0) === '/') return src;
    return SAK.BASE + '/' + src;
  }
  SAK.resolveUrl = resolveUrl;

  var scriptCache = {};
  SAK.loadScript = function (src) {
    var url = resolveUrl(src);
    if (scriptCache[url]) return scriptCache[url];
    scriptCache[url] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('无法加载 ' + url)); };
      document.head.appendChild(s);
    });
    return scriptCache[url];
  };

})(window.SAK);
