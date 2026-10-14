/* ===== 文本编辑器 主程序 ===== */
(function (SAK) {
  'use strict';

  var CodeMirror = window.CodeMirror;
  var $ = SAK.$, el = SAK.el;
  var MODE_PATH = function (n) { return SAK.BASE + '/node_modules/codemirror/mode/' + n + '/' + n + '.js'; };

  var docs = [];
  var activeDoc = null;
  var ed = null;
  var docSeq = 0;

  /* ================================================================== *
   * 文档模型
   * ================================================================== */
  function Doc(opts) {
    this.id = ++docSeq;
    this.name = opts.name || '未命名-' + this.id + '.txt';
    this.handle = opts.handle || null;
    this.bytes = opts.bytes || null;          // 原始字节（用于换编码重读）
    this.encoding = opts.encoding || 'UTF-8';
    this.newline = opts.newline || 'CRLF';
    this.langId = opts.langId || 'plaintext';
    this.langSource = opts.langSource || 'auto'; // auto | file | manual
    this.metaDirty = false;
    this.charCount = 0;
    this.cmDoc = CodeMirror.Doc(opts.text || '', 'null');
    this.cmDoc.markClean();
  }
  Doc.prototype.isDirty = function () {
    return this.metaDirty || !this.cmDoc.isClean();
  };
  Doc.prototype.markSaved = function () {
    this.metaDirty = false;
    this.cmDoc.markClean();
  };

  function docOf(edInstance) {
    for (var i = 0; i < docs.length; i++) if (docs[i].cmDoc === edInstance.getDoc()) return docs[i];
    return null;
  }

  /* ================================================================== *
   * 命令注册表 —— 所有可自定义快捷键的功能都在这里
   * key 为默认快捷键；用户改动保存在 SAK.settings.keymap[命令id]
   * ================================================================== */
  var COMMANDS = [
    { id: 'file.new', group: '文件', label: '新建文件', key: 'Ctrl-N', run: function () { newDoc(); } },
    { id: 'file.open', group: '文件', label: '打开文件', key: 'Ctrl-O', run: function () { openFiles(); } },
    { id: 'file.save', group: '文件', label: '保存', key: 'Ctrl-S', run: function () { saveFocused(false); } },
    { id: 'file.saveAs', group: '文件', label: '另存为', key: 'Shift-Ctrl-S', run: function () { saveFocused(true); } },
    { id: 'file.close', group: '文件', label: '关闭当前标签', key: 'Ctrl-W', run: function () { closeDoc(activeDoc); } },

    { id: 'edit.undo', group: '编辑', label: '撤销', key: 'Ctrl-Z', run: function (cm) { cm.undo(); } },
    { id: 'edit.redo', group: '编辑', label: '重做', key: 'Ctrl-Y', run: function (cm) { cm.redo(); } },
    { id: 'edit.selectAll', group: '编辑', label: '全选', key: 'Ctrl-A', run: function (cm) { cm.execCommand('selectAll'); } },
    { id: 'edit.tab', group: '编辑', label: '插入缩进', key: 'Tab', run: function (cm) { cm.execCommand('defaultTab'); } },
    { id: 'edit.indentLess', group: '编辑', label: '减少缩进', key: 'Shift-Tab', run: function (cm) { cm.indentSelection('subtract'); } },
    { id: 'edit.comment', group: '编辑', label: '注释 / 取消注释', key: 'Ctrl-/', run: function (cm) { cm.toggleComment(); } },
    {
      id: 'edit.complete', group: '编辑', label: '单词自动补全', key: 'Ctrl-Space',
      run: function (cm) { cm.showHint({ hint: CodeMirror.hint.anyword, completeSingle: false }); }
    },

    { id: 'text.sortAsc', group: '文本处理', label: '按行升序排序', key: 'Ctrl-Alt-A', run: function () { sortLines('asc'); } },
    { id: 'text.sortDesc', group: '文本处理', label: '按行降序排序', key: 'Ctrl-Alt-D', run: function () { sortLines('desc'); } },
    { id: 'text.dedupe', group: '文本处理', label: '删除重复行', key: 'Alt-M', run: function () { dedupeLines(); } },
    { id: 'format.open', group: '文本处理', label: '格式化代码', key: 'Ctrl-Alt-F', run: function () { openFormatDialog(); } },
    { id: 'lang.detect', group: '文本处理', label: '重新识别代码语言', key: '', run: function () { detectNow(); } },

    { id: 'text.upper', group: '文本转换', label: '小写字母转大写', key: 'Alt-Q', run: function (cm) { convertCase('upper', cm); } },
    { id: 'text.lower', group: '文本转换', label: '大写字母转小写', key: 'Alt-E', run: function (cm) { convertCase('lower', cm); } },
    { id: 'text.batchReplace', group: '文本转换', label: '批量文字替换', key: 'Alt-R', run: function () { openReplaceDialog(); } },
    {
      id: 'i18n.translate', group: '文本转换', label: '选中文字英汉互译（联网）', key: 'Shift-Ctrl-Space',
      run: function (cm) { translateSelection(cm); }
    },
    {
      id: 'i18n.punct', group: '文本转换', label: '中英标点 / 全角半角转换（离线）', key: '',
      run: function () { openPunctDialog(); }
    },

    { id: 'merge.open', group: '比较合并', label: '选择两个文件开始比较 / 合并', key: 'Ctrl-Alt-M', run: function () { openMergeDialog(); } },
    { id: 'merge.next', group: '比较合并', label: '跳到下一处差异', key: 'F7', run: function () { gotoHunk(merge.idx + 1); } },
    { id: 'merge.prev', group: '比较合并', label: '跳到上一处差异', key: 'Shift-F7', run: function () { gotoHunk(merge.idx - 1); } },
    { id: 'merge.toRight', group: '比较合并', label: '用左侧内容覆盖右侧差异', key: 'Ctrl-Alt-Right', run: function () { applyHunk('toRight'); } },
    { id: 'merge.toLeft', group: '比较合并', label: '用右侧内容覆盖左侧差异', key: 'Ctrl-Alt-Left', run: function () { applyHunk('toLeft'); } },
    { id: 'merge.anchor', group: '比较合并', label: '标记行对齐起点（再点另一边对齐）', key: 'F2', run: function () { markMergeAnchor(); } },
    { id: 'merge.anchorClear', group: '比较合并', label: '清除行对齐', key: '', run: function () { clearMergeAnchor(true); } },
    { id: 'merge.close', group: '比较合并', label: '退出比较视图', key: '', run: function () { exitMerge(); } },

    { id: 'view.wordWrap', group: '视图', label: '自动换行开关', key: 'Alt-Z', run: function () { toggleWordWrap(); } },
    { id: 'view.theme', group: '视图', label: '切换明亮 / 暗色主题', key: '', run: function () { toggleTheme(); } },

    { id: 'help.open', group: '帮助', label: '使用说明', key: 'F1', run: function () { showHelp(); } },
    { id: 'help.keys', group: '帮助', label: '快捷键设置', key: '', run: function () { openKeymapDialog(); } }
  ];
  var CMD_BY_ID = {};
  COMMANDS.forEach(function (c) { CMD_BY_ID[c.id] = c; });

  // 额外别名键：默认键位之外，这些键也触发同一个命令（设置界面里显示的仍是默认键位）
  var KEY_ALIASES = {
    'merge.anchor': ['F12'],       // 行对齐起点：默认 F2，F12 也认（两个键都放行）
    // Chrome / Edge 在 Windows 上把 Alt+E 拿去开浏览器菜单了，页面拦截不住，
    // 所以给它留一个同样顺手的备选键位
    'text.lower': ['Shift-Alt-E']
  };

  function commandById(id) { return CMD_BY_ID[id] || null; }

  // 统一成固定的修饰键顺序，避免 "Alt-Ctrl-A" 与 "Ctrl-Alt-A" 被当成两个快捷键。
  // 顺序必须与 CodeMirror 的 addModifierNames 一致：它按 Alt → Ctrl → Cmd → Shift
  // 依次前缀，最终字符串从左往右是「Shift-Cmd-Ctrl-Alt-键」。
  // CodeMirror 查 extraKeys 时不做规范化，顺序不一致就会找不到绑定
  // （例如 Ctrl+Shift+S 会被查成 "Shift-Ctrl-S"，而 "Ctrl-Shift-S" 就永远不触发）。
  function normalizeKeyName(name) {
    if (!name) return '';
    var parts = String(name).split('-');
    var base = parts.pop();
    if (!base) return '';
    var has = function (m) { return parts.indexOf(m) >= 0; };
    var out = base;
    if (has('Alt')) out = 'Alt-' + out;
    if (has('Ctrl') || has('Control')) out = 'Ctrl-' + out;
    if (has('Cmd') || has('Meta')) out = 'Cmd-' + out;
    if (has('Shift')) out = 'Shift-' + out;
    return out;
  }

  /** 取某个命令当前生效的快捷键（用户覆盖优先），已规范化 */
  function currentKey(cmd) {
    var km = SAK.settings.keymap || {};
    var raw = Object.prototype.hasOwnProperty.call(km, cmd.id) ? km[cmd.id] : cmd.key;
    return normalizeKeyName(raw);
  }

  function commandForKey(name) {
    var want = normalizeKeyName(name);
    if (!want) return null;
    for (var i = 0; i < COMMANDS.length; i++) {
      if (currentKey(COMMANDS[i]) === want) return COMMANDS[i];
    }
    // 别名键（例如行对齐起点的 F12）
    for (var id in KEY_ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(KEY_ALIASES, id)) continue;
      var list = KEY_ALIASES[id];
      for (var k = 0; k < list.length; k++) {
        if (normalizeKeyName(list[k]) === want) return commandById(id);
      }
    }
    return null;
  }

  /** 写入用户覆盖；等于默认值时删除覆盖项 */
  function setOverride(id, key) {
    var cmd = commandById(id);
    if (!cmd) return;
    if (!SAK.settings.keymap) SAK.settings.keymap = {};
    var normalized = normalizeKeyName(key);
    if (normalized === normalizeKeyName(cmd.key)) delete SAK.settings.keymap[id];
    else SAK.settings.keymap[id] = normalized;
    SAK.saveSettings();
    applyKeymap();
  }

  function clearAllOverrides() {
    SAK.settings.keymap = {};
    SAK.saveSettings();
    applyKeymap();
  }

  function applyKeymap() {
    if (ed) ed.setOption('extraKeys', buildKeymap());
  }

  // 与 CodeMirror 的 keyName 保持一致的命名顺序：Alt- Ctrl- Cmd- Shift-
  var KEY_BASE_BY_CODE = {
    Space: 'Space', Escape: 'Esc', ArrowLeft: 'Left', ArrowRight: 'Right',
    ArrowUp: 'Up', ArrowDown: 'Down', Enter: 'Enter', Tab: 'Tab',
    Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert',
    Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
    Slash: '/', Semicolon: ';', Quote: "'", Comma: ',', Period: '.',
    Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Backquote: '`', Backslash: '\\'
  };
  var SHIFTED_SYMBOL = {
    '?': '/', ':': ';', '"': "'", '<': ',', '>': '.', '_': '-', '+': '=',
    '{': '[', '}': ']', '~': '`', '|': '\\',
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0'
  };

  function baseKeyOf(e) {
    var code = e.code || '', m;
    if ((m = /^Key([A-Za-z])$/.exec(code))) return m[1].toUpperCase();
    if ((m = /^Digit([0-9])$/.exec(code))) return m[1];
    if ((m = /^(F[0-9]{1,2})$/.exec(code))) return m[1];
    if (KEY_BASE_BY_CODE[code]) return KEY_BASE_BY_CODE[code];
    var k = e.key;
    if (!k) return null;
    if (/^(Control|Alt|Shift|Meta|OS|CapsLock|NumLock|ScrollLock|ContextMenu|AltGraph)/.test(k)) return null;
    if (k.length === 1) {
      if (/[a-zA-Z]/.test(k)) return k.toUpperCase();
      if (/[0-9]/.test(k)) return k;
      if (SHIFTED_SYMBOL[k]) return SHIFTED_SYMBOL[k];
      return k;
    }
    if (k === ' ') return 'Space';
    if (k === 'Escape') return 'Esc';
    if (/^Arrow/.test(k)) return k.slice(5);
    return k;
  }

  /** 把键盘事件转成规范化的键名，如 "Ctrl-Alt-A" */
  function eventToKeyName(e) {
    var base = baseKeyOf(e);
    if (!base) return null;
    var name = base;
    if (e.altKey) name = 'Alt-' + name;
    if (e.ctrlKey) name = 'Ctrl-' + name;
    if (e.metaKey) name = 'Cmd-' + name;
    if (e.shiftKey) name = 'Shift-' + name;
    return normalizeKeyName(name);
  }

  /** 是否允许作为快捷键：必须带修饰键，或者是不影响打字的特殊键 */
  function isValidShortcut(name) {
    if (!name) return false;
    var parts = name.split('-');
    var base = parts[parts.length - 1];
    if (parts.length > 1) return true;
    return /^(F[0-9]{1,2}|Esc|Insert|Delete|Home|End|PageUp|PageDown|Tab)$/.test(base);
  }

  function prettyKey(name) {
    if (!name) return '';
    var parts = name.split('-');
    var base = parts.pop();
    var order = ['Ctrl', 'Alt', 'Shift', 'Cmd'];
    var mods = order.filter(function (m) { return parts.indexOf(m) >= 0; });
    return mods.concat([base]).join('+');
  }

  function isTypingTarget(t) {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable) return true;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  }

  function isEditorInput(t) {
    if (!t) return false;
    if (ed && t === ed.getInputField()) return true;
    if (merge.mLeft && t === merge.mLeft.getInputField()) return true;
    if (merge.mRight && t === merge.mRight.getInputField()) return true;
    return false;
  }

  /** 执行命令：编辑器内的按键走 CodeMirror，编辑器外的按键走全局分发 */
  function runCommand(id, cm) {
    var cmd = commandById(id);
    if (!cmd) return;
    try {
      cmd.run(cm || ed);
    } catch (err) {
      SAK.error('命令「' + cmd.label + '」执行出错：' + (err && err.message ? err.message : err));
    }
  }

  /* ================================================================== *
   * 编辑器
   * ================================================================== */
  function buildEditorOptions() {
    var s = SAK.settings;
    return {
      lineNumbers: s.lineNumbers,
      lineWrapping: s.wordWrap,
      tabSize: s.tabSize,
      indentUnit: s.tabSize,
      indentWithTabs: !s.insertSpaces,
      smartIndent: true,
      electricChars: true,
      styleActiveLine: s.highlightActiveLine,
      autoCloseBrackets: true,
      matchBrackets: true,
      scrollPastEnd: 0.3,
      showCursorWhenSelecting: true,
      undoDepth: 500,
      theme: 'default',
      specialChars: /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00a0\u200b\ufeff]/g,
      extraKeys: buildKeymap()
    };
  }

  function buildKeymap() {
    var map = {};
    function bind(name, cmd) {
      if (!name || map[name]) return;   // 冲突时保留先注册的
      map[name] = function (cm, event) {
        runCommand(cmd.id, cm);
        if (event && event.preventDefault) event.preventDefault();
        if (event && event.stopPropagation) event.stopPropagation();
      };
    }
    COMMANDS.forEach(function (cmd) {
      bind(currentKey(cmd), cmd);
      (KEY_ALIASES[cmd.id] || []).forEach(function (alias) { bind(normalizeKeyName(alias), cmd); });
    });
    return map;
  }

  function initEditor() {
    ed = CodeMirror($('#editor'), Object.assign(buildEditorOptions(), { value: '' }));
    ed.on('cursorActivity', SAK.debounce(updateStatus, 60));
    ed.on('change', function (cm, change) {
      var doc = docOf(cm);
      if (doc) {
        doc.charCount = -1;
        renderTabs();
        updateStatus();
        if (change.origin && change.origin.indexOf('paste') >= 0) scheduleAutoDetect(doc);
      }
    });
    ed.on('focus', function () { updateStatus(); });

    installFilePaste(ed);
    installFileDrop(ed);
    ed.focus();
  }

  /* ================================================================== *
   * 标签页 / 状态栏
   * ================================================================== */
  function renderTabs() {
    var bar = $('#tabbar');
    bar.innerHTML = '';
    docs.forEach(function (doc) {
      var tab = el('div', {
        class: 'tab' + (doc === activeDoc ? ' active' : '') + (doc.isDirty() ? ' dirty' : ''),
        title: doc.name,
        onclick: function (e) { if (e.target.classList.contains('tclose')) return; activate(doc); }
      }, [
        el('span', { class: 'tname', text: doc.name }),
        el('button', {
          class: 'tclose', title: '关闭', onclick: function (e) { e.stopPropagation(); closeDoc(doc); }
        }, '\u2715')
      ]);
      bar.appendChild(tab);
    });
  }

  function langLabel(doc) {
    var l = SAK.langById(doc.langId);
    if (l.id === 'plaintext') return '纯文本';
    return l.label + (doc.langSource === 'manual' ? '' : '(自动)');
  }

  function updateStatus() {
    if (merge.on) { updateMergeStatus(); return; }
    if (!ed || !activeDoc) return;
    var doc = activeDoc;
    var c = ed.getCursor();
    $('#st-file').textContent = doc.name + (doc.isDirty() ? ' *' : '');
    $('#st-pos').textContent = (c.line + 1) + ' 行, ' + (c.ch + 1) + ' 列';
    var sel = ed.getSelection();
    $('#st-sel').textContent = sel ? ('选中 ' + sel.length + ' 字符') : '';
    $('#st-enc').textContent = SAK.encodingLabel(doc.encoding);
    $('#st-nl').textContent = doc.newline;
    $('#st-mode').textContent = langLabel(doc);
    if (doc.charCount < 0) doc.charCount = doc.cmDoc.getValue().length;
    $('#st-stat').textContent = doc.cmDoc.lineCount() + ' 行 / ' + doc.charCount + ' 字符';
    var sel2 = $('#lang-select');
    if (sel2 && sel2.value !== doc.langId) sel2.value = doc.langId;
    var sel3 = $('#nl-select');
    if (sel3) sel3.value = doc.newline;
    var sel4 = $('#enc-select');
    if (sel4) sel4.value = doc.encoding;
  }

  /* ================================================================== *
   * 语言模式
   * ================================================================== */
  function setDocLanguage(doc, langId) {
    var lang = SAK.langById(langId);
    doc.langId = lang.id;
    var spec = lang.mime || 'null';
    doc.cmDoc.modeOption = spec;
    var apply = function () {
      if (activeDoc === doc && doc.cmDoc === ed.getDoc()) ed.setOption('mode', spec);
    };
    apply();
    if (lang.mode) {
      try {
        CodeMirror.requireMode(lang.mode, function () { apply(); updateStatus(); }, { path: MODE_PATH });
      } catch (e) { /* 模式加载失败时保持纯文本 */ }
    }
    updateStatus();
  }

  var autoDetectTimer = null;
  function scheduleAutoDetect(doc) {
    if (!SAK.settings.autoDetect) return;
    if (autoDetectTimer) clearTimeout(autoDetectTimer);
    autoDetectTimer = setTimeout(function () { autoDetect(doc); }, 220);
  }

  function autoDetect(doc) {
    if (!doc || doc.langSource === 'manual') return;
    var text = doc.cmDoc.getValue();
    if (!text.trim() || text.length > 400000) return;
    var result = SAK.detectLanguage(text);
    if (result.id === 'plaintext' || result.id === doc.langId) return;
    doc.langSource = 'auto';
    setDocLanguage(doc, result.id);
    SAK.msg('已自动识别为 ' + SAK.langById(result.id).label + '（得分 ' + result.score + '）');
  }

  function detectNow() {
    var doc = focusedDoc();
    var cm = focusedEditor();
    if (!doc || !cm) return;
    doc.langSource = 'auto';
    var r = SAK.detectLanguage(cm.getValue());
    if (r.id === 'plaintext') SAK.msg('未能识别出语言，保持纯文本');
    else {
      doc.langId = r.id;
      setDocLanguage(doc, r.id);
      if (merge.on) setPaneLanguage(cm, doc);
      var names = (r.ranked || []).map(function (x) { return SAK.langById(x.id).label + ':' + x.score; }).join('  ');
      SAK.msg('识别结果 → ' + SAK.langById(r.id).label + '（' + names + '）', 6000);
    }
  }

  /* ================================================================== *
   * 行操作：排序 / 去重
   * ================================================================== */
  function lineRangeOf(cm) {
    var sels = cm.listSelections();
    var from = sels[0].from(), to = sels[0].to();
    sels.forEach(function (r) {
      if (CodeMirror.cmpPos(r.from(), from) < 0) from = r.from();
      if (CodeMirror.cmpPos(r.to(), to) > 0) to = r.to();
    });
    var hasSelection = !(from.line === to.line && from.ch === to.ch);
    var startLine, endLine;
    if (hasSelection) {
      startLine = from.line;
      endLine = to.line;
      if (to.ch === 0 && endLine > startLine) endLine--;
    } else {
      startLine = cm.firstLine();
      endLine = cm.lastLine();
      // 文档末尾的空行是「结尾换行」产生的，排序/去重时不应参与
      while (endLine > startLine && cm.getLine(endLine) === '') endLine--;
    }
    return { startLine: startLine, endLine: endLine, hasSelection: hasSelection };
  }

  function getRangeLines(cm, r) {
    var lines = [];
    for (var l = r.startLine; l <= r.endLine; l++) lines.push(cm.getLine(l));
    return lines;
  }

  function replaceLines(cm, r, lines, origin) {
    var last = r.endLine;
    cm.operation(function () {
      cm.replaceRange(lines.join('\n'),
        { line: r.startLine, ch: 0 },
        { line: last, ch: cm.getLine(last).length },
        origin);
      cm.setSelection({ line: r.startLine, ch: 0 }, { line: r.startLine + lines.length - 1, ch: lines[lines.length - 1].length });
    });
  }

  function sortLines(dir, cm) {
    cm = cm || focusedEditor();
    if (!cm) return;
    var r = lineRangeOf(cm);
    var lines = getRangeLines(cm, r);
    if (lines.length < 2) { SAK.msg('至少需要 2 行才能排序'); return; }
    var sorted = lines.slice().sort(function (a, b) {
      var c = a.localeCompare(b, undefined, { numeric: true, sensitivity: 'variant' });
      return dir === 'asc' ? c : -c;
    });
    if (sorted.join('\n') === lines.join('\n')) { SAK.msg('已经是' + (dir === 'asc' ? '升序' : '降序') + '，无需改动'); return; }
    replaceLines(cm, r, sorted, '+sort');
    SAK.msg('按行' + (dir === 'asc' ? '升序' : '降序') + '：已处理 ' + lines.length + ' 行'
      + (r.hasSelection ? '（选区）' : '（全文）'));
  }

  function dedupeLines(cm) {
    cm = cm || focusedEditor();
    if (!cm) return;
    var r = lineRangeOf(cm);
    var lines = getRangeLines(cm, r);
    var seen = Object.create(null), out = [], removed = 0;
    lines.forEach(function (line) {
      var key = line.replace(/[ \t]+$/, '');
      if (seen[key]) { removed++; return; }
      seen[key] = 1;
      out.push(line);
    });
    if (!removed) { SAK.msg('没有重复行'); return; }
    if (!out.length) out = [''];
    replaceLines(cm, r, out, '+dedupe');
    SAK.msg('去重：删除 ' + removed + ' 行重复内容' + (r.hasSelection ? '（选区）' : '（全文）'));
  }

  /* ================================================================== *
   * 文本转换：大小写 / 批量替换 / 中英互译 / 标点全角半角
   * ================================================================== */
  /** 全局分发时传进来的是主编辑器；比较视图下应该落在当前焦点那一侧 */
  function targetEditor(cm) {
    if (merge.on) return focusedEditor();
    return cm || ed;
  }

  /**
   * 把一个「文字 → 结果」的转换作用到选区（没有选区就是全文）
   * fn(text) 返回 { text, count }；opts: { origin, noChange, done }
   */
  function applyTextOp(cm, fn, opts) {
    cm = targetEditor(cm);
    if (!cm) return null;
    var sel = cm.getSelection();
    var hasSel = sel.length > 0;
    var text = hasSel ? sel : cm.getValue();
    if (!text) { SAK.msg('没有可转换的内容'); return null; }
    var result = fn(text);
    if (!result.count) { SAK.msg(opts.noChange); return null; }
    writeBack(cm, result.text, hasSel, opts.origin);
    SAK.msg(opts.done(result, hasSel), 6000);
    return result;
  }

  /** 选区有内容就替换选区，否则替换整个文档；都记为一步可撤销的操作 */
  function writeBack(cm, text, useSelection, origin) {
    cm.operation(function () {
      if (useSelection) {
        cm.replaceSelection(text, 'around', origin);
      } else {
        var last = cm.lastLine();
        cm.replaceRange(text, { line: cm.firstLine(), ch: 0 },
          { line: last, ch: cm.getLine(last).length }, origin);
      }
    });
    updateStatus();
  }

  function convertCase(dir, cm) {
    var up = dir === 'upper';
    applyTextOp(cm, up ? SAK.textops.toUpper : SAK.textops.toLower, {
      origin: up ? '+upper' : '+lower',
      noChange: up ? '没有小写字母需要转成大写' : '没有大写字母需要转成小写',
      done: function (r, hasSel) {
        return (up ? '小写 → 大写' : '大写 → 小写') + '：转换 ' + r.count + ' 个字符'
          + (hasSel ? '（选区）' : '（全文）') + '，Ctrl+Z 可撤销';
      }
    });
  }

  /* ---------- 英汉互译（联网，走本地 /api/translate） ---------- */
  async function translateSelection(cm) {
    cm = targetEditor(cm);
    if (!cm) return null;
    var sel = cm.getSelection();
    if (!sel.trim()) { SAK.error('请先选中要翻译的文字，再按 Ctrl+Shift+空格'); return null; }
    var target = SAK.textops.detectTranslateTarget(sel);
    var dirLabel = target === 'en' ? '中文 → 英文' : '英文 → 中文';
    var parts = SAK.textops.splitForTranslate(sel);
    var out = [], provider = '';
    SAK.msg('正在翻译（' + dirLabel + '）…', 60000);
    try {
      for (var i = 0; i < parts.length; i++) {
        if (parts.length > 1) SAK.msg('正在翻译（' + dirLabel + '）… ' + (i + 1) + '/' + parts.length, 60000);
        var r = await SAK.translate(parts[i].text, target);
        provider = provider || r.provider || '';
        out.push({ text: String(r.text).replace(/[ \t]+$/, ''), sep: parts[i].sep });
      }
    } catch (e) {
      SAK.error('翻译失败：' + ((e && e.message) || e) + '；离线可用「中英标点 / 全角半角转换」');
      return null;
    }
    var result = out.map(function (p, i) { return (i ? p.sep : '') + p.text; }).join('');
    writeBack(cm, result, true, '+translate');
    SAK.msg('翻译完成（' + dirLabel + (provider ? '，' + provider : '') + '），Ctrl+Z 可撤销', 8000);
    return result;
  }

  /* ---------- 批量文字替换（Alt+R） ---------- */
  function openReplaceDialog(cm) {
    cm = targetEditor(cm);
    if (!cm) return null;
    var sel = cm.getSelection();
    var hasSel = sel.length > 0;
    var saved = SAK.settings.replaceRules || null;

    var list = el('div', { class: 'rule-list' });
    var rows = [];
    var refreshSoon = SAK.debounce(function () { refresh(); }, 160);

    function addRow(find, to) {
      var findInput = el('input', { type: 'text', class: 'grow', placeholder: '查找内容（换行写 \\n）', value: find || '' });
      var toInput = el('input', { type: 'text', class: 'grow', placeholder: '替换为（留空 = 删除）', value: to || '' });
      var delBtn = el('button', { type: 'button', class: 'linkbtn', title: '删除这条规则', text: '✕' });
      var cnt = el('span', { class: 'rep-count' });
      var row = el('div', { class: 'rule-row' }, [findInput, toInput, delBtn, cnt]);
      var entry = { find: findInput, to: toInput, el: row, count: cnt };
      delBtn.addEventListener('click', function () {
        if (rows.length <= 1) { findInput.value = ''; toInput.value = ''; refresh(); return; }
        var i = rows.indexOf(entry);
        if (i >= 0) rows.splice(i, 1);
        row.remove();
        refresh();
      });
      findInput.addEventListener('input', refreshSoon);
      toInput.addEventListener('input', refreshSoon);
      rows.push(entry);
      list.appendChild(row);
      return entry;
    }

    var caseSensitive = el('input', { type: 'checkbox' });
    var useRegex = el('input', { type: 'checkbox' });
    var scopeAll = el('input', { type: 'radio', name: 'rep-scope', value: 'all' });
    var scopeSel = el('input', { type: 'radio', name: 'rep-scope', value: 'sel' });
    scopeAll.checked = !hasSel;
    scopeSel.checked = hasSel;
    scopeSel.disabled = !hasSel;
    var summary = el('div', { class: 'rep-summary' });
    var preview = el('pre', { class: 'rep-preview' });

    function options() { return { caseSensitive: caseSensitive.checked, regex: useRegex.checked }; }
    function curRules() { return rows.map(function (r) { return { find: r.find.value, to: r.to.value }; }); }
    function inSelection() { return scopeSel.checked && hasSel; }
    function scopeText() { return inSelection() ? cm.getSelection() : cm.getValue(); }

    function refresh() {
      var opts = options(), rs = curRules(), text = scopeText();
      var badAt = -1, badMsg = '';
      rs.forEach(function (r, i) {
        if (!r.find) return;
        try { SAK.textops.compileFind(r.find, opts); }
        catch (e) { if (badAt < 0) { badAt = i; badMsg = e.message; } }
      });
      if (badAt >= 0) {
        rows.forEach(function (r, i) {
          r.el.classList.toggle('bad', i === badAt);
          r.count.textContent = i === badAt ? '⚠ 正则错误' : '';
        });
        summary.innerHTML = '<span class="warn">⚠ 第 ' + (badAt + 1) + ' 条规则的正则有问题：' + SAK.escapeHtml(badMsg) + '</span>';
        preview.textContent = '';
        return;
      }
      var res = SAK.textops.batchReplace(text, rs, opts);
      rows.forEach(function (r, i) {
        r.el.classList.remove('bad');
        r.count.textContent = res.perRule[i] ? (res.perRule[i] + ' 处') : '';
      });
      var active = rs.filter(function (r) { return r.find; }).length;
      if (!active) {
        summary.textContent = '左边填「查找内容」，右边填「替换为」，一次可以加多条规则，按从上到下的顺序依次应用';
      } else {
        summary.innerHTML = '共 <b>' + res.count + '</b> 处匹配 · ' + active + ' 条规则 · '
          + (inSelection() ? '范围：当前选区' : '范围：整个文档');
      }
      if (!res.count) { preview.textContent = ''; return; }
      var idx = SAK.textops.firstDiff(text, res.text);
      var start = Math.max(0, idx - 120);
      var piece = res.text.substr(start, 700);
      preview.textContent = (start > 0 ? '…' : '') + piece + (start + 700 < res.text.length ? '\n…（仅预览改动附近）' : '');
    }

    function doApply(m) {
      var opts = options();
      var rs = curRules().filter(function (r) { return r.find; });
      if (!rs.length) { SAK.error('请先填写「查找内容」'); return; }
      var useSel = inSelection();
      var text = scopeText();
      var res;
      try { res = SAK.textops.batchReplace(text, rs, opts); }
      catch (e) { SAK.error('替换失败：' + ((e && e.message) || e)); return; }
      // 记住这次的规则，下次按 Alt+R 直接就是这一套
      SAK.settings.replaceRules = {
        caseSensitive: caseSensitive.checked,
        regex: useRegex.checked,
        rules: rs.map(function (r) { return { find: r.find, to: r.to }; })
      };
      SAK.saveSettings();
      if (!res.count) { SAK.msg('没有匹配到内容，文档未改动'); m.close(null); return; }
      writeBack(cm, res.text, useSel, '+batchReplace');
      m.close(null);
      SAK.msg('批量替换完成：' + rs.length + ' 条规则共替换 ' + res.count + ' 处（Ctrl+Z 可撤销）', 7000);
    }

    var initial = (saved && saved.rules && saved.rules.length) ? saved.rules : [{ find: '', to: '' }];
    initial.forEach(function (r) { addRow(r.find, r.to); });
    if (saved) { caseSensitive.checked = !!saved.caseSensitive; useRegex.checked = !!saved.regex; }
    [caseSensitive, useRegex, scopeAll, scopeSel].forEach(function (n) { n.addEventListener('change', refresh); });

    var body = el('div', { style: { width: '560px' } }, [
      el('div', { class: 'field' }, [
        el('label', { text: '替换规则' }),
        el('div', { class: 'grow' }, [
          list,
          el('button', {
            type: 'button', class: 'linkbtn', text: '＋ 添加一条规则',
            onclick: function () { addRow('', '').find.focus(); refresh(); }
          })
        ])
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: '选项' }),
        el('div', { class: 'grow inline-radio' }, [
          el('label', {}, [caseSensitive, '区分大小写']),
          el('label', {}, [useRegex, '正则表达式']),
          el('label', {}, [scopeAll, '整个文档']),
          el('label', {}, [scopeSel, hasSel ? '当前选区' : '当前选区（无选区）'])
        ])
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: '预览' }),
        el('div', { class: 'grow' }, [summary, preview])
      ])
    ]);
    refresh();

    return SAK.modal({
      title: '批量文字替换  (Alt+R)',
      width: '640px',
      body: body,
      buttons: [
        {
          label: '清空规则', onClick: function () {
            rows.slice().forEach(function (r) { r.el.remove(); });
            rows.length = 0;
            addRow('', '').find.focus();
            refresh();
          }
        },
        { label: '取消', onClick: function (m) { m.close(null); } },
        { label: '全部替换', primary: true, onClick: function (m) { doApply(m); } }
      ]
    });
  }

  /* ---------- 中英标点 / 全角半角转换（离线） ---------- */
  function openPunctDialog(cm) {
    cm = targetEditor(cm);
    if (!cm) return null;
    var sel = cm.getSelection();
    var hasSel = sel.length > 0;
    var sample = hasSel ? sel : cm.getValue();
    if (!sample.trim()) { SAK.msg('没有可转换的内容'); return null; }

    // 按内容猜一个方向：中文居多就按「中 → 英」标点处理，反之亦然（可以手动改）
    var guess = SAK.textops.detectTranslateTarget(sample) === 'en' ? 'zh2en' : 'en2zh';
    var zh2en = el('input', { type: 'radio', name: 'punct-dir', value: 'zh2en' });
    var en2zh = el('input', { type: 'radio', name: 'punct-dir', value: 'en2zh' });
    if (guess === 'zh2en') zh2en.checked = true; else en2zh.checked = true;

    var alnum = el('input', { type: 'checkbox' });
    var scopeAll = el('input', { type: 'radio', name: 'punct-scope', value: 'all' });
    var scopeSel = el('input', { type: 'radio', name: 'punct-scope', value: 'sel' });
    scopeAll.checked = !hasSel;
    scopeSel.checked = hasSel;
    scopeSel.disabled = !hasSel;
    var info = el('div', { class: 'plan-info' });
    var preview = el('pre', { class: 'rep-preview' });

    function dirNow() { return zh2en.checked ? 'zh2en' : 'en2zh'; }
    function inSelection() { return scopeSel.checked && hasSel; }

    function refresh() {
      var dir = dirNow();
      var text = inSelection() ? cm.getSelection() : cm.getValue();
      var r = SAK.textops.convertPunctuation(text, dir, { alnum: alnum.checked });
      info.innerHTML = '将改 <b>' + r.count + '</b> 个字符 · <b>' + (dir === 'zh2en' ? '中文标点 → 英文标点' : '英文标点 → 中文标点') + '</b>'
        + '<div class="dim">' + (dir === 'zh2en'
          ? '，。！？；：、（）【】《》和全角空格 / 引号都会换成英文写法。'
          : ',.!?;:()[] 和引号会换成中文写法；小数点（3.14）、千分位逗号（1,000）、时间（10:30）这类会原样保留。') + '</div>';
      if (!r.count) { preview.textContent = ''; return; }
      var idx = SAK.textops.firstDiff(text, r.text);
      var start = Math.max(0, idx - 120);
      preview.textContent = (start > 0 ? '…' : '') + r.text.substr(start, 600);
    }

    var body = el('div', { style: { width: '520px' } }, [
      el('div', { class: 'field' }, [
        el('label', { text: '转换方向' }),
        el('div', { class: 'grow inline-radio' }, [
          el('label', {}, [zh2en, '中文标点 → 英文标点']),
          el('label', {}, [en2zh, '英文标点 → 中文标点'])
        ])
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: '范围' }),
        el('div', { class: 'grow inline-radio' }, [
          el('label', {}, [scopeAll, '整个文档']),
          el('label', {}, [scopeSel, hasSel ? '当前选区' : '当前选区（无选区）'])
        ])
      ]),
      el('div', { class: 'field' }, [
        el('label', { text: '附加' }),
        el('div', { class: 'grow' }, [
          el('label', { class: 'inline-check' }, [alnum, '字母数字也一起转全角 / 半角（ＡＢＣ ↔ ABC）'])
        ])
      ]),
      el('div', { class: 'field' }, [el('label', { text: '预览' }), el('div', { class: 'grow' }, [info, preview])])
    ]);

    [zh2en, en2zh, alnum, scopeAll, scopeSel].forEach(function (n) { n.addEventListener('change', refresh); });
    refresh();

    return SAK.modal({
      title: '中英标点 / 全角半角转换（离线）',
      width: '600px',
      body: body,
      buttons: [
        { label: '取消', onClick: function (m) { m.close(null); } },
        {
          label: '转换', primary: true, onClick: function (m) {
            var text = inSelection() ? cm.getSelection() : cm.getValue();
            var r = SAK.textops.convertPunctuation(text, dirNow(), { alnum: alnum.checked });
            m.close(null);
            if (!r.count) { SAK.msg('没有需要转换的标点'); return; }
            writeBack(cm, r.text, inSelection(), '+punct');
            SAK.msg('标点转换完成：改动 ' + r.count + ' 个字符（Ctrl+Z 可撤销）', 6000);
          }
        }
      ]
    });
  }

  /* ================================================================== *
   * 粘贴 / 拖入多个文件 → 可点击路径
   * ================================================================== */
  function collectFiles(dt) {
    var files = [];
    if (dt.files && dt.files.length) {
      for (var i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    }
    if (!files.length && dt.items) {
      for (var j = 0; j < dt.items.length; j++) {
        var it = dt.items[j];
        if (it.kind === 'file') {
          var f = it.getAsFile();
          if (f) files.push(f);
        }
      }
    }
    return files;
  }

  // 有些平台在复制文件时会同时给出纯文本路径，能拿到就优先用真实路径显示
  function looksLikePath(s) {
    return /^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s) || /^\/[^/]/.test(s) || /[\\/]/.test(s);
  }

  function insertFileLinks(cm, files, textHint) {
    var names = files.map(function (f) {
      return SAK.fileLinks.pathOf(f) || f.name || '未命名文件';
    });
    if (textHint) {
      var hintLines = String(textHint).replace(/\r\n?/g, '\n').split('\n')
        .map(function (s) { return s.replace(/^["']|["']$/g, '').trim(); })
        .filter(function (s) { return s.length > 0; });
      if (hintLines.length === files.length && hintLines.some(looksLikePath)) names = hintLines;
    }
    var text = names.join('\n');
    var cursor = cm.getCursor();
    var startLine = cursor.line, startCh = cursor.ch;
    cm.operation(function () {
      cm.replaceSelection(text, 'end', '+paste');
      for (var i = 0; i < files.length; i++) {
        var line = startLine + i;
        var ch = i === 0 ? startCh : 0;
        var id = SAK.fileLinks.add(files[i], names[i]);
        cm.markText({ line: line, ch: ch }, { line: line, ch: ch + names[i].length }, {
          className: 'cm-file-path',
          atomic: true,
          attributes: {
            'data-flid': String(id),
            title: '点击打开：' + names[i]
          }
        });
      }
    });
    SAK.msg('已插入 ' + files.length + ' 个文件路径，点击路径即可打开', 6000);
  }

  function installFilePaste(cm) {
    var wrapper = cm.getWrapperElement();

    wrapper.addEventListener('paste', function (e) {
      var dt = e.clipboardData;
      if (!dt) return;
      var files = collectFiles(dt);
      if (!files.length) return;   // 普通文本粘贴交给 CodeMirror
      var textHint = '';
      try { textHint = dt.getData('text/plain') || ''; } catch (err) { }
      e.preventDefault();
      e.stopPropagation();
      insertFileLinks(cm, files, textHint);
    }, true);

    wrapper.addEventListener('click', function (e) {
      var node = e.target;
      while (node && node !== wrapper && !(node.classList && node.classList.contains('cm-file-path'))) {
        node = node.parentNode;
      }
      if (!node || node === wrapper) return;
      var id = node.getAttribute('data-flid');
      var entry = id && SAK.fileLinks.get(id);
      if (!entry) return;
      e.preventDefault();
      e.stopPropagation();
      openLinkedFile(entry);
    }, true);
  }

  /** 把一个 File 对象读成文档并开成新标签页（拖入单个文件、点击路径共用这一条路） */
  async function openFileObject(file, displayName) {
    var name = displayName || SAK.fileLinks.pathOf(file) || (file && file.name) || '未命名文件';
    try {
      var bytes = new Uint8Array(await file.arrayBuffer());
      var doc = openBytes(name, bytes, null);
      if (doc) SAK.msg('已打开 ' + name);
      return doc;
    } catch (err) {
      SAK.error('打开失败：' + (err && err.message ? err.message : err));
      return null;
    }
  }

  function openLinkedFile(entry) {
    return openFileObject(entry.file, entry.display);
  }

  /**
   * 拖进来的到底是不是文件夹。
   * 浏览器会把文件夹也塞进 dataTransfer.files（大小为 0），它不是能打开的「文件」，
   * 这种情况退回原来的「插入可点击路径」行为。
   */
  function droppedEntryIsDirectory(dt) {
    try {
      if (!dt.items || dt.items.length !== 1) return false;
      var it = dt.items[0];
      var entry = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null;
      return !!(entry && entry.isDirectory);
    } catch (e) {
      return false;
    }
  }

  function installFileDrop(cm) {
    var wrapper = cm.getWrapperElement();
    var hint = $('#drop-hint');
    ['dragenter', 'dragover'].forEach(function (type) {
      wrapper.addEventListener(type, function (e) {
        if (!e.dataTransfer) return;
        var hasFiles = Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0;
        if (!hasFiles) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (hint) hint.classList.add('show');
      });
    });
    wrapper.addEventListener('dragleave', function (e) {
      if (hint) hint.classList.remove('show');
    });
    wrapper.addEventListener('drop', function (e) {
      if (hint) hint.classList.remove('show');
      var dt = e.dataTransfer;
      if (!dt) return;
      var files = collectFiles(dt);
      if (!files.length) return;
      e.preventDefault();
      e.stopPropagation();
      // 拖入「一个文件」＝ 想打开它，直接开成新标签页；
      // 拖入「多个文件」维持原样：在光标处插入一行一个可点击路径
      if (files.length === 1 && !droppedEntryIsDirectory(dt)) {
        openFileObject(files[0]);
        return;
      }
      var pos = cm.coordsChar({ left: e.pageX, top: e.pageY });
      cm.setCursor(pos);
      insertFileLinks(cm, files);
    });
  }

  /* ================================================================== *
   * 文档操作
   * ================================================================== */
  function createDoc(opts) {
    var doc = new Doc(opts);
    docs.push(doc);
    activate(doc);
    return doc;
  }

  function newDoc() {
    var doc = createDoc({ name: '未命名-' + (docSeq + 1) + '.txt', text: '', langId: 'plaintext', langSource: 'auto' });
    renderTabs();
    updateStatus();
    ed.focus();
    return doc;
  }

  function activate(doc) {
    if (!doc) return;
    activeDoc = doc;
    if (ed.getDoc() !== doc.cmDoc) ed.swapDoc(doc.cmDoc);
    var lang = SAK.langById(doc.langId);
    var spec = lang.mime || 'null';
    ed.setOption('mode', spec);
    if (lang.mode) {
      try { CodeMirror.requireMode(lang.mode, function () { ed.setOption('mode', spec); }, { path: MODE_PATH }); }
      catch (e) { }
    }
    renderTabs();
    updateStatus();
  }

  async function closeDoc(doc) {
    if (!doc) return;
    if (merge.on && (doc === merge.docL || doc === merge.docR)) await exitMerge(true);
    if (doc.isDirty()) {
      var ok = await SAK.confirm('关闭确认', '「' + doc.name + '」有未保存的修改，确定关闭吗？', '不保存并关闭');
      if (!ok) return;
    }
    var idx = docs.indexOf(doc);
    if (idx < 0) return;
    docs.splice(idx, 1);
    if (!docs.length) {
      activeDoc = null;
      newDoc();
    } else {
      activate(docs[Math.min(idx, docs.length - 1)]);
    }
    renderTabs();
  }

  function openBytes(name, bytes, handle) {
    if (SAK.encoding.isBinary(bytes)) {
      SAK.error(name + ' 看起来是二进制文件，已跳过');
      return null;
    }
    var enc = SAK.encoding.detect(bytes);
    var text = SAK.encoding.decode(bytes, enc);
    var nl = SAK.detectNewline(text);
    text = SAK.normalizeNewline(text);

    var doc = new Doc({
      name: name, text: text, encoding: enc, newline: nl,
      handle: handle || null, bytes: bytes, langId: 'plaintext', langSource: 'auto'
    });
    docs.push(doc);

    var lang = SAK.langByFileName(name);
    if (lang && lang.id !== 'plaintext') {
      doc.langSource = 'file';
      setDocLanguage(doc, lang.id);
    } else {
      var r = SAK.detectLanguage(text);
      if (r.id !== 'plaintext') { doc.langSource = 'auto'; setDocLanguage(doc, r.id); }
    }
    activate(doc);
    return doc;
  }

  async function openFiles() {
    try {
      var picked = await SAK.fs.pickOpen();
      var opened = [];
      for (var i = 0; i < picked.length; i++) {
        var d = openBytes(picked[i].name, picked[i].bytes, picked[i].handle);
        if (d) opened.push(d);
      }
      if (opened.length) SAK.msg('已打开 ' + opened.length + ' 个文件');
      return opened;
    } catch (e) {
      if (e && e.name === 'AbortError') return [];
      SAK.error('打开失败：' + (e && e.message ? e.message : e));
      return [];
    }
  }

  /** 把拖进来的 File 对象读成文档（复用打开文件那套编码识别 / 二进制检查） */
  function importFiles(fileList) {
    var arr = Array.prototype.slice.call(fileList || []);
    return Promise.all(arr.map(function (f) {
      return SAK.fs.readBlob(f).then(function (bytes) {
        return openBytes(f.name, bytes, null);
      }).catch(function () { return null; });
    })).then(function (list) {
      return list.filter(Boolean);
    });
  }

  async function saveDoc(doc, saveAs) {
    if (!doc) return;
    var info = SAK.encodingInfo(doc.encoding);
    if (!info.write) {
      var ok = await SAK.confirm('编码不支持保存',
        '当前文字编码「' + info.label + '」只能读取，无法写回。\n是否改用 UTF-8 保存？', '用 UTF-8 保存');
      if (!ok) return;
      doc.encoding = 'UTF-8';
    }
    var text = SAK.applyNewline(doc.cmDoc.getValue(), doc.newline);
    var bytes = SAK.encoding.encode(text, doc.encoding);
    try {
      if (saveAs || !doc.handle) {
        var h = await SAK.fs.pickSave(doc.name);
        if (h === undefined) return;      // 用户取消
        if (h) {
          doc.handle = h;
          doc.name = h.name || doc.name;
        }
      }
      var direct = await SAK.fs.write(doc.handle, bytes, doc.name);
      doc.markSaved();
      doc.bytes = bytes;
      renderTabs();
      updateStatus();
      SAK.msg(direct ? ('已保存：' + doc.name) : ('已下载：' + doc.name + '（浏览器不支持直接写盘，文件在下载目录）'), 6000);
    } catch (e) {
      SAK.error('保存失败：' + (e && e.message ? e.message : e));
    }
  }

  /* ================================================================== *
   * 双栏比较 / 合并
   * ================================================================== */
  var merge = {
    on: false, mLeft: null, mRight: null,
    docL: null, docR: null,
    hunks: [], idx: -1, stat: null,
    wordMarks: [], widgets: [],
    opts: { ignoreTrailingSpace: false, ignoreCase: false },
    focus: null, ui: null, diffTimer: null,
    // 行对齐（F2 标记 + 点另一边）：只影响占位块的排法，不动差异结果。
    // 可以累积多对：anchors = [{left: 行号, right: 行号}, ...]
    anchors: [],
    pending: null        // 按了 F2 还没点另一边：{side: 'left'|'right', line: 行号}
  };
  SAK.mergeState = merge;

  function ensureMergeEditors() {
    if (merge.mLeft) return;
    var base = buildEditorOptions();
    var opts = Object.assign({}, base, {
      lineWrapping: false,          // 关掉换行，行高一致才能左右对齐
      styleActiveLine: false,
      scrollPastEnd: 0.1
    });
    merge.mLeft = CodeMirror($('#merge-left'), Object.assign({}, opts, { value: '' }));
    merge.mRight = CodeMirror($('#merge-right'), Object.assign({}, opts, { value: '' }));

    [merge.mLeft, merge.mRight].forEach(function (cm) {
      var other = cm === merge.mLeft ? merge.mRight : merge.mLeft;
      // 两条路径都接上：CM 的 scroll 信号 + 滚动容器的 DOM scroll 事件
      cm.on('scroll', function () { syncScroll(cm, other); });
      cm.getScrollerElement().addEventListener('scroll', function () { syncScroll(cm, other); }, { passive: true });
      cm.on('focus', function () { merge.focus = cm; updateStatus(); });
      cm.on('change', function () { scheduleDiff(); });
      cm.on('cursorActivity', SAK.debounce(updateMergeStatus, 80));
      // 已经按过 F2：点另一边的那一行 → 用这两行做滚动对齐
      cm.getWrapperElement().addEventListener('mousedown', function (e) {
        if (!merge.on || !merge.pending) return;
        var side = cm === merge.mRight ? 'right' : 'left';
        var pos = cm.coordsChar({ left: e.pageX, top: e.pageY });
        if (merge.pending.side === side) {
          merge.pending.line = pos.line;          // 同一侧再点：只是把标记挪过去
          paintMergeAnchors();
          updateMergeStatus();
          return;
        }
        completeMergeAnchor(side, pos.line);
      });
    });
  }

  function syncScroll(src, dst) {
    if (!src || !dst) return;
    var a = src.getScrollInfo(), b = dst.getScrollInfo();
    // 行对齐是靠占位块做出来的，所以两边始终是 1:1 同步
    if (Math.abs(a.top - b.top) < 1 && Math.abs(a.left - b.left) < 1) return;
    dst.scrollTo(a.left, a.top);
  }

  /* ---------- 行对齐（F2 标记 → 点另一边） ---------- */

  function mergeSideOf(cm) { return cm === merge.mRight ? 'right' : 'left'; }
  function mergeCmOf(side) { return side === 'right' ? merge.mRight : merge.mLeft; }

  /** 在焦点所在的那一侧，把光标行标成「对齐起点」，等用户点另一边 */
  function markMergeAnchor() {
    if (!merge.on) { SAK.msg('当前不在比较视图，先用「比较」按钮选择两个文件'); return; }
    var cm = focusedEditor();
    var side = mergeSideOf(cm);
    var line = cm.getCursor().line;
    merge.pending = { side: side, line: line };
    paintMergeAnchors();
    updateMergeStatus();
    SAK.msg('已把' + (side === 'left' ? '左' : '右') + '侧第 ' + (line + 1) +
      ' 行标为对齐起点：点另一边的对应行，这两行就会排到同一行上', 8000);
  }

  /** 点另一边完成对齐：把这一对行顶到同一个「视觉行」上（加占位块，不改差异结果） */
  function completeMergeAnchor(side, line) {
    var p = merge.pending;
    if (!p) return;
    var leftLine = side === 'left' ? line : p.line;
    var rightLine = side === 'right' ? line : p.line;
    var replaced = merge.anchors.some(function (a) {
      return a.left === leftLine || a.right === rightLine;
    });
    // 同一行只能配一对：同一侧行或另一侧行相同的旧配对让位
    merge.anchors = merge.anchors.filter(function (a) {
      return a.left !== leftLine && a.right !== rightLine;
    });
    merge.anchors.push({ left: leftLine, right: rightLine });
    merge.pending = null;
    runDiff();                       // 重算占位块：这些行都会落到同一行
    paintMergeAnchors();
    // 把刚配的这一对带到眼前
    var aL = Math.min(leftLine, merge.mLeft.lastLine());
    merge.mLeft.scrollIntoView({ line: Math.max(0, aL - 3), ch: 0 }, 60);
    syncScroll(merge.mLeft, merge.mRight);
    updateMergeStatus();
    SAK.msg('已对齐：左侧第 ' + (leftLine + 1) + ' 行 ↔ 右侧第 ' + (rightLine + 1) +
      ' 行排在同一行（共 ' + merge.anchors.length + ' 对' + (replaced ? '，同一行的旧配对已替换' : '，之前的对齐保留') +
      '；差异结果没变）', 8000);
  }

  function clearMergeAnchor(notify) {
    var had = merge.anchors.length > 0 || !!merge.pending;
    merge.anchors = [];
    merge.pending = null;
    if (merge.on) {
      runDiff();                     // 占位块回到按差异自动计算
      paintMergeAnchors();
      updateMergeStatus();
    }
    if (notify) SAK.msg(had ? '已取消全部行对齐，占位块恢复按差异自动计算' : '当前没有行对齐');
  }

  function paintMergeAnchors() {
    [merge.mLeft, merge.mRight].forEach(function (cm) {
      if (!cm) return;
      var n = cm.lineCount();
      for (var i = 0; i < n; i++) {
        cm.removeLineClass(i, 'background', 'cm-merge-anchor');
        cm.removeLineClass(i, 'background', 'cm-merge-anchor-pending');
      }
    });
    merge.anchors.forEach(function (a) {
      if (a.left < merge.mLeft.lineCount()) merge.mLeft.addLineClass(a.left, 'background', 'cm-merge-anchor');
      if (a.right < merge.mRight.lineCount()) merge.mRight.addLineClass(a.right, 'background', 'cm-merge-anchor');
    });
    if (merge.pending) {
      var cm = mergeCmOf(merge.pending.side);
      if (merge.pending.line < cm.lineCount()) {
        cm.addLineClass(merge.pending.line, 'background', 'cm-merge-anchor-pending');
      }
    }
  }

  function scheduleDiff() {
    if (!merge.on) return;
    if (merge.diffTimer) clearTimeout(merge.diffTimer);
    merge.diffTimer = setTimeout(runDiff, 400);
  }

  function focusedEditor() {
    if (merge.on) {
      if (merge.focus === merge.mRight) return merge.mRight;
      return merge.mLeft;
    }
    return ed;
  }

  function focusedDoc() {
    if (merge.on) return focusedEditor() === merge.mRight ? merge.docR : merge.docL;
    return activeDoc;
  }

  function saveFocused(as) {
    if (merge.on) {
      var cm = focusedEditor();
      var doc = cm === merge.mRight ? merge.docR : merge.docL;
      if (!doc) { SAK.error('这一侧的内容没有对应的文档，无法保存'); return; }
      if (doc.cmDoc.getValue() !== cm.getValue()) {
        doc.cmDoc.setValue(cm.getValue());
        doc.charCount = -1;
      }
      saveDoc(doc, as);
      return;
    }
    saveDoc(activeDoc, as);
  }

  function paneDirty() {
    if (!merge.docL && !merge.docR) return false;
    var okL = !merge.docL || merge.mLeft.getValue() === merge.docL.cmDoc.getValue();
    var okR = !merge.docR || merge.mRight.getValue() === merge.docR.cmDoc.getValue();
    return !(okL && okR);
  }

  /* ---------- 选择文件：拖拽分配到左 / 右 ---------- */
  function openMergeDialog() {
    if (merge.on) { SAK.msg('已经在比较视图中，可先退出再重新选择文件'); return; }

    var pool = [];                        // 待分配
    var slots = { left: null, right: null };
    var seq = 0;

    function entryOf(doc) {
      return { id: 'e' + (++seq), doc: doc, label: doc.name + (doc.isDirty() ? ' *' : '') };
    }
    function findEntry(id) {
      if (slots.left && slots.left.id === id) return slots.left;
      if (slots.right && slots.right.id === id) return slots.right;
      for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return pool[i];
      return null;
    }
    function removeFromPool(entry) {
      var i = pool.indexOf(entry);
      if (i >= 0) pool.splice(i, 1);
    }
    /** 把某个文件放到指定一侧；原来占位的那一个回到待分配 */
    function assign(entry, side) {
      if (!entry) return;
      var other = side === 'left' ? 'right' : 'left';
      removeFromPool(entry);
      if (slots[other] === entry) slots[other] = null;
      if (slots[side] && slots[side] !== entry) pool.push(slots[side]);
      slots[side] = entry;
    }
    function unassign(entry) {
      if (slots.left === entry) slots.left = null;
      if (slots.right === entry) slots.right = null;
      if (pool.indexOf(entry) < 0) pool.push(entry);
    }
    /** 新增文件：正好两个且两侧都空 → 自动一左一右 */
    function addEntries(entries, autoAssign) {
      var added = [];
      entries.forEach(function (en) {
        if (!en) return;
        if (slots.left === en || slots.right === en || pool.indexOf(en) >= 0) return;
        pool.push(en);
        added.push(en);
      });
      if (autoAssign && added.length === 2 && !slots.left && !slots.right) {
        assign(added[0], 'left');
        assign(added[1], 'right');
        SAK.msg('已自动分配：左边「' + added[0].label + '」，右边「' + added[1].label + '」', 6000);
      }
      render();
    }

    /* ---- 元素 ---- */
    var chipsBox = el('div', { class: 'mp-chips' });
    var poolBox = el('div', { class: 'mp-pool' }, [
      el('div', { class: 'mp-pool-title', text: '待分配（拖到左边或右边，或者点一下放进去）' }),
      chipsBox
    ]);
    var slotLeftBody = el('div', { class: 'mp-slot-body' });
    var slotRightBody = el('div', { class: 'mp-slot-body' });

    function slotBox(side, body) {
      var box = el('div', { class: 'mp-slot ' + side }, [
        el('div', { class: 'mp-slot-title' }, [
          el('span', { class: 'merge-badge ' + (side === 'left' ? 'left-badge' : 'right-badge'), text: side === 'left' ? '左' : '右' }),
          el('span', { text: '把文件拖到这里' })
        ]),
        body
      ]);
      box.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        box.classList.add('dragover');
      });
      box.addEventListener('dragleave', function () { box.classList.remove('dragover'); });
      box.addEventListener('drop', async function (e) {
        e.preventDefault();
        e.stopPropagation();
        box.classList.remove('dragover');
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
          var imported = (await importFiles(files)).map(entryOf);
          if (imported.length) {
            assign(imported[0], side);
            var other = side === 'left' ? 'right' : 'left';
            for (var i = 1; i < imported.length; i++) {
              if (!slots[other]) assign(imported[i], other);
              else if (pool.indexOf(imported[i]) < 0) pool.push(imported[i]);
            }
            render();
          }
          return;
        }
        var id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
        var entry = id ? findEntry(id) : null;
        if (entry) { assign(entry, side); render(); }
      });
      return box;
    }

    var slotLeft = slotBox('left', slotLeftBody);
    var slotRight = slotBox('right', slotRightBody);

    var pickBtn = el('button', { class: 'btn', type: 'button', text: '选择文件…' });
    pickBtn.addEventListener('click', async function () {
      var opened = await openFiles();
      if (opened && opened.length) addEntries(opened.map(entryOf), true);
    });

    var swapBtn = el('button', { class: 'btn', type: 'button', text: '⇄ 交换左右' });
    swapBtn.addEventListener('click', function () {
      var t = slots.left; slots.left = slots.right; slots.right = t;
      render();
    });

    var ignWs = el('input', { type: 'checkbox' });
    ignWs.checked = merge.opts.ignoreTrailingSpace;
    var ignCase = el('input', { type: 'checkbox' });
    ignCase.checked = merge.opts.ignoreCase;

    var body = el('div', { class: 'merge-picker' }, [
      el('div', { class: 'mp-toolbar' }, [
        pickBtn, swapBtn,
        el('span', { class: 'hint nomargin', text: '一次选两个文件会自动一左一右；选一个可以自己拖到左边或右边' })
      ]),
      poolBox,
      el('div', { class: 'mp-slots' }, [slotLeft, slotRight]),
      el('div', { class: 'mp-options' }, [
        el('label', { class: 'inline-check' }, [ignWs, '忽略行尾空白']),
        el('label', { class: 'inline-check' }, [ignCase, '忽略大小写']),
        el('span', { class: 'hint nomargin', text: '只放一侧也可以比较（另一侧按空文件处理）' })
      ])
    ]);

    // 拖到空白处 = 放回待分配
    body.addEventListener('dragover', function (e) { e.preventDefault(); });
    body.addEventListener('drop', async function (e) {
      e.preventDefault();
      e.stopPropagation();
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files.length) {
        addEntries((await importFiles(files)).map(entryOf), true);
        return;
      }
      var id = e.dataTransfer ? e.dataTransfer.getData('text/plain') : '';
      var entry = id ? findEntry(id) : null;
      if (entry) { unassign(entry); render(); }
    });

    /* ---- 渲染 ---- */
    function makeChip(entry, inSlot, side) {
      var chip = el('div', {
        class: 'mp-chip', draggable: 'true',
        title: inSlot ? entry.label : (entry.label + '（点一下放进空的一侧，或拖到左/右）')
      }, [
        el('span', { class: 'mp-chip-name', text: entry.label }),
        el('span', { class: 'mp-chip-kind', text: entry.doc.handle ? '文件' : '标签' })
      ]);
      if (inSlot) {
        chip.appendChild(el('button', {
          class: 'mp-x', type: 'button', title: '移出', text: '✕',
          onclick: function (e) { e.stopPropagation(); unassign(entry); render(); }
        }));
      }
      chip.addEventListener('dragstart', function (e) {
        e.dataTransfer.setData('text/plain', entry.id);
        e.dataTransfer.effectAllowed = 'move';
        chip.classList.add('dragging');
      });
      chip.addEventListener('dragend', function () { chip.classList.remove('dragging'); });
      if (!inSlot) {
        chip.addEventListener('click', function () {
          if (!slots.left) assign(entry, 'left');
          else if (!slots.right) assign(entry, 'right');
          else { SAK.msg('左右两侧都已经有文件了，请先点 ✕ 移出一个，或直接把文件拖到想放的一侧', 6000); return; }
          render();
        });
      }
      return chip;
    }

    function renderSlot(bodyEl, side) {
      bodyEl.innerHTML = '';
      var entry = slots[side];
      if (entry) bodyEl.appendChild(makeChip(entry, true, side));
      else bodyEl.appendChild(el('div', { class: 'mp-empty', text: '（空）' }));
    }

    function render() {
      chipsBox.innerHTML = '';
      if (!pool.length) {
        chipsBox.appendChild(el('div', { class: 'mp-empty', text: '还没有文件，点「选择文件…」或直接把文件拖进来' }));
      } else {
        pool.forEach(function (en) { chipsBox.appendChild(makeChip(en, false)); });
      }
      renderSlot(slotLeftBody, 'left');
      renderSlot(slotRightBody, 'right');
      startBtn.disabled = !slots.left && !slots.right;
      startBtn.textContent = (slots.left && slots.right) ? '开始比较'
        : (slots.left || slots.right) ? '开始比较（另一侧为空）' : '开始比较';
    }

    var startBtn = el('button', {
      class: 'btn primary', type: 'button', text: '开始比较',
      onclick: function () {
        merge.opts.ignoreTrailingSpace = ignWs.checked;
        merge.opts.ignoreCase = ignCase.checked;
        var dl = slots.left ? slots.left.doc : null;
        var dr = slots.right ? slots.right.doc : null;
        if (!dl && !dr) { SAK.error('请至少放入一个文件'); return; }
        api.close(null);
        startMerge(dl, dr);
      }
    });

    var api = SAK.modal({
      title: '文件比较 / 合并',
      body: body,
      width: '660px',
      sticky: true,
      buttons: [
        { label: '取消', onClick: function (m) { m.close(null); } },
        { el: startBtn }
      ]
    });

    // 已打开的标签先放进待分配区（不自动分配，交给用户决定）
    addEntries(docs.map(entryOf), false);
    render();
  }

  function setMergeMode(on) {
    merge.on = on;
    $('#toolbar').classList.toggle('hidden', on);
    $('#docbar').classList.toggle('hidden', on);
    $('#editor').classList.toggle('hidden', on);
    $('#merge').classList.toggle('hidden', !on);
  }

  function setPaneLanguage(cm, doc) {
    if (!doc) return;
    var lang = SAK.langById(doc.langId);
    var spec = lang.mime || 'null';
    cm.setOption('mode', spec);
    if (lang.mode) {
      try { CodeMirror.requireMode(lang.mode, function () { cm.setOption('mode', spec); }, { path: MODE_PATH }); }
      catch (e) { }
    }
  }

  function startMerge(docL, docR) {
    ensureMergeEditors();
    merge.docL = docL;
    merge.docR = docR;
    merge.idx = -1;
    clearMergeAnchor(false);        // 新的比较从 1:1 同步滚动开始

    merge.mLeft.setValue(docL ? docL.cmDoc.getValue() : '');
    merge.mRight.setValue(docR ? docR.cmDoc.getValue() : '');
    setPaneLanguage(merge.mLeft, docL);
    setPaneLanguage(merge.mRight, docR);

    $('#merge-title-left').textContent = docL ? docL.name : '（空）';
    $('#merge-title-right').textContent = docR ? docR.name : '（空）';

    buildMergeToolbar();
    setMergeMode(true);
    merge.focus = merge.mLeft;
    runDiff();
    merge.mLeft.refresh();
    merge.mRight.refresh();
    merge.mLeft.focus();
    updateStatus();
    SAK.msg('已进入比较视图：左侧「' + (docL ? docL.name : '空') + '」 ↔ 右侧「' + (docR ? docR.name : '空') + '」', 6000);
  }

  async function exitMerge(force) {
    if (!merge.on) return;
    if (!force && paneDirty()) {
      var ok = await SAK.confirm('退出比较',
        '比较视图里有还没保存回文档的改动，退出会丢弃它们。确定退出吗？', '丢弃并退出');
      if (!ok) return;
    }
    setMergeMode(false);
    clearDiffMarks();
    clearMergeAnchor(false);
    merge.hunks = [];
    merge.idx = -1;
    merge.focus = null;
    updateStatus();
    if (ed) { ed.refresh(); ed.focus(); }
    SAK.msg('已退出比较视图');
  }

  /* ---------- 差异标记 ---------- */
  function clearDiffMarks() {
    [merge.mLeft, merge.mRight].forEach(function (cm) {
      if (!cm) return;
      var n = cm.lineCount();
      for (var i = 0; i < n; i++) {
        cm.removeLineClass(i, 'background', 'cm-diff-del');
        cm.removeLineClass(i, 'background', 'cm-diff-ins');
        cm.removeLineClass(i, 'background', 'cm-diff-current');
      }
    });
    merge.wordMarks.forEach(function (m) { try { m.clear(); } catch (e) { } });
    merge.wordMarks = [];
    merge.widgets.forEach(function (w) { try { w.cm.removeLineWidget(w.widget); } catch (e) { } });
    merge.widgets = [];
  }

  function addLineClassRange(cm, from, to, cls) {
    for (var l = from; l < to; l++) {
      if (l >= 0 && l < cm.lineCount()) cm.addLineClass(l, 'background', cls);
    }
  }

  function markWord(cm, line, from, to, cls) {
    if (to <= from || line < 0 || line >= cm.lineCount()) return;
    var text = cm.getLine(line) || '';
    if (from >= text.length) return;
    to = Math.min(to, text.length);
    if (to <= from) return;
    try {
      merge.wordMarks.push(cm.markText({ line: line, ch: from }, { line: line, ch: to }, { className: cls }));
    } catch (e) { }
  }

  function markWordDiffs(h, L, R) {
    var nL = h.leftEnd - h.leftStart, nR = h.rightEnd - h.rightStart;
    var pairs = Math.min(nL, nR);
    for (var i = 0; i < pairs; i++) {
      var la = L[h.leftStart + i], lb = R[h.rightStart + i];
      if (la === undefined || lb === undefined || la === lb) continue;
      var segs = SAK.diff.words(la, lb, merge.opts);
      var chL = 0, chR = 0;
      for (var s = 0; s < segs.length; s++) {
        var seg = segs[s];
        if (seg.type === 'equal') { chL += seg.text.length; chR += seg.text.length; }
        else if (seg.type === 'del') { markWord(merge.mLeft, h.leftStart + i, chL, chL + seg.text.length, 'cm-diff-word-del'); chL += seg.text.length; }
        else { markWord(merge.mRight, h.rightStart + i, chR, chR + seg.text.length, 'cm-diff-word-ins'); chR += seg.text.length; }
      }
    }
  }

  function addPhantom(cm, atLine, count) {
    if (count <= 0) return;
    var h = cm.defaultTextHeight() || 18;
    var node = el('div', { class: 'cm-phantom-stack' });
    node.style.height = (count * h) + 'px';
    var lc = cm.lineCount();
    var widget;
    if (atLine < lc) widget = cm.addLineWidget(atLine, node, { above: true, coverGutter: false, noHScroll: true });
    else widget = cm.addLineWidget(lc - 1, node, { above: false, coverGutter: false, noHScroll: true });
    if (widget) merge.widgets.push({ cm: cm, widget: widget });
  }

  /** 手动对齐的配对：按左行号排序，丢掉重复 / 冲突（必须左右都递增） */
  function normalizedAnchors(L, R) {
    var list = merge.anchors.map(function (a) {
      return {
        left: Math.max(0, Math.min(a.left, L.length - 1)),
        right: Math.max(0, Math.min(a.right, R.length - 1))
      };
    }).sort(function (a, b) { return a.left - b.left || a.right - b.right; });
    var out = [], lastL = -1, lastR = -1;
    list.forEach(function (a) {
      if (a.left <= lastL || a.right <= lastR) return;
      out.push(a);
      lastL = a.left;
      lastR = a.right;
    });
    return out;
  }

  function padAbove(pads, side, line) {
    var n = 0;
    pads.forEach(function (p) { if (p.side === side && p.at <= line) n += p.count; });
    return n;
  }

  /**
   * 算出要补哪些占位块。
   * 没有手动对齐时按差异自动算；有手动对齐时，把配对的那些行当成「同一行」：
   * 相邻两对之间 / 最后一对以下，各自单独算差异占位，再在配对行上补一个
   * 「校正占位」把两者的行号差抹平。多对可以叠加，互不取消。
   * 差异结果（hunks / 颜色 / 逐词）始终不变。
   */
  function computePads(L, R, res) {
    var pads = [];
    var hunks = res.hunks;

    function pushHunks(list, offL, offR) {
      list.forEach(function (h) {
        var ls = h.leftStart + offL, le = h.leftEnd + offL;
        var rs = h.rightStart + offR, re = h.rightEnd + offR;
        var nL = le - ls, nR = re - rs;
        if (h.type === 'delete') pads.push({ side: 'right', at: rs, count: nL });
        else if (h.type === 'insert') pads.push({ side: 'left', at: ls, count: nR });
        else {
          if (nL > nR) pads.push({ side: 'right', at: re, count: nL - nR });
          else if (nR > nL) pads.push({ side: 'left', at: le, count: nR - nL });
        }
      });
    }

    var anchors = normalizedAnchors(L, R);
    if (!anchors.length) {
      pushHunks(hunks, 0, 0);
      return pads;
    }

    var prevL = -1, prevR = -1;
    for (var i = 0; i <= anchors.length; i++) {
      var nextL = i < anchors.length ? anchors[i].left : L.length;
      var nextR = i < anchors.length ? anchors[i].right : R.length;
      // 段内（不含两端的配对行）单独算差异占位
      var sL = prevL + 1, sR = prevR + 1;
      if (nextL > sL || nextR > sR) {
        var sub = SAK.diff.lines(L.slice(sL, nextL), R.slice(sR, nextR), merge.opts);
        pushHunks(sub.hunks, sL, sR);
      }
      if (i < anchors.length) {
        // 在配对行上把行号差抹平：谁在上面，就给谁上面垫占位
        var need = nextR - nextL;
        var have = padAbove(pads, 'left', nextL) - padAbove(pads, 'right', nextR);
        var fix = need - have;
        if (fix > 0) pads.push({ side: 'left', at: nextL, count: fix });
        else if (fix < 0) pads.push({ side: 'right', at: nextR, count: -fix });
        prevL = nextL;
        prevR = nextR;
      }
    }
    return pads;
  }

  function runDiff() {
    if (!merge.on) return;
    clearDiffMarks();
    var L = merge.mLeft.getValue().split('\n');
    var R = merge.mRight.getValue().split('\n');
    var res = SAK.diff.lines(L, R, merge.opts);
    merge.hunks = res.hunks;
    merge.stat = res;

    // 差异行底色 / 逐词标色：一直按全量差异来画，手动对齐不改变它们
    res.hunks.forEach(function (h) {
      var nL = h.leftEnd - h.leftStart, nR = h.rightEnd - h.rightStart;
      if (h.type === 'delete') {
        addLineClassRange(merge.mLeft, h.leftStart, h.leftEnd, 'cm-diff-del');
      } else if (h.type === 'insert') {
        addLineClassRange(merge.mRight, h.rightStart, h.rightEnd, 'cm-diff-ins');
      } else {
        addLineClassRange(merge.mLeft, h.leftStart, h.leftEnd, 'cm-diff-del');
        addLineClassRange(merge.mRight, h.rightStart, h.rightEnd, 'cm-diff-ins');
        markWordDiffs(h, L, R);
      }
    });

    // 占位块（含手动对齐带来的占位）
    computePads(L, R, res).forEach(function (p) {
      addPhantom(p.side === 'left' ? merge.mLeft : merge.mRight, p.at, p.count);
    });

    if (merge.idx >= res.hunks.length) merge.idx = res.hunks.length - 1;
    if (merge.idx < 0) merge.idx = res.hunks.length ? 0 : -1;
    highlightCurrent();
    paintMergeAnchors();
    updateMergeStatus();
    if (res.truncated) SAK.msg('文件差异过大，已按整块标记', 6000);
  }

  function highlightCurrent() {
    [merge.mLeft, merge.mRight].forEach(function (cm) {
      var n = cm.lineCount();
      for (var i = 0; i < n; i++) cm.removeLineClass(i, 'background', 'cm-diff-current');
    });
    var h = merge.hunks[merge.idx];
    if (!h) return;
    addLineClassRange(merge.mLeft, h.leftStart, h.leftEnd, 'cm-diff-current');
    addLineClassRange(merge.mRight, h.rightStart, h.rightEnd, 'cm-diff-current');
  }

  function gotoHunk(i) {
    if (!merge.on) { SAK.msg('当前不在比较视图，先用「比较」按钮选择两个文件'); return; }
    var n = merge.hunks.length;
    if (!n) { SAK.msg('两边内容完全一致，没有差异'); return; }
    merge.idx = ((i % n) + n) % n;
    highlightCurrent();
    var h = merge.hunks[merge.idx];
    merge.mLeft.setCursor({ line: Math.min(h.leftStart, merge.mLeft.lastLine()), ch: 0 });
    merge.mLeft.scrollIntoView({ line: Math.max(0, h.leftStart - 3), ch: 0 }, 80);
    syncScroll(merge.mLeft, merge.mRight);
    updateMergeStatus();
    SAK.msg('第 ' + (merge.idx + 1) + ' / ' + n + ' 处差异   （左侧第 ' + (h.leftStart + 1) +
      ' 行 ↔ 右侧第 ' + (h.rightStart + 1) + ' 行）', 5000);
  }

  /** 整行区间替换，处理好文档首尾的边界 */
  function replaceLineRange(cm, startLine, endLine, text) {
    var lc = cm.lineCount();
    var from, to, insert;
    if (startLine >= lc) {
      var last = cm.lastLine();
      from = to = { line: last, ch: cm.getLine(last).length };
      insert = (lc === 1 && cm.getLine(0) === '') ? text : ('\n' + text);
    } else if (endLine >= lc) {
      from = { line: startLine, ch: 0 };
      to = { line: cm.lastLine(), ch: cm.getLine(cm.lastLine()).length };
      insert = text;
    } else {
      from = { line: startLine, ch: 0 };
      to = { line: endLine, ch: 0 };
      insert = text.length ? text + '\n' : '';
    }
    cm.replaceRange(insert, from, to, '+merge');
  }

  function applyHunk(dir) {
    if (!merge.on) { SAK.msg('当前不在比较视图'); return; }
    var h = merge.hunks[merge.idx];
    if (!h) { SAK.msg('没有可应用的差异'); return; }
    var L = merge.mLeft.getValue().split('\n');
    var R = merge.mRight.getValue().split('\n');
    if (dir === 'toRight') {
      var text = L.slice(h.leftStart, h.leftEnd).join('\n');
      replaceLineRange(merge.mRight, h.rightStart, h.rightEnd, text);
      SAK.msg('已把左侧 ' + (h.leftEnd - h.leftStart) + ' 行应用到右侧');
    } else {
      var text2 = R.slice(h.rightStart, h.rightEnd).join('\n');
      replaceLineRange(merge.mLeft, h.leftStart, h.leftEnd, text2);
      SAK.msg('已把右侧 ' + (h.rightEnd - h.rightStart) + ' 行应用到左侧');
    }
    runDiff();
  }

  function updateMergeStatus() {
    if (!merge.on) return;
    var n = merge.hunks.length;
    $('#st-file').textContent = '比较：' + (merge.docL ? merge.docL.name : '空') + ' ↔ ' + (merge.docR ? merge.docR.name : '空');
    $('#st-stat').textContent = (merge.stat ? merge.stat.leftCount + ' 行 ↔ ' + merge.stat.rightCount + ' 行' : '') +
      (n ? '，' + n + ' 处差异' : '，无差异');
    var nAnchors = merge.anchors.length;
    $('#st-pos').textContent = (n ? ('第 ' + (merge.idx + 1) + ' / ' + n + ' 处差异') : '—') +
      (nAnchors ? ('　行对齐 ' + nAnchors + ' 对' + (nAnchors <= 3 ? '：' + merge.anchors.map(function (a) {
        return '左' + (a.left + 1) + '↔右' + (a.right + 1);
      }).join(' ') : '')) : '') +
      (merge.pending ? ('　待对齐：' + (merge.pending.side === 'left' ? '左' : '右') + (merge.pending.line + 1) + ' 行，点另一边') : '');
    $('#st-sel').textContent = paneDirty() ? '有未保存的合并改动' : '';
    var doc = focusedDoc();
    $('#st-enc').textContent = doc ? SAK.encodingLabel(doc.encoding) : '—';
    $('#st-nl').textContent = doc ? doc.newline : '—';
    $('#st-mode').textContent = doc ? langLabel(doc) : '—';
    if (merge.ui) {
      merge.ui.count.textContent = n ? ((merge.idx + 1) + ' / ' + n) : '0 / 0';
      merge.ui.prev.disabled = merge.ui.next.disabled = !n;
      merge.ui.toRight.disabled = merge.ui.toLeft.disabled = !n;
      if (merge.ui.anchorClear) merge.ui.anchorClear.disabled = !(merge.anchors.length || merge.pending);
    }
  }

  function buildMergeToolbar() {
    var bar = $('#merge-toolbar');
    if (bar.dataset.built === '1') {
      // 已经建过：只同步选项勾选状态
      if (merge.ui) {
        merge.ui.ignWs.checked = merge.opts.ignoreTrailingSpace;
        merge.ui.ignCase.checked = merge.opts.ignoreCase;
      }
      return;
    }
    bar.dataset.built = '1';
    function btn(label, title, handler) {
      return el('button', { class: 'tbtn', title: title, onclick: handler }, label);
    }
    var prev = btn('◀ 上一处', '跳到上一处差异 (Shift+F7)', function () { gotoHunk(merge.idx - 1); });
    var next = btn('下一处 ▶', '跳到下一处差异 (F7)', function () { gotoHunk(merge.idx + 1); });
    var count = el('span', { class: 'merge-count', text: '0 / 0' });
    var toRight = btn('→ 用左侧覆盖右侧', '把当前差异处的左边内容应用到右边 (Ctrl+Alt+→)', function () { applyHunk('toRight'); });
    var toLeft = btn('← 用右侧覆盖左侧', '把当前差异处的右边内容应用到左边 (Ctrl+Alt+←)', function () { applyHunk('toLeft'); });
    var anchorBtn = btn('⤓ 对齐起点', '把光标行按 F2（或 F12）标为对齐起点，再点另一边的对应行：这两行会排到同一行上（用占位块补齐，差异结果不变）', function () { markMergeAnchor(); });
    var anchorClear = btn('清除对齐', '取消手动行对齐，占位块恢复按差异自动计算', function () { clearMergeAnchor(true); });

    var ignWs = el('input', { type: 'checkbox' });
    ignWs.checked = merge.opts.ignoreTrailingSpace;
    ignWs.addEventListener('change', function () {
      merge.opts.ignoreTrailingSpace = ignWs.checked;
      runDiff();
      SAK.msg('忽略行尾空白：' + (ignWs.checked ? '开' : '关'));
    });
    var ignCase = el('input', { type: 'checkbox' });
    ignCase.checked = merge.opts.ignoreCase;
    ignCase.addEventListener('change', function () {
      merge.opts.ignoreCase = ignCase.checked;
      runDiff();
      SAK.msg('忽略大小写：' + (ignCase.checked ? '开' : '关'));
    });

    [
      btn('重新比较', '重新计算两边的差异', runDiff),
      el('span', { class: 'tsep' }),
      prev, count, next,
      el('span', { class: 'tsep' }),
      toRight, toLeft,
      el('span', { class: 'tsep' }),
      anchorBtn, anchorClear,
      el('span', { class: 'tsep' }),
      btn('保存左侧', '把左侧内容写回它对应的文档并保存', function () { merge.focus = merge.mLeft; saveFocused(false); }),
      btn('保存右侧', '把右侧内容写回它对应的文档并保存', function () { merge.focus = merge.mRight; saveFocused(false); }),
      el('span', { class: 'tsep' }),
      el('label', { class: 'chk-inline' }, [ignWs, '忽略行尾空白']),
      el('label', { class: 'chk-inline' }, [ignCase, '忽略大小写']),
      el('span', { class: 'tsep' }),
      btn('退出比较', '返回普通编辑视图', function () { exitMerge(); })
    ].forEach(function (n) { bar.appendChild(n); });

    merge.ui = {
      prev: prev, next: next, count: count, toRight: toRight, toLeft: toLeft,
      anchorClear: anchorClear, ignWs: ignWs, ignCase: ignCase
    };
  }

  /* ================================================================== *
   * 格式化对话框（Ctrl+Alt+F）
   * ================================================================== */
  /** 内容是不是一份完整的 JSON（用于语言没识别出来时的兜底） */
  function looksLikeJson(text) {
    var t = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!/^[{[]/.test(t)) return false;
    try { JSON.parse(t); return true; } catch (e) { return false; }
  }

  function openFormatDialog() {
    var cm = focusedEditor();
    var doc = focusedDoc();
    if (!cm || !doc) return;
    var sel = cm.getSelection();
    var hasSel = sel.length > 0;
    var startLang = doc.langId;
    // 语言还停在「纯文本」时，打开对话框就地再猜一次：粘贴、打字、打开文件都可能
    // 没走到自动识别，一旦按纯文本格式化就会退化成「只重排缩进」，看起来像没格式化。
    // 用户自己手动选过「纯文本」的话就不插手。
    if (startLang === 'plaintext' && doc.langSource !== 'manual') {
      var guess = SAK.detectLanguage(cm.getValue());
      if (guess && guess.id && guess.id !== 'plaintext') startLang = guess.id;
      else if (looksLikeJson(cm.getValue())) startLang = 'json';
    }

    var select = el('select', { class: 'grow' });
    SAK.LANGS.forEach(function (l) {
      select.appendChild(el('option', { value: l.id, text: l.label }));
    });
    select.value = startLang;

    var planInfo = el('div', { class: 'plan-info' });
    var scopeAll = el('input', { type: 'radio', name: 'fmt-scope', value: 'all' });
    var scopeSel = el('input', { type: 'radio', name: 'fmt-scope', value: 'sel' });
    scopeAll.checked = !hasSel;
    scopeSel.checked = hasSel;
    scopeSel.disabled = !hasSel;

    var tabSize = el('input', { type: 'number', min: '1', max: '12', value: String(SAK.settings.tabSize), style: { width: '64px' } });
    var useTabs = el('input', { type: 'checkbox' });
    useTabs.checked = !SAK.settings.insertSpaces;

    function refreshPlan() {
      var plan = SAK.formatPlan(select.value);
      var lang = SAK.langById(select.value);
      planInfo.innerHTML = '将使用：<b>' + SAK.escapeHtml(plan.label) + '</b>'
        + '<div class="dim">' + planNote(select.value, lang) + '</div>';
    }
    select.addEventListener('change', refreshPlan);

    var body = el('div', { style: { width: '470px' } }, [
      el('div', { class: 'field' }, [el('label', { text: '代码语言' }), select]),
      el('div', { class: 'field' }, [el('label', { text: '格式化范围' }),
        el('div', { class: 'grow inline-radio' }, [
          el('label', {}, [scopeAll, '整个文档']),
          el('label', {}, [scopeSel, hasSel ? '当前选区' : '当前选区（无选区）'])
        ])
      ]),
      el('div', { class: 'field' }, [el('label', { text: '缩进宽度' }), tabSize,
        el('label', { class: 'inline-check' }, [useTabs, '使用 Tab 缩进'])]),
      el('div', { class: 'field' }, [el('label', { text: '' }), planInfo])
    ]);

    refreshPlan();

    SAK.modal({
      title: '格式化代码  (Ctrl+Alt+F)',
      body: body,
      width: '520px',
      buttons: [
        { label: '取消', onClick: function (m) { m.close(null); } },
        {
          label: '格式化', primary: true, onClick: function (m) {
            var langId = select.value;
            var useSelection = scopeSel.checked && hasSel;
            var opts = {
              tabSize: parseInt(tabSize.value, 10) || 4,
              useTabs: useTabs.checked,
              printWidth: SAK.settings.printWidth
            };
            m.close(null);
            runFormat(langId, useSelection, opts, cm, doc);
          }
        }
      ]
    });
  }

  function planNote(langId, lang) {
    var plan = SAK.formatPlan(langId);
    if (plan.kind === 'prettier') {
      if (langId === 'json') {
        return '使用 Prettier 格式化 JSON：对象/数组按层级换行缩进，数字、转义字符等字面量原样保留。';
      }
      return '使用 Prettier 精确格式化，缩进/换行/空格都会重排。';
    }
    if (plan.kind === 'sql') return '使用 sql-formatter 美化 SQL 语句，关键字转为大写。';
    if (plan.kind === 'beautifyHtml') return '使用 js-beautify 美化标签层级。';
    if (plan.kind === 'braces') return '内置结构重排：先把挤在一行的语句按 ; { } 摊成一句一行，再按层级缩进，并规范运算符、逗号、大括号周围的空格；泛型 < >、字符串、注释不会被拆坏。不改变代码语义。';
    if (plan.kind === 'python') return '内置 Python 格式化：按原有层级规范化缩进，并给赋值号、运算符、逗号、字典冒号补上空格；一行写不完的字典/列表/调用会按最外层括号摊成一项一行；三引号字符串和注释原样保留。';
    return '内置缩进规范化：保持内容不变，只把每一层缩进统一为设定宽度。';
  }

  async function runFormat(langId, useSelection, opts, cm, doc) {
    cm = cm || focusedEditor();
    doc = doc || focusedDoc();
    if (!cm) return;
    var lang = SAK.langById(langId);
    var text = useSelection ? cm.getSelection() : cm.getValue();
    if (!text.trim()) { SAK.msg('没有可格式化的内容'); return; }
    SAK.msg('正在用 ' + SAK.formatPlan(langId).label + ' 格式化…', 60000);
    var t0 = Date.now();
    try {
      var result = await SAK.formatText(text, langId, opts);
      if (result === text) {
        SAK.msg('格式化完成，内容无需改动');
        return;
      }
      cm.operation(function () {
        if (useSelection) {
          cm.replaceSelection(result, 'around', '+format');
        } else {
          var last = cm.lastLine();
          cm.replaceRange(result, { line: cm.firstLine(), ch: 0 }, { line: last, ch: cm.getLine(last).length }, '+format');
        }
      });
      // 格式化的语言与当前不一致时，同步语法高亮
      if (doc && langId !== doc.langId) {
        doc.langSource = 'manual';
        doc.langId = langId;
        if (merge.on) setPaneLanguage(cm, doc);
        else setDocLanguage(doc, langId);
      }
      updateStatus();
      SAK.msg('格式化完成（' + lang.label + '，用时 ' + (Date.now() - t0) + ' ms），可按 Ctrl+Z 撤销', 6000);
    } catch (e) {
      SAK.error('格式化失败：' + (e && e.message ? e.message.split('\n')[0] : e));
    }
  }

  /* ================================================================== *
   * 使用说明（快捷键列表由命令注册表实时生成）
   * ================================================================== */
  function showHelp() {
    var groups = {}, order = [];
    COMMANDS.forEach(function (c) {
      if (!groups[c.group]) { groups[c.group] = []; order.push(c.group); }
      groups[c.group].push(c);
    });

    var table = el('table', { class: 'keys' });
    order.forEach(function (g) {
      table.appendChild(el('tr', {}, [el('th', { colspan: '2', text: g })]));
      groups[g].forEach(function (c) {
        var k = currentKey(c);
        table.appendChild(el('tr', {}, [
          el('td', { class: 'kcol' }, k ? el('kbd', { text: prettyKey(k) }) : el('span', { class: 'dim', text: '未设置' })),
          el('td', { text: c.label })
        ]));
      });
    });

    var fixed = el('table', { class: 'keys' });
    [
      ['Ctrl+C / Ctrl+X / Ctrl+V', '复制 / 剪切 / 粘贴（浏览器系统保留，不可修改）'],
      ['粘贴文件', '把资源管理器里复制的文件粘进来 → 变成可点击的路径'],
      ['拖入单个文件', '直接开成新标签页（拖两个以上才变成可点击的路径）'],
      ['鼠标点击路径', '打开该文件内容（新标签页）']
    ].forEach(function (r) {
      fixed.appendChild(el('tr', {}, [
        el('td', { class: 'kcol' }, el('kbd', { text: r[0] })),
        el('td', { text: r[1] })
      ]));
    });

    SAK.modal({
      title: '使用说明',
      body: el('div', { style: { width: '600px' } }, [
        table,
        el('div', { class: 'hint nomargin', style: { marginTop: '14px' } },
          '复制 / 粘贴 / 剪切由浏览器接管，无法改键；其余功能都可以在「快捷键设置」里改成自己喜欢的按键。'),
        fixed
      ]),
      buttons: [
        { label: '快捷键设置', onClick: function (m) { m.close(null); openKeymapDialog(); } },
        { label: '知道了', primary: true, onClick: function (m) { m.close(null); } }
      ]
    });
  }

  /* ================================================================== *
   * 快捷键设置对话框
   * ================================================================== */
  function openKeymapDialog() {
    var capturing = null;
    var refreshers = [];

    var table = el('table', { class: 'keys keymap-table' });
    table.appendChild(el('tr', {}, [
      el('th', { text: '功能' }),
      el('th', { text: '快捷键' }),
      el('th', { text: '' })
    ]));

    COMMANDS.forEach(function (cmd) {
      var keyBtn = el('button', { type: 'button', class: 'keycap' });
      var resetBtn = el('button', { type: 'button', class: 'linkbtn', text: '恢复默认' });
      var hint = el('span', { class: 'km-hint' });

      function refresh() {
        var k = currentKey(cmd);
        keyBtn.textContent = k ? prettyKey(k) : '（未设置）';
        keyBtn.classList.toggle('unset', !k);
        keyBtn.classList.toggle('custom', k !== cmd.key);
        resetBtn.style.visibility = (k === cmd.key) ? 'hidden' : 'visible';
      }
      refreshers.push(function () { refresh(); hint.textContent = ''; });

      keyBtn.addEventListener('click', function () {
        if (capturing) capturing.cancel();
        startCapture(cmd, keyBtn, hint);
      });
      resetBtn.addEventListener('click', function () {
        setOverride(cmd.id, cmd.key);
        refreshAll();
      });

      table.appendChild(el('tr', {}, [
        el('td', {}, [
          el('span', { text: cmd.label }),
          el('span', { class: 'km-group', text: cmd.group })
        ]),
        el('td', { class: 'kcol' }, [keyBtn, hint]),
        el('td', { class: 'kact' }, resetBtn)
      ]));
      refresh();
    });

    function refreshAll() { refreshers.forEach(function (f) { f(); }); }

    function startCapture(cmd, btn, hint) {
      var prevText = btn.textContent;
      btn.textContent = '请按下新的快捷键…';
      btn.classList.add('capturing');
      hint.textContent = '';
      var finished = false;

      function finish() {
        if (finished) return;
        finished = true;
        window.removeEventListener('keydown', onKey, true);
        btn.classList.remove('capturing');
        btn.textContent = currentKey(cmd) ? prettyKey(currentKey(cmd)) : '（未设置）';
        capturing = null;
      }

      function onKey(e) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { finish(); hint.textContent = '已取消'; return; }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          setOverride(cmd.id, '');
          finish(); refreshAll();
          hint.textContent = '已清空该快捷键';
          return;
        }
        var name = eventToKeyName(e);
        if (!name) return;                     // 只按了修饰键，继续等待
        if (!isValidShortcut(name)) {
          hint.textContent = '⚠ 需要配合 Ctrl / Alt 使用（功能键除外）';
          return;
        }
        var conflict = commandForKey(name);
        if (conflict && conflict.id !== cmd.id) {
          hint.textContent = '⚠ 已被「' + conflict.label + '」占用';
          return;
        }
        setOverride(cmd.id, name);
        finish(); refreshAll();
        hint.textContent = '✔ 已设置为 ' + prettyKey(name);
      }

      capturing = { cancel: function () { finish(); } };
      window.addEventListener('keydown', onKey, true);
    }

    SAK.modal({
      title: '快捷键设置',
      width: '680px',
      body: el('div', {}, [
        el('div', { class: 'hint nomargin', style: { marginBottom: '10px' } },
          '点一下右边的按键按钮，然后直接按下你想要的组合键。Esc 取消，Backspace 清空该快捷键。设置会自动保存。'),
        table,
        el('div', { class: 'hint nomargin', style: { marginTop: '10px' } },
          '说明：复制 / 剪切 / 粘贴由浏览器接管，不在此列表中；清空某个快捷键后，编辑器内置的默认键（如 Ctrl+Z 撤销）可能仍会生效。')
      ]),
      sticky: true,
      buttons: [
        {
          label: '全部恢复默认', onClick: function (m) {
            clearAllOverrides();
            refreshAll();
            SAK.msg('已恢复全部默认快捷键');
          }
        },
        { label: '关闭', primary: true, onClick: function (m) { m.close(null); } }
      ],
      onClose: function () { if (capturing) capturing.cancel(); }
    });
  }

  /* ================================================================== *
   * 视图开关
   * ================================================================== */
  function toggleWordWrap() {
    SAK.settings.wordWrap = !SAK.settings.wordWrap;
    SAK.saveSettings();
    if (ed) ed.setOption('lineWrapping', SAK.settings.wordWrap);
    SAK.msg('自动换行：' + (SAK.settings.wordWrap ? '开' : '关'));
  }

  function toggleTheme() {
    SAK.settings.theme = SAK.settings.theme === 'dark' ? 'light' : 'dark';
    applyTheme();
    SAK.saveSettings();
    SAK.msg('主题：' + (SAK.settings.theme === 'dark' ? '暗色' : '明亮'));
  }

  /* ================================================================== *
   * 工具栏
   * ================================================================== */
  function buildToolbar() {
    var bar = $('#toolbar');
    function btn(label, title, handler) {
      return el('button', { class: 'tbtn', title: title, onclick: handler }, label);
    }
    function sep() { return el('span', { class: 'tsep' }); }

    bar.appendChild(btn('新建', '新建 (Ctrl+N)', newDoc));
    bar.appendChild(btn('打开', '打开文件 (Ctrl+O)', openFiles));
    bar.appendChild(btn('保存', '保存 (Ctrl+S)', function () { saveDoc(activeDoc, false); }));
    bar.appendChild(btn('另存为', '另存为 (Ctrl+Shift+S)', function () { saveDoc(activeDoc, true); }));
    bar.appendChild(sep());

    var langSel = el('select', { id: 'lang-select', title: '语法高亮语言' });
    SAK.LANGS.forEach(function (l) { langSel.appendChild(el('option', { value: l.id, text: l.label })); });
    langSel.addEventListener('change', function () {
      if (!activeDoc) return;
      if (langSel.value === '__auto__') return;
      activeDoc.langSource = 'manual';
      setDocLanguage(activeDoc, langSel.value);
      SAK.msg('语法高亮：' + SAK.langById(langSel.value).label);
    });
    bar.appendChild(el('span', { class: 'tb-label', text: '语法' }));
    bar.appendChild(langSel);
    bar.appendChild(btn('识别', '根据内容自动识别代码语言', detectNow));
    bar.appendChild(sep());

    bar.appendChild(btn('格式化', '格式化代码 (Ctrl+Alt+F)', openFormatDialog));
    bar.appendChild(btn('排序↑', '按行升序 (Ctrl+Alt+A)', function () { sortLines('asc'); }));
    bar.appendChild(btn('排序↓', '按行降序 (Ctrl+Alt+D)', function () { sortLines('desc'); }));
    bar.appendChild(btn('去重', '删除重复行 (Alt+M)', function () { dedupeLines(); }));
    bar.appendChild(btn('大写', '选中的小写字母转大写 (Alt+Q)', function () { convertCase('upper'); }));
    bar.appendChild(btn('小写', '选中的大写字母转小写 (Alt+E / Shift+Alt+E)', function () { convertCase('lower'); }));
    bar.appendChild(btn('替换', '批量文字替换 (Alt+R)', function () { openReplaceDialog(); }));
    bar.appendChild(btn('翻译', '选中文字英汉互译，需要联网 (Ctrl+Shift+空格)', function () { translateSelection(); }));
    bar.appendChild(btn('标点', '中英标点 / 全角半角转换，离线可用', function () { openPunctDialog(); }));
    bar.appendChild(sep());

    bar.appendChild(btn('比较', '选择两个文件做双栏比较 / 合并 (Ctrl+Alt+M)', openMergeDialog));
    bar.appendChild(sep());

    var nlSel = el('select', { id: 'nl-select', title: '换行符' });
    SAK.NEWLINES.forEach(function (n) { nlSel.appendChild(el('option', { value: n.id, text: n.label })); });
    nlSel.addEventListener('change', function () {
      if (!activeDoc) return;
      activeDoc.newline = nlSel.value;
      activeDoc.metaDirty = true;
      renderTabs();
      updateStatus();
      SAK.msg('换行符改为 ' + nlSel.value + '，保存后生效');
    });
    bar.appendChild(nlSel);

    var encSel = el('select', { id: 'enc-select', title: '文字编码（切换会按新编码重新读取原文件）' });
    SAK.ENCODINGS.forEach(function (n) { encSel.appendChild(el('option', { value: n.id, text: n.label })); });
    encSel.addEventListener('change', function () { changeEncoding(encSel.value); });
    bar.appendChild(encSel);
    bar.appendChild(sep());

    bar.appendChild(btn('主题', '切换明亮 / 暗色主题', toggleTheme));
    bar.appendChild(btn('快捷键', '自定义快捷键', openKeymapDialog));
    bar.appendChild(btn('帮助', '快捷键说明 (F1)', showHelp));
  }

  async function changeEncoding(encId) {
    var doc = activeDoc;
    if (!doc) return;
    if (doc.bytes && doc.isDirty()) {
      var ok = await SAK.confirm('重新读取文件',
        '文档已修改。按「' + SAK.encodingLabel(encId) + '」重新读取会丢弃未保存的修改，继续吗？', '重新读取');
      if (!ok) { updateStatus(); return; }
    }
    if (doc.bytes) {
      var text = SAK.encoding.decode(doc.bytes, encId);
      doc.encoding = encId;
      doc.newline = SAK.detectNewline(text);
      doc.cmDoc.setValue(SAK.normalizeNewline(text));
      doc.cmDoc.markClean();
      doc.metaDirty = false;
      doc.charCount = -1;
      if (doc.langSource !== 'manual') {
        var r = SAK.detectLanguage(doc.cmDoc.getValue());
        if (r.id !== 'plaintext') setDocLanguage(doc, r.id);
      }
      SAK.msg('已按 ' + SAK.encodingLabel(encId) + ' 重新读取');
    } else {
      doc.encoding = encId;
      doc.metaDirty = true;
      SAK.msg('保存时将使用 ' + SAK.encodingLabel(encId));
    }
    renderTabs();
    updateStatus();
  }

  function applyTheme() {
    document.body.setAttribute('data-theme', SAK.settings.theme === 'dark' ? 'dark' : 'light');
  }

  /* ================================================================== *
   * 启动
   * ================================================================== */
  function init() {
    window.addEventListener('error', function (e) {
      SAK.error('脚本错误：' + (e.message || e.type) + (e.filename ? ' @' + e.filename.split('/').pop() + ':' + e.lineno : ''));
    });
    window.addEventListener('unhandledrejection', function (e) {
      SAK.error('未处理的异常：' + ((e.reason && e.reason.message) || e.reason));
    });

    SAK.registerExtraMimes();
    applyTheme();
    initEditor();
    buildToolbar();
    newDoc();

    // 拦住浏览器默认的「把拖进来的文件当页面打开」行为
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    window.addEventListener('drop', function (e) { e.preventDefault(); });

    window.addEventListener('beforeunload', function (e) {
      var dirty = docs.some(function (d) { return d.isDirty(); });
      if (merge.on && paneDirty()) dirty = true;
      if (dirty) { e.preventDefault(); e.returnValue = ''; return ''; }
    });

    // 全局快捷键分发：焦点不在编辑器上时（工具栏、状态栏等）也能用同一套快捷键
    // 编辑器内部由 CodeMirror 的 extraKeys 处理，这里直接跳过，避免触发两次
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented) return;
      if (isEditorInput(e.target)) return;
      var name = eventToKeyName(e);
      if (!name) return;
      var cmd = commandForKey(name);
      if (!cmd) return;
      // 在输入框 / 下拉框里打字时，只放行带 Ctrl-Alt / Alt 或功能键的组合
      if (isTypingTarget(e.target) && !/^(Ctrl-Alt-|Alt-|F[0-9])/.test(name)) return;
      e.preventDefault();
      runCommand(cmd.id, ed);
    });

    SAK.msg('就绪：粘贴代码会自动识别语言并上色；快捷键可在工具栏「快捷键」里自定义', 8000);
  }

  SAK.App = {
    docs: docs,
    commands: COMMANDS,
    get active() { return activeDoc; },
    get editor() { return ed; },
    newDoc: newDoc, openFiles: openFiles, saveDoc: saveDoc,
    sortLines: sortLines, dedupeLines: dedupeLines,
    convertCase: convertCase, translateSelection: translateSelection,
    openReplaceDialog: openReplaceDialog, openPunctDialog: openPunctDialog,
    openFormatDialog: openFormatDialog, openKeymapDialog: openKeymapDialog, openHelp: showHelp,
    openMergeDialog: openMergeDialog, startMerge: startMerge, exitMerge: exitMerge,
    runDiff: runDiff, gotoHunk: gotoHunk, applyHunk: applyHunk,
    currentKeyOf: function (id) { var c = commandById(id); return c ? currentKey(c) : null; },
    runCommand: runCommand, applyKeymap: applyKeymap
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window.SAK);
