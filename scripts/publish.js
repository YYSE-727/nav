'use strict';
/**
 * 导航站 · 发布脚本
 * ------------------------------------------------------------
 * 把本地改动提交到 git 并推送到 GitHub，Cloudflare Pages 会自动重新部署。
 *
 * 由「发布.cmd」双击调用；也可以在项目根目录手动执行：
 *     node scripts/publish.js
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const BAR = '='.repeat(50);

function title(text) {
  console.log('');
  console.log(BAR);
  console.log('  ' + text);
  console.log(BAR);
  console.log('');
}
function info(text) { console.log('  ' + text); }
function blank() { console.log(''); }

/* ---------- 找到可用的 git ---------- */
function findGit() {
  const candidates = [
    'git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe'
  ];
  for (let i = 0; i < candidates.length; i++) {
    const r = spawnSync(candidates[i], ['--version'], { encoding: 'utf8' });
    if (!r.error && r.status === 0) return candidates[i];
  }
  return null;
}

/* ---------- git 调用封装 ---------- */
const GIT = findGit();

function gitCapture(args) {
  // -c core.quotepath=false ：让中文文件名原样显示，而不是 \346\210\220 这种转义
  return spawnSync(GIT, ['-c', 'core.quotepath=false'].concat(args), {
    cwd: ROOT,
    encoding: 'utf8'
  });
}

function gitLive(args) {
  return spawnSync(GIT, ['-c', 'core.quotepath=false'].concat(args), {
    cwd: ROOT,
    stdio: 'inherit'
  });
}

/* ---------- 前置检查 ---------- */
if (!GIT) {
  title('发布失败：没有找到 git');
  info('这台电脑上还没安装 Git，无法推送到 GitHub。');
  info('安装地址：https://git-scm.com/download/win');
  info('装完之后，关掉本窗口，重新双击「发布.cmd」即可。');
  blank();
  process.exit(1);
}

const inside = gitCapture(['rev-parse', '--is-inside-work-tree']);
if (inside.status !== 0 || String(inside.stdout).trim() !== 'true') {
  title('发布失败：当前目录还不是 git 仓库');
  info('本地仓库还没建好，请先按部署说明完成 git init。');
  blank();
  process.exit(1);
}

title('导航站 · 发布上线');

/* ---------- 检查是不是忘了重新构建 ---------- */
const jsonPath = path.join(ROOT, 'data', 'sites.json');
const jsPath = path.join(ROOT, 'data', 'sites.js');
if (fs.existsSync(jsonPath) && fs.existsSync(jsPath)) {
  const tJson = fs.statSync(jsonPath).mtimeMs;
  const tJs = fs.statSync(jsPath).mtimeMs;
  if (tJson > tJs + 1000) {
    info('提醒：data/sites.json 比 data/sites.js 更新，');
    info('      说明改完数据之后还没重新构建，线上会看到旧数据。');
    info('      建议先关掉本窗口，双击「更新.cmd」构建一次再发布。');
    blank();
  }
}

/* ---------- 1/3 看改动 ---------- */
info('[1/3] 检查有哪些改动……');
blank();
const status = gitCapture(['status', '--short']);
const changed = String(status.stdout || '').split('\n').filter(function (l) {
  return l.trim().length > 0;
});

if (changed.length === 0) {
  info('（没有发现任何改动）');
} else {
  changed.forEach(function (l) {
    const mark = l.slice(0, 2);
    let label = '修改';
    if (mark.indexOf('?') === 0 || mark.indexOf('A') === 0) label = '新增';
    else if (mark.indexOf('D') === 0) label = '删除';
    else if (mark.indexOf('R') === 0) label = '改名';
    info('  [' + label + '] ' + l.slice(3));
  });
  blank();
  info('共 ' + changed.length + ' 处改动。');
}
blank();

/* ---------- 2/3 提交 ---------- */
info('[2/3] 提交到本地仓库……');
blank();

if (changed.length === 0) {
  info('没有新改动需要提交，直接尝试推送。');
  blank();
} else {
  const add = gitLive(['add', '-A']);
  if (add.status !== 0) {
    title('发布失败：暂存文件时出错');
    blank();
    process.exit(1);
  }
  const stamp = new Date().toLocaleString('zh-CN', { hour12: false });
  const commit = gitLive(['commit', '-m', '更新站点数据 ' + stamp]);
  if (commit.status !== 0) {
    blank();
    info('提交没有成功（可能是没有实际改动，或者 git 报了错）。');
    blank();
  }
}

/* ---------- 3/3 推送 ---------- */
info('[3/3] 推送到 GitHub……');
blank();
const push = gitLive(['push']);

blank();
if (push.status !== 0) {
  title('发布失败：推送没有成功');
  info('常见原因：');
  info('  · 网络不通 —— 稍等一会儿，重新双击本脚本再试一次');
  info('  · 弹出的 GitHub 登录窗口被关掉了 —— 重跑并完成登录');
  info('  · 远程仓库还没关联 —— 首次推送会遇到，先执行：');
  info('      git remote add origin https://github.com/你的用户名/仓库名.git');
  blank();
  process.exit(1);
}

title('发布成功');
info('代码已经推送到 GitHub，Cloudflare 大约 1 分钟后自动重新上线。');
info('稍等片刻，刷新你的网站地址就能看到最新内容。');
blank();
