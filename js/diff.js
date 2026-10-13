/* ===== 文本差分：行级 Myers 差分 + 行内词级差分 ===== */
(function (SAK) {
  'use strict';

  function normalize(s, opts) {
    if (opts && opts.ignoreTrailingSpace) s = s.replace(/[ \t]+$/, '');
    if (opts && opts.ignoreCase) s = s.toLowerCase();
    return s;
  }

  /**
   * Myers 贪心差分（带 trace 以便回溯）
   * @returns {Array|null} 操作序列（按文档顺序）；差异过大时返回 null
   */
  function myers(a, b, eq, maxD) {
    var N = a.length, M = b.length, MAX = N + M;
    if (MAX === 0) return [];
    var offset = MAX;
    var v = new Int32Array(2 * MAX + 2);
    var trace = [];
    for (var d = 0; d <= maxD; d++) {
      trace.push(v.slice(0));
      for (var k = -d; k <= d; k += 2) {
        var idx = k + offset;
        var x;
        if (k === -d || (k !== d && v[idx - 1] < v[idx + 1])) x = v[idx + 1];
        else x = v[idx - 1] + 1;
        var y = x - k;
        while (x < N && y < M && eq(a[x], b[y])) { x++; y++; }
        v[idx] = x;
        if (x >= N && y >= M) return backtrack(trace, a, b, d, offset);
      }
    }
    return null;
  }

  function backtrack(trace, a, b, d, offset) {
    var ops = [];
    var x = a.length, y = b.length;
    for (var dd = d; dd > 0; dd--) {
      var v = trace[dd];
      var k = x - y;
      var idx = k + offset;
      var prevK;
      if (k === -dd || (k !== dd && v[idx - 1] < v[idx + 1])) prevK = k + 1;
      else prevK = k - 1;
      var prevX = v[prevK + offset];
      var prevY = prevX - prevK;
      while (x > prevX && y > prevY) { ops.push({ type: 'equal', a: x - 1, b: y - 1 }); x--; y--; }
      if (x === prevX) { ops.push({ type: 'insert', b: y - 1 }); y--; }
      else { ops.push({ type: 'delete', a: x - 1 }); x--; }
    }
    while (x > 0 && y > 0) { ops.push({ type: 'equal', a: x - 1, b: y - 1 }); x--; y--; }
    while (x > 0) { ops.push({ type: 'delete', a: x - 1 }); x--; }
    while (y > 0) { ops.push({ type: 'insert', b: y - 1 }); y--; }
    return ops.reverse();
  }

  /** 把操作序列合并成「差异块」 */
  function buildHunks(ops) {
    var hunks = [], cur = null;
    var ai = 0, bi = 0;
    function close() { if (cur) { hunks.push(cur); cur = null; } }
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.type === 'equal') { close(); ai++; bi++; continue; }
      if (!cur) cur = { leftStart: ai, rightStart: bi, leftEnd: ai, rightEnd: bi };
      if (op.type === 'delete') { ai++; cur.leftEnd = ai; }
      else { bi++; cur.rightEnd = bi; }
    }
    close();
    hunks.forEach(function (h) {
      var hasL = h.leftEnd > h.leftStart, hasR = h.rightEnd > h.rightStart;
      h.type = (hasL && hasR) ? 'change' : (hasL ? 'delete' : 'insert');
    });
    return hunks;
  }

  /**
   * 行级差分
   * @param {string[]} a 左侧行数组
   * @param {string[]} b 右侧行数组
   * @param {object} opts {ignoreTrailingSpace, ignoreCase}
   * @returns {{hunks:Array, equalCount:number, leftCount:number, rightCount:number, truncated:boolean}}
   */
  function diffLines(a, b, opts) {
    var eq = function (x, y) { return normalize(x, opts) === normalize(y, opts); };

    // 先掐掉公共前缀 / 后缀，能大幅缩小问题规模
    var start = 0;
    while (start < a.length && start < b.length && eq(a[start], b[start])) start++;
    var endA = a.length, endB = b.length;
    while (endA > start && endB > start && eq(a[endA - 1], b[endB - 1])) { endA--; endB--; }

    var midA = a.slice(start, endA), midB = b.slice(start, endB);
    var total = midA.length + midB.length;
    var maxD = total > 6000 ? 600 : (total > 2000 ? 1500 : 3000);

    var ops = total === 0 ? [] : myers(midA, midB, eq, maxD);
    var hunks, truncated = false;
    if (ops === null) {
      truncated = true;
      hunks = midA.length || midB.length
        ? [{ leftStart: start, leftEnd: endA, rightStart: start, rightEnd: endB, type: 'change' }]
        : [];
    } else {
      hunks = buildHunks(ops).map(function (h) {
        return {
          leftStart: h.leftStart + start, leftEnd: h.leftEnd + start,
          rightStart: h.rightStart + start, rightEnd: h.rightEnd + start,
          type: h.type
        };
      });
    }
    return {
      hunks: hunks,
      equalCount: start + (a.length - endA),
      leftCount: a.length,
      rightCount: b.length,
      truncated: truncated
    };
  }

  /* ---------- 行内词级差分 ---------- */
  function tokenize(s) {
    return s.match(/[A-Za-z0-9_]+|\s+|[\s\S]/g) || [];
  }

  /**
   * 两行之间的词级差异
   * @returns {Array<{type:'equal'|'del'|'ins', text:string}>}
   */
  function diffWords(la, lb, opts) {
    if (la === lb) return [{ type: 'equal', text: la }];
    var ta = tokenize(la), tb = tokenize(lb);
    if (ta.length + tb.length > 4000) {
      return [{ type: 'del', text: la }, { type: 'ins', text: lb }];
    }
    var eq = function (x, y) { return normalize(x, opts) === normalize(y, opts); };
    var ops = myers(ta, tb, eq, 2000);
    if (ops === null) return [{ type: 'del', text: la }, { type: 'ins', text: lb }];
    var out = [];
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      var type = op.type === 'equal' ? 'equal' : (op.type === 'delete' ? 'del' : 'ins');
      var text = op.type === 'delete' ? ta[op.a] : tb[op.b];
      var last = out[out.length - 1];
      if (last && last.type === type) last.text += text;
      else out.push({ type: type, text: text });
    }
    return out;
  }

  SAK.diff = {
    lines: diffLines,
    words: diffWords,
    buildHunks: buildHunks,
    _normalize: normalize
  };

})(window.SAK);
