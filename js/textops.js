/* ===== 文本转换：大小写 / 中英标点 / 全角半角 / 批量替换 / 翻译方向与分块 =====
 * 这里全部是纯字符串处理，不碰 DOM，所以 test/unit.js 能直接用 node 跑。
 * 所有转换函数统一返回 { text: 结果, count: 改动字符数 }，方便状态栏报数。
 */
(function (SAK) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 大小写
   * ------------------------------------------------------------------ */
  function mapChars(text, fn) {
    var out = '', count = 0;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      var n = fn(c);
      if (n !== c) count++;
      out += n;
    }
    return { text: out, count: count };
  }

  /** 小写字母 → 大写（只改字母，其它字符原样） */
  function toUpper(text) {
    return mapChars(String(text == null ? '' : text), function (c) { return c.toUpperCase(); });
  }

  /** 大写字母 → 小写（只改字母，其它字符原样） */
  function toLower(text) {
    return mapChars(String(text == null ? '' : text), function (c) { return c.toLowerCase(); });
  }

  /* ------------------------------------------------------------------ *
   * 改动统计 / 首个差异位置（批量替换的预览用得上）
   * ------------------------------------------------------------------ */
  function firstDiff(a, b) {
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) if (a.charAt(i) !== b.charAt(i)) return i;
    return a.length === b.length ? -1 : n;
  }

  /** 粗略统计改动字符数：同一位置不同算 1 个，长度差也算进去 */
  function diffCount(a, b) {
    var n = Math.min(a.length, b.length), count = Math.abs(a.length - b.length);
    for (var i = 0; i < n; i++) if (a.charAt(i) !== b.charAt(i)) count++;
    return count;
  }

  /* ------------------------------------------------------------------ *
   * 中英标点 / 全角半角
   * ------------------------------------------------------------------ */
  var FULL_SPACE = '\u3000';              // 全角空格
  var MULTI_ZH = { '……': '...', '——': '-', '－－': '-' };
  var SINGLE_ZH = {
    '，': ',', '。': '.', '、': ',', '；': ';', '：': ':',
    '！': '!', '？': '?', '（': '(', '）': ')',
    '【': '[', '】': ']', '《': '<', '》': '>',
    '“': '"', '”': '"', '‘': "'", '’': "'",
    '～': '~', '％': '%', '＃': '#', '＆': '&', '＠': '@',
    '｜': '|', '＼': '\\', '＄': '$', '＊': '*', '＋': '+', '＝': '=', '－': '-',
    '｛': '{', '｝': '}', '＜': '<', '＞': '>'
  };

  function isDigit(c) { return c >= '0' && c <= '9'; }
  function isWordChar(c) { return /[0-9A-Za-z]/.test(c || ''); }

  /** 中文标点 → 英文标点；alnum 为真时连全角字母数字（ＡＢＣ１２３）一起转半角 */
  function zhToEn(text, alnum) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var two = text.substr(i, 2);
      if (MULTI_ZH[two]) { out += MULTI_ZH[two]; i++; continue; }
      var c = text.charAt(i);
      if (Object.prototype.hasOwnProperty.call(SINGLE_ZH, c)) { out += SINGLE_ZH[c]; continue; }
      var code = text.charCodeAt(i);
      if (code === 0x3000) { out += ' '; continue; }
      if (alnum && code >= 0xFF01 && code <= 0xFF5E) { out += String.fromCharCode(code - 0xFEE0); continue; }
      out += c;
    }
    return out;
  }

  /**
   * 英文标点 → 中文标点（半角 → 全角）
   * 刻意保留「成对出现才有意义」和「转了就出错」的情况：
   *   3.14 / a.txt / e.g 里的点、1,000 里的逗号、10:30 里的冒号都不动；
   *   引号按出现顺序配对成 “ ” ‘ ’，don't 里的撇号识别成 ’；
   *   只做标点语义转换，字母数字要转全角得显式打开 alnum。
   */
  function enToZh(text, alnum) {
    var out = '', dq = false, sq = false;
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i), p = text.charAt(i - 1), n = text.charAt(i + 1);
      switch (c) {
        case '.': out += (isWordChar(p) && isWordChar(n)) ? '.' : '。'; continue;
        case ',': out += (isDigit(p) && isDigit(n)) ? ',' : '，'; continue;
        case ';': out += (isDigit(p) && isDigit(n)) ? ';' : '；'; continue;
        case ':': out += (isDigit(p) && isDigit(n)) ? ':' : '：'; continue;
        case '!': out += '！'; continue;
        case '?': out += '？'; continue;
        case '(': out += '（'; continue;
        case ')': out += '）'; continue;
        case '[': out += '【'; continue;
        case ']': out += '】'; continue;
        case '~': out += '～'; continue;
        case '"': out += dq ? '”' : '“'; dq = !dq; continue;
        case "'":
          if (/[A-Za-z]/.test(p || '') && /[A-Za-z]/.test(n || '')) { out += '’'; continue; }
          out += sq ? '’' : '‘'; sq = !sq; continue;
      }
      var code = text.charCodeAt(i);
      if (alnum && code >= 0x21 && code <= 0x7E) { out += String.fromCharCode(code + 0xFEE0); continue; }
      out += c;
    }
    return out;
  }

  /**
   * 标点方向转换
   * dir: 'zh2en'（中文标点 → 英文标点）| 'en2zh'（英文标点 → 中文标点）
   * opts.alnum: 是否连全角/半角字母数字符号一起转（默认否，只转标点）
   */
  function convertPunctuation(text, dir, opts) {
    opts = opts || {};
    var src = String(text == null ? '' : text);
    var alnum = !!opts.alnum;
    var out = dir === 'zh2en' ? zhToEn(src, alnum) : enToZh(src, alnum);
    return { text: out, count: diffCount(src, out) };
  }

  /** 判断一段文字更该翻成哪种语言：中文居多 → 翻英文，否则 → 翻中文 */
  function detectTranslateTarget(text) {
    var s = String(text == null ? '' : text);
    var cjk = 0, latin = 0;
    for (var i = 0; i < s.length; i++) {
      var code = s.charCodeAt(i);
      if ((code >= 0x3400 && code <= 0x4DBF) || (code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0xF900 && code <= 0xFAFF) || (code >= 0x3040 && code <= 0x30FF) ||
        (code >= 0xAC00 && code <= 0xD7AF)) cjk++;
      else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) latin++;
    }
    if (cjk === 0) return 'zh-CN';
    return cjk >= latin ? 'en' : 'zh-CN';
  }

  /**
   * 把待翻译文字切成若干块（翻译接口对长度有限制）。
   * 按行切，超长单行硬切；返回值里带 sep —— 它是这一块与上一块之间的原始分隔符，
   * 拼回去时用得上（硬切出来的块用空串，行与行之间用 \n），这样译文结构不会走样。
   */
  function splitForTranslate(text, maxLen) {
    maxLen = maxLen || 1800;
    var src = String(text == null ? '' : text);
    var parts = [];
    var buf = null;                        // { text, sep }
    function flush() { if (buf !== null) { parts.push(buf); buf = null; } }
    var lines = src.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var sep = i === 0 ? '' : '\n';
      if (line.length > maxLen) {
        for (var off = 0; off < line.length; off += maxLen) {
          flush();
          parts.push({ text: line.substr(off, maxLen), sep: off === 0 ? sep : '' });
        }
        continue;
      }
      if (buf !== null && buf.text.length + sep.length + line.length > maxLen) flush();
      if (buf === null) buf = { text: line, sep: sep };
      else buf.text += sep + line;
    }
    flush();
    if (!parts.length) parts.push({ text: '', sep: '' });
    return parts;
  }

  /* ------------------------------------------------------------------ *
   * 批量文字替换
   * ------------------------------------------------------------------ */
  function escapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** 非正则模式下允许在输入框里写 \n \r \t \\ ，把它们还原成真实字符 */
  function decodeEscapes(s) {
    return String(s == null ? '' : s).replace(/\\(n|r|t|\\)/g, function (m, ch) {
      if (ch === 'n') return '\n';
      if (ch === 'r') return '\r';
      if (ch === 't') return '\t';
      return '\\';
    });
  }

  /**
   * 编译「查找内容」：正则模式下按正则，普通模式下按字面量（特殊字符自动转义）。
   * 正则写错会抛异常，调用方负责提示。
   */
  function compileFind(find, opts) {
    opts = opts || {};
    var flags = 'g' + (opts.caseSensitive ? '' : 'i');
    var pattern = opts.regex ? String(find) : escapeRegExp(decodeEscapes(find));
    return new RegExp(pattern, flags);
  }

  /**
   * 按顺序依次应用多条规则
   * rules: [{ find, to }]，find 为空的行会被跳过
   * opts:  { caseSensitive, regex }
   * 返回 { text, count, perRule: [每条规则的替换次数] }
   */
  function batchReplace(text, rules, opts) {
    opts = opts || {};
    var cur = String(text == null ? '' : text);
    var total = 0, perRule = [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i] || {};
      var find = r.find == null ? '' : String(r.find);
      if (!find) { perRule.push(0); continue; }
      var re = compileFind(find, opts);
      var n = 0;
      if (opts.regex) {
        // 正则模式必须把替换串交给 String.replace 本体，$1 / $& 这类反向引用才有意义，
        // 所以命中数先用 match 数一遍（用替换函数的话 $1 会变成字面量）
        var hits = cur.match(re);
        cur = cur.replace(re, decodeEscapes(r.to == null ? '' : r.to));
        n = hits ? hits.length : 0;
      } else {
        // 普通模式：替换内容是纯字面量，$ 不能被当成反向引用，只能走替换函数
        var literal = decodeEscapes(r.to == null ? '' : r.to);
        cur = cur.replace(re, function () {
          n++;
          return literal;
        });
      }
      perRule.push(n);
      total += n;
    }
    return { text: cur, count: total, perRule: perRule };
  }

  SAK.textops = {
    toUpper: toUpper,
    toLower: toLower,
    firstDiff: firstDiff,
    diffCount: diffCount,
    convertPunctuation: convertPunctuation,
    detectTranslateTarget: detectTranslateTarget,
    splitForTranslate: splitForTranslate,
    escapeRegExp: escapeRegExp,
    decodeEscapes: decodeEscapes,
    compileFind: compileFind,
    batchReplace: batchReplace
  };

})(window.SAK);
