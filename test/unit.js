/* 无头单元测试：node test/unit.js */
'use strict';
global.window = global;
global.Encoding = require('encoding-japanese');
require('../js/core.js');
require('../js/lang.js');
require('../js/diff.js');
require('../js/format.js');
require('../js/textops.js');

var translateMod = require('../translate.js');

var SAK = global.SAK;
var pass = 0, fail = 0;

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '\n        ' + extra : '')); }
}
function eq(name, actual, expected) {
  var a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + '\n        期望: ' + e + '\n        实际: ' + a); }
}
function section(t) { console.log('\n== ' + t + ' =='); }

/* ---------------- 语言识别 ---------------- */
section('语言自动识别');
var SAMPLES = {
  java: 'package com.example.demo;\n\nimport java.util.List;\n\npublic class Demo {\n    public static void main(String[] args) {\n        System.out.println("hello");\n    }\n}\n',
  python: 'import os\n\n\ndef main():\n    print("hi")\n    if os.path.exists("x"):\n        return 1\n    return 0\n\n\nclass Foo:\n    def bar(self):\n        pass\n',
  javascript: 'const express = require(\'express\');\nfunction add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2));\nmodule.exports = { add };\n',
  typescript: 'interface User {\n  id: number;\n  name: string;\n}\n\nexport type Result<T> = { ok: boolean; data: T };\n\nenum Color { Red, Green }\n',
  json: '{ "name": "demo", "list": [1, 2, 3], "ok": true }\n',
  html: '<!DOCTYPE html>\n<html><body><div class="x">hi</div><p>t</p><span>a</span></body></html>\n',
  css: '.container {\n  display: flex;\n  color: red;\n}\n#main .item:hover {\n  background: #fff;\n}\n',
  sql: 'SELECT id, name FROM users WHERE age > 18 ORDER BY name;\nINSERT INTO logs (msg) VALUES (\'x\');\nCREATE TABLE t (id INT PRIMARY KEY, name VARCHAR(50) NOT NULL);\n',
  yaml: 'name: demo\nversion: 1.0.0\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n',
  markdown: '# 标题\n\n这是一个 **示例**。\n\n- 项目 1\n- 项目 2\n\n```js\ncode\n```\n\n[链接](https://example.com)\n',
  go: 'package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("hi")\n}\n',
  rust: 'use std::collections::HashMap;\n\nfn main() {\n    let mut map = HashMap::new();\n    println!("{}", 1);\n}\n',
  csharp: 'using System;\nnamespace Demo {\n    public class Program {\n        public static void Main(string[] args) {\n            Console.WriteLine("hi");\n        }\n    }\n}\n',
  cpp: '#include <iostream>\n#include <vector>\nusing namespace std;\nint main() {\n    std::vector<int> v;\n    cout << "hi" << endl;\n    return 0;\n}\n',
  php: '<?php\n$name = "world";\necho "hello " . $name;\nfunction greet($n) { return "hi " . $n; }\n?>\n',
  shell: '#!/bin/bash\nset -e\nfor f in *.txt; do\n  echo "$f"\ndone\n',
  batch: '@echo off\nsetlocal\nset NAME=world\necho Hello %NAME%\nif exist "C:\\temp" goto found\n:found\npause\n',
  powershell: 'param([string]$Name)\nWrite-Host "Hello $Name"\nGet-ChildItem -Path C:\\ | Where-Object { $_.Length -gt 0 }\n',
  ruby: 'require \'json\'\n\nclass Greeter\n  def initialize(name)\n    @name = name\n  end\n\n  def greet\n    puts "Hello #{@name}"\n  end\nend\n',
  kotlin: 'fun main() {\n    val name: String = "world"\n    println("hello $name")\n}\n\ndata class User(val id: Int, val name: String)\n',
  plaintext: '今天天气不错，我们一起去公园散步吧。\n这段文字是普通中文，不包含任何代码关键字。\n它应该被识别为纯文本，而不是某种编程语言。\n'
};
Object.keys(SAMPLES).forEach(function (expected) {
  var r = SAK.detectLanguage(SAMPLES[expected]);
  ok('识别 ' + expected + ' → ' + r.id + ' (分数 ' + r.score + ')', r.id === expected,
    '得分前几名: ' + (r.ranked || []).slice(0, 3).map(function (x) { return x.id + ':' + x.score; }).join(', '));
});

section('按文件名判定语言');
eq('Demo.java', SAK.langByFileName('Demo.java').id, 'java');
eq('a/b/main.py', SAK.langByFileName('a/b/main.py').id, 'python');
eq('index.html', SAK.langByFileName('index.html').id, 'html');
eq('app.tsx', SAK.langByFileName('app.tsx').id, 'tsx');
eq('Dockerfile', SAK.langByFileName('Dockerfile').id, 'dockerfile');
eq('unknown.zzz', SAK.langByFileName('unknown.zzz'), null);

/* ---------------- 格式化 ---------------- */
section('内置结构重排（大括号语言）');
var messyJava = [
  'public class A {',
  'public void f() {',
  'int x = 1;',
  'if (x>0) {',
  'System.out.println(x);',
  '}',
  '}',
  '}'
].join('\n');
var expectJava = [
  'public class A {',
  '    public void f() {',
  '        int x = 1;',
  '        if (x > 0) {',
  '            System.out.println(x);',
  '        }',
  '    }',
  '}'
].join('\n');
eq('Java 缩进重排', SAK._formatters.reindentBraces(messyJava, { tabSize: 4 }), expectJava);

var sw = 'switch (x) {\ncase 1:\na();\nbreak;\ndefault:\nb();\n}\n';
var expectSw = 'switch (x) {\n    case 1:\n        a();\n        break;\n    default:\n        b();\n}\n';
eq('switch/case 缩进', SAK._formatters.reindentBraces(sw, { tabSize: 4 }), expectSw);

eq('逗号后补空格', SAK._formatters.reindentBraces('f(a,b ,c);\n', { tabSize: 4 }), 'f(a, b, c);\n');
eq('大括号前补空格', SAK._formatters.reindentBraces('class A{\nint x=0;\n}\n', { tabSize: 4 }), 'class A {\n    int x = 0;\n}\n');
eq('赋值号两侧补空格', SAK._formatters.reindentBraces('int a=1;\nint b =2;\nint c= 3;\n', { tabSize: 4 }),
  'int a = 1;\nint b = 2;\nint c = 3;\n');
eq('比较/复合运算符两侧补空格',
  SAK._formatters.reindentBraces('if (a==b && c<=d && e!=f) {\nx+=1;\ny => z;\n}\n', { tabSize: 4 }),
  'if (a == b && c <= d && e != f) {\n    x += 1;\n    y => z;\n}\n');
eq('关键字后括号补空格', SAK._formatters.reindentBraces('if(x>0){\nwhile(y<1){\n}\n}\n', { tabSize: 4 }),
  'if (x > 0) {\n    while (y < 1) {\n    }\n}\n');
eq('for 三段式', SAK._formatters.reindentBraces('for(int i=0;i<n;i++){\nf(i);\n}\n', { tabSize: 4 }),
  'for (int i = 0; i < n; i++) {\n    f(i);\n}\n');
eq('泛型整体照抄、只补逗号', SAK._formatters.reindentBraces('Map<String,List<Integer>> m=new HashMap<>();\n', { tabSize: 4 }),
  'Map<String, List<Integer>> m = new HashMap<>();\n');
eq('比较用的尖括号当运算符', SAK._formatters.reindentBraces('if (a<b && c>d) {\nx=1;\n}\n', { tabSize: 4 }),
  'if (a < b && c > d) {\n    x = 1;\n}\n');
eq('三元运算符两侧补空格（含紧凑写法）', SAK._formatters.reindentBraces('int y=x>0?1:2;\n', { tabSize: 4 }),
  'int y = x > 0 ? 1 : 2;\n');
eq('C# 可空类型不被当成三元', SAK._formatters.reindentBraces('int? x = a?b:c;\n', { tabSize: 4 }),
  'int? x = a ? b : c;\n');
eq('switch 标签的冒号前不补空格', SAK._formatters.reindentBraces('switch(x){\ncase 1:\nbreak;\n}\n', { tabSize: 4 }),
  'switch (x) {\n    case 1:\n        break;\n}\n');
eq('一元负号不动、逗号后的一元负号不粘连', SAK._formatters.reindentBraces('x = -1 - -2;\nf(a,-b);\n', { tabSize: 4 }),
  'x = -1 - -2;\nf(a, -b);\n');
eq('指针语言的 -> 两侧不留空格', SAK._formatters.reindentBraces('p->x=1;\n', { tabSize: 4, langId: 'c' }),
  'p->x = 1;\n');
eq('Java 的 lambda -> 两侧补空格', SAK._formatters.reindentBraces('xs.forEach(x->f(x));\n', { tabSize: 4, langId: 'java' }),
  'xs.forEach(x -> f(x));\n');
eq(':: 不被拆开', SAK._formatters.reindentBraces('std::vector<int> v;\n', { tabSize: 4 }), 'std::vector<int> v;\n');
eq('数组初始化', SAK._formatters.reindentBraces('int[] a={1,2,3};\n', { tabSize: 4 }), 'int[] a = {1, 2, 3};\n');
eq('C# 空合并运算符', SAK._formatters.reindentBraces('var t = a?.b ?? c;\nx ??= y;\n', { tabSize: 4 }),
  'var t = a?.b ?? c;\nx ??= y;\n');
eq('字符串里的大括号逗号等号都不动', SAK._formatters.reindentBraces('String s = "a,b{c}=1";\n', { tabSize: 4 }),
  'String s = "a,b{c}=1";\n');
eq('字符串内不误改', SAK._formatters.reindentBraces('String s = "a,b{c}=1";\n', { tabSize: 4 }), 'String s = "a,b{c}=1";\n');
eq('注释内不误改', SAK._formatters.reindentBraces('// a,b {\nint x = 1;\n', { tabSize: 4 }), '// a,b {\nint x = 1;\n');
eq('Tab 缩进', SAK._formatters.reindentBraces('class A{\nint x;\n}\n', { tabSize: 4, useTabs: true }), 'class A {\n\tint x;\n}\n');

section('缩进规范化（Python / YAML 等）');
var messyPy = 'def f():\n  x = 1\n  if x:\n        y = 2\n  return y\n';
var expectPy = 'def f():\n    x = 1\n    if x:\n        y = 2\n    return y\n';
eq('Python 缩进规范化', SAK._formatters.normalizeIndent(messyPy, { tabSize: 4 }), expectPy);
eq('空行保持', SAK._formatters.normalizeIndent('a:\n\n   b: 1\n', { tabSize: 4 }), 'a:\n\n    b: 1\n');

section('大括号语言：语句断行（挤成一行的代码摊开）');
var oneLineJava = 'Map<String, Object> data = new HashMap<>(); data.put("name", "张三"); data.put("age", 28); data.put("city", "北京"); data.put("hobbies", Arrays.asList("阅读", "跑步", "编程")); data.put("isStudent", false); Map<String, Object> address = new HashMap<>(); address.put("street", "中关村大街1号"); address.put("zip", "100000"); data.put("address", address);';
eq('挤成一行的 Java：一句一行',
  SAK._formatters.reindentBraces(oneLineJava, { tabSize: 4, langId: 'java' }),
  [
    'Map<String, Object> data = new HashMap<>();',
    'data.put("name", "张三");',
    'data.put("age", 28);',
    'data.put("city", "北京");',
    'data.put("hobbies", Arrays.asList("阅读", "跑步", "编程"));',
    'data.put("isStudent", false);',
    'Map<String, Object> address = new HashMap<>();',
    'address.put("street", "中关村大街1号");',
    'address.put("zip", "100000");',
    'data.put("address", address);'
  ].join('\n'));
ok('这种没有 class / import 的 Java 片段也能被识别成 java', SAK.detectLanguage(oneLineJava).id === 'java',
  SAK.detectLanguage(oneLineJava).id + ':' + SAK.detectLanguage(oneLineJava).score);

eq('一行写完的类会被摊开并缩进',
  SAK._formatters.reindentBraces('public class A{public static void main(String[] a){int x=1;if(x>0){System.out.println("hi"+x);}}}',
    { tabSize: 4, langId: 'java' }),
  'public class A {\n    public static void main(String[] a) {\n        int x = 1;\n        if (x > 0) {\n            System.out.println("hi" + x);\n        }\n    }\n}');
eq('紧凑 switch 摊开',
  SAK._formatters.reindentBraces('switch(x){case 1:a();break;default:b();}', { tabSize: 4, langId: 'java' }),
  'switch (x) {\n    case 1:\n        a();\n        break;\n    default:\n        b();\n}');
eq('} else { 留在同一行',
  SAK._formatters.reindentBraces('if(a){b();}else{c();}', { tabSize: 4, langId: 'java' }),
  'if (a) {\n    b();\n} else {\n    c();\n}');
eq('try / catch / finally',
  SAK._formatters.reindentBraces('try{a();}catch(Exception e){b(e);}finally{c();}', { tabSize: 4, langId: 'java' }),
  'try {\n    a();\n} catch (Exception e) {\n    b(e);\n} finally {\n    c();\n}');
eq('for 三段式里的分号不换行',
  SAK._formatters.reindentBraces('for(int i=0;i<n;i++){f(i);}', { tabSize: 4, langId: 'java' }),
  'for (int i = 0; i < n; i++) {\n    f(i);\n}');
eq('lambda 块只缩一层（括号不叠缩进）',
  SAK._formatters.reindentBraces('list.forEach(x->{doIt(x);});', { tabSize: 4, langId: 'java' }),
  'list.forEach(x -> {\n    doIt(x);\n});');
var alreadyJava = 'class A {\n\n    void f() {\n        int x = 1;\n    }\n}\n';
eq('已排好版的代码行结构与空行不变',
  SAK._formatters.reindentBraces(alreadyJava, { tabSize: 4, langId: 'java' }), alreadyJava);
ok('一行 JS function 不会被误判成 Fortran',
  SAK.detectLanguage('function add(a,b){\nreturn a+b;\n}').id === 'javascript',
  SAK.detectLanguage('function add(a,b){\nreturn a+b;\n}').id);

section('Python 格式化（缩进 + 行内空格）');
var fmtPy = SAK._formatters.formatPython;
eq('赋值号两侧补空格', fmtPy('x=1\ny =2\n', { tabSize: 4 }), 'x = 1\ny = 2\n');
eq('运算符两侧补空格', fmtPy('y=x+2*3\n', { tabSize: 4 }), 'y = x + 2 * 3\n');
eq('关键字参数 / 默认值不留空格', fmtPy('f(a = 1,b=2)\ndef g(a = 1):\n', { tabSize: 4 }), 'f(a=1, b=2)\ndef g(a=1):\n');
eq('逗号后补空格', fmtPy('f(a,b)\n', { tabSize: 4 }), 'f(a, b)\n');
eq('切片冒号不留空格', fmtPy('x=a[1:2]\ny=a[1:2:3]\n', { tabSize: 4 }), 'x = a[1:2]\ny = a[1:2:3]\n');
eq('字典冒号后补空格', fmtPy('d={"a":1,"b":2}\n', { tabSize: 4 }), 'd = {"a": 1, "b": 2}\n');
eq('幂 / 整除', fmtPy('x=2**8\ny=a//b\n', { tabSize: 4 }), 'x = 2 ** 8\ny = a // b\n');
eq('变参与解包不留空格', fmtPy('def f(*args,**kw):\n    g(*args,**kw)\n', { tabSize: 4 }),
  'def f(*args, **kw):\n    g(*args, **kw)\n');
eq('一元负号不动', fmtPy('z = -1\nq = -x + 1\n', { tabSize: 4 }), 'z = -1\nq = -x + 1\n');
eq('括号内不留空格', fmtPy('x = a[ i ]\nf( a,b )\n', { tabSize: 4 }), 'x = a[i]\nf(a, b)\n');
eq('行内注释规范为两个空格', fmtPy('x=1 # 说明\n', { tabSize: 4 }), 'x = 1  # 说明\n');
eq('整行注释：只规范缩进、注释内容不动', fmtPy('    # 只注释\n', { tabSize: 4 }), '    # 只注释\n');
eq('比较运算与逻辑', fmtPy('if a==b and c!=d:\n    pass\n', { tabSize: 4 }), 'if a == b and c != d:\n    pass\n');
eq('缩进照旧规范化', fmtPy('def f():\n  x=1\n  if x:\n        y=2\n  return y\n', { tabSize: 4 }),
  'def f():\n    x = 1\n    if x:\n        y = 2\n    return y\n');
var pyDoc = 'def f():\n  """第一行\n     内部缩进是字符串内容\n  """\n  return 1\n';
eq('三引号字符串内容不被改动', fmtPy(pyDoc, { tabSize: 4 }),
  'def f():\n    """第一行\n     内部缩进是字符串内容\n  """\n    return 1\n');
var pyMessy = 'import os\ndef main():\n  x=1\n  d={"a":1}\n  if os.path.exists("a"):\n    print(x,d)\n  return d\n';
ok('Python 格式化幂等', fmtPy(fmtPy(pyMessy, { tabSize: 4 }), { tabSize: 4 }) === fmtPy(pyMessy, { tabSize: 4 }));

section('Python 结构整理（一行摊成多行）');
var pyOneLineDict = 'data={"name":"张三","age":28,"city":"北京","hobbies":["阅读","跑步","编程"],"isStudent":False,"address":{"street":"中关村大街1号","zip":"100000"}}';
eq('一行嵌套字典摊成一项一行', fmtPy(pyOneLineDict, { tabSize: 4, printWidth: 100 }),
  [
    'data = {',
    '    "name": "张三",',
    '    "age": 28,',
    '    "city": "北京",',
    '    "hobbies": ["阅读", "跑步", "编程"],',
    '    "isStudent": False,',
    '    "address": {"street": "中关村大街1号", "zip": "100000"},',
    '}'
  ].join('\n'));
ok('这种一行字典也能被识别成 python', SAK.detectLanguage(pyOneLineDict).id === 'python',
  SAK.detectLanguage(pyOneLineDict).id + ':' + SAK.detectLanguage(pyOneLineDict).score);
ok('摊开后的 Python 仍然幂等',
  fmtPy(fmtPy(pyOneLineDict, { tabSize: 4, printWidth: 100 }), { tabSize: 4, printWidth: 100 }) ===
  fmtPy(pyOneLineDict, { tabSize: 4, printWidth: 100 }));
eq('短的一行字典不动', fmtPy('short={"a":1,"b":2}', { tabSize: 4, printWidth: 100 }), 'short = {"a": 1, "b": 2}');
eq('单行复合语句摊开', fmtPy('def f(a,b): return a+b', { tabSize: 4 }),
  'def f(a, b):\n    return a + b');
eq('单行 if 摊开', fmtPy('if x>0: print("正")', { tabSize: 4 }),
  'if x > 0:\n    print("正")');
eq("顶层 ';' 分行", fmtPy('x=1;y=2;print(x,y)', { tabSize: 4 }),
  'x = 1\ny = 2\nprint(x, y)');
eq('超长调用摊开并补尾逗号',
  fmtPy('result = some_function(argument_one, argument_two, argument_three, argument_four, argument_five, argument_six)',
    { tabSize: 4, printWidth: 88 }),
  [
    'result = some_function(',
    '    argument_one,',
    '    argument_two,',
    '    argument_three,',
    '    argument_four,',
    '    argument_five,',
    '    argument_six,',
    ')'
  ].join('\n'));
eq('已经摊开的多行调用保持原样',
  fmtPy('x = [\n    1,\n    2,\n]\n', { tabSize: 4, printWidth: 88 }), 'x = [\n    1,\n    2,\n]\n');
eq('注释不参与结构拆分', fmtPy('d={"k":"v"}  # 短字典不动', { tabSize: 4 }),
  'd = {"k": "v"}  # 短字典不动');

section('格式化方案路由');
eq('java → braces', SAK.formatPlan('java').kind, 'braces');
eq('python → python 专用方案', SAK.formatPlan('python').kind, 'python');
eq('javascript → prettier', SAK.formatPlan('javascript').kind, 'prettier');
eq('json → prettier(json)', SAK.formatPlan('json').parser, 'json');
eq('typescript → prettier', SAK.formatPlan('typescript').kind, 'prettier');
eq('sql → sql', SAK.formatPlan('sql').kind, 'sql');
eq('xml → beautifyHtml', SAK.formatPlan('xml').kind, 'beautifyHtml');
eq('markdown → prettier', SAK.formatPlan('markdown').kind, 'prettier');

/* ---------------- JSON 格式化（真实 Prettier；异步，结果在本文件末尾输出） ---------------- */
section('JSON 格式化（异步，结果见末尾）');
(function () {
  var fs = require('fs'), path = require('path');
  // 浏览器里由 core.js 动态插入 <script>；这里把同一份文件执行到全局，行为等价
  SAK.loadScript = function (src) {
    (new Function(fs.readFileSync(path.join(__dirname, '..', src), 'utf8')))();
    return Promise.resolve();
  };

  (async function () {
    eq('压缩 JSON 展开为缩进结构',
      await SAK.formatText('{"a":1,"b":[1,2]}', 'json', { tabSize: 2, printWidth: 100 }),
      '{\n  "a": 1,\n  "b": [1, 2]\n}\n');

    var lit = await SAK.formatText('{"n":1.0,"e":1e5,"big":12345678901234567890,"s":"a\\u00e9b"}', 'json',
      { tabSize: 2, printWidth: 100 });
    ok('数字/转义字面量原样保留（不被改写）',
      lit.indexOf('1.0') >= 0 && lit.indexOf('1e5') >= 0 &&
      lit.indexOf('12345678901234567890') >= 0 && lit.indexOf('\\u00e9') >= 0,
      JSON.stringify(lit));
    eq('展开为多行', lit.trim().split('\n').length, 6);

    var pretty = await SAK.formatText('{\n  "a": 1,\n  "b": 2\n}', 'json', { tabSize: 2, printWidth: 100 });
    eq('已排版的 JSON 保持不变', pretty, '{\n  "a": 1,\n  "b": 2\n}\n');
    eq('JSON 格式化幂等',
      await SAK.formatText(pretty, 'json', { tabSize: 2, printWidth: 100 }), pretty);

    eq('带注释的 JSONC 仍可格式化',
      await SAK.formatText('{\n// 说明\n"a":1,"b":2}', 'json', { tabSize: 2, printWidth: 100 }),
      '{\n  // 说明\n  "a": 1,\n  "b": 2\n}\n');

    eq('JSON 支持 Tab 缩进',
      await SAK.formatText('{"a":{"b":1}}', 'json', { tabSize: 4, useTabs: true }),
      '{\n\t"a": {\n\t\t"b": 1\n\t}\n}\n');

    eq('结构换行不会误改字符串里的括号',
      SAK._formatters.expandJson('{"s":"{ \\"a\\": 1 }"}'),
      '{\n"s":"{ \\"a\\": 1 }"\n}');

    var bad = null;
    try { await SAK.formatText('{"a" 1}', 'json', { tabSize: 2 }); } catch (e) { bad = e; }
    ok('非法 JSON 抛出可读错误', !!bad && /Unexpected token/.test(String(bad.message)),
      bad && String(bad.message).split('\n')[0]);

    /* ---- 翻译提供方链：前一个失败就自动换下一个（不联网，用假请求顶替 https） ----
     * 放在这个 async 块里是因为整个测试文件只有这里会等 Promise（末尾统一 finish）。 */
    var chainCalls = [];
    var tr = await translateMod.translateText('hello', 'auto', 'zh-CN', {
      request: function (built) {
        chainCalls.push(built.url);
        if (built.url.indexOf('transmart') >= 0) return Promise.reject(new Error('模拟超时'));
        return Promise.resolve('{"errorCode":"0","translation":["你好"]}');
      }
    });
    eq('翻译失败后自动换下一个提供方', [tr.provider, tr.text, chainCalls.length], ['有道翻译', '你好', 2]);

    var allFail = null;
    try {
      await translateMod.translateText('hello', 'auto', 'zh-CN', {
        request: function () { return Promise.reject(new Error('断网')); }
      });
    } catch (e) { allFail = e; }
    ok('全部提供方失败时给出可读错误',
      !!allFail && /翻译服务不可用/.test(allFail.message) &&
      ['腾讯交互翻译', '有道翻译', 'Google 翻译', 'MyMemory'].every(function (l) {
        return String(allFail.detail || '').indexOf(l) >= 0;
      }),
      allFail && (allFail.message + ' | ' + allFail.detail));
  })().then(finish).catch(function (e) {
    fail++;
    console.log('  FAIL  JSON 格式化测试异常\n        ' + (e && e.stack || e));
    finish();
  });
})();

/* ---------------- 编码 / 换行 ---------------- */
section('换行符');
eq('侦测 CRLF', SAK.detectNewline('a\r\nb\r\nc'), 'CRLF');
eq('侦测 LF', SAK.detectNewline('a\nb\nc'), 'LF');
eq('侦测 CR', SAK.detectNewline('a\rb\rc'), 'CR');
eq('规范化', SAK.normalizeNewline('a\r\nb\rc\nd'), 'a\nb\nc\nd');
eq('写回 CRLF', SAK.applyNewline('a\nb', 'CRLF'), 'a\r\nb');

section('编码');
(function () {
  var s = '中文abc123';
  var b = SAK.encoding.encode(s, 'UTF-8');
  eq('UTF-8 往返', SAK.encoding.decode(b, 'UTF-8'), s);
  var b2 = SAK.encoding.encode(s, 'UTF-8BOM');
  ok('UTF-8 BOM 头', b2[0] === 0xEF && b2[1] === 0xBB && b2[2] === 0xBF);
  eq('UTF-8 BOM 侦测', SAK.encoding.detect(b2), 'UTF-8BOM');
  eq('UTF-8 BOM 解码', SAK.encoding.decode(b2, 'UTF-8BOM'), s);

  var jp = '日本語のテスト';
  var sj = SAK.encoding.encode(jp, 'SJIS');
  eq('Shift_JIS 往返', SAK.encoding.decode(sj, 'SJIS'), jp);
  ok('Shift_JIS 非 UTF-8', !SAK.encoding.isValidUtf8(sj));
  eq('Shift_JIS 侦测', SAK.encoding.detect(sj), 'SJIS');
  var eu = SAK.encoding.encode(jp, 'EUCJP');
  eq('EUC-JP 往返', SAK.encoding.decode(eu, 'EUCJP'), jp);

  var u16 = SAK.encoding.encode(s, 'UTF-16LE');
  eq('UTF-16LE 侦测', SAK.encoding.detect(u16), 'UTF-16LE');
  eq('UTF-16LE 往返', SAK.encoding.decode(u16, 'UTF-16LE'), s);

  ok('二进制判定', SAK.encoding.isBinary(new Uint8Array([1, 2, 0, 3])) === true);
  ok('文本判定', SAK.encoding.isBinary(new TextEncoder().encode('hello 世界')) === false);
  ok('只读编码标记', SAK.encodingInfo('GBK').write === false && SAK.encodingInfo('UTF-8').write === true);
})();

/* ---------------- 差分 ---------------- */
section('行级差分');
function hunkSummary(hunks) {
  return hunks.map(function (h) {
    return h.type + ':' + h.leftStart + '-' + h.leftEnd + '/' + h.rightStart + '-' + h.rightEnd;
  });
}

(function () {
  var r = SAK.diff.lines(['a', 'b', 'c'], ['a', 'b', 'c']);
  eq('完全相同 → 无差异块', r.hunks.length, 0);
  eq('相同行数统计', [r.equalCount, r.leftCount, r.rightCount], [3, 3, 3]);

  r = SAK.diff.lines(['a', 'b', 'c'], ['a', 'x', 'c']);
  eq('中间一行被改 → change 块', hunkSummary(r.hunks), ['change:1-2/1-2']);

  r = SAK.diff.lines(['a', 'b', 'c'], ['a', 'c']);
  eq('删除一行 → delete 块', hunkSummary(r.hunks), ['delete:1-2/1-1']);

  r = SAK.diff.lines(['a', 'c'], ['a', 'b', 'c']);
  eq('插入一行 → insert 块', hunkSummary(r.hunks), ['insert:1-1/1-2']);

  r = SAK.diff.lines(['a', 'b', 'c', 'd'], ['a', 'x', 'y', 'd']);
  eq('连续两行被改', hunkSummary(r.hunks), ['change:1-3/1-3']);

  r = SAK.diff.lines(['1', '2', '3', '4', '5'], ['1', '3', '5']);
  eq('多处删除', hunkSummary(r.hunks), ['delete:1-2/1-1', 'delete:3-4/2-2']);

  r = SAK.diff.lines([], ['a', 'b']);
  eq('左侧为空 → 全插入', hunkSummary(r.hunks), ['insert:0-0/0-2']);
  r = SAK.diff.lines(['a', 'b'], []);
  eq('右侧为空 → 全删除', hunkSummary(r.hunks), ['delete:0-2/0-0']);

  // 尾部多行（含末尾换行产生的空行）
  r = SAK.diff.lines(['a', 'b', 'c', ''], ['a', 'b', '']);
  eq('末尾行删除', hunkSummary(r.hunks), ['delete:2-3/2-2']);

  // 忽略行尾空白
  r = SAK.diff.lines(['a  ', 'b'], ['a', 'b'], { ignoreTrailingSpace: true });
  eq('忽略行尾空白后无差异', r.hunks.length, 0);
  r = SAK.diff.lines(['a  ', 'b'], ['a', 'b']);
  eq('不忽略时算差异', r.hunks.length, 1);

  // 忽略大小写
  r = SAK.diff.lines(['Hello'], ['hello'], { ignoreCase: true });
  eq('忽略大小写后无差异', r.hunks.length, 0);

  // 较大文件的性能与正确性
  var big1 = [], big2 = [];
  for (var i = 0; i < 2000; i++) { big1.push('line ' + i); big2.push('line ' + i); }
  big2[500] = 'CHANGED 500';
  big2.splice(1200, 0, 'INSERTED', 'INSERTED2');
  var t0 = Date.now();
  r = SAK.diff.lines(big1, big2);
  var ms = Date.now() - t0;
  ok('2000 行文件差分正确 (' + ms + 'ms)',
    hunkSummary(r.hunks).join(',') === 'change:500-501/500-501,insert:1200-1200/1200-1202',
    hunkSummary(r.hunks).join(','));
  ok('大文件差分耗时 < 1500ms', ms < 1500, ms + 'ms');
})();

section('行内词级差分');
(function () {
  var segs = SAK.diff.words('var a = 1;', 'var a = 2;');
  var del = segs.filter(function (s) { return s.type === 'del'; }).map(function (s) { return s.text; }).join('');
  var ins = segs.filter(function (s) { return s.type === 'ins'; }).map(function (s) { return s.text; }).join('');
  eq('找出被改的数字（左）', del, '1');
  eq('找出被改的数字（右）', ins, '2');

  var same = SAK.diff.words('abc', 'abc');
  eq('完全相同的行', [same.length, same[0].type], [1, 'equal']);

  segs = SAK.diff.words('aaa', 'zzz');
  eq('完全不同 → 整块替换', segs.map(function (s) { return s.type; }), ['del', 'ins']);

  segs = SAK.diff.words('foo bar baz', 'foo qux baz');
  var changed = segs.filter(function (s) { return s.type !== 'equal'; });
  eq('只有中间词不同', changed.map(function (s) { return s.type + '=' + s.text; }), ['del=bar', 'ins=qux']);
})();

/* ---------------- 大小写 / 标点 / 批量替换 ---------------- */
section('大小写转换');
(function () {
  var r = SAK.textops.toUpper('hello World 123 中文');
  eq('小写转大写', r.text, 'HELLO WORLD 123 中文');
  eq('只数真正改动的字符', r.count, 9);

  r = SAK.textops.toLower('Hello WORLD 123 中文');
  eq('大写转小写', r.text, 'hello world 123 中文');
  eq('大写转小写的改动数', r.count, 6);

  eq('本来就全大写 → 0 处改动', SAK.textops.toUpper('ABC').count, 0);
  eq('没有字母 → 0 处改动', SAK.textops.toUpper('123，。！').count, 0);
  eq('空字符串不报错', SAK.textops.toUpper('').text, '');
})();

section('中英标点 / 全角半角转换');
(function () {
  var r = SAK.textops.convertPunctuation('你好，世界！这是“测试”（第一行）。', 'zh2en');
  eq('中 → 英标点', r.text, '你好,世界!这是"测试"(第一行).');
  ok('中 → 英有改动计数', r.count > 0, r.count);

  r = SAK.textops.convertPunctuation('Hello, world! This is a test.', 'en2zh');
  eq('英 → 中标点', r.text, 'Hello， world！ This is a test。');

  r = SAK.textops.convertPunctuation('圆周率是 3.14, 时间是 10:30。', 'en2zh');
  eq('小数点 / 千分位 / 时间里的标点原样保留', r.text, '圆周率是 3.14， 时间是 10:30。');

  r = SAK.textops.convertPunctuation('He said "hi" and don\'t worry.', 'en2zh');
  eq('引号成对、撇号识别成 ’', r.text, 'He said “hi” and don’t worry。');

  r = SAK.textops.convertPunctuation('括号() 与 方括号[]', 'en2zh');
  eq('圆括号方括号 → 中文括号', r.text, '括号（） 与 方括号【】');

  r = SAK.textops.convertPunctuation('省略号……和破折号——', 'zh2en');
  eq('省略号与破折号', r.text, '省略号...和破折号-');

  r = SAK.textops.convertPunctuation('ＡＢＣ １２３', 'zh2en', { alnum: true });
  eq('全角字母数字 → 半角（开了 alnum）', r.text, 'ABC 123');

  r = SAK.textops.convertPunctuation('ＡＢＣ，１２３', 'zh2en');
  eq('不开 alnum 时只动标点，字母数字留着', r.text, 'ＡＢＣ,１２３');

  r = SAK.textops.convertPunctuation('abc, def', 'en2zh', { alnum: true });
  eq('半角 → 全角（开了 alnum）', r.text, 'ａｂｃ， ｄｅｆ');
})();

section('批量文字替换');
(function () {
  var r = SAK.textops.batchReplace('foo foo', [{ find: 'foo', to: 'bar' }, { find: 'bar', to: 'baz' }], {});
  eq('多条规则按顺序依次应用', r.text, 'baz baz');
  eq('每条规则的命中数', r.perRule, [2, 2]);
  eq('总命中数', r.count, 4);

  r = SAK.textops.batchReplace('Foo foo', [{ find: 'foo', to: 'X' }], {});
  eq('默认忽略大小写', r.text, 'X X');

  r = SAK.textops.batchReplace('Foo foo', [{ find: 'foo', to: 'X' }], { caseSensitive: true });
  eq('区分大小写时只替换大小写一致的', r.text, 'Foo X');

  r = SAK.textops.batchReplace('a.b.c', [{ find: '.', to: '-' }], {});
  eq('普通模式里 . 是字面量（自动转义）', r.text, 'a-b-c');

  r = SAK.textops.batchReplace('a1b2', [{ find: '([a-z])(\\d)', to: '$2$1' }], { regex: true });
  eq('正则模式支持 $1 反向引用', r.text, '1a2b');

  r = SAK.textops.batchReplace('价格 $5 和 $6', [{ find: '$', to: '￥' }], {});
  eq('替换内容里的 $ 不会被当成反向引用', r.text, '价格 ￥5 和 ￥6');

  r = SAK.textops.batchReplace('a\nb', [{ find: '\\n', to: ' ' }], {});
  eq('查找框里可以用 \\n 表示换行', r.text, 'a b');

  r = SAK.textops.batchReplace('abc', [{ find: 'b', to: '' }], {});
  eq('替换为空就是删除', r.text, 'ac');

  r = SAK.textops.batchReplace('a', [{ find: '', to: 'x' }], {});
  eq('空规则被跳过', [r.text, r.count, r.perRule[0]], ['a', 0, 0]);

  var threw = false;
  try { SAK.textops.batchReplace('a', [{ find: '(', to: 'x' }], { regex: true }); } catch (e) { threw = true; }
  ok('非法正则会抛错（对话框据此提示第几条）', threw);

  eq('转义后的字面量正则', SAK.textops.escapeRegExp('a+b*c?'), 'a\\+b\\*c\\?');
  eq('首个差异位置', SAK.textops.firstDiff('abc', 'axc'), 1);
  eq('完全相同 → -1', SAK.textops.firstDiff('abc', 'abc'), -1);
  eq('前缀相同但更长 → 长度位置', SAK.textops.firstDiff('abc', 'abcd'), 3);
})();

section('翻译方向判定与分块');
(function () {
  eq('纯英文 → 翻成中文', SAK.textops.detectTranslateTarget('Hello world, this is a test.'), 'zh-CN');
  eq('纯中文 → 翻成英文', SAK.textops.detectTranslateTarget('你好，这是一段中文。'), 'en');
  eq('中文里夹几个英文词 → 仍翻成英文',
    SAK.textops.detectTranslateTarget('请把这段文字翻译成 Hello World 那种写法。'), 'en');
  eq('英文里夹中文名字 → 仍翻成中文',
    SAK.textops.detectTranslateTarget('Li Hua (李华) is a student from China.'), 'zh-CN');
  eq('纯符号 → 默认翻成中文', SAK.textops.detectTranslateTarget('123 ??'), 'zh-CN');

  function rejoin(parts) {
    return parts.map(function (p, i) { return (i ? p.sep : '') + p.text; }).join('');
  }

  var parts = SAK.textops.splitForTranslate('第一行\n第二行', 100);
  eq('短文本只有一块', parts.length, 1);
  eq('块内容与分隔符', [parts[0].text, parts[0].sep], ['第一行\n第二行', '']);

  parts = SAK.textops.splitForTranslate('aaa\nbbb\nccc', 3);
  eq('按行分块', parts.map(function (p) { return p.text; }), ['aaa', 'bbb', 'ccc']);
  eq('行间分隔符是换行', parts.map(function (p) { return p.sep; }), ['', '\n', '\n']);

  parts = SAK.textops.splitForTranslate('abcdefg', 3);
  eq('超长单行硬切', parts.map(function (p) { return p.text; }), ['abc', 'def', 'g']);
  eq('硬切出来的块之间不加分隔符', parts.map(function (p) { return p.sep; }), ['', '', '']);

  var original = '第一行内容\n第二行内容\n第三行内容\n';
  eq('分块后拼回去 = 原文', rejoin(SAK.textops.splitForTranslate(original, 6)), original);
  eq('硬切分块拼回去 = 原文', rejoin(SAK.textops.splitForTranslate('a'.repeat(10), 3)), 'a'.repeat(10));
  eq('空字符串也有一块（避免调用方拿到空数组）', SAK.textops.splitForTranslate('').length, 1);
})();

section('翻译提供方：请求构造与响应解析（不联网）');
(function () {
  var T = translateMod;
  eq('目标语言归一化', [T.normalizeTarget('en'), T.normalizeTarget('zh-CN'), T.normalizeTarget('')], ['en', 'zh', 'zh']);
  eq('提供方顺序（国内可直连的排前面）', T.providers.map(function (p) { return p.name; }),
    ['tencent', 'youdao', 'google', 'mymemory']);

  var tencent = T.providerByName('tencent');
  var built = tencent.build('hello', 'auto', 'zh-CN');
  eq('腾讯接口是 POST', [built.method, built.url], ['POST', 'https://transmart.qq.com/api/imt']);
  ok('腾讯请求体包含待翻译文字与功能名',
    built.body.indexOf('hello') >= 0 && built.body.indexOf('auto_translation') >= 0, built.body);
  var parsed = tencent.parse('{"header":{"ret_code":"succ"},"auto_translation":["你好世界"],"src_lang":"en","tgt_lang":"zh"}');
  eq('腾讯响应解析', [parsed.text, parsed.from, parsed.to], ['你好世界', 'en', 'zh']);
  var bad = false;
  try { tencent.parse('{"header":{"ret_code":"fail"}}'); } catch (e) { bad = true; }
  ok('腾讯 ret_code 非 succ 时报错', bad);

  var youdao = T.providerByName('youdao');
  eq('有道响应解析（多行合并）', youdao.parse('{"errorCode":"0","translation":["你好","世界"]}').text, '你好\n世界');
  eq('有道请求 URL 带 Auto 方向', /from=Auto&to=Auto/.test(youdao.build('你好', 'auto', 'en').url), true);
  bad = false;
  try { youdao.parse('{"errorCode":"50"}'); } catch (e) { bad = true; }
  ok('有道错误码报错', bad);

  var google = T.providerByName('google');
  eq('Google 响应解析（多段拼接）',
    google.parse('[[["你好世界","hello world",null,null,10]],null,"en"]').text, '你好世界');
  bad = false;
  try { google.parse('{"unexpected":1}'); } catch (e) { bad = true; }
  ok('Google 返回格式异常时报错', bad);

  var mymemory = T.providerByName('mymemory');
  eq('MyMemory 响应解析',
    mymemory.parse('{"responseData":{"translatedText":"你好"},"responseStatus":200}').text, '你好');
  eq('MyMemory 按目标语决定语向', /langpair=zh-CN%7Cen/.test(mymemory.build('你好', 'auto', 'en').url), true);
  bad = false;
  try {
    mymemory.parse('{"responseData":{"translatedText":"QUERY LENGTH LIMIT EXCEEDED. MAX ALLOWED QUERY : 500 CHARS"}}');
  } catch (e) { bad = true; }
  ok('MyMemory 超长提示当成错误', bad);
})();

function finish() {
  console.log('\n========================================');
  console.log('  通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('========================================');
  process.exit(fail ? 1 : 0);
}
