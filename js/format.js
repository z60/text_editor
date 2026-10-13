/* ===== 代码格式化：Prettier / js-beautify / sql-formatter / 内置结构重排 ===== */
(function (SAK) {
  'use strict';

  var VENDOR = 'node_modules/';

  /* ------------------------------------------------------------------ *
   * 工具：把字符串与注释内容抹掉，只留下代码结构，便于安全地统计括号
   *   抹掉的位置填 FILLER（\u0001）而不是空格，这样「代码里的空白」和
   *   「字符串/注释里的内容」就能区分开：后者必须原样搬运，一个字都不能动。
   * ------------------------------------------------------------------ */
  var FILLER = '\u0001';

  function fill(n) { return n > 0 ? new Array(n + 1).join(FILLER) : ''; }

  function maskCode(lines, hashComment) {
    var out = [];
    var inBlock = false;
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var res = '';
      var i = 0;
      while (i < line.length) {
        if (inBlock) {
          if (line[i] === '*' && line[i + 1] === '/') { inBlock = false; res += FILLER + FILLER; i += 2; }
          else { res += FILLER; i++; }
          continue;
        }
        var c = line[i], n = line[i + 1];
        if (c === '/' && n === '*') { inBlock = true; res += FILLER + FILLER; i += 2; continue; }
        if (c === '/' && n === '/') { res += fill(line.length - i); break; }
        if (hashComment && c === '#') { res += fill(line.length - i); break; }
        if (c === '"' || c === "'" || c === '`') {
          var q = c;
          res += FILLER;
          i++;
          while (i < line.length) {
            if (line[i] === '\\') { res += FILLER + FILLER; i += 2; continue; }
            var done = (line[i] === q);
            res += FILLER;
            i++;
            if (done) break;
          }
          continue;
        }
        res += c;
        i++;
      }
      out.push(res);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 大括号语言的「行内空格规范化」
   *   在 mask（FILLER = 字符串/注释，原字符 = 代码，空格 = 代码空白）的对照下
   *   只增删空白，一个代码字符都不改，所以不会改变程序语义。
   * ------------------------------------------------------------------ */

  // 这些关键字后面要空一格再写 '('：if ( / for ( / while ( ...
  var SPACE_BEFORE_PAREN = ['if', 'for', 'while', 'switch', 'catch', 'synchronized', 'try', 'return', 'throw', 'assert'];

  // 多字符运算符（从长到短匹配）
  var OP_TOKENS = [
    '>>>=', '??=', '**=', '//=',
    '>>=', '<<=', '>>>', '...',
    '>=', '<=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
    '++', '--', '->', '::', '=>', '??', '?.', '?:', ':=', '<-', '**', '//', '>>', '<<', '<>', '?['
  ];

  // 两侧补空格的运算符
  var SPACED_OPS = {
    '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '&=': 1, '|=': 1, '^=': 1,
    '>>=': 1, '<<=': 1, '>>>=': 1, '??=': 1, '**=': 1, '//=': 1,
    '==': 1, '!=': 1, '<=': 1, '>=': 1, '&&': 1, '||': 1,
    '+': 1, '-': 1, '*': 1, '/': 1, '%': 1, '&': 1, '|': 1, '^': 1,
    '>>': 1, '<<': 1, '>>>': 1, '**': 1, '//': 1,
    '->': 1, '=>': 1, '??': 1, '?:': 1, ':=': 1, '<-': 1,
    '<': 1, '>': 1
  };

  // 原样输出、两侧不留空格的运算符
  var TIGHT_OPS = { '++': 1, '--': 1, '::': 1, '...': 1, '?.': 1, '?[': 1, '<>': 1 };

  // 可能是一元前缀的运算符（前面是运算符 / 左括号 / 行首时按一元处理）
  var MAYBE_UNARY = { '-': 1, '+': 1, '*': 1, '&': 1, '**': 1 };

  var UNARY_PREV_CHARS = '([{,;:=.!&|+-*/%^<>?~';
  var UNARY_PREV_WORDS = /^(return|case|throw|new|else|do|yield|await|instanceof|typeof|delete|void|in|of)$/;

  /**
   * '<' 是不是泛型的开始：List<String> / Map<K, List<V>> / new ArrayList<>()
   * 判定要点：'<' 紧后面不能是空格（写了 a < b 就一定是比较），
   * 中间只允许出现类型里会有的字符，配对的 '>' 紧前面也不能是空格。
   * @returns {number} 配对 '>' 的下标；不是泛型返回 -1
   */
  function genericSpanEnd(line, mask, i) {
    var n = line.length;
    if (i + 1 >= n || line[i + 1] === ' ' || line[i + 1] === '\t') return -1;
    var depth = 0;
    for (var j = i; j < n; j++) {
      var c = line[j];
      if (mask[j] === FILLER) return -1;                  // 进了字符串 / 注释，不猜
      if (c === '&' && line[j + 1] === '&') return -1;    // && 一定是布尔运算，泛型里不会出现
      if (c === '<') { depth++; continue; }
      if (c === '>') {
        if (line[j - 1] === ' ' || line[j - 1] === '\t') return -1;
        depth--;
        if (depth === 0) {
          var next = '';
          for (var k = j + 1; k < n; k++) {
            if (line[k] !== ' ' && line[k] !== '\t') { next = line[k]; break; }
          }
          if (!next) return j;
          return /[A-Za-z0-9_$.,;()[\]{}<>?:=]/.test(next) ? j : -1;
        }
        continue;
      }
      if (!/[A-Za-z0-9_$.,?\[\] \t&@]/.test(c)) return -1;
    }
    return -1;
  }

  /** 一行代码的空格规范化（大括号语言）。line 与 mask 等长，且都已去掉前导缩进。 */
  function tidySpacing(line, mask, opt) {
    var pointerArrow = !!(opt && opt.pointerArrow);   // C/C++/PHP：-> 是成员访问，两侧不留空格
    var out = [];
    var n = line.length;
    var i = 0;
    var word = '';              // 正在读的标识符（用来认 if / for 这类关键字）
    var prevCode = '';          // 上一个代码字符（字符串 / 注释不算）
    var noSpaceAfter = false;   // 刚输出一元前缀或左括号，后面的空白要丢掉
    var kwRe = new RegExp('^(?:' + SPACE_BEFORE_PAREN.join('|') + ')$');

    // 找出本行「看起来是三元运算符」的 '?'：
    //   · 前面本来就有空格的（a ? b : c）
    //   · 前后都紧贴着、且本行还有内容跟在某个 ':' 后面的（a?b:c）
    //   C#/Kotlin 的 int? x / String? 是「紧贴前面、后面有空格」，所以不会被误判成三元
    var hasTernaryColon = false;
    for (var tc = 0; tc < n; tc++) {
      if (mask[tc] === FILLER || line[tc] !== ':') continue;
      if (nextNonBlank(tc + 1) !== -1) { hasTernaryColon = true; break; }
    }
    var ternaryQ = {}, firstTernaryQ = -1;
    for (var tq = 0; tq < n; tq++) {
      if (mask[tq] === FILLER || line[tq] !== '?') continue;
      var afterQ = line[tq + 1];
      if (afterQ === '?' || afterQ === '.' || afterQ === ':') continue;
      var beforeQ = tq > 0 && (line[tq - 1] === ' ' || line[tq - 1] === '\t');
      var spacedQ = tq + 1 < n && (line[tq + 1] === ' ' || line[tq + 1] === '\t');
      if (beforeQ || (!spacedQ && hasTernaryColon)) {
        ternaryQ[tq] = true;
        if (firstTernaryQ < 0) firstTernaryQ = tq;
      }
    }

    function isCode(k) { return k < n && mask[k] !== FILLER && line[k] !== ' ' && line[k] !== '\t'; }
    function isVerbatim(k) { return k < n && mask[k] === FILLER; }
    function nextNonBlank(from) {
      for (var k = from; k < n; k++) if (line[k] !== ' ' && line[k] !== '\t') return k;
      return -1;
    }
    function lastIsSpace() { return out.length > 0 && (out[out.length - 1] === ' ' || out[out.length - 1] === '\t'); }
    function ensureSpace() { if (out.length && !lastIsSpace()) out.push(' '); }
    function cutSpaces() { while (out.length && (out[out.length - 1] === ' ' || out[out.length - 1] === '\t')) out.pop(); }
    function push(s) { for (var k = 0; k < s.length; k++) out.push(s[k]); }
    function unaryHere() {
      if (!prevCode) return true;
      if (UNARY_PREV_CHARS.indexOf(prevCode) >= 0) return true;
      return UNARY_PREV_WORDS.test(word);
    }
    function matchToken(k) {
      for (var t = 0; t < OP_TOKENS.length; t++) {
        var s = OP_TOKENS[t], ok = true;
        for (var p = 0; p < s.length; p++) {
          if (!isCode(k + p) || line[k + p] !== s[p]) { ok = false; break; }
        }
        if (ok) return s;
      }
      return '';
    }

    while (i < n) {
      var c = line[i];

      // 字符串 / 注释里的内容：原样搬运（prevCode 跟着更新，这样 "a"+b 里的 + 不会被当成一元）
      if (isVerbatim(i)) { out.push(c); prevCode = c; noSpaceAfter = false; i++; continue; }

      // 代码里的空白
      if (c === ' ' || c === '\t') {
        var nb = nextNonBlank(i + 1);
        var drop = noSpaceAfter || nb === -1 || (!isVerbatim(nb) && ',;)'.indexOf(line[nb]) >= 0);
        if (!drop) ensureSpace();
        i++;
        continue;
      }

      // '{' 前补空格（跟在 ( [ { ] 后面时不补：f({..})、new int[]{..}）
      if (c === '{') {
        if (prevCode && '([{]'.indexOf(prevCode) < 0) ensureSpace();
        out.push('{');
        prevCode = '{'; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // '}' 后面接标识符才补空格（} else / } catch）
      if (c === '}') {
        out.push('}');
        prevCode = '}'; word = ''; noSpaceAfter = false;
        var nbc = nextNonBlank(i + 1);
        if (nbc !== -1 && /[A-Za-z0-9_$@]/.test(line[nbc])) ensureSpace();
        i++;
        continue;
      }

      // ',' 后面补一个空格
      if (c === ',') {
        cutSpaces();
        out.push(',');
        var ncm = nextNonBlank(i + 1);
        if (ncm !== -1 && ',;)]}'.indexOf(line[ncm]) < 0) ensureSpace();
        prevCode = ','; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // ';' 后面接标识符才补空格（for 的三段式）
      if (c === ';') {
        cutSpaces();
        out.push(';');
        var nsm = nextNonBlank(i + 1);
        if (nsm !== -1 && /[A-Za-z0-9_$@]/.test(line[nsm])) ensureSpace();
        prevCode = ';'; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // '(' ：if / for / while 这类关键字后面补空格；括号内不留空格
      if (c === '(') {
        if (kwRe.test(word)) ensureSpace();
        out.push('(');
        prevCode = '('; word = ''; noSpaceAfter = true; i++;
        continue;
      }
      if (c === ')') {
        cutSpaces();
        out.push(')');
        prevCode = ')'; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // '[' / ']' ：里面的空格去掉（下标、数组）
      if (c === '[') {
        out.push('[');
        prevCode = '['; word = ''; noSpaceAfter = true; i++;
        continue;
      }
      if (c === ']') {
        cutSpaces();
        out.push(']');
        prevCode = ']'; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // 泛型：整段照抄，只把里面的逗号补上空格
      if (c === '<') {
        var gEnd = genericSpanEnd(line, mask, i);
        if (gEnd > 0) {
          for (var g = i; g <= gEnd; g++) {
            if (isCode(g) && line[g] === ',') {
              out.push(',');
              if (g + 1 <= gEnd && line[g + 1] !== ' ' && line[g + 1] !== '>') out.push(' ');
              continue;
            }
            out.push(line[g]);
          }
          prevCode = '>'; word = ''; noSpaceAfter = false;
          i = gEnd + 1;
          continue;
        }
      }

      // ':' ：三元运算符、或者本来前面就有空格的（for (String s : items)）才补空格；
      //       case 1: / default: / public: 这些行尾冒号前面绝不补；:: 和 := 交给下面的运算符表
      if (c === ':' && !matchToken(i)) {
        var nbColon = nextNonBlank(i + 1);
        var colonSpaceBefore = nbColon !== -1
          && ((firstTernaryQ >= 0 && firstTernaryQ < i) || (i > 0 && (line[i - 1] === ' ' || line[i - 1] === '\t')));
        cutSpaces();
        if (colonSpaceBefore) ensureSpace();
        out.push(':');
        if (nbColon !== -1) ensureSpace();
        prevCode = ':'; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // '?' ：按上面判定的三元运算符决定要不要两侧补空格（?? / ?. / ?: 交给运算符表）
      if (c === '?' && !matchToken(i)) {
        if (ternaryQ[i]) {
          cutSpaces();
          ensureSpace();
        }
        out.push('?');
        if (ternaryQ[i] && nextNonBlank(i + 1) !== -1) ensureSpace();
        prevCode = '?'; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // 多字符运算符
      var tok = matchToken(i);
      if (tok) {
        // p->x（C/C++ 指针、PHP 成员）两侧不留空格；Java/Kotlin 等的 x -> y 按运算符加空格。
        // 这里按语言判断，不看「原来有没有空格」，否则 { 前补空格会让结果不再幂等。
        if (tok === '->' && pointerArrow) {
          push(tok);
          prevCode = '>';
          word = ''; noSpaceAfter = false;
          i += tok.length;
          continue;
        }
        if (TIGHT_OPS[tok]) {                       // ++ -- :: ... ?. 原样输出
          push(tok);
          prevCode = tok.charAt(tok.length - 1);
          word = ''; noSpaceAfter = false;
          i += tok.length;
          continue;
        }
        if (SPACED_OPS[tok]) {                      // 两侧补空格
          cutSpaces();
          ensureSpace();
          push(tok);
          if (nextNonBlank(i + tok.length) !== -1) ensureSpace();
          prevCode = tok.charAt(tok.length - 1);
          word = ''; noSpaceAfter = false;
          i += tok.length;
          continue;
        }
      }

      // 一元前缀：! ~ 以及处在运算符位置上的 + - * &
      if (c === '!' || c === '~') {
        out.push(c);
        prevCode = c; word = ''; noSpaceAfter = true; i++;
        continue;
      }
      if (MAYBE_UNARY[c] && unaryHere()) {
        out.push(c);
        prevCode = c; word = ''; noSpaceAfter = true; i++;
        continue;
      }

      // 单字符二元运算符（= + - * / % & | ^ < >）
      if (SPACED_OPS[c]) {
        cutSpaces();
        ensureSpace();
        out.push(c);
        if (nextNonBlank(i + 1) !== -1) ensureSpace();
        prevCode = c; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // 普通字符
      out.push(c);
      prevCode = c;
      if (/[A-Za-z0-9_$@]/.test(c)) word += c; else word = '';
      noSpaceAfter = false;
      i++;
    }
    return out.join('');
  }

  function indentUnit(opts) {
    var size = Math.max(1, Math.min(12, (opts && opts.tabSize) || 4));
    return (opts && opts.useTabs) ? '\t' : new Array(size + 1).join(' ');
  }

  /* ------------------------------------------------------------------ *
   * 大括号语言的「语句断行」
   *   粘贴过来的代码常常被压成一行，光补空格是看不出格式化的，所以先把语句摊开：
   *     ';' 之后换行、'{' 之后换行、'}' 之前换行、case/default 标签的 ':' 之后换行
   *   括号里的分号不算（for (a; b; c) 不会被打断）；
   *   字符串、注释里的分号大括号也不算（靠 mask 对照）；
   *   源码本来分好的行结构保持不变：普通换行以结构为准，连续两个换行（空行）保留一个。
   * ------------------------------------------------------------------ */
  function splitBraceStatements(text) {
    var src = text.replace(/\r\n?/g, '\n');
    var mask = maskCode(src.split('\n'), false).join('\n');
    var out = [];
    var buf = [];
    var stack = [];          // 括号栈：'(' '[' '{'
    var exprStack = [];      // 只记 '{' ：是不是数组/集合初始化那种「表达式大括号」
    var pendingNl = 0;       // 源码里挂起的换行数
    var lastBlank = false;
    var i = 0;

    function bufText() { return buf.join(''); }
    function flushContent() {
      var s = bufText().replace(/[ \t]+$/, '');
      if (s.trim() !== '') { out.push(s); out.push('\n'); lastBlank = false; }
      buf = [];
    }
    function endLine() { flushContent(); }
    function nextCodeIndex(from) {
      for (var k = from; k < src.length; k++) {
        if (mask[k] === FILLER) return k;                  // 字符串/注释：算有内容
        var c = src[k];
        if (c === '\n' || c === ' ' || c === '\t') continue;
        return k;
      }
      return -1;
    }
    function prevCodeChar(from) {
      for (var k = from; k >= 0; k--) {
        if (mask[k] === FILLER) return src[k];
        var c = src[k];
        if (c === '\n' || c === ' ' || c === '\t') continue;
        return c;
      }
      return '';
    }
    function insideParens() {
      for (var k = stack.length - 1; k >= 0; k--) {
        if (stack[k] === '(' || stack[k] === '[') return true;
        if (stack[k] === '{') return false;
      }
      return false;
    }
    function nextWord(from) {
      var s = '';
      for (var k = from; k < src.length; k++) {
        if (mask[k] === FILLER) break;
        var c = src[k];
        if (c === '\n' || c === ' ' || c === '\t') { if (s) break; continue; }
        if (/[A-Za-z_]/.test(c)) s += c; else break;
      }
      return s;
    }

    while (i < src.length) {
      var c = src[i];

      if (c === '\n') { pendingNl++; i++; continue; }

      if (pendingNl > 0) {
        if (pendingNl >= 2) {
          var hadContent = bufText().trim() !== '';
          flushContent();
          if (!lastBlank && (hadContent || out.length)) { out.push('\n'); lastBlank = true; }
        } else {
          flushContent();
        }
        pendingNl = 0;
      }

      if (mask[i] === FILLER) { buf.push(c); i++; continue; }

      if (c === '(' || c === '[') { stack.push(c); buf.push(c); i++; continue; }
      if (c === ')' || c === ']') {
        var top = stack.length ? stack[stack.length - 1] : '';
        if (top === '(' || top === '[') stack.pop();
        buf.push(c); i++;
        continue;
      }
      if (c === '{') {
        // 跟在 = , ( [ ] { 后面的 '{' 是数组/集合初始化（int[] a = {1, 2, 3}），
        // 不是代码块，摊开反而难看，保持原样
        var prevCh = prevCodeChar(i - 1);
        var isExpr = '=,([{]'.indexOf(prevCh) >= 0;
        buf.push('{');
        stack.push('{');
        exprStack.push(isExpr);
        var afterOpen = nextCodeIndex(i + 1);
        if (!isExpr && !(afterOpen >= 0 && src[afterOpen] === '}')) endLine();
        i++;
        continue;
      }
      if (c === '}') {
        var wasExpr = exprStack.length ? exprStack.pop() : false;
        if (!wasExpr) flushContent();                     // '}' 自己占一行
        buf.push('}');
        if (stack.length && stack[stack.length - 1] === '{') stack.pop();
        var w = nextWord(i + 1);
        if (w === 'else' || w === 'catch' || w === 'finally' || w === 'while') {
          buf.push(' ');                                  // } else { 留在同一行
        } else {
          var nc = nextCodeIndex(i + 1);
          var nch = nc >= 0 ? src[nc] : '';
          if (nch !== ';' && nch !== ',' && nch !== ')' && nch !== ']' && nch !== '.') endLine();
        }
        i++;
        continue;
      }
      if (c === ';') {
        buf.push(';');
        if (!insideParens()) endLine();                   // for (a; b; c) 里的分号不动
        i++;
        continue;
      }
      if (c === ':') {
        buf.push(':');
        if (!insideParens() && /^(case\b|default\s*:)/.test(bufText().replace(/^[ \t]+/, ''))) endLine();
        i++;
        continue;
      }

      buf.push(c);
      i++;
    }
    flushContent();
    var res = out.join('');
    // 原来结尾没有换行就不要凭空加一个（保持旧行为，也免得每次格式化都多出一行）
    if (res.charAt(res.length - 1) === '\n' && src.charAt(src.length - 1) !== '\n') res = res.slice(0, -1);
    return res;
  }

  /* ------------------------------------------------------------------ *
   * 内置格式化 1：大括号语言的结构重排（Java / C / C++ / C# / Go / Rust ...）
   * ------------------------------------------------------------------ */
  function reindentBraces(text, opts) {
    var unit = indentUnit(opts);
    var lines = splitBraceStatements(text).replace(/\r\n?/g, '\n').split('\n');
    var mask = maskCode(lines, false);
    var pointerArrow = ['c', 'cpp', 'objectivec', 'php'].indexOf(opts && opts.langId) >= 0;
    var tidyOpt = { pointerArrow: pointerArrow };
    // braceLevel 只管 {} 的块层级；括号 ( [ 只管「续行」缩进，
    // 这样 foo(x -> { ... }) 这种「括号里开块」才不会越缩越深
    var braceLevel = 0, caseExtra = 0;
    var stack = [];          // 未闭合的 ( [ {
    var out = [];

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/[ \t]+$/, '');
      var trimmed = raw.replace(/^[ \t]+/, '');
      if (!trimmed) { out.push(''); continue; }

      var code = mask[i];
      // mask 与 raw 等长；裁掉同样多的前导空白后与 trimmed 对齐
      var codeTrim = code.slice(raw.length - trimmed.length);
      var leadMatch = /^[)\]}]+/.exec(codeTrim);
      var leadBrace = 0, leadParen = 0;
      if (leadMatch) {
        for (var lc = 0; lc < leadMatch[0].length; lc++) {
          if (leadMatch[0].charAt(lc) === '}') leadBrace++; else leadParen++;
        }
      }
      if (leadBrace > 0) caseExtra = 0;

      // 这一行整个落在块注释里（续行）→ 原样保留，不重排，
      // 否则会动到注释内部的排版
      var allFiller = true;
      for (var f = 0; f < codeTrim.length; f++) {
        if (codeTrim[f] !== FILLER) { allFiller = false; break; }
      }
      if (allFiller) {
        out.push(raw);
        continue;
      }

      // 上一行留下了没闭合的 ( [ → 这一行是续行，缩进一层
      var continuation = stack.length > 0 && (stack[stack.length - 1] === '(' || stack[stack.length - 1] === '[');
      var isCase = /^(case\b|default\s*:)/.test(trimmed);
      var indentLevel;
      if (isCase) { indentLevel = braceLevel; caseExtra = 1; }
      else {
        indentLevel = braceLevel - leadBrace + caseExtra;
        if (continuation) indentLevel += 1 - leadParen;
      }
      // 链式调用的续行（以 . 开头）往右缩一层，读起来才是连着的
      if (/^\./.test(trimmed)) indentLevel += 1;
      if (indentLevel < 0) indentLevel = 0;

      // 行内空格规范化（用 mask 对照，字符串/注释原样保留）
      var body = tidySpacing(trimmed, codeTrim, tidyOpt);
      out.push(new Array(indentLevel + 1).join(unit) + body);

      // 维护块层级与括号栈
      for (var j = 0; j < code.length; j++) {
        var ch = code[j];
        if (ch === '(' || ch === '[') stack.push(ch);
        else if (ch === '{') { braceLevel++; stack.push('{'); }
        else if (ch === '}') {
          braceLevel--;
          if (stack.length && stack[stack.length - 1] === '{') stack.pop();
        } else if (ch === ')' || ch === ']') {
          var top = stack.length ? stack[stack.length - 1] : '';
          if (top === '(' || top === '[') stack.pop();
        }
      }
      if (braceLevel < 0) braceLevel = 0;
    }
    return out.join('\n');
  }

  /* ------------------------------------------------------------------ *
   * 内置格式化 2：按原缩进层级重新对齐（Python / Ruby / YAML / INI ...）
   * 说明：不改动行内内容，只把每一层缩进统一成设定宽度，安全、可预期。
   * ------------------------------------------------------------------ */
  function normalizeIndent(text, opts) {
    var unit = indentUnit(opts);
    var tabSize = Math.max(1, (opts && opts.tabSize) || 4);
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var stack = [0];
    var out = [];

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/[ \t]+$/, '');
      var trimmed = raw.replace(/^[ \t]+/, '');
      if (!trimmed) { out.push(''); continue; }

      var width = 0;
      for (var k = 0; k < raw.length; k++) {
        if (raw[k] === ' ') width += 1;
        else if (raw[k] === '\t') width += tabSize;
        else break;
      }
      while (stack.length > 1 && width < stack[stack.length - 1]) stack.pop();
      if (width > stack[stack.length - 1]) stack.push(width);
      var level = stack.length - 1;

      out.push(new Array(level + 1).join(unit) + trimmed);
    }
    return out.join('\n');
  }

  /* ------------------------------------------------------------------ *
   * 内置格式化 3：Python（缩进规范化 + 行内空格规范化）
   *   Python 没有大括号，缩进就是语法，所以绝不重排代码块归属：
   *   只按「原有的相对层级」把缩进统一成设定宽度，再把行内空格按 PEP8 习惯
   *   规整（= 两侧留空格、逗号后留空格、字典的冒号后留空格、切片不留空格……）。
   *   三引号字符串和 # 注释整段原样保留。
   * ------------------------------------------------------------------ */

  /**
   * Python 专用的遮罩："""/''' 跨行字符串、# 注释、单行字符串都抹成 FILLER。
   * @returns {Array<{mask:string, commentAt:number, inTripleAtStart:boolean}>}
   */
  function maskPython(lines) {
    var out = [];
    var inTriple = null;
    for (var li = 0; li < lines.length; li++) {
      var line = lines[li];
      var inTripleAtStart = !!inTriple;
      var res = '';
      var commentAt = -1;
      var i = 0;
      while (i < line.length) {
        if (inTriple) {
          if (line.substr(i, 3) === inTriple) { res += FILLER + FILLER + FILLER; i += 3; inTriple = null; continue; }
          res += FILLER; i++; continue;
        }
        var c = line[i];
        if (c === '#') { commentAt = i; res += fill(line.length - i); break; }
        if (c === '"' || c === "'") {
          var q3 = line.substr(i, 3);
          if (q3 === '"""' || q3 === "'''") { inTriple = q3; res += FILLER + FILLER + FILLER; i += 3; continue; }
          res += FILLER; i++;
          while (i < line.length) {
            if (line[i] === '\\') { res += FILLER + FILLER; i += 2; continue; }
            var done = (line[i] === c);
            res += FILLER;
            i++;
            if (done) break;
          }
          continue;
        }
        res += c;
        i++;
      }
      out.push({ mask: res, commentAt: commentAt, inTripleAtStart: inTripleAtStart });
    }
    return out;
  }

  var PY_SPACED_OPS = {
    '=': 1, '+=': 1, '-=': 1, '*=': 1, '/=': 1, '//=': 1, '%=': 1, '**=': 1, '&=': 1, '|=': 1, '^=': 1,
    '>>=': 1, '<<=': 1, '==': 1, '!=': 1, '<=': 1, '>=': 1,
    '+': 1, '-': 1, '*': 1, '/': 1, '//': 1, '%': 1, '**': 1, '&': 1, '|': 1, '^': 1,
    '>>': 1, '<<': 1, '<': 1, '>': 1, ':=': 1, '->': 1
  };
  var PY_TIGHT_OPS = { '@': 1, '...': 1 };
  var PY_PREFIX_OPS = { '*': 1, '**': 1 };
  var PY_KEYWORDS = /^(and|or|not|in|is|if|elif|else|for|while|return|yield|lambda|def|class|with|as|import|from|del|assert|raise|try|except|finally|global|nonlocal|await|async|pass|break|continue|print|None|True|False)$/;
  var PY_OP_TOKENS = [
    '//=', '**=', '>>=', '<<=',
    '**', '//', '>>', '<<', '==', '!=', '<=', '>=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=',
    ':=', '->', '...'
  ];

  function pyUnaryPrevChars() { return '([{,;:=.!&|+-*/%^<>~'; }

  /** 一行 Python 代码的空格规范化（缩进已由外面处理） */
  function tidyPythonLine(line, info, state) {
    var mask = info.mask;
    var commentAt = info.commentAt;
    var codeEnd = commentAt >= 0 ? commentAt : line.length;
    var out = [];
    var i = 0;
    var word = '';
    var prevCode = '';
    var noSpaceAfter = false;
    var stack = state.stack;         // [{ch, callLike}]

    function isVerbatim(k) { return mask[k] === FILLER; }
    function isCode(k) { return k < codeEnd && mask[k] !== FILLER && line[k] !== ' ' && line[k] !== '\t'; }
    function nextNonBlank(from) {
      for (var k = from; k < codeEnd; k++) if (line[k] !== ' ' && line[k] !== '\t') return k;
      return -1;
    }
    function lastIsSpace() { return out.length > 0 && (out[out.length - 1] === ' ' || out[out.length - 1] === '\t'); }
    function ensureSpace() { if (out.length && !lastIsSpace()) out.push(' '); }
    function cutSpaces() { while (out.length && (out[out.length - 1] === ' ' || out[out.length - 1] === '\t')) out.pop(); }
    function push(s) { for (var k = 0; k < s.length; k++) out.push(s[k]); }
    function inCallParen() {
      for (var k = stack.length - 1; k >= 0; k--) {
        if (stack[k].ch === '(') return stack[k].callLike;
        if (stack[k].ch === '[' || stack[k].ch === '{') return false;
      }
      return false;
    }
    function inBracket() {
      for (var k = stack.length - 1; k >= 0; k--) {
        if (stack[k].ch === '[') return true;
        if (stack[k].ch === '(' || stack[k].ch === '{') return false;
      }
      return false;
    }
    function unaryHere() {
      if (!prevCode) return true;
      if (pyUnaryPrevChars().indexOf(prevCode) >= 0) return true;
      return PY_KEYWORDS.test(word);
    }
    function matchToken(k) {
      for (var t = 0; t < PY_OP_TOKENS.length; t++) {
        var s = PY_OP_TOKENS[t], ok = true;
        for (var p = 0; p < s.length; p++) {
          if (!isCode(k + p) || line[k + p] !== s[p]) { ok = false; break; }
        }
        if (ok) return s;
      }
      return '';
    }

    while (i < codeEnd) {
      var c = line[i];

      if (isVerbatim(i)) { out.push(c); prevCode = c; noSpaceAfter = false; i++; continue; }

      if (c === ' ' || c === '\t') {
        var nb = nextNonBlank(i + 1);
        var drop = noSpaceAfter || nb === -1 || (!isVerbatim(nb) && ',;)]}'.indexOf(line[nb]) >= 0);
        if (!drop) ensureSpace();
        i++;
        continue;
      }

      // 括号 / 花括号 / 方括号
      if (c === '(' || c === '[' || c === '{') {
        if (c === '(') {
          var callLike = !!(prevCode && /[A-Za-z0-9_$)\]]/.test(prevCode) && !PY_KEYWORDS.test(word));
          stack.push({ ch: '(', callLike: callLike });
        } else {
          stack.push({ ch: c, callLike: false });
        }
        out.push(c);
        prevCode = c; word = ''; noSpaceAfter = true; i++;
        continue;
      }
      if (c === ')' || c === ']' || c === '}') {
        cutSpaces();
        out.push(c);
        if (stack.length) stack.pop();
        prevCode = c; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // 逗号
      if (c === ',') {
        cutSpaces();
        out.push(',');
        var ncm = nextNonBlank(i + 1);
        if (ncm !== -1 && ',;)]}'.indexOf(line[ncm]) < 0) ensureSpace();
        prevCode = ','; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      // 冒号：切片里不留空格（a[1:2]），其它地方 = 冒号后留一个空格（字典 / 注解 / lambda）
      if (c === ':' && !matchToken(i)) {
        var nbColon = nextNonBlank(i + 1);
        cutSpaces();
        out.push(':');
        if (inBracket()) {
          noSpaceAfter = true;
        } else if (nbColon !== -1) {
          ensureSpace();
        }
        prevCode = ':'; word = ''; noSpaceAfter = inBracket();
        i++;
        continue;
      }

      // 赋值号：关键字参数 / 默认值里不留空格（f(a=1)），其它地方两侧留空格
      if (c === '=' && !matchToken(i)) {
        var nbEq = nextNonBlank(i + 1);
        if (inCallParen()) {
          cutSpaces();
          out.push('=');
          noSpaceAfter = true;
        } else {
          cutSpaces();
          ensureSpace();
          out.push('=');
          if (nbEq !== -1) ensureSpace();
          noSpaceAfter = false;
        }
        prevCode = '='; word = ''; i++;
        continue;
      }

      var tok = matchToken(i);
      if (tok) {
        if (PY_TIGHT_OPS[tok]) {
          push(tok);
          prevCode = tok.charAt(tok.length - 1); word = ''; noSpaceAfter = false;
          i += tok.length;
          continue;
        }
        if (PY_PREFIX_OPS[tok] && unaryHere()) {   // *args / **kwargs / 解包
          push(tok);
          prevCode = tok.charAt(tok.length - 1); word = ''; noSpaceAfter = true;
          i += tok.length;
          continue;
        }
        if (PY_SPACED_OPS[tok]) {
          cutSpaces();
          ensureSpace();
          push(tok);
          if (nextNonBlank(i + tok.length) !== -1) ensureSpace();
          prevCode = tok.charAt(tok.length - 1); word = ''; noSpaceAfter = false;
          i += tok.length;
          continue;
        }
      }

      // 一元前缀 ~，以及处在运算符位置的 + -
      if (c === '~') {
        out.push(c);
        prevCode = c; word = ''; noSpaceAfter = true; i++;
        continue;
      }
      if ((c === '-' || c === '+') && unaryHere()) {
        out.push(c);
        prevCode = c; word = ''; noSpaceAfter = true; i++;
        continue;
      }
      if ((c === '*' || c === '**') && unaryHere()) {
        out.push(c);
        prevCode = c; word = ''; noSpaceAfter = true; i++;
        continue;
      }

      // 单字符二元运算符
      if (PY_SPACED_OPS[c]) {
        cutSpaces();
        ensureSpace();
        out.push(c);
        if (nextNonBlank(i + 1) !== -1) ensureSpace();
        prevCode = c; word = ''; noSpaceAfter = false; i++;
        continue;
      }

      out.push(c);
      prevCode = c;
      if (/[A-Za-z0-9_$]/.test(c)) word += c; else word = '';
      noSpaceAfter = false;
      i++;
    }

    var body = out.join('');
    if (commentAt >= 0) {
      var comment = line.slice(commentAt);
      if (body.trim()) {
        body = body.replace(/[ \t]+$/, '') + '  ' + comment;
      } else {
        body = comment;                 // 整行都是注释：原样保留
      }
    }
    return body;
  }

  /* ------------------------------------------------------------------ *
   * Python 结构整理：把挤在一行里的代码摊开
   *   · 顶层 ';' 分行
   *   · 单行写法的复合语句：if x: y  →  if x:\n    y
   *   · 超过一行宽度上限的表达式：按最外层括号摊成一项一行（Black 风格，补尾逗号）
   *   字符串 / 注释里的符号一律不算（靠 mask 对照）
   * ------------------------------------------------------------------ */

  /** 按顶层分隔符切分（括号里的、字符串/注释里的都不算） */
  function pySplitTopLevel(s, mask, sep) {
    var parts = [], start = 0, depth = 0;
    for (var i = 0; i < s.length; i++) {
      if (mask[i] === FILLER) continue;
      var c = s[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth > 0) depth--; }
      else if (c === sep && depth === 0) { parts.push(s.slice(start, i)); start = i + 1; }
    }
    parts.push(s.slice(start));
    return parts;
  }

  var PY_COMPOUND_HEAD = /^(if|elif|else|for|while|def|class|try|except|finally|with)\b/;

  /** 单行复合语句的顶层冒号（`if x: y` 里那个）下标；没有返回 -1 */
  function pyCompoundColon(s, mask) {
    if (!PY_COMPOUND_HEAD.test(s)) return -1;
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
      if (mask[i] === FILLER) continue;
      var c = s[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth > 0) depth--; }
      else if (c === ':' && depth === 0) return i;
    }
    return -1;
  }

  /** 把一行表达式按最外层括号摊成多行；摊不开返回 null */
  function pyExpandExpr(expr, indentStr, indentCols, width, unit, unitWidth) {
    if (indentCols + expr.length <= width) return null;
    var mask = maskPython([expr])[0].mask;
    var openAt = -1, depth = 0;
    for (var i = 0; i < expr.length; i++) {
      if (mask[i] === FILLER) continue;
      var c = expr[i];
      if (c === '(' || c === '[' || c === '{') {
        if (depth === 0) openAt = i;
        depth++;
      } else if (c === ')' || c === ']' || c === '}') {
        depth--;
        if (depth === 0 && openAt >= 0) {
          var lines = pyExpandGroup(expr, mask, openAt, i, indentStr, indentCols, width, unit, unitWidth);
          return lines;
        }
      }
    }
    return null;   // 括号没在这一行闭合 → 不猜，保持原样
  }

  function pyExpandGroup(expr, mask, openAt, closeAt, indentStr, indentCols, width, unit, unitWidth) {
    var prefix = expr.slice(0, openAt + 1);
    var suffix = expr.slice(closeAt);
    var inner = expr.slice(openAt + 1, closeAt);
    var items = pySplitTopLevel(inner, mask.slice(openAt + 1, closeAt), ',');
    if (items.length <= 1) return null;               // 只有一项，硬拆反而难看
    var childStr = indentStr + unit;
    var childCols = indentCols + unitWidth;
    var lines = [{ indent: indentStr, text: prefix }];
    for (var k = 0; k < items.length; k++) {
      var item = items[k].trim();
      if (!item) continue;
      var sub = pyExpandExpr(item, childStr, childCols, width, unit, unitWidth) ||
        [{ indent: childStr, text: item }];
      // 逗号补在最后一行末尾：Python 允许尾逗号，Black 也是这么排的，重排结果稳定
      var last = sub[sub.length - 1];
      sub[sub.length - 1] = { indent: last.indent, text: last.text + ',' };
      lines = lines.concat(sub);
    }
    lines.push({ indent: indentStr, text: suffix });
    return lines;
  }

  /** 一行的结构整理（返回若干行） */
  function pyStructureLine(line, isTriple, opts, tabSize) {
    var width = Math.max(20, (opts && opts.printWidth) || 100);
    var unit = indentUnit(opts);
    var unitWidth = Math.max(1, tabSize);
    var m = /^[ \t]*/.exec(line)[0];
    var body = line.slice(m.length);
    if (!body) return [line];
    if (isTriple) return [line];                       // 三引号续行一个字都不动

    function colsOf(s) { return s.replace(/\t/g, new Array(unitWidth + 1).join(' ')).length; }

    // 1) 顶层 ';' 分行
    var mask = maskPython([body])[0].mask;
    var parts = pySplitTopLevel(body, mask, ';');
    if (parts.length > 1) {
      var res = [];
      for (var p = 0; p < parts.length; p++) {
        var seg = parts[p].replace(/;\s*$/, '').trim();
        if (!seg) continue;
        if (seg.charAt(0) === '#' && res.length) {     // 行尾注释跟着上一句
          res[res.length - 1] += '  ' + seg;
          continue;
        }
        res = res.concat(pyStructureLine(m + seg, false, opts, tabSize));
      }
      return res;
    }

    // 2) 单行写法的复合语句
    var colonAt = pyCompoundColon(body, mask);
    if (colonAt >= 0) {
      var rest = body.slice(colonAt + 1).trim();
      if (rest && rest.charAt(0) !== '#') {
        return [m + body.slice(0, colonAt + 1)]
          .concat(pyStructureLine(m + unit + rest, false, opts, tabSize));
      }
    }

    // 3) 太长的一行：按最外层括号摊开
    var expanded = pyExpandExpr(body, m, colsOf(m), width, unit, unitWidth);
    if (expanded) {
      return expanded.map(function (l) { return l.indent + l.text; });
    }
    return [line];
  }

  /** Python 格式化：缩进规范化（跳过三引号续行）+ 行内空格规范化 + 结构整理 */
  function formatPython(text, opts) {
    var unit = indentUnit(opts);
    var tabSize = Math.max(1, (opts && opts.tabSize) || 4);
    var lines = text.replace(/\r\n?/g, '\n').split('\n');
    var info = maskPython(lines);
    var stack = [0];
    var state = { stack: [] };
    var tidied = [], tripleFlags = [];

    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i].replace(/[ \t]+$/, '');
      var trimmed = raw.replace(/^[ \t]+/, '');

      // 三引号字符串的续行：一个字都不动（里面的缩进是字符串内容）
      if (info[i].inTripleAtStart) { tidied.push(raw); tripleFlags.push(true); continue; }
      if (!trimmed) { tidied.push(''); tripleFlags.push(false); continue; }
      tripleFlags.push(false);

      var width = 0;
      for (var k = 0; k < raw.length; k++) {
        if (raw[k] === ' ') width += 1;
        else if (raw[k] === '\t') width += tabSize;
        else break;
      }
      while (stack.length > 1 && width < stack[stack.length - 1]) stack.pop();
      if (width > stack[stack.length - 1]) stack.push(width);
      var level = stack.length - 1;

      // 行内括号状态跨行保持（多行调用 / 多行字典）
      var lineInfo = { mask: info[i].mask.slice(raw.length - trimmed.length), commentAt: -1 };
      if (info[i].commentAt >= 0) lineInfo.commentAt = info[i].commentAt - (raw.length - trimmed.length);
      var body = tidyPythonLine(trimmed, lineInfo, state);
      tidied.push(new Array(level + 1).join(unit) + body);
    }

    // 结构整理：把挤在一行里的语句摊开
    var out = [];
    for (var j = 0; j < tidied.length; j++) {
      out = out.concat(pyStructureLine(tidied[j], tripleFlags[j], opts, tabSize));
    }
    return out.join('\n');
  }

  /* ------------------------------------------------------------------ *
   * JSON 排版预处理
   * Prettier 的 json 解析器“尊重原文换行”：原本压在一行里的对象/数组会被
   * 原样留在同一行，所以对压缩过的 JSON 按「格式化」几乎看不到变化。
   * 这里先在字符串 / 注释之外给 { [ } ] 补上换行，再交给 Prettier 排版：
   * 既能展开成缩进结构，又能原样保留数字与转义字面量。
   * （Prettier 的 json-stringify 解析器虽然总是展开，但会把 1.0 改写成 1、
   *   1e5 改写成 100000、大整数丢精度、\uXXXX 解码成真实字符，
   *   对文本编辑器来说这是在改内容，不能接受。）
   * ------------------------------------------------------------------ */
  function expandJsonLayout(text) {
    var src = String(text);
    var n = src.length;
    var parts = [];
    var i = 0;

    function lastMeaningful() {
      for (var k = parts.length - 1; k >= 0; k--) {
        var s = parts[k];
        for (var j = s.length - 1; j >= 0; j--) {
          if (s[j] !== ' ' && s[j] !== '\t') return s[j];
        }
      }
      return '';
    }
    function nextMeaningful(from) {
      for (var k = from; k < n; k++) {
        if (src[k] !== ' ' && src[k] !== '\t' && src[k] !== '\r') return src[k];
      }
      return '';
    }

    while (i < n) {
      var c = src[i];

      // 字符串整体照抄（含转义）
      if (c === '"') {
        var start = i; i++;
        while (i < n) {
          if (src[i] === '\\') { i += 2; continue; }
          if (src[i] === '"') { i++; break; }
          i++;
        }
        parts.push(src.slice(start, i));
        continue;
      }
      // 行注释照抄到行尾
      if (c === '/' && src[i + 1] === '/') {
        var ls = i;
        while (i < n && src[i] !== '\n') i++;
        parts.push(src.slice(ls, i));
        continue;
      }
      // 块注释照抄
      if (c === '/' && src[i + 1] === '*') {
        var bs = i; i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i = Math.min(n, i + 2);
        parts.push(src.slice(bs, i));
        continue;
      }
      // 开括号：后面若还压着内容，就补一个换行
      if (c === '{' || c === '[') {
        parts.push(c);
        var nx = nextMeaningful(i + 1);
        var empty = (c === '{' && nx === '}') || (c === '[' && nx === ']');
        if (nx && nx !== '\n' && !empty) parts.push('\n');
        i++;
        continue;
      }
      // 闭括号：前面若还压着内容，就先补一个换行
      if (c === '}' || c === ']') {
        var pv = lastMeaningful();
        var atOpen = (c === '}' && pv === '{') || (c === ']' && pv === '[');
        if (pv && pv !== '\n' && !atOpen) parts.push('\n');
        parts.push(c);
        i++;
        continue;
      }
      parts.push(c);
      i++;
    }
    return parts.join('');
  }

  /* ------------------------------------------------------------------ *
   * Prettier（JS/TS/JSON/HTML/Vue/CSS/Markdown/YAML）
   * ------------------------------------------------------------------ */
  var PARSER_FILE = {
    babel: 'parser-babel.js',
    json: 'parser-babel.js',
    typescript: 'parser-typescript.js',
    html: 'parser-html.js',
    vue: 'parser-html.js',
    angular: 'parser-angular.js',
    css: 'parser-postcss.js',
    scss: 'parser-postcss.js',
    less: 'parser-postcss.js',
    markdown: 'parser-markdown.js',
    yaml: 'parser-yaml.js',
    graphql: 'parser-graphql.js'
  };

  async function runPrettier(text, parser, opts) {
    if (typeof window.prettier === 'undefined') {
      await SAK.loadScript(VENDOR + 'prettier/standalone.js');
    }
    var file = PARSER_FILE[parser];
    if (file) await SAK.loadScript(VENDOR + 'prettier/' + file);
    // JSON 先补齐结构换行，压缩过的一行 JSON 才会被展开成缩进结构
    if (parser === 'json') text = expandJsonLayout(text);
    return window.prettier.format(text, {
      parser: parser,
      plugins: window.prettierPlugins,
      tabWidth: Math.max(1, (opts && opts.tabSize) || 4),
      useTabs: !!(opts && opts.useTabs),
      printWidth: (opts && opts.printWidth) || 100,
      semi: true,
      singleQuote: false,
      endOfLine: 'lf'
    });
  }

  /* ------------------------------------------------------------------ *
   * js-beautify（XML / 兜底 JS / CSS）
   * ------------------------------------------------------------------ */
  async function runBeautifyHtml(text, opts) {
    await SAK.loadScript(VENDOR + 'js-beautify/js/lib/beautify.js');
    await SAK.loadScript(VENDOR + 'js-beautify/js/lib/beautify-css.js');
    await SAK.loadScript(VENDOR + 'js-beautify/js/lib/beautify-html.js');
    return window.html_beautify(text, {
      indent_size: Math.max(1, (opts && opts.tabSize) || 4),
      indent_char: (opts && opts.useTabs) ? '\t' : ' ',
      wrap_line_length: 0,
      preserve_newlines: true,
      max_preserve_newlines: 2,
      end_with_newline: false
    });
  }

  async function runBeautifyJs(text, opts) {
    await SAK.loadScript(VENDOR + 'js-beautify/js/lib/beautify.js');
    return window.js_beautify(text, {
      indent_size: Math.max(1, (opts && opts.tabSize) || 4),
      indent_char: (opts && opts.useTabs) ? '\t' : ' ',
      preserve_newlines: true,
      max_preserve_newlines: 2,
      end_with_newline: false
    });
  }

  async function runBeautifyCss(text, opts) {
    await SAK.loadScript(VENDOR + 'js-beautify/js/lib/beautify-css.js');
    return window.css_beautify(text, {
      indent_size: Math.max(1, (opts && opts.tabSize) || 4),
      indent_char: (opts && opts.useTabs) ? '\t' : ' ',
      end_with_newline: false
    });
  }

  /* ------------------------------------------------------------------ *
   * sql-formatter
   * ------------------------------------------------------------------ */
  var SQL_DIALECTS = ['sql', 'mysql', 'postgresql', 'sqlite', 'transactsql', 'bigquery', 'plsql'];

  async function runSql(text, opts) {
    if (typeof window.sqlFormatter === 'undefined') {
      await SAK.loadScript(VENDOR + 'sql-formatter/dist/sql-formatter.min.js');
    }
    var cfg = {
      tabWidth: Math.max(1, (opts && opts.tabSize) || 4),
      useTabs: !!(opts && opts.useTabs),
      keywordCase: 'upper',
      linesBetweenQueries: 1
    };
    var lastErr = null;
    for (var i = 0; i < SQL_DIALECTS.length; i++) {
      try {
        return window.sqlFormatter.format(text, Object.assign({ language: SQL_DIALECTS[i] }, cfg));
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('SQL 解析失败');
  }

  /* ------------------------------------------------------------------ *
   * 每种语言对应的格式化方案
   * ------------------------------------------------------------------ */
  var PRETTIER_PARSER = {
    javascript: 'babel', jsx: 'babel', json: 'json',
    typescript: 'typescript', tsx: 'typescript',
    html: 'html', vue: 'vue',
    css: 'css', scss: 'scss', less: 'less',
    markdown: 'markdown', yaml: 'yaml'
  };

  // 结构重排适合的语言
  var BRACE_LANGS = ['java', 'c', 'cpp', 'csharp', 'kotlin', 'scala', 'objectivec', 'go',
    'rust', 'swift', 'dart', 'groovy', 'php', 'pascal', 'verilog', 'vhdl', 'nginx', 'stylus', 'sass'];

  // Python：缩进规范化 + 行内空格规范化（单独一套，避免把 YAML/INI 也改了）
  var PYTHON_LANGS = ['python'];

  var KIND_LABEL = {
    prettier: 'Prettier 精确格式化',
    beautifyHtml: 'js-beautify 标签美化',
    beautifyJs: 'js-beautify 美化',
    beautifyCss: 'js-beautify 美化',
    sql: 'sql-formatter 美化',
    braces: '内置结构重排（缩进 + 运算符/括号空格）',
    python: '内置 Python 格式化（缩进 + 运算符/逗号/冒号空格）',
    indent: '内置缩进规范化（按原有层级重排）'
  };

  /** 查询某语言使用哪种格式化方案 */
  SAK.formatPlan = function (langId) {
    if (PRETTIER_PARSER[langId]) return { kind: 'prettier', parser: PRETTIER_PARSER[langId], label: KIND_LABEL.prettier };
    if (langId === 'xml') return { kind: 'beautifyHtml', label: KIND_LABEL.beautifyHtml };
    if (langId === 'sql') return { kind: 'sql', label: KIND_LABEL.sql };
    if (BRACE_LANGS.indexOf(langId) >= 0) return { kind: 'braces', label: KIND_LABEL.braces };
    if (PYTHON_LANGS.indexOf(langId) >= 0) return { kind: 'python', label: KIND_LABEL.python };
    return { kind: 'indent', label: KIND_LABEL.indent };
  };

  /**
   * 格式化入口
   * @param {string} text 文本
   * @param {string} langId 语言 id（SAK.LANGS 中的 id）
   * @param {object} opts {tabSize, useTabs, printWidth}
   * @returns {Promise<string>}
   */
  SAK.formatText = async function (text, langId, opts) {
    var plan = SAK.formatPlan(langId);
    // 把语言也带上：个别规则（比如 -> 在 C/C++ 里是成员访问、在 Java 里是 lambda）
    // 需要按语言决定
    var fopts = Object.assign({}, opts || {}, { langId: langId });
    switch (plan.kind) {
      case 'prettier': return await runPrettier(text, plan.parser, fopts);
      case 'beautifyHtml': return await runBeautifyHtml(text, fopts);
      case 'beautifyJs': return await runBeautifyJs(text, fopts);
      case 'beautifyCss': return await runBeautifyCss(text, fopts);
      case 'sql': return await runSql(text, fopts);
      case 'braces': return reindentBraces(text, fopts);
      case 'python': return formatPython(text, fopts);
      default: return normalizeIndent(text, fopts);
    }
  };

  // 供测试/复用的内部实现
  SAK._formatters = {
    reindentBraces: reindentBraces,
    normalizeIndent: normalizeIndent,
    formatPython: formatPython,
    tidySpacing: tidySpacing,
    maskPython: maskPython,
    expandJson: expandJsonLayout,
    maskCode: maskCode
  };

})(window.SAK);
