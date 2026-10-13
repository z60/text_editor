/* ===== 语言表 + 代码语言自动识别 ===== */
(function (SAK) {
  'use strict';

  // mime: 传给 CodeMirror 的模式标识；mode: 需要懒加载的模式文件（mode/<mode>/<mode>.js）
  var LANGS = [
    { id: 'plaintext', label: '纯文本', mime: null, mode: null, ext: ['txt', 'log', 'text', 'csv', 'tsv'] },

    { id: 'javascript', label: 'JavaScript', mime: 'text/javascript', mode: 'javascript', ext: ['js', 'mjs', 'cjs'] },
    { id: 'jsx', label: 'JSX', mime: 'text/x-jsx', mode: 'javascript', ext: ['jsx'] },
    { id: 'typescript', label: 'TypeScript', mime: 'text/typescript', mode: 'javascript', ext: ['ts', 'mts', 'cts'] },
    { id: 'tsx', label: 'TSX', mime: 'text/x-tsx', mode: 'javascript', ext: ['tsx'] },
    { id: 'json', label: 'JSON', mime: 'application/json', mode: 'javascript', ext: ['json', 'jsonc', 'webmanifest'] },

    { id: 'html', label: 'HTML', mime: 'text/html', mode: 'htmlmixed', ext: ['html', 'htm', 'xhtml'] },
    { id: 'vue', label: 'Vue', mime: 'text/x-vue', mode: 'vue', ext: ['vue'] },
    { id: 'xml', label: 'XML', mime: 'text/xml', mode: 'xml', ext: ['xml', 'xsd', 'xsl', 'xslt', 'svg', 'plist', 'pom'] },
    { id: 'css', label: 'CSS', mime: 'text/css', mode: 'css', ext: ['css'] },
    { id: 'scss', label: 'SCSS', mime: 'text/x-scss', mode: 'css', ext: ['scss'] },
    { id: 'less', label: 'Less', mime: 'text/x-less', mode: 'css', ext: ['less'] },
    { id: 'sass', label: 'Sass', mime: 'text/x-sass', mode: 'sass', ext: ['sass'] },
    { id: 'stylus', label: 'Stylus', mime: 'text/x-styl', mode: 'stylus', ext: ['styl'] },

    { id: 'markdown', label: 'Markdown', mime: 'text/x-markdown', mode: 'markdown', ext: ['md', 'markdown', 'mdown'] },
    { id: 'yaml', label: 'YAML', mime: 'text/x-yaml', mode: 'yaml', ext: ['yml', 'yaml'] },
    { id: 'toml', label: 'TOML', mime: 'text/x-toml', mode: 'toml', ext: ['toml'] },
    { id: 'ini', label: 'INI / Properties', mime: 'text/x-properties', mode: 'properties', ext: ['ini', 'properties', 'conf', 'cfg', 'env'] },
    { id: 'diff', label: 'Diff / Patch', mime: 'text/x-diff', mode: 'diff', ext: ['diff', 'patch'] },
    { id: 'dockerfile', label: 'Dockerfile', mime: 'text/x-dockerfile', mode: 'dockerfile', ext: [], files: ['dockerfile', 'containerfile'] },
    { id: 'nginx', label: 'Nginx 配置', mime: 'text/x-nginx-conf', mode: 'nginx', ext: [], files: ['nginx.conf'] },

    { id: 'sql', label: 'SQL', mime: 'text/x-sql', mode: 'sql', ext: ['sql', 'ddl', 'dml'] },
    { id: 'java', label: 'Java', mime: 'text/x-java', mode: 'clike', ext: ['java'] },
    { id: 'python', label: 'Python', mime: 'text/x-python', mode: 'python', ext: ['py', 'pyw', 'pyi'] },
    { id: 'c', label: 'C', mime: 'text/x-csrc', mode: 'clike', ext: ['c', 'h'] },
    { id: 'cpp', label: 'C++', mime: 'text/x-c++src', mode: 'clike', ext: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'] },
    { id: 'csharp', label: 'C#', mime: 'text/x-csharp', mode: 'clike', ext: ['cs'] },
    { id: 'kotlin', label: 'Kotlin', mime: 'text/x-kotlin', mode: 'clike', ext: ['kt', 'kts'] },
    { id: 'scala', label: 'Scala', mime: 'text/x-scala', mode: 'clike', ext: ['scala', 'sc'] },
    { id: 'objectivec', label: 'Objective-C', mime: 'text/x-objectivec', mode: 'clike', ext: ['m', 'mm'] },
    { id: 'go', label: 'Go', mime: 'text/x-go', mode: 'go', ext: ['go'] },
    { id: 'rust', label: 'Rust', mime: 'text/x-rustsrc', mode: 'rust', ext: ['rs'] },
    { id: 'swift', label: 'Swift', mime: 'text/x-swift', mode: 'swift', ext: ['swift'] },
    { id: 'dart', label: 'Dart', mime: 'application/dart', mode: 'dart', ext: ['dart'] },
    { id: 'groovy', label: 'Groovy', mime: 'text/x-groovy', mode: 'groovy', ext: ['groovy', 'gvy', 'gradle'] },
    { id: 'julia', label: 'Julia', mime: 'text/x-julia', mode: 'julia', ext: ['jl'] },
    { id: 'haskell', label: 'Haskell', mime: 'text/x-haskell', mode: 'haskell', ext: ['hs'] },
    { id: 'elm', label: 'Elm', mime: 'text/x-elm', mode: 'elm', ext: ['elm'] },
    { id: 'crystal', label: 'Crystal', mime: 'text/x-crystal', mode: 'crystal', ext: ['cr'] },
    { id: 'php', label: 'PHP', mime: 'application/x-httpd-php', mode: 'php', ext: ['php', 'phtml'] },
    { id: 'ruby', label: 'Ruby', mime: 'text/x-ruby', mode: 'ruby', ext: ['rb', 'rake', 'gemspec'] },
    { id: 'perl', label: 'Perl', mime: 'text/x-perl', mode: 'perl', ext: ['pl', 'pm'] },
    { id: 'lua', label: 'Lua', mime: 'text/x-lua', mode: 'lua', ext: ['lua'] },
    { id: 'r', label: 'R', mime: 'text/x-rsrc', mode: 'r', ext: ['r'] },
    { id: 'shell', label: 'Shell', mime: 'text/x-sh', mode: 'shell', ext: ['sh', 'bash', 'zsh', 'ksh'] },
    { id: 'powershell', label: 'PowerShell', mime: 'application/x-powershell', mode: 'powershell', ext: ['ps1', 'psm1', 'psd1'] },
    { id: 'batch', label: '批处理', mime: 'text/x-sh', mode: 'shell', ext: ['bat', 'cmd'] },
    { id: 'pascal', label: 'Pascal', mime: 'text/x-pascal', mode: 'pascal', ext: ['pas', 'dpr'] },
    { id: 'vb', label: 'Visual Basic', mime: 'text/x-vb', mode: 'vb', ext: ['vb', 'vbs'] },
    { id: 'coffeescript', label: 'CoffeeScript', mime: 'text/x-coffeescript', mode: 'coffeescript', ext: ['coffee'] },
    { id: 'pug', label: 'Pug', mime: 'text/x-pug', mode: 'pug', ext: ['pug', 'jade'] },
    { id: 'tcl', label: 'Tcl', mime: 'text/x-tcl', mode: 'tcl', ext: ['tcl'] },
    { id: 'verilog', label: 'Verilog', mime: 'text/x-verilog', mode: 'verilog', ext: ['v', 'sv'] },
    { id: 'vhdl', label: 'VHDL', mime: 'text/x-vhdl', mode: 'vhdl', ext: ['vhd', 'vhdl'] },
    { id: 'fortran', label: 'Fortran', mime: 'text/x-fortran', mode: 'fortran', ext: ['f', 'f90', 'f95'] }
  ];

  var BY_ID = {}, BY_EXT = {}, BY_FILE = {};
  LANGS.forEach(function (l) {
    BY_ID[l.id] = l;
    (l.ext || []).forEach(function (e) { if (!BY_EXT[e]) BY_EXT[e] = l; });
    (l.files || []).forEach(function (f) { BY_FILE[f] = l; });
  });

  SAK.LANGS = LANGS;
  SAK.langById = function (id) { return BY_ID[id] || BY_ID.plaintext; };
  SAK.langByFileName = function (name) {
    if (!name) return null;
    var base = String(name).replace(/^.*[\\/]/, '').toLowerCase();
    if (BY_FILE[base]) return BY_FILE[base];
    var m = /\.([^.]+)$/.exec(base);
    if (m && BY_EXT[m[1]]) return BY_EXT[m[1]];
    // Makefile / CMakeLists 之类
    if (base === 'makefile' || base === 'gnumakefile') return BY_ID.plaintext;
    return null;
  };

  /* ---------- 自定义 MIME（CodeMirror 未内置的 JSX/TSX） ---------- */
  SAK.registerExtraMimes = function () {
    if (typeof CodeMirror === 'undefined') return;
    try {
      CodeMirror.defineMIME('text/x-jsx', { name: 'javascript', jsx: true });
      CodeMirror.defineMIME('text/x-tsx', { name: 'javascript', typescript: true, jsx: true });
    } catch (e) { /* 重复定义忽略 */ }
  };

  /* ---------- 内容识别 ---------- */
  function count(text, re) { var m = text.match(re); return m ? m.length : 0; }

  // 每条规则返回分数，取最高分；低于阈值判为纯文本
  var RULES = [
    {
      id: 'json', score: function (t) {
        if (!/^\s*[{[]/.test(t)) return 0;
        try { JSON.parse(t); return 260; } catch (e) { return 30; }
      }
    },
    {
      id: 'html', score: function (t) {
        var s = 0;
        if (/<!doctype\s+html/i.test(t)) s += 90;
        if (/<html[\s>]/i.test(t)) s += 70;
        if (/<head[\s>]/i.test(t)) s += 25;
        if (/<body[\s>]/i.test(t)) s += 25;
        if (/<meta\s/i.test(t)) s += 25;
        if (/<div[\s>]/i.test(t)) s += 25;
        if (/<script[\s>]/i.test(t)) s += 20;
        if (/<style[\s>]/i.test(t)) s += 20;
        s += Math.min(40, count(t, /<\/[a-z][a-z0-9]*>/gi) * 3);
        if (/=&quot;|&nbsp;|&amp;/.test(t)) s += 10;
        return s;
      }
    },
    {
      id: 'xml', score: function (t) {
        var s = 0;
        if (/^\s*<\?xml/i.test(t)) s += 110;
        if (/xmlns[:=]/.test(t)) s += 40;
        if (/<!DOCTYPE\s+\w+/i.test(t)) s += 30;
        s += Math.min(45, count(t, /<\/[a-z][\w.:-]*>/gi) * 3);
        if (/<html|<div|<script|<style/i.test(t)) s -= 45;   // 更像 HTML
        if (/\b(public|class|void|function|const|def)\b/.test(t)) s -= 20;
        return s;
      }
    },
    {
      id: 'vue', score: function (t) {
        var s = 0;
        if (/<template[\s>]/.test(t)) s += 45;
        if (/<script[\s>]/.test(t) && /export\s+default/.test(t)) s += 30;
        if (/<style[\s>]/.test(t) && /scoped/.test(t)) s += 45;
        return s;
      }
    },
    {
      id: 'css', score: function (t) {
        var sel = count(t, /(^|\n)\s*[.#]?[a-zA-Z][\w-]*(\s*[>+~]\s*[.#]?[\w-]+)*\s*\{/g);
        var prop = count(t, /(^|\n)\s*[-a-z]+\s*:\s*[^;{}\n]+;/g);
        var at = count(t, /@(media|import|charset|font-face|keyframes)/g);
        var s = Math.min(90, sel * 12) + Math.min(70, prop * 6) + at * 20;
        if (/[{}]/.test(t) === false) s = 0;
        if (/\b(function|const|let|var|def|class)\b/.test(t)) s -= 40;
        return s;
      }
    },
    {
      id: 'scss', score: function (t) {
        var s = 0;
        if (/\$[\w-]+\s*:/.test(t)) s += 50;
        if (/&:[\w-]+/.test(t)) s += 40;
        if (/@(mixin|include|extend)\b/.test(t)) s += 45;
        if (/\.scss/.test(t)) s += 5;
        return s;
      }
    },
    {
      id: 'less', score: function (t) {
        var s = 0;
        if (/@[\w-]+\s*:\s*[^;]+;/.test(t)) s += 45;
        if (/&:[\w-]+/.test(t)) s += 25;
        if (/\.[\w-]+\(\)/.test(t)) s += 15;
        return s;
      }
    },
    {
      id: 'markdown', score: function (t) {
        var s = 0;
        s += Math.min(60, count(t, /(^|\n)#{1,6}\s+\S/g) * 25);
        if (/(^|\n)\s*```/.test(t)) s += 45;
        s += Math.min(40, count(t, /(^|\n)\s*[-*+]\s+\S/g) * 6);
        s += Math.min(40, count(t, /\[[^\]\n]+\]\([^)\n]+\)/g) * 14);
        s += Math.min(30, count(t, /(^|\n)\s*>\s+\S/g) * 10);
        if (/\*\*[^*\n]+\*\*/.test(t)) s += 12;
        return s;
      }
    },
    {
      id: 'yaml', score: function (t) {
        var kv = count(t, /(^|\n)[ \t]*[-\w.$]+\s*:\s*(\S.*)?$/gm);
        var list = count(t, /(^|\n)[ \t]*-\s+\S/g);
        var s = Math.min(80, kv * 9) + Math.min(30, list * 6);
        if (/^---/m.test(t)) s += 35;
        if (/[{};]/.test(t)) s -= 25;
        if (/<\/?[a-z]/i.test(t)) s -= 30;
        return s;
      }
    },
    {
      id: 'toml', score: function (t) {
        var s = 0;
        s += Math.min(70, count(t, /(^|\n)\s*\[[^\]\n]+\]\s*$/gm) * 30);
        s += Math.min(50, count(t, /(^|\n)\s*[\w.-]+\s*=\s*\S/gm) * 10);
        if (/#.*\n/.test(t)) s += 5;
        if (/\{/.test(t)) s -= 20;
        return s;
      }
    },
    {
      id: 'ini', score: function (t) {
        var sec = count(t, /(^|\n)\s*\[[^\]\n]+\]\s*$/gm);
        var kv = count(t, /(^|\n)\s*[\w.-]+\s*[=:]\s*\S/gm);
        var s = Math.min(60, sec * 25) + Math.min(50, kv * 7);
        if (/[{};]/.test(t)) s -= 25;
        return s;
      }
    },
    {
      id: 'diff', score: function (t) {
        var s = 0;
        if (/^diff --git /m.test(t)) s += 120;
        if (/^@@ .* @@/m.test(t)) s += 90;
        if (/^\+\+\+ /m.test(t) && /^--- /m.test(t)) s += 60;
        if (/^index [0-9a-f]{7,}/m.test(t)) s += 40;
        return s;
      }
    },
    {
      id: 'dockerfile', score: function (t) {
        var s = 0;
        if (/^[ \t]*FROM\s+\S+/im.test(t)) s += 90;
        if (/^[ \t]*(RUN|CMD|ENTRYPOINT|COPY|ADD|WORKDIR|ENV|EXPOSE|ARG|VOLUME|USER)\s/im.test(t)) s += 45;
        if (/^[ \t]*#\s*syntax=/im.test(t)) s += 30;
        return s;
      }
    },
    {
      id: 'sql', score: function (t) {
        var s = 0;
        if (/\bSELECT\b[\s\S]{0,400}?\bFROM\b/i.test(t)) s += 90;
        if (/\bINSERT\s+INTO\b/i.test(t)) s += 55;
        if (/\bCREATE\s+(TABLE|VIEW|INDEX|DATABASE|PROCEDURE)\b/i.test(t)) s += 70;
        if (/\bUPDATE\b[\s\S]{0,200}?\bSET\b/i.test(t)) s += 55;
        if (/\bDELETE\s+FROM\b/i.test(t)) s += 55;
        if (/\b(WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|JOIN)\b/i.test(t)) s += 30;
        if (/\bVARCHAR|INT\s+PRIMARY\s+KEY|NOT\s+NULL\b/i.test(t)) s += 20;
        return s;
      }
    },
    {
      id: 'java', score: function (t) {
        var s = 0;
        if (/\b(public|private|protected)\s+(static\s+)?(final\s+)?(class|interface|enum)\s+\w+/.test(t)) s += 90;
        if (/System\.out\.println/.test(t)) s += 60;
        if (/public\s+static\s+void\s+main\s*\(\s*String/.test(t)) s += 70;
        if (/^\s*import\s+java[\w.]*\s*;/m.test(t)) s += 45;
        if (/^\s*package\s+[\w.]+\s*;/m.test(t)) s += 45;
        if (/@(Override|Autowired|SpringBootApplication|RestController)\b/.test(t)) s += 40;
        if (/new\s+ArrayList\s*</.test(t)) s += 25;
        // 下面这些是「一段 Java 业务代码」的常见特征：没有 class 声明、没有 import，
        // 以前这种片段会一个信号都命不中，被当成纯文本，格式化就退化成「只重排缩进」。
        if (/\bArrays\.asList\s*\(/.test(t)) s += 25;
        if (/\b(HashMap|ArrayList|LinkedList|TreeMap|HashSet|StringBuilder|StringBuffer)\s*[<(]/.test(t)) s += 30;
        if (/\bnew\s+[A-Z]\w*\s*<[^<>;{}()]*>\s*\(/.test(t)) s += 25;      // new HashMap<>() / new ArrayList<String>()
        if (/\b(Map|Set|Optional|Stream)\s*</.test(t)) s += 25;
        if (/\bString\s+\w+\s*[=;)]/.test(t)) s += 20;
        if (/\b(public|private|protected|static|final)\s+(static\s+)?(final\s+)?[\w<>\[\], .]+\s+\w+\s*\(/.test(t)) s += 25;
        return s;
      }
    },
    {
      id: 'csharp', score: function (t) {
        var s = 0;
        if (/^\s*using\s+System(\.[\w]+)*\s*;/m.test(t)) s += 90;
        if (/Console\.(WriteLine|ReadLine)/.test(t)) s += 60;
        if (/\bnamespace\s+[\w.]+/.test(t)) s += 40;
        if (/\bpublic\s+(sealed\s+)?class\s+\w+/.test(t) && /\bvoid\s+\w+\s*\(/.test(t)) s += 30;
        if (/\bvar\s+\w+\s*=\s*new\s+\w+/.test(t)) s += 20;
        if (/\[(Serializable|HttpGet|JsonProperty)\b/.test(t)) s += 30;
        return s;
      }
    },
    {
      id: 'cpp', score: function (t) {
        var s = 0;
        if (/#include\s*<(iostream|vector|string|map|set|algorithm|memory|unordered_map)>/.test(t)) s += 90;
        if (/\bstd::/.test(t)) s += 50;
        if (/using\s+namespace\s+std\s*;/.test(t)) s += 45;
        if (/\bstd::cout\b|\bcout\s*<</.test(t)) s += 30;
        if (/\btemplate\s*</.test(t)) s += 35;
        if (/\bclass\s+\w+\s*:\s*(public|private|protected)\b/.test(t)) s += 30;
        if (/\bint\s+main\s*\(/.test(t)) s += 20;
        return s;
      }
    },
    {
      id: 'c', score: function (t) {
        var s = 0;
        if (/#include\s*<[\w./]+\.h>/.test(t)) s += 70;
        if (/\bint\s+main\s*\(/.test(t)) s += 45;
        if (/\bprintf\s*\(/.test(t)) s += 35;
        if (/\b(malloc|free|sizeof)\s*\(/.test(t)) s += 30;
        if (/struct\s+\w+\s*\{/.test(t)) s += 25;
        if (/\bstd::|namespace\s+std/.test(t)) s -= 60;
        return s;
      }
    },
    {
      id: 'objectivec', score: function (t) {
        var s = 0;
        if (/^\s*#import\s*[<"]/m.test(t)) s += 60;
        if (/@(interface|implementation|property|end|autoreleasepool)\b/.test(t)) s += 70;
        if (/\[\[?\w+\s+alloc\]/.test(t)) s += 45;
        if (/NS(Log|String|Array|Dictionary)\b/.test(t)) s += 35;
        return s;
      }
    },
    {
      id: 'kotlin', score: function (t) {
        var s = 0;
        if (/\bfun\s+\w+\s*\(/.test(t)) s += 55;
        if (/\bval\s+\w+\s*(:|=)/.test(t)) s += 30;
        if (/\bvar\s+\w+\s*(:|=)/.test(t)) s += 20;
        if (/\bdata\s+class\s+\w+/.test(t)) s += 55;
        if (/:\s*(String|Int|Boolean|Long|Double|Unit)\b/.test(t)) s += 30;
        if (/\?\.|\?:|\bcompanion\s+object\b/.test(t)) s += 25;
        if (/;\s*$/m.test(t)) s -= 30;
        if (/\bdef\s+\w+\s*\(/.test(t)) s -= 40;
        return s;
      }
    },
    {
      id: 'scala', score: function (t) {
        var s = 0;
        if (/\bcase\s+class\s+\w+/.test(t)) s += 70;
        if (/\bobject\s+\w+\s*\{/.test(t)) s += 50;
        if (/\bdef\s+\w+\s*\(/.test(t) && /:\s*\w+\s*=/.test(t)) s += 35;
        if (/\bval\s+\w+\s*[:=]/.test(t)) s += 25;
        if (/\bimplicit\b|\btrait\s+\w+/.test(t)) s += 25;
        return s;
      }
    },
    {
      id: 'go', score: function (t) {
        var s = 0;
        if (/^\s*package\s+\w+\s*$/m.test(t)) s += 80;
        if (/\bfunc\s+(\(\w+\s+\*?\w+\)\s*)?\w+\s*\(/.test(t)) s += 45;
        if (/:=/.test(t)) s += 30;
        if (/\bfmt\.(Print|Sprint|Errorf)/.test(t)) s += 45;
        if (/\bstruct\s+\w+\s*\{[\s\S]{0,200}?`(json|db|gorm):/.test(t)) s += 45;
        if (/;\s*$/m.test(t)) s -= 25;
        return s;
      }
    },
    {
      id: 'rust', score: function (t) {
        var s = 0;
        if (/\bfn\s+\w+\s*\(/.test(t)) s += 55;
        if (/\blet\s+(mut\s+)?\w+/.test(t)) s += 35;
        if (/println!|format!|vec!/.test(t)) s += 55;
        if (/^\s*use\s+(std|crate|super)::/m.test(t)) s += 40;
        if (/\bimpl\s+\w+/.test(t)) s += 40;
        if (/->\s*(Result|Option)</.test(t)) s += 35;
        if (/&\w+|\bpub\s+fn\b/.test(t)) s += 20;
        return s;
      }
    },
    {
      id: 'swift', score: function (t) {
        var s = 0;
        if (/\bfunc\s+\w+\s*\(/.test(t)) s += 45;
        if (/^\s*import\s+(Foundation|UIKit|SwiftUI|Combine)\b/m.test(t)) s += 70;
        if (/\b(let|var)\s+\w+\s*:\s*(String|Int|Bool|Double|\[)/.test(t)) s += 45;
        if (/\bguard\s+let\b|\bif\s+let\b/.test(t)) s += 45;
        if (/\bstruct\s+\w+\s*:\s*(View|Codable|Equatable)/.test(t)) s += 40;
        if (/;\s*$/m.test(t)) s -= 30;
        return s;
      }
    },
    {
      id: 'dart', score: function (t) {
        var s = 0;
        if (/^\s*import\s+['"]package:/m.test(t)) s += 70;
        if (/\bvoid\s+main\s*\(\s*\)/.test(t)) s += 45;
        if (/Widget\s+build\s*\(/.test(t)) s += 45;
        if (/\bfinal\s+\w+\s+\w+\s*=/.test(t)) s += 25;
        if (/@override/.test(t)) s += 25;
        return s;
      }
    },
    {
      id: 'groovy', score: function (t) {
        var s = 0;
        if (/^\s*(plugins|repositories|dependencies)\s*\{/m.test(t)) s += 70;
        if (/\bdef\s+\w+\s*\(/.test(t) && /\bclass\s+\w+/.test(t)) s += 35;
        if (/\$\{?\w+\}?/.test(t) && /'''|"""|\bGString\b/.test(t)) s += 25;
        if (/@Grab|apply\s+plugin/.test(t)) s += 40;
        return s;
      }
    },
    {
      id: 'python', score: function (t) {
        var s = 0;
        if (/^\s*def\s+\w+\s*\([^)]*\)\s*:/m.test(t)) s += 80;
        if (/^\s*class\s+\w+(\([^)]*\))?\s*:/m.test(t)) s += 60;
        if (/^\s*(import\s+[\w.]+|from\s+[\w.]+\s+import\s+)/m.test(t)) s += 45;
        if (/^\s*(if|elif|else|for|while|try|except|finally|with)\b[^\n]*:\s*$/m.test(t)) s += 35;
        if (/\bself\b/.test(t)) s += 40;
        if (/\bprint\s*\(/.test(t)) s += 15;
        if (/^\s*@\w+/m.test(t)) s += 20;
        // 下面这些是「一段 Python 数据/脚本片段」的特征：没有 def/class/import 时，
        // 以前这种片段一个信号都命不中，会掉成纯文本，格式化就退化成只重排缩进
        if (/\b(True|False|None)\b/.test(t)) s += 45;                 // JS 是 true/false/null，Java 是 true/false/null
        if (/\bfor\s+\w+\s+in\s+[\w(\[]/.test(t)) s += 25;            // Python 的 for x in y，JS 要写 for (x in y)
        if (/\b(elif|yield|lambda|nonlocal|f['"])/.test(t)) s += 35;
        if (/^\s*(if|for|while|with)\b[^\n]*:\s+\S/m.test(t)) s += 25; // 单行复合语句 if x: y
        if (/:\s*$/m.test(t) && /^\s*\S.*:\s*$/m.test(t)) s += 15;
        if (/\bend\s*$/m.test(t)) s -= 45;
        if (/\{[\s\S]{0,80}?\}/.test(t) && /;\s*$/m.test(t)) s -= 35;
        return s;
      }
    },
    {
      id: 'ruby', score: function (t) {
        var s = 0;
        if (/^\s*def\s+[\w?!]+\s*(\([^)]*\))?\s*$/m.test(t)) s += 50;
        if (/^\s*end\s*$/m.test(t)) s += 45;
        if (/\bputs\s/.test(t)) s += 40;
        if (/^\s*(require|require_relative)\s+['"]/m.test(t)) s += 45;
        if (/\bdo\s*\|[\w,\s]+\|/.test(t)) s += 40;
        if (/\battr_(accessor|reader|writer)\b/.test(t)) s += 45;
        if (/\bself\./.test(t)) s += 15;
        if (/:\s*$/m.test(t) && /^\s*(if|for|while)\b.*:\s*$/m.test(t)) s -= 40;
        return s;
      }
    },
    {
      id: 'perl', score: function (t) {
        var s = 0;
        if (/\buse\s+strict\b|\buse\s+warnings\b/.test(t)) s += 90;
        if (/\bmy\s+[@$%]\w+/.test(t)) s += 55;
        if (/^\s*sub\s+\w+\s*\{/m.test(t)) s += 40;
        if (/\$_\b|@ARGV|->\s*new\b/.test(t)) s += 30;
        return s;
      }
    },
    {
      id: 'lua', score: function (t) {
        var s = 0;
        if (/\blocal\s+\w+/.test(t)) s += 45;
        if (/^\s*function\s+[\w.:]*\s*\(/m.test(t)) s += 40;
        if (/\bthen\b/.test(t) && /\bend\b/.test(t)) s += 45;
        if (/\bnil\b|\bpairs\s*\(|\bipairs\s*\(/.test(t)) s += 35;
        return s;
      }
    },
    {
      id: 'r', score: function (t) {
        var s = 0;
        if (/<-/.test(t)) s += 60;
        if (/\b(library|require)\s*\(/.test(t)) s += 35;
        if (/\bdata\.frame\s*\(|\bggplot\s*\(|\bfunction\s*\(/.test(t)) s += 40;
        if (/^\s*#/m.test(t)) s += 5;
        return s;
      }
    },
    {
      id: 'julia', score: function (t) {
        var s = 0;
        if (/^\s*function\s+\w+\s*\(/m.test(t) && /^\s*end\s*$/m.test(t)) s += 45;
        if (/::\s*(Int|Float64|String|Vector)\b/.test(t)) s += 45;
        if (/\busing\s+\w+|\bmodule\s+\w+/.test(t)) s += 35;
        if (/@\w+\s/.test(t)) s += 25;
        return s;
      }
    },
    {
      id: 'haskell', score: function (t) {
        var s = 0;
        if (/^\s*module\s+[\w.]+\s+where/m.test(t)) s += 80;
        if (/^\s*import\s+(qualified\s+)?[A-Z][\w.]*/m.test(t)) s += 45;
        if (/^\s*\w+\s*::\s*\w+/m.test(t)) s += 45;
        if (/\b(do|where|let|in)\b/.test(t) && /<-/.test(t)) s += 35;
        return s;
      }
    },
    {
      id: 'elm', score: function (t) {
        var s = 0;
        if (/^\s*module\s+\w+\s+exposing/m.test(t)) s += 90;
        if (/^\s*import\s+Html/m.test(t)) s += 50;
        if (/\btype\s+Msg\b|\bupdate\s*:\s*Msg\s*->/.test(t)) s += 60;
        return s;
      }
    },
    {
      id: 'crystal', score: function (t) {
        var s = 0;
        if (/^\s*require\s+["'][\w/]+["']/m.test(t)) s += 40;
        if (/\bdef\s+\w+(\([^)]*\))?\s*:\s*\w+/.test(t)) s += 45;
        if (/\bend\s*$/m.test(t) && /\bputs\b/.test(t)) s += 30;
        return s;
      }
    },
    {
      id: 'php', score: function (t) {
        var s = 0;
        if (/<\?php/.test(t)) s += 150;
        if (/<\?=/.test(t)) s += 40;
        if (/\$\w+\s*(=|->)/.test(t)) s += 20;
        if (/->\w+\s*\(/.test(t)) s += 20;
        if (/\becho\s/.test(t)) s += 15;
        return s;
      }
    },
    {
      id: 'powershell', score: function (t) {
        var s = 0;
        if (/^\s*(Get|Set|New|Remove|Write|Start|Stop|Test|Import|Export|Invoke|Select|Where|ForEach|Out)-\w+/m.test(t)) s += 80;
        if (/\$env:\w+/.test(t)) s += 60;
        if (/^\s*param\s*\(/m.test(t)) s += 45;
        if (/\bWrite-Host\b|\bGet-ChildItem\b/.test(t)) s += 45;
        if (/\b(function|def)\s+\w+\s*\(/.test(t)) s -= 20;
        return s;
      }
    },
    {
      id: 'batch', score: function (t) {
        var s = 0;
        if (/^@?echo\s+(on|off)/im.test(t)) s += 90;
        if (/%[\w~]+%/.test(t)) s += 45;
        if (/^\s*(set|if|for|goto|call)\s+/im.test(t)) s += 25;
        if (/^\s*rem\s/im.test(t)) s += 20;
        if (/\{\s*$/m.test(t)) s -= 40;
        return s;
      }
    },
    {
      id: 'shell', score: function (t) {
        var s = 0;
        if (/^#!\s*\S*\/(ba|z|k|da)?sh\b/.test(t)) s += 130;
        if (/^#!\s*\/usr\/bin\/env\s+\w+/.test(t)) s += 90;
        if (/^\s*(fi|done|esac|then)\s*$/m.test(t)) s += 45;
        if (/\$\{?\w+\}?/.test(t)) s += 20;
        if (/^\s*(export|echo|cd|mkdir|rm|cp|mv|grep|awk|sed|curl|cat)\s/m.test(t)) s += 25;
        if (/\bfunction\s+\w+\s*\(\)/.test(t)) s += 20;
        if (/\{\s*$/m.test(t)) s -= 30;
        return s;
      }
    },
    {
      id: 'pascal', score: function (t) {
        var s = 0;
        if (/\bprogram\s+\w+\s*;/i.test(t)) s += 70;
        if (/\bbegin\b[\s\S]{0,2000}?\bend\s*\./i.test(t)) s += 70;
        if (/\bprocedure\s+\w+\s*\(/i.test(t)) s += 45;
        if (/\bvar\b[\s\S]{0,200}?:/i.test(t)) s += 25;
        return s;
      }
    },
    {
      id: 'vb', score: function (t) {
        var s = 0;
        if (/^\s*(Public|Private)\s+(Sub|Function)\s+\w+/im.test(t)) s += 80;
        if (/^\s*(End\s+(Sub|Function|If|Class))\b/im.test(t)) s += 65;
        if (/\bDim\s+\w+\s+As\s+\w+/i.test(t)) s += 55;
        if (/\bMsgBox\s*\(/i.test(t)) s += 30;
        return s;
      }
    },
    {
      id: 'tcl', score: function (t) {
        var s = 0;
        if (/^\s*proc\s+\w+\s*\{/m.test(t)) s += 70;
        if (/\bputs\s+["$]/.test(t)) s += 45;
        if (/\bpackage\s+require\b/.test(t)) s += 35;
        return s;
      }
    },
    {
      id: 'fortran', score: function (t) {
        var s = 0;
        if (/^\s*(program|module|subroutine)\s+\w+/im.test(t)) s += 65;
        // Fortran 的 function 不能只看关键字：JavaScript 的 "function foo(" 长得一模一样，
        // 必须同时有 Fortran 特征（:: 声明 / implicit none / end function）才算
        if (/^\s*function\s+\w+/im.test(t) &&
          /(::|implicit\s+none|end\s+function|\bend\b\s*$)/im.test(t)) s += 65;
        if (/^\s*(end\s+(program|module|subroutine|function|if|do)|endif|enddo)\b/im.test(t)) s += 55;
        if (/^\s*(implicit\s+none|integer|real|double\s+precision)\b/im.test(t)) s += 45;
        return s;
      }
    },
    {
      id: 'verilog', score: function (t) {
        var s = 0;
        if (/\bmodule\s+\w+\s*\(/i.test(t)) s += 60;
        if (/\bendmodule\b/i.test(t)) s += 70;
        if (/\b(always|assign|wire|reg|posedge|negedge)\b/.test(t)) s += 45;
        return s;
      }
    },
    {
      id: 'vhdl', score: function (t) {
        var s = 0;
        if (/\blibrary\s+ieee\s*;/i.test(t)) s += 80;
        if (/\bentity\s+\w+\s+is\b/i.test(t)) s += 60;
        if (/\barchitecture\s+\w+\s+of\b/i.test(t)) s += 60;
        return s;
      }
    },
    {
      id: 'coffeescript', score: function (t) {
        var s = 0;
        if (/^\s*\w+\s*=\s*\([^)]*\)\s*->/m.test(t)) s += 70;
        if (/^\s*(class\s+\w+|[\w.]+\s*=\s*->)/m.test(t)) s += 35;
        if (/\bthen\b|\bunless\b|\bisnt\b/.test(t)) s += 35;
        if (/;\s*$/m.test(t)) s -= 40;
        return s;
      }
    },
    {
      id: 'pug', score: function (t) {
        var s = 0;
        if (/^\s*(doctype|extends|block|mixin)\s+\w*/im.test(t)) s += 80;
        if (/^\s*\+[\w-]+\s*\(/m.test(t)) s += 50;
        if (/^\s*[a-z][\w-]*\([^)]*\)\s*$/m.test(t)) s += 25;
        if (/<\w+>/.test(t)) s -= 40;
        return s;
      }
    },
    {
      id: 'nginx', score: function (t) {
        var s = 0;
        if (/\b(server|http|location|upstream)\s*\{/.test(t)) s += 55;
        if (/\b(listen|server_name|proxy_pass|root|index)\s/.test(t)) s += 45;
        if (/\bworker_processes\b/.test(t)) s += 45;
        return s;
      }
    },
    {
      id: 'javascript', score: function (t) {
        var s = 0;
        if (/\bfunction\s+\w*\s*\(/.test(t)) s += 45;
        if (/\b(const|let)\s+\w+\s*=/.test(t)) s += 40;
        if (/=>/.test(t)) s += 35;
        if (/console\.(log|error|warn)/.test(t)) s += 45;
        if (/\brequire\s*\(\s*['"]/.test(t)) s += 40;
        if (/\bmodule\.exports\b|\bexports\.\w+/.test(t)) s += 55;
        if (/^\s*import\s+[\s\S]{0,80}?from\s+['"]/m.test(t)) s += 45;
        if (/^\s*export\s+(default|const|function|class)/m.test(t)) s += 45;
        if (/\b(document|window)\.\w+/.test(t)) s += 25;
        if (/\bnew\s+Promise\s*\(/.test(t)) s += 30;
        if (/\basync\s+function|\bawait\s/.test(t)) s += 25;
        if (/\binterface\s+\w+\s*\{|\btype\s+\w+\s*=|:\s*(string|number|boolean)\b/.test(t)) s -= 40;
        return s;
      }
    },
    {
      id: 'typescript', score: function (t) {
        var s = 0;
        if (/\binterface\s+\w+\s*\{/.test(t)) s += 80;
        if (/\btype\s+\w+\s*=/.test(t)) s += 45;
        if (/:\s*(string|number|boolean|void|any|unknown)\b/.test(t)) s += 45;
        if (/\benum\s+\w+\s*\{/.test(t)) s += 45;
        if (/\b(public|private|readonly)\s+\w+\s*:/.test(t)) s += 35;
        if (/\bimplements\s+\w+/.test(t)) s += 35;
        if (/\bexport\s+(type|interface)\b/.test(t)) s += 45;
        return s;
      }
    },
    {
      id: 'jsx', score: function (t) {
        var s = 0;
        if (/<[A-Z][\w.]*[\s/>]/.test(t)) s += 55;
        if (/return\s*\(\s*</.test(t)) s += 45;
        if (/\{[\s\S]{0,80}?\}/.test(t) && /className=/.test(t)) s += 55;
        if (/\buse(State|Effect|Ref|Memo)\s*\(/.test(t)) s += 50;
        return s;
      }
    }
  ];

  // 识别优先级：分数接近时优先更具体的语言
  var PRIORITY = {
    json: 6, html: 5, xml: 4, vue: 6, php: 6, diff: 6, dockerfile: 5,
    java: 3, csharp: 3, objectivec: 4, cpp: 3, c: 1, kotlin: 2, scala: 2,
    typescript: 3, tsx: 4, jsx: 2, javascript: 1, python: 3, ruby: 2, perl: 3,
    go: 3, rust: 3, swift: 3, dart: 3, groovy: 3, elm: 5, crystal: 2, julia: 2,
    haskell: 3, lua: 3, r: 2, powershell: 4, batch: 3, shell: 2,
    pascal: 4, vb: 4, tcl: 4, fortran: 4, verilog: 4, vhdl: 4,
    coffeescript: 3, pug: 4, nginx: 4,
    css: 2, scss: 3, less: 3, sass: 2, stylus: 2,
    markdown: 1, yaml: 2, toml: 2, ini: 1, sql: 3, plaintext: 0
  };

  /**
   * 按内容猜测语言
   * @returns {{id:string, score:number, ranked:Array}}
   */
  SAK.detectLanguage = function (text) {
    var sample = (text || '').slice(0, 20000);
    if (!sample.trim()) return { id: 'plaintext', score: 0, ranked: [] };
    var ranked = [];
    for (var i = 0; i < RULES.length; i++) {
      var rule = RULES[i];
      var score;
      try { score = rule.score(sample) || 0; } catch (e) { score = 0; }
      if (score > 0) ranked.push({ id: rule.id, score: score });
    }
    ranked.sort(function (a, b) {
      var pa = PRIORITY[a.id] || 0, pb = PRIORITY[b.id] || 0;
      if (a.score !== b.score) return b.score - a.score;
      return pb - pa;
    });
    var best = ranked[0];
    if (!best || best.score < 30) return { id: 'plaintext', score: best ? best.score : 0, ranked: ranked };
    return { id: best.id, score: best.score, ranked: ranked.slice(0, 5) };
  };

})(window.SAK);
