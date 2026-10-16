'use strict';
/* =====================================================================
 * 导航站 · 添加网站向导   (scripts/add.js)
 * ---------------------------------------------------------------------
 * 交互式地把一个新站点写进 data/sites.json：自动补逗号、按项目规范生成
 * 完整记录，写完后顺手帮你校验并构建。
 *
 * 用法：
 *     双击项目根目录的「加网站.cmd」
 *     或手动执行       node scripts/add.js
 *
 * 其他参数：
 *     node scripts/add.js --help            显示帮助
 *     node scripts/add.js --dry-run         全部走一遍，但不写任何文件
 *     node scripts/add.js --file 新站.json  非交互：从一份简单 json 读入
 *     node scripts/add.js --file x.json --dry-run
 *
 * 铁律提醒：本脚本不替你编造任何功能描述。你只填核心信息，其余字段会写成
 * 「（待补充）」占位符，并在最后列出待补清单，等你访问官网核实后补全。
 * ===================================================================== */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const FILE_JSON = path.join(ROOT, 'data', 'sites.json');
const BACKUP_DIR = path.join(ROOT, '.workbuddy', 'backups');
const ASSETS_DIR = path.join(ROOT, 'assets');
const BUILD = path.join(ROOT, 'build.js');

const NOW = new Date();
const TODAY =
  NOW.getFullYear() + '-' +
  String(NOW.getMonth() + 1).padStart(2, '0') + '-' +
  String(NOW.getDate()).padStart(2, '0');

const PRICING = ['免费', '部分免费', '付费', '未知'];
const STATUS = ['通过', '待复核', '不予收录'];
const PLACE = '（待补充）';
const BAR = '━'.repeat(58);

/* =====================================================================
 * 一、输出小工具
 * ===================================================================== */
function line(s) { console.log('  ' + (s == null ? '' : s)); }
function blank() { console.log(''); }
function head(t) {
  blank();
  console.log(BAR);
  console.log('  ' + t);
  console.log(BAR);
  blank();
}
function ok(t) { console.log('  ✔ ' + t); }
function warn(t) { console.log('  ! ' + t); }
function bad(t) { console.log('  ✗ ' + t); }

/* =====================================================================
 * 二、数据小工具
 * ===================================================================== */
function readJson() {
  const raw = fs.readFileSync(FILE_JSON, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function normUrl(u) {
  return String(u || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

/* 从域名猜一个 id：https://www.iloveimg.com/zh-cn → iloveimg */
const PUBLIC_SUFFIX = ['com', 'net', 'org', 'cn', 'gov', 'edu', 'io', 'co', 'me', 'app', 'xyz', 'top', 'info', 'biz', 'tv', 'cc', 'dev', 'site', 'online', 'shop', 'fun'];
function slugFromUrl(u) {
  let host = String(u || '').replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
  host = host.replace(/^www\./, '');
  const parts = host.split('.').filter(Boolean);
  let cand = '';
  for (let i = 0; i < parts.length; i++) {
    if (PUBLIC_SUFFIX.indexOf(parts[i]) === -1) { cand = parts[i]; break; }
  }
  if (!cand) cand = parts[0] || 'site';
  cand = cand.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9]/.test(cand)) cand = 'site-' + cand;
  return cand || 'site';
}

/* 逗号分隔 → 数组（中英文逗号都认） */
function splitList(s) {
  return String(s || '')
    .split(/[,，、;；]+/)
    .map(x => x.trim())
    .filter(Boolean);
}

/* =====================================================================
 * 三、把新记录插进 sites.json
 * ---------------------------------------------------------------------
 * 用「括号配对扫描」精确定位 sites 数组的结尾，只做最小插入，
 * 完整保留你原本的排版（不会把 need_matches 压成多行、不会重排字段）。
 * 数组为空时也能正确处理。插入位置：数组末尾。
 * ===================================================================== */
function insertRecord(text, record) {
  const key = '"sites"';
  const ki = text.indexOf(key);
  if (ki === -1) throw new Error('在 data/sites.json 里没有找到 "sites" 字段');

  const bi = text.indexOf('[', ki);
  if (bi === -1) throw new Error('"sites" 后面没有找到左方括号 [');

  let depth = 0, inStr = false, escaping = false, end = -1;
  for (let i = bi; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (escaping) escaping = false;
      else if (ch === '\\') escaping = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) throw new Error('方括号不配对，data/sites.json 可能被改坏了');

  const inner = text.slice(bi + 1, end);
  let k = inner.length - 1;
  while (k >= 0 && /\s/.test(inner[k])) k--;

  const block = JSON.stringify(record, null, 2).split('\n').map(l => '    ' + l).join('\n');

  let newInner;
  if (k < 0) {
    // 空数组
    newInner = '\n' + block + '\n  ';
  } else {
    newInner = inner.slice(0, k + 1) + ',\n' + block + inner.slice(k + 1);
  }
  return text.slice(0, bi + 1) + newInner + text.slice(end);
}

/* =====================================================================
 * 四、按项目规范拼一条记录
 * ===================================================================== */
function buildRecord(a) {
  const rec = {};
  rec.id = a.id;
  rec.name = a.name;
  rec.url = a.url;
  rec.category = a.category;
  if (a.image) rec.image = a.image;
  rec.subcategories = a.subcategories.length ? a.subcategories : [PLACE];
  rec.tags = a.tags;
  rec.short_description = a.short;
  rec.full_description = PLACE;
  rec.use_cases = [PLACE];
  rec.target_users = [PLACE];
  rec.key_features = [PLACE];
  rec.pricing_model = a.pricing;
  rec.limitations = [PLACE];
  rec.pros = [PLACE];
  rec.cons = [PLACE];
  rec.recommendation_reason = PLACE;
  rec.verification_status = a.status;
  rec.verified_at = TODAY;
  rec.evidence_urls = [a.url];
  rec.notes = buildNotes(a);
  rec.need_matches = a.needMatch ? [a.needMatch] : [];
  return rec;
}

/* 待补字段清单（notes 里要写清，结尾也要提醒） */
const PLACEHOLDER_FIELDS = [
  ['full_description', '详细介绍'],
  ['use_cases', '适用场景'],
  ['target_users', '适合的用户'],
  ['key_features', '核心功能'],
  ['limitations', '使用限制'],
  ['pros', '有依据的优点'],
  ['cons', '有依据的缺点'],
  ['recommendation_reason', '推荐理由']
];

function buildNotes(a) {
  const filled = ['网址', '名称', '分类', '一句话简介'];
  if (a.tags.length) filled.push('标签');
  if (a.subcategories.length) filled.push('子分类');
  if (a.image) filled.push('图片');

  const pending = PLACEHOLDER_FIELDS.map(x => x[1]).join('、');

  let s = '【'+ TODAY +' 由添加向导录入】本记录目前只填了：' + filled.join('、') + '。' +
    '以下字段尚未核实、仍为「（待补充）」占位符：' + pending + '。';

  if (a.status === '通过') {
    s += '添加者确认已实际访问官网核实该站点存在且功能入口可用；';
  } else if (a.status === '待复核') {
    s += '添加者尚未完成核实，审核状态为「待复核」；';
  } else {
    s += '该条目标记为「不予收录」，不应出现在正式收录数据中；';
  }
  if (!a.needMatch) s += '需求—匹配记录也未填写；';
  s += '请访问官网逐项核实后补全这些内容，并把审核状态调整到与核实深度一致。';

  if (a.extraNotes) s = '［添加者备注］' + a.extraNotes + '　' + s;
  return s;
}

/* =====================================================================
 * 五、交互提问
 * ===================================================================== */
let rl = null;
const inQueue = [];
let waitingCb = null;
let inputEnded = false;

function openInput() {
  if (rl) return;
  inputEnded = false;
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: !!process.stdin.isTTY
  });
  rl.on('line', function (l) {
    if (waitingCb) { const cb = waitingCb; waitingCb = null; cb(l); }
    else inQueue.push(l);          // 一次粘进来多行时先排队，逐个消费
  });
  rl.on('close', function () {
    inputEnded = true;
    if (waitingCb) { const cb = waitingCb; waitingCb = null; cb(null); }
  });
}

function closeInput() {
  if (rl) { try { rl.close(); } catch (e) {} rl = null; }
}

/* 取一行输入。用队列而不是 rl.question，是为了让「一次粘贴多行 / 管道输入」
   也能一行一行按顺序被消费掉（rl.question 会把多余的行直接丢掉）。 */
function ask(prompt, def) {
  return new Promise(function (resolve) {
    const shown = (def != null && def !== '') ? prompt + ' [' + def + ']：' : prompt + '：';
    process.stdout.write('  ' + shown);
    const handle = function (raw) {
      if (raw === null) {
        blank();
        line('输入已结束，向导中止。没有写入任何文件。');
        closeInput();
        process.exit(0);
      }
      let ans = String(raw == null ? '' : raw).trim();
      if (ans === '' && def != null) ans = def;
      resolve(ans);
    };
    if (inQueue.length) { setImmediate(handle, inQueue.shift()); }
    else if (inputEnded) { setImmediate(handle, null); }
    else waitingCb = handle;
  });
}

async function askRequired(prompt, hint) {
  for (;;) {
    if (hint) line('   （' + hint + '）');
    const a = await ask(prompt);
    if (a) return a;
    warn('这项必须填。');
  }
}

async function choose(prompt, values, defVal) {
  for (;;) {
    blank();
    line(prompt);
    values.forEach(function (v, i) {
      line('     ' + (i + 1) + ') ' + v + (v === defVal ? '   ← 默认' : ''));
    });
    blank();
    const a = await ask('输入序号', defVal ? String(values.indexOf(defVal) + 1) : '1');
    const n = parseInt(a, 10);
    if (n >= 1 && n <= values.length) return values[n - 1];
    warn('请输入 1 到 ' + values.length + ' 之间的序号。');
  }
}

async function confirm(prompt, defYes) {
  const a = await ask(prompt + '（' + (defYes ? 'Y/n' : 'y/N') + '）', defYes ? 'y' : 'n');
  return /^y(es)?$/i.test(a);
}

/* =====================================================================
 * 六、主流程
 * ===================================================================== */
async function collect(J, prefill) {
  const cats = [];
  J.sites.forEach(function (s) { if (cats.indexOf(s.category) === -1) cats.push(s.category); });

  const a = {
    id: '', name: '', url: '', category: '', image: '',
    short: '', tags: [], subcategories: [],
    pricing: '未知', status: '待复核',
    extraNotes: '', needMatch: null
  };

  /* --- 1 网址 --- */
  blank();
  line('── 1/10　网址 ───────────────────────────────────────');
  for (;;) {
    const u = prefill && prefill.url ? prefill.url : await askRequired('网站网址', '必须以 http:// 或 https:// 开头，例：https://tinypng.com/');
    if (!/^https?:\/\/.+/i.test(u)) { bad('网址必须以 http:// 或 https:// 开头。'); continue; }
    const dup = J.sites.filter(function (s) { return normUrl(s.url) === normUrl(u); })[0];
    if (dup) {
      bad('这个网址已经收录过了：' + dup.name + '（id: ' + dup.id + '）');
      line('   同一服务的不同域名/镜像请合并成一条，不要重复收录。');
      if (prefill) return null;
      continue;
    }
    a.url = u;
    break;
  }

  /* --- 2 名称 --- */
  blank();
  line('── 2/10　网站名称 ───────────────────────────────────');
  {
    const n = prefill ? prefill.name : await askRequired('网站名称', '写官网上的正式名字，例：TinyPNG');
    const same = J.sites.filter(function (s) { return s.name === n; })[0];
    if (same) warn('已有同名记录（id: ' + same.id + '），确认不是重复收录再继续。');
    a.name = n;
  }

  /* --- 3 分类 --- */
  blank();
  line('── 3/10　功能分类 ───────────────────────────────────');
  line('   分类栏里的顺序由 data/sites.json 的 meta.category_order 控制；');
  line('   用了一个全新的分类名也没关系，网站横栏会自动多出一格。');
  blank();
  line('   现有分类：');
  cats.forEach(function (c, i) {
    const n = J.sites.filter(function (s) { return s.category === c; }).length;
    line('     ' + (i + 1) + ') ' + c + '（' + n + ' 个）');
  });
  line('     0) 新建一个分类');
  blank();
  {
    let chosen = null;
    if (prefill && prefill.category) {
      chosen = prefill.category;
      if (cats.indexOf(chosen) === -1) line('   数据里还没有「' + chosen + '」这个分类，将新建。');
    } else {
      for (;;) {
        const v = await ask('输入序号或直接输入分类名', '0');
        const idx = parseInt(v, 10);
        if (/^\d+$/.test(v) && idx > 0 && idx <= cats.length) { chosen = cats[idx - 1]; break; }
        if (v === '0') {
          const nn = await askRequired('新分类名', '例：音视频工具、效率办公');
          chosen = nn;
          ok('新分类「' + nn + '」将被使用。');
          break;
        }
        if (v) { chosen = v; break; }
        warn('请输入序号，或直接输入分类名，或输入 0 新建。');
      }
    }
    a.category = chosen;
    if (cats.indexOf(chosen) === -1) {
      blank();
      line('   新分类会自动出现在网站的「功能分类」横栏里（默认排在最后）。');
      line('   想让它在横栏里排到指定位置：把「' + chosen + '」加进 data/sites.json 的 meta.category_order 数组。');
      line('   想让它有更准确的分类说明：可改 build.js 顶部的 catNote（可选，不改也能跑）。');
    }
  }

  /* --- 4 id --- */
  blank();
  line('── 4/10　唯一标识 id ────────────────────────────────');
  line('   小写字母 / 数字 / 连字符，全局唯一，以后不会改（图片文件名也建议用它）。');
  {
    let guess = prefill && prefill.id ? prefill.id : slugFromUrl(a.url);
    const taken = J.sites.filter(function (s) { return s.id === guess; })[0];
    if (taken) guess = guess + '-2';
    for (;;) {
      const v = prefill ? guess : await ask('id', guess);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(v)) { bad('只能用英文小写字母、数字和连字符，且要以字母或数字开头。'); if (prefill) return null; continue; }
      if (J.sites.filter(function (s) { return s.id === v; })[0]) { bad('id「' + v + '」已被占用，换一个。'); if (prefill) return null; continue; }
      a.id = v;
      break;
    }
  }

  /* --- 5 一句话简介 --- */
  blank();
  line('── 5/10　一句话简介 ─────────────────────────────────');
  line('   会显示在卡片和轮播上，建议 60 字以内说清「它能干什么」。不要抄官网宣传语。');
  a.short = prefill ? prefill.short_description : await askRequired('一句话简介');
  if (a.short.length > 90) warn('有 ' + a.short.length + ' 字，卡片上会显得很长，建议压到 60 字以内。');

  /* --- 6 付费模式 --- */
  blank();
  line('── 6/10　付费模式 ───────────────────────────────────');
  if (prefill && prefill.pricing_model) {
    if (PRICING.indexOf(prefill.pricing_model) === -1) { bad('pricing_model 只能是 ' + PRICING.join(' / ')); return null; }
    a.pricing = prefill.pricing_model;
    line('   取自输入文件：' + a.pricing);
  } else {
    line('   免费 = 官方明确声明完全免费；部分免费 = 基础免费、完整使用要付费；未知 = 没核实清楚。');
    a.pricing = await choose('  选一个：', PRICING, '未知');
  }

  /* --- 7 审核状态 --- */
  blank();
  line('── 7/10　审核状态 ───────────────────────────────────');
  if (prefill && prefill.verification_status) {
    if (STATUS.indexOf(prefill.verification_status) === -1) { bad('verification_status 只能是 ' + STATUS.join(' / ')); return null; }
    a.status = prefill.verification_status;
    line('   取自输入文件：' + a.status);
  } else {
    line('   通过 = 你已实际访问官网核实；待复核 = 还没核实；不予收录 = 决定不收。');
    a.status = await choose('  选一个：', STATUS, '待复核');
  }
  if (a.status !== '通过') {
    blank();
    warn('按项目铁律，未核实的记录不应进入正式收录数据（data/sites.json）。');
    warn('建议先访官网核实功能与限制，再以「通过」状态录入。');
    if (!prefill) {
      if (!await confirm('   仍要以「' + a.status + '」状态写入吗？', false)) {
        blank();
        line('   已取消。核实完成后重新运行向导即可。');
        return null;
      }
    }
  }

  /* --- 8 标签 / 子分类 --- */
  blank();
  line('── 8/10　标签与子分类（可留空）───────────────────────');
  line('   标签 = 用户会拿来搜的词，例：图片压缩, 在线工具, 无需安装');
  if (prefill) {
    a.tags = Array.isArray(prefill.tags) ? prefill.tags.slice() : [];
    line('   取自输入文件：' + (a.tags.join('、') || '（无）'));
  } else {
    a.tags = splitList(await ask('标签（逗号分隔，可留空）'));
    if (a.tags.length > 14) warn('标签有 ' + a.tags.length + ' 个，过多会稀释筛选效果，建议 6—12 个。');
  }
  blank();
  line('   子分类 = 更细的归类，例：图片处理, 在线压缩');
  if (prefill) {
    a.subcategories = Array.isArray(prefill.subcategories) ? prefill.subcategories.slice() : [];
    line('   取自输入文件：' + (a.subcategories.join('、') || '（无）'));
  } else {
    a.subcategories = splitList(await ask('子分类（逗号分隔，可留空）'));
  }

  /* --- 9 图片 --- */
  blank();
  line('── 9/10　图片（可留空）───────────────────────────────');
  line('   图片放在项目的 assets 文件夹里。留空也能用：轮播会自动生成首字母大字设计卡片。');
  {
    let pic = prefill ? (prefill.image || '') : await ask('图片文件名（例：qidian.jpg）');
    if (pic) {
      pic = pic.replace(/^assets[\\/]/i, '');
      a.image = 'assets/' + pic;
      const abs = path.join(ROOT, 'assets', pic);
      if (fs.existsSync(abs)) ok('找到图片：assets/' + pic);
      else warn('assets/' + pic + ' 现在还不存在。先把图放进去再构建，否则会退回字母样式（构建时也会提醒一次）。');
    }
  }

  /* --- 10 备注 + 需求 --- */
  blank();
  line('── 10/10　核实备注与需求匹配（可留空）─────────────────');
  line('   备注：写清你实际核实到哪一层、哪些没测。例：已访问首页确认功能入口；未登录实测。');
  a.extraNotes = prefill ? (prefill.notes || '') : await ask('核实备注');
  blank();
  line('   需求匹配：写一句「用户会怎么描述这个需求」，会生成一条需求—匹配记录。');
  line('   例：找一个免费、无需安装、能压缩图片的网站');
  {
    const need = prefill ? (prefill.need || '') : await ask('用户需求');
    if (need) {
      a.needMatch = {
        need: need,
        match_type: a.status === '通过' ? '已验证匹配' : '初步匹配',
        reason: '（待补充）填写你为什么判定它匹配这条需求的依据。'
      };
    }
  }

  return a;
}

/* 把 a 里的 id 等回填到 prefill 用不到的地方 */
function toRecord(a) { return buildRecord(a); }

/* =====================================================================
 * 七、写文件
 * ===================================================================== */
function backupFile() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = NOW.getFullYear() + String(NOW.getMonth() + 1).padStart(2, '0') + String(NOW.getDate()).padStart(2, '0') +
      '-' + String(NOW.getHours()).padStart(2, '0') + String(NOW.getMinutes()).padStart(2, '0') + String(NOW.getSeconds()).padStart(2, '0');
    const dest = path.join(BACKUP_DIR, 'sites-' + stamp + '.json');
    fs.copyFileSync(FILE_JSON, dest);
    return dest;
  } catch (e) {
    return null;
  }
}

function runNode(args) {
  return spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
}

/* =====================================================================
 * 八、帮助
 * ===================================================================== */
const HELP = [
  '',
  '导航站 · 添加网站向导',
  '',
  '  node scripts/add.js                交互式添加一个网站（推荐双击「加网站.cmd」）',
  '  node scripts/add.js --dry-run      全部走一遍但不写文件，先熟悉流程',
  '  node scripts/add.js --file x.json  非交互：从简单 json 读入',
  '  node scripts/add.js --help         显示本帮助',
  '',
  '  --file 的 json 只要这些键（其余会自动补占位符）：',
  '    {',
  '      "url": "https://example.com/",',
  '      "name": "网站名称",',
  '      "category": "分类名",',
  '      "short_description": "一句话简介",',
  '      "pricing_model": "免费 | 部分免费 | 付费 | 未知",',
  '      "verification_status": "通过 | 待复核 | 不予收录",',
  '      "tags": ["标签1", "标签2"],',
  '      "subcategories": ["子分类"],',
  '      "image": "qidian.jpg",',
  '      "notes": "核实到什么程度",',
  '      "need": "用户会怎么描述这个需求"',
  '    }',
  '',
  '添加位置：data/sites.json 的 sites 数组末尾（原排版会被完整保留）。',
  '写完会自动执行 node build.js --check，通过后询问是否直接构建。',
  ''
].join('\n');

/* =====================================================================
 * 九、入口
 * ===================================================================== */
async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.indexOf('--dry-run') !== -1;
  const fileIdx = argv.indexOf('--file');

  if (argv.indexOf('--help') !== -1 || argv.indexOf('-h') !== -1) { console.log(HELP); return; }

  if (!fs.existsSync(FILE_JSON)) {
    bad('找不到 ' + FILE_JSON);
    line('请确认本脚本在项目的 scripts 目录里，且 data/sites.json 存在。');
    process.exitCode = 1;
    return;
  }

  let J;
  try {
    J = readJson();
  } catch (e) {
    head('无法读取 data/sites.json');
    bad(e.message);
    line('先用编辑器里的 JSON 校验功能定位问题，修好再运行向导。');
    process.exitCode = 1;
    return;
  }
  if (!Array.isArray(J.sites)) { bad('data/sites.json 里的 "sites" 不是数组。'); process.exitCode = 1; return; }

  let prefill = null;
  if (fileIdx !== -1) {
    const p = argv[fileIdx + 1];
    if (!p) { bad('--file 后面要跟一个 json 文件的路径。'); process.exitCode = 1; return; }
    const abs = path.isAbsolute(p) ? p : path.join(process.cwd(), p);
    if (!fs.existsSync(abs)) { bad('找不到文件：' + abs); process.exitCode = 1; return; }
    try {
      prefill = JSON.parse(fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) { bad('那个 json 读不了：' + e.message); process.exitCode = 1; return; }
    if (!prefill || !prefill.url) { bad('输入文件里必须有 url 字段。'); process.exitCode = 1; return; }
    if (!prefill.name) { bad('输入文件里必须有 name 字段（网站名称）。'); process.exitCode = 1; return; }
    if (!prefill.short_description && !prefill.short) { bad('输入文件里必须有 short_description 字段（一句话简介）。'); process.exitCode = 1; return; }
    prefill.short_description = prefill.short_description || prefill.short;
    prefill.verification_status = prefill.verification_status || '待复核';
    prefill.pricing_model = prefill.pricing_model || '未知';
    prefill.notes = prefill.notes || '';
  }

  const interactive = !prefill;

  if (interactive) {
    head('导航站 · 添加网站向导');
    line('我会问你 10 组问题，只填核心信息即可，其余字段会写成「（待补充）」占位符，');
    line('等你访问官网核实后补全。整个过程约 1 分钟。');
    line('随时按 Ctrl+C 退出，不会写入任何东西。');
    if (dryRun) { blank(); warn('当前是 --dry-run 试用模式：走完全流程，但不会写任何文件。'); }
    if (!process.stdin.isTTY) {
      blank();
      warn('检测到标准输入不是终端（例如被管道接了）。如果这里卡住不动，');
      warn('请关掉本窗口，直接双击项目根目录的「加网站.cmd」。');
    }
    openInput();
    process.on('SIGINT', function () { blank(); line('已取消，未写入任何文件。'); process.exit(0); });
  }

  let a = null;
  try {
    a = await collect(J, prefill);
  } catch (e) {
    closeInput();
    throw e;
  }
  if (!a) { closeInput(); process.exitCode = prefill ? 1 : 0; return; }

  const rec = toRecord(a);

  head('请确认这条记录');
  console.log(JSON.stringify(rec, null, 2).split('\n').map(function (l) { return '  ' + l; }).join('\n'));
  blank();

  /* 待补清单 */
  const pendingLabels = PLACEHOLDER_FIELDS.map(function (x) { return x[1]; });
  if (!a.subcategories.length) pendingLabels.unshift('子分类');
  if (!a.tags.length) pendingLabels.unshift('标签');
  if (!a.needMatch) pendingLabels.push('需求—匹配记录');

  if (pendingLabels.length) {
    line('仍待补充的字段：' + pendingLabels.join('、'));
    line('（它们在网站上都显示为「（待补充）」，提醒你回来补。不算错误，构建不会失败。）');
    blank();
  }
  if (a.image && !fs.existsSync(path.join(ROOT, 'assets', a.image.replace(/^assets[\\/]/i, '')))) {
    warn('图片 assets/' + a.image.replace(/^assets[\\/]/i, '') + ' 还不存在，构建时会提醒一次，网站会退回字母样式。');
    blank();
  }

  if (dryRun) {
    closeInput();
    head('试用结束（未写入）');
    line('去掉 --dry-run 再跑一次，或直接双击「加网站.cmd」，才会真正写进 data/sites.json。');
    return;
  }

  if (interactive) {
    if (!await confirm('确认写入 data/sites.json？', true)) {
      closeInput();
      blank();
      line('已取消，未写入任何文件。');
      return;
    }
  }

  /* ---- 备份 + 写入 ---- */
  const raw = fs.readFileSync(FILE_JSON, 'utf8');
  let next;
  try {
    next = insertRecord(raw.replace(/^\uFEFF/, ''), rec);
  } catch (e) {
    closeInput();
    head('写入失败');
    bad(e.message);
    line('没有改动 data/sites.json。');
    process.exitCode = 1;
    return;
  }

  try { JSON.parse(next); } catch (e) {
    closeInput();
    head('写入失败：插入后 JSON 不合法（已中止，原文件未改）');
    bad(e.message);
    process.exitCode = 1;
    return;
  }

  const bak = backupFile();
  fs.writeFileSync(FILE_JSON, next, 'utf8');

  head('已写入');
  ok('data/sites.json 新增 1 条记录：' + rec.name + '（' + rec.id + '）');
  if (bak) ok('原文件已备份到 .workbuddy/backups/' + path.basename(bak));
  blank();

  /* ---- 校验 + 构建 ---- */
  line('正在校验……');
  blank();
  const chk = runNode([BUILD, '--check']);
  blank();
  if (chk.status !== 0) {
    closeInput();
    warn('校验没通过。上面列出的问题改完后，双击「更新.cmd」重新构建即可。');
    warn('（记录已经写进 data/sites.json 了，不用重新添加。）');
    process.exitCode = 1;
    return;
  }

  ok('校验通过。');
  blank();

  let doBuild = true;
  if (interactive) {
    doBuild = await confirm('现在生成 data/sites.js 和四份成果文档吗？', true);
  }
  closeInput();

  if (doBuild) {
    blank();
    const b = runNode([BUILD]);
    if (b.status !== 0) { warn('构建失败，请按上面的提示处理。'); process.exitCode = 1; return; }
  } else {
    blank();
    line('跳过构建。稍后双击「更新.cmd」即可。');
  }

  head('下一步');
  line('双击「发布.cmd」提交并推送，Cloudflare 大约 1 分钟后自动上线。');
  if (pendingLabels.length) {
    blank();
    line('别忘了：上面列出的「待补充」字段补完后，重新跑一次「更新.cmd」+「发布.cmd」。');
  }
  blank();
}

main().catch(function (e) {
  blank();
  bad('出错了：' + (e && e.message ? e.message : e));
  process.exitCode = 1;
});
