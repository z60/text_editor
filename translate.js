'use strict';
/**
 * 翻译提供方（服务端用，零依赖）
 *
 * 浏览器端不直接连翻译服务：一是跨域会被挡，二是把请求集中到本地服务里方便按顺序重试。
 * 这里按「国内可直连 → 国外」的顺序排：腾讯交互翻译 → 有道 → Google → MyMemory，
 * 前一个失败就自动试下一个；每个提供方都拆成 build（造请求）和 parse（解析响应），
 * 这样 test/unit.js 不用联网也能验证解析逻辑。
 */
const https = require('https');
const { URL } = require('url');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_TIMEOUT = 12000;
const MAX_RESPONSE = 2 * 1024 * 1024;

/** 统一成 'en' / 'zh' 两种目标语言 */
function normalizeTarget(to) {
  return /^en/i.test(String(to || '')) ? 'en' : 'zh';
}

function normalizeSource(from) {
  const f = String(from || 'auto');
  if (/^en/i.test(f)) return 'en';
  if (/^zh/i.test(f)) return 'zh';
  return 'auto';
}

const PROVIDERS = [
  {
    name: 'tencent',
    label: '腾讯交互翻译',
    build: function (text, from, to) {
      const body = JSON.stringify({
        header: { fn: 'auto_translation', client_key: 'browser-chrome-110.0.0' },
        type: 'plain',
        model_category: 'normal',
        source: { lang: normalizeSource(from), text_list: [text] },
        target: { lang: normalizeTarget(to) }
      });
      return {
        url: 'https://transmart.qq.com/api/imt',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        body: body
      };
    },
    parse: function (raw) {
      const data = JSON.parse(raw);
      const ret = data && data.header && data.header.ret_code;
      if (ret && ret !== 'succ') throw new Error('返回 ret_code=' + ret);
      const arr = data && data.auto_translation;
      if (!Array.isArray(arr) || !arr.length) throw new Error('返回内容为空');
      return { text: arr.join('\n'), from: data.src_lang || '', to: data.tgt_lang || '' };
    }
  },
  {
    name: 'youdao',
    label: '有道翻译',
    build: function (text, from, to) {
      return {
        url: 'https://aidemo.youdao.com/trans?q=' + encodeURIComponent(text) + '&from=Auto&to=Auto',
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      };
    },
    parse: function (raw) {
      const data = JSON.parse(raw);
      if (data && data.errorCode !== undefined && String(data.errorCode) !== '0') {
        throw new Error('返回 errorCode=' + data.errorCode);
      }
      const arr = data && data.translation;
      if (!Array.isArray(arr) || !arr.length) throw new Error('返回内容为空');
      return { text: arr.join('\n'), from: '', to: '' };
    }
  },
  {
    name: 'google',
    label: 'Google 翻译',
    build: function (text, from, to) {
      const body = 'client=gtx&sl=' + encodeURIComponent(normalizeSource(from)) +
        '&tl=' + encodeURIComponent(normalizeTarget(to)) + '&dt=t&q=' + encodeURIComponent(text);
      return {
        url: 'https://translate.googleapis.com/translate_a/single',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          'Content-Length': Buffer.byteLength(body)
        },
        body: body
      };
    },
    parse: function (raw) {
      const data = JSON.parse(raw);
      const segs = data && data[0];
      if (!Array.isArray(segs)) throw new Error('返回格式异常');
      const text = segs.map(function (s) { return s && s[0] ? s[0] : ''; }).join('');
      if (!text) throw new Error('返回内容为空');
      return { text: text, from: data[2] || '', to: data[3] || '' };
    }
  },
  {
    name: 'mymemory',
    label: 'MyMemory',
    build: function (text, from, to) {
      const tgt = normalizeTarget(to) === 'en' ? 'en' : 'zh-CN';
      const src = tgt === 'en' ? 'zh-CN' : 'en';
      return {
        url: 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(text) +
          '&langpair=' + encodeURIComponent(src + '|' + tgt),
        method: 'GET',
        headers: { 'Accept': 'application/json, text/plain, */*' }
      };
    },
    parse: function (raw) {
      const data = JSON.parse(raw);
      const text = data && data.responseData && data.responseData.translatedText;
      if (!text) throw new Error((data && data.responseDetails) || '返回内容为空');
      if (/QUERY LENGTH LIMIT|INVALID (SOURCE|TARGET|EMAIL)/i.test(text)) throw new Error(text);
      return { text: text, from: '', to: '' };
    }
  }
];

const BY_NAME = {};
PROVIDERS.forEach(function (p) { BY_NAME[p.name] = p; });

/** 发一个 https 请求，把响应体当字符串返回 */
function httpRequest(built, timeout) {
  return new Promise(function (resolve, reject) {
    let url;
    try { url = new URL(built.url); } catch (e) { return reject(new Error('接口地址非法')); }
    const req = https.request({
      method: built.method || 'GET',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: Object.assign({ 'User-Agent': UA }, built.headers || {})
    }, function (res) {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        data += chunk;
        if (data.length > MAX_RESPONSE) req.destroy(new Error('响应内容过大'));
      });
      res.on('end', function () {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('HTTP ' + res.statusCode));
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout || DEFAULT_TIMEOUT, function () { req.destroy(new Error('请求超时')); });
    if (built.body) req.write(built.body);
    req.end();
  });
}

/**
 * 依次尝试各个提供方，第一个成功就返回
 * @returns {Promise<{text:string, provider:string, from:string, to:string, tried:string[]}>}
 */
async function translateText(text, from, to, opts) {
  opts = opts || {};
  const chain = opts.only ? [BY_NAME[opts.only]].filter(Boolean) : PROVIDERS;
  const request = opts.request || httpRequest;
  const timeout = opts.timeout || DEFAULT_TIMEOUT;
  const tried = [];
  for (const p of chain) {
    try {
      const built = p.build(text, from, to);
      const raw = await request(built, timeout);
      const out = p.parse(raw);
      if (!out.text || !out.text.trim()) throw new Error('返回内容为空');
      return {
        text: out.text,
        provider: p.label,
        name: p.name,
        from: out.from || '',
        to: out.to || normalizeTarget(to),
        tried: tried
      };
    } catch (e) {
      tried.push(p.label + '：' + ((e && e.message) || e));
    }
  }
  const err = new Error('翻译服务不可用（需要联网）');
  err.detail = tried.join('；');
  throw err;
}

module.exports = {
  providers: PROVIDERS,
  providerByName: function (name) { return BY_NAME[name] || null; },
  normalizeTarget: normalizeTarget,
  normalizeSource: normalizeSource,
  httpRequest: httpRequest,
  translateText: translateText
};
