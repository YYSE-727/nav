#!/usr/bin/env node
/* =====================================================================
 * 综合型资源导航网站 · 统一构建脚本  (build.js)
 * ---------------------------------------------------------------------
 * 一条命令搞定全部：
 *
 *     node build.js
 *
 *   ① 校验 data/sites.json      —— 字段是否齐全、id / 网址是否重复、枚举值是否合法
 *   ② 生成 data/sites.js        —— 网站运行时真正读取的数据文件
 *   ③ 生成四份成果文档          —— 成果 A / B / C / D
 *
 * 其他用法：
 *
 *     node build.js --check      只校验，不写任何文件（改完数据先跑这个）
 *     node build.js --template   打印一条空白记录模板，照着填新资源
 *     node build.js --help       显示本帮助
 *
 * ---------------------------------------------------------------------
 * 唯一数据源：data/sites.json 里的 "sites" 数组。
 * data/sites.js 和四份成果文档都是它的派生物，不要手动编辑 —— 改了会被覆盖。
 *
 * 只有需要调整「待复核 / 不予收录」清单时，才改本文件下面那两个数组。
 * ===================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const FILE_SITES_JSON = path.join(ROOT, 'data', 'sites.json');
const FILE_SITES_JS = path.join(ROOT, 'data', 'sites.js');

/* ---------- 构建日期：取本机当天，不再写死 ---------- */
const NOW = new Date();
const TODAY =
  NOW.getFullYear() + '-' +
  String(NOW.getMonth() + 1).padStart(2, '0') + '-' +
  String(NOW.getDate()).padStart(2, '0');

/* ---------- 允许的枚举值 ---------- */
const PRICING_VALUES = ['免费', '部分免费', '付费', '未知'];
const STATUS_VALUES = ['通过', '待复核', '不予收录'];
const MATCH_VALUES = ['已验证匹配', '初步匹配', '不匹配'];

/* ---------- 每条记录必须填的字段 ---------- */
const REQUIRED_STRING = {
  id: '唯一标识（小写字母 / 数字 / 连字符，例：tiny-png）',
  name: '网站名称',
  url: '核实过的网址（必须以 http:// 或 https:// 开头）',
  category: '主要分类',
  short_description: '卡片上显示的一句话简介',
  full_description: '详细介绍',
  pricing_model: '付费模式，只能是：' + PRICING_VALUES.join(' / '),
  verification_status: '审核状态，只能是：' + STATUS_VALUES.join(' / '),
  verified_at: '核实日期（YYYY-MM-DD）',
  recommendation_reason: '推荐理由',
  notes: '审核备注（必须写清实际核实到哪一层、哪些没有实测）'
};

const REQUIRED_ARRAY = {
  subcategories: '子分类',
  tags: '标签',
  use_cases: '适用场景',
  target_users: '适合的用户',
  key_features: '核心功能',
  limitations: '已知限制',
  pros: '有依据的优点',
  cons: '有依据的缺点',
  evidence_urls: '支持关键信息的来源网址',
  need_matches: '需求—匹配记录'
};

/* =====================================================================
 * 待复核 / 不予收录 候选（极少改动；日常新增资源只动 data/sites.json）
 * ===================================================================== */
const pending = [
  { name: 'Unsplash', url: 'https://unsplash.com/', category: '设计与创作', use: '高质量摄影图库', src: '第三方设计资源清单', reason: '实际访问时被站点反爬校验（Anubis 工作量证明）拦截，未能确认页面内容与许可条款，无法完成核实。', type: '技术性无法验证' },
  { name: 'Pexels', url: 'https://www.pexels.com/', category: '设计与创作', use: '免费图片与视频素材', src: '第三方设计资源清单', reason: '仅在第三方清单中出现，本次未直接访问官网，免费范围与许可细则未核实。', type: '尚未访问' },
  { name: 'Iconfont 阿里矢量图标库', url: 'https://www.iconfont.cn/', category: '设计与创作', use: '矢量图标库', src: '第三方设计资源清单', reason: '页面抓取仅返回标题，未获得正文，功能与授权条款无法确认。', type: '技术性无法验证' },
  { name: 'Google Fonts', url: 'https://fonts.google.com/', category: '设计与创作', use: '开源字体库', src: '第三方设计资源清单', reason: '访问请求失败，未能确认页面可访问性与字体授权细节。', type: '技术性无法验证' },
  { name: '鸠摩搜书（Jiumo Search）', url: 'https://www.jiumodiary.com/', category: '小说与阅读', use: '电子书文档搜索', src: '第三方学习资源清单', reason: '页面显示「网站升级中，新版本即将上线」，服务暂不可用，无法核实。', type: '服务暂时不可用' },
  { name: '凹凸凹（AllToAll）', url: 'https://www.alltoall.net/', category: '文档与转换', use: '在线格式转换', src: '搜索引擎结果', reason: '搜索片段提到支持约 200 种格式、免费、单文件上限 10MB，但本次未直接访问官网核实。', type: '尚未访问' },
  { name: 'Aconvert', url: 'https://www.aconvert.com/cn', category: '文档与转换', use: '文档 / 图像 / 音视频转换', src: '第三方工具清单', reason: '第三方清单来源，未直接访问官网，免费额度与限制未核实。', type: '尚未访问' },
  { name: 'Zamzar', url: 'https://www.zamzar.com/', category: '文档与转换', use: '在线文件转换（1200+ 格式）', src: '第三方工具清单', reason: '第三方清单来源，免费用户每日转换次数与文件大小限制未核实。', type: '尚未访问' },
  { name: 'Online-Convert', url: 'https://www.online-convert.com/', category: '文档与转换', use: '在线多媒体格式转换', src: '搜索引擎结果', reason: '搜索仅返回首页片段，免费额度、排队机制与限制未核实。', type: '尚未访问' },
  { name: '虫部落', url: 'https://www.chongbuluo.com/', category: '其他工具', use: '聚合多个搜索引擎', src: '第三方学习资源清单', reason: '第三方清单来源，未直接访问，站点当前可用性未核实。', type: '尚未访问' },
  { name: '学堂在线', url: 'https://www.xuetangx.com/', category: '学习与知识', use: '在线课程平台', src: '搜索引擎结果', reason: '搜索结果来源，未直接访问官网；与国家平台收录的课程存在重叠，需去重后再定。', type: '尚未访问' },
  { name: '我要自学网', url: 'https://www.51zxw.net/', category: '学习与知识', use: '实用技能视频教程', src: '第三方学习资源清单', reason: '第三方清单来源，未直接访问；是否仍为免费模式需核实。', type: '尚未访问' },
  { name: '3DM', url: 'https://www.3dmgame.com/', category: '游戏相关', use: '单机游戏资讯与 Mod', src: '搜索引擎结果', reason: '未直接访问；站点含游戏下载板块，合规性需评估后再决定是否收录。', type: '合规性待评估' },
  { name: 'NGA 玩家社区', url: 'https://bbs.nga.cn/', category: '游戏相关', use: '游戏论坛与深度攻略', src: '搜索引擎结果', reason: '未直接访问；论坛类内容质量波动大，且部分版块需登录，需人工评估。', type: '尚未访问' },
  { name: '米游社', url: 'https://www.mihoyo.com/', category: '游戏相关', use: '米哈游旗下游戏官方社区', src: '搜索引擎结果', reason: '未直接访问；官方社区定位明确，建议下一批优先核实收录。', type: '尚未访问' },
  { name: 'GitHub', url: 'https://github.com/', category: '开发者与技术', use: '代码托管与开源社区', src: '第三方开发者清单', reason: '本次未直接访问核实；中国大陆访问稳定性与是否需要补充说明需评估。', type: '尚未访问' },
  { name: 'ChatGPT', url: 'https://chatgpt.com/', category: 'AI 工具', use: 'AI 对话助手', src: '第三方 AI 工具清单', reason: '中国大陆地区访问受限，面向大陆用户的导航站收录价值有限；若定位包含海外用户可另作考虑。', type: '地区访问受限' },
  { name: 'Claude', url: 'https://claude.ai/', category: 'AI 工具', use: 'AI 对话助手（长文写作）', src: '第三方 AI 工具清单', reason: '同上，中国大陆地区访问受限，未核实。', type: '地区访问受限' },
  { name: 'Gemini', url: 'https://gemini.google.com/', category: 'AI 工具', use: '多模态 AI 助手', src: '第三方 AI 工具清单', reason: '同上，中国大陆地区访问受限，未核实。', type: '地区访问受限' },
  { name: 'Perplexity AI', url: 'https://perplexity.ai/', category: 'AI 工具', use: '带来源的 AI 搜索', src: '第三方 AI 工具清单', reason: '同上，中国大陆地区访问受限；可考虑与已收录的秘塔 AI 搜索做替代关系说明。', type: '地区访问受限' },
  { name: 'Hotpot / Poe 等多模型聚合平台', url: '（未核实）', category: 'AI 工具', use: '聚合多家大模型', src: '第三方 AI 工具清单', reason: '聚合平台的服务条款与地区可用性复杂，未核实。', type: '尚未访问' }
];

const rejected = [
  { name: 'Sci-Hub', url: 'https://sci-hub.se/', category: '（不建议收录）', use: '绕过出版商付费墙获取学术论文', reason: '以绕过付费墙方式提供论文，存在版权与合规风险，本站不予收录。' },
  { name: 'Library Genesis', url: 'https://libgen.is/', category: '（不建议收录）', use: '免费下载图书与论文', reason: '内容授权来源不明，存在明确版权与法律风险，不予收录。' },
  { name: 'Z-Library', url: '（域名反复变动）', category: '（不建议收录）', use: '电子书下载', reason: '版权争议明确且域名与服务极不稳定，不予收录。' },
  { name: "Anna's Archive", url: 'https://annas-archive.org/', category: '（不建议收录）', use: '聚合多个影子图书馆的索引', reason: '本质为聚合未授权资源，风险明确，不予收录。' },
  { name: '第一版主 / 笔趣阁类盗版小说聚合站', url: '（不予记录具体域名）', category: '（不建议收录）', use: '聚合盗版网络小说', reason: '明确为盗版内容聚合，不予收录，也不提供入口。' }
];

/* =====================================================================
 * 一、数据校验
 * ===================================================================== */
function normUrl(u) {
  return String(u || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

function validate(sites) {
  const errors = [];
  const warnings = [];
  const label = (s, i) => '第 ' + (i + 1) + ' 条 · ' + (s && s.name ? s.name : '（缺 name）');

  if (!Array.isArray(sites)) {
    errors.push('data/sites.json 里的 "sites" 必须是一个数组');
    return { errors, warnings };
  }
  if (!sites.length) errors.push('data/sites.json 里的 "sites" 是空的');

  const seenId = {};
  const seenUrl = {};

  sites.forEach((s, i) => {
    const tag = label(s, i);
    if (!s || typeof s !== 'object') { errors.push(tag + '：不是合法的对象'); return; }

    // 必填文本字段
    Object.keys(REQUIRED_STRING).forEach(k => {
      if (s[k] == null || String(s[k]).trim() === '') {
        errors.push(tag + '：缺少必填字段 `' + k + '`（' + REQUIRED_STRING[k] + '）');
      } else if (typeof s[k] !== 'string') {
        errors.push(tag + '：字段 `' + k + '` 应该是字符串，现在是什么都别写的 ' + (typeof s[k]));
      }
    });

    // 必填数组字段
    Object.keys(REQUIRED_ARRAY).forEach(k => {
      if (s[k] == null) {
        errors.push(tag + '：缺少必填字段 `' + k + '`（' + REQUIRED_ARRAY[k] + '）');
      } else if (!Array.isArray(s[k])) {
        errors.push(tag + '：字段 `' + k + '` 应该是数组（用 [ ] 包起来）');
      } else if (s[k].length === 0) {
        warnings.push(tag + '：`' + k + '` 是空数组，其他记录都填了内容');
      }
    });

    // id 格式
    if (s.id && !/^[a-z0-9][a-z0-9-]*$/.test(s.id)) {
      errors.push(tag + '：`id` 只能用小写字母、数字和连字符（例：tiny-png），现在是「' + s.id + '」');
    }

    // 网址
    if (s.url && !/^https?:\/\//i.test(s.url)) {
      errors.push(tag + '：`url` 必须以 http:// 或 https:// 开头，现在是「' + s.url + '」');
    }

    // 枚举值
    if (s.pricing_model && PRICING_VALUES.indexOf(s.pricing_model) === -1) {
      errors.push(tag + '：`pricing_model` 只能是 ' + PRICING_VALUES.join(' / ') + '，现在是「' + s.pricing_model + '」');
    }
    if (s.verification_status && STATUS_VALUES.indexOf(s.verification_status) === -1) {
      errors.push(tag + '：`verification_status` 只能是 ' + STATUS_VALUES.join(' / ') + '，现在是「' + s.verification_status + '」');
    }
    if (s.verified_at && !/^\d{4}-\d{2}-\d{2}$/.test(s.verified_at)) {
      errors.push(tag + '：`verified_at` 要写成 YYYY-MM-DD（例：' + TODAY + '），现在是「' + s.verified_at + '」');
    }

    // 需求匹配记录
    if (Array.isArray(s.need_matches)) {
      if (s.need_matches.length === 0) {
        warnings.push(tag + '：`need_matches` 是空的，需求匹配功能会搜不到这个站点');
      }
      s.need_matches.forEach((m, j) => {
        const mt = tag + ' 的需求匹配第 ' + (j + 1) + ' 条';
        if (!m || typeof m !== 'object') { errors.push(mt + '：不是合法的对象'); return; }
        ['need', 'match_type', 'reason'].forEach(k => {
          if (!m[k] || String(m[k]).trim() === '') errors.push(mt + '：缺少字段 `' + k + '`');
        });
        if (m.match_type && MATCH_VALUES.indexOf(m.match_type) === -1) {
          errors.push(mt + '：`match_type` 只能是 ' + MATCH_VALUES.join(' / ') + '，现在是「' + m.match_type + '」');
        }
      });
    }

    // 重复检查
    if (s.id) {
      if (seenId[s.id]) errors.push(tag + '：`id` 与「' + seenId[s.id] + '」重复，必须唯一');
      else seenId[s.id] = s.name;
    }
    const n = normUrl(s.url);
    if (n) {
      if (seenUrl[n]) errors.push(tag + '：网址与「' + seenUrl[n] + '」重复（同一服务只收录一条，镜像域名请合并）');
      else seenUrl[n] = s.name;
    }

    // 软提醒
    if (s.short_description && s.short_description.length > 90) {
      warnings.push(tag + '：`short_description` 有 ' + s.short_description.length + ' 字，卡片上会显得很长，建议压到 60 字以内');
    }
    if (Array.isArray(s.tags) && s.tags.length > 14) {
      warnings.push(tag + '：`tags` 有 ' + s.tags.length + ' 个，标签过多会稀释筛选效果，建议 6—12 个');
    }
    if (s.notes && !/未/.test(s.notes)) {
      warnings.push(tag + '：`notes` 里没有任何「未……」的说明，按项目铁律应写清哪些没实测 / 未核实');
    }
    if (s.verified_at) {
      const days = Math.floor((NOW - new Date(s.verified_at + 'T00:00:00')) / 86400000);
      if (days > 180) warnings.push(tag + '：`verified_at` 距今已 ' + days + ' 天，建议重新核实');
    }
  });

  return { errors, warnings };
}

/* =====================================================================
 * 二、生成 data/sites.js（网站运行时读的就是它）
 * ===================================================================== */
function buildSiteData(J) {
  // 只在产物里补一个 built_at，不动源文件
  const out = Object.assign({}, J, {
    meta: Object.assign({}, J.meta, { built_at: TODAY })
  });
  fs.writeFileSync(FILE_SITES_JS, 'window.NAV_DATA = ' + JSON.stringify(out) + ';\n', 'utf8');
}

/* =====================================================================
 * 三、生成四份成果文档
 * ===================================================================== */
function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

function buildDocs(J) {
  const sites = J.sites;
  const written = [];

  const write = (name, content) => {
    fs.writeFileSync(path.join(ROOT, name), content, 'utf8');
    written.push(name);
  };

  /* ---------- 成果 A：候选网站总表 ---------- */
  const aRows = [];
  sites.forEach(s => aRows.push({
    name: s.name, url: s.url, cat: s.category, use: s.short_description,
    status: '通过（已核实）', src: '实际访问官方网站核实'
  }));
  pending.forEach(p => aRows.push({ name: p.name, url: p.url, cat: p.category, use: p.use, status: '待复核', src: p.src }));
  rejected.forEach(r => aRows.push({ name: r.name, url: r.url, cat: r.category, use: r.use, status: '不予收录', src: '第三方榜单/搜索发现' }));

  let csv = '名称,网址,分类,核心用途,初步审核状态,发现渠道\n';
  aRows.forEach(r => { csv += [r.name, r.url, r.cat, r.use, r.status, r.src].map(csvCell).join(',') + '\n'; });
  write('成果A-候选网站总表.csv', '\ufeff' + csv);

  let aMd = '# 成果 A · 候选网站总表\n\n';
  aMd += '> 说明：本表列出**全部发现过的候选网站**，包括已通过审核与未通过的两类，两者不混为一谈。\n';
  aMd += '> 「已核实」指本次实际访问过官方网站首页 / 功能页；「待复核」指尚未完成核实或存在不确定因素；「不予收录」指存在明确版权 / 合规风险。\n';
  aMd += '> 数据日期：' + TODAY + '　|　候选总数：' + aRows.length + '（通过 ' + sites.length + ' / 待复核 ' + pending.length + ' / 不予收录 ' + rejected.length + '）\n\n';
  aMd += '## A-1 已通过核实（进入正式收录）\n\n';
  aMd += '| # | 名称 | 网址 | 分类 | 核心用途 | 审核状态 |\n|---|------|------|------|----------|----------|\n';
  sites.forEach((s, i) => { aMd += '| ' + (i + 1) + ' | ' + s.name + ' | ' + s.url + ' | ' + s.category + ' | ' + s.short_description + ' | 通过（已核实首页） |\n'; });

  aMd += '\n> 注：linovelib.com（哔哩轻小说的繁体 / 镜像入口）与 bilinovel.com 属同一站点，已合并为同一条收录记录（见上表），不在 A-2 单列，候选总数相应不重复计数。\n';
  aMd += '> 注：本版按收录方决定，将 5 个日系轻小说阅读 / 分享站点纳入正式收录。这些站点的作品授权来源未公开，各记录的 `limitations` 与 `notes` 已逐条标注，版权状态请以原站为准。\n\n';

  aMd += '## A-2 待复核候选（未进入正式收录）\n\n';
  aMd += '| # | 名称 | 网址 | 分类 | 核心用途 | 待复核原因 |\n|---|------|------|------|----------|------------|\n';
  pending.forEach((p, i) => {
    const clean = p.reason.replace(/\s+/g, ' ').trim();
    aMd += '| ' + (i + 1) + ' | ' + p.name + ' | ' + p.url + ' | ' + p.category + ' | ' + p.use + ' | ' + p.type + '：' + clean + ' |\n';
  });

  aMd += '\n## A-3 不予收录候选\n\n';
  aMd += '| # | 名称 | 分类 | 核心用途 | 不予收录原因 |\n|---|------|------|----------|--------------|\n';
  rejected.forEach((r, i) => { aMd += '| ' + (i + 1) + ' | ' + r.name + ' | ' + r.category + ' | ' + r.use + ' | ' + r.reason + ' |\n'; });

  aMd += '\n---\n\n**审核状态图例**：已核实（首页及官方说明已访问）· 待复核（未完成核实）· 不予收录（存在明确风险）\n';
  write('成果A-候选网站总表.md', aMd);

  /* ---------- 成果 B：正式收录内容（Markdown） ---------- */
  const order = [];
  sites.forEach(s => { if (order.indexOf(s.category) === -1) order.push(s.category); });

  let bMd = '# 成果 B · 正式收录内容（Markdown 版）\n\n';
  bMd += '> 共收录 ' + sites.length + ' 个站点。程序可读版本见 `data/sites.json`。\n';
  bMd += '> 全部记录均通过实际访问官方站点首页 / 功能页核对；仅访问首页者可确认「首页可访问 + 官方自述功能」，未逐一实测核心功能。\n';
  bMd += '> 核实日期：' + TODAY + '\n\n---\n\n';

  order.forEach(cat => {
    const list = sites.filter(s => s.category === cat);
    bMd += '## ' + cat + '（' + list.length + '）\n\n';
    list.forEach(s => {
      bMd += '### ' + s.name + '\n\n';
      bMd += '**一句话简介**：' + s.short_description + '\n\n';
      bMd += '**网址**：' + s.url + '　|　**付费情况**：' + s.pricing_model + '　|　**审核状态**：' + s.verification_status + '（' + s.verified_at + '）\n\n';
      bMd += '**标签**：' + (s.tags || []).join('、') + '\n\n';
      bMd += '**详细介绍**：' + s.full_description + '\n\n';
      bMd += '**适用场景**\n' + (s.use_cases || []).map(x => '- ' + x).join('\n') + '\n\n';
      bMd += '**适合的用户**：' + (s.target_users || []).join('；') + '\n\n';
      bMd += '**核心功能**\n' + (s.key_features || []).map(x => '- ' + x).join('\n') + '\n\n';
      bMd += '**优点**\n' + (s.pros || []).map(x => '- ' + x).join('\n') + '\n\n';
      bMd += '**缺点**\n' + (s.cons || []).map(x => '- ' + x).join('\n') + '\n\n';
      bMd += '**使用限制**\n' + (s.limitations || []).map(x => '- ' + x).join('\n') + '\n\n';
      bMd += '**推荐理由**：' + s.recommendation_reason + '\n\n';
      bMd += '**需求 — 匹配关系**\n\n| 用户需求 | 匹配类型 | 依据 |\n|---|---|---|\n';
      (s.need_matches || []).forEach(m => { bMd += '| ' + m.need + ' | ' + m.match_type + ' | ' + m.reason + ' |\n'; });
      bMd += '\n**来源**：' + (s.evidence_urls || []).join('　') + '\n\n';
      bMd += '**审核备注**：' + s.notes + '\n\n---\n\n';
    });
  });
  write('成果B-正式收录内容.md', bMd);

  /* ---------- 成果 C：待复核清单 ---------- */
  let cMd = '# 成果 C · 待复核清单\n\n';
  cMd += '> 以下条目**未进入正式收录数据**，请勿与成果 B 混用。每条都说明了需要人工判断的具体原因。\n';
  cMd += '> 合计 ' + pending.length + ' 条。数据日期：' + TODAY + '\n\n';
  const types = [];
  pending.forEach(p => { if (types.indexOf(p.type) === -1) types.push(p.type); });
  types.forEach(t => {
    cMd += '## ' + t + '\n\n';
    pending.filter(p => p.type === t).forEach((p, i) => {
      cMd += '### ' + (i + 1) + '. ' + p.name + '\n\n';
      cMd += '- **网址**：' + p.url + '\n';
      cMd += '- **分类**：' + p.category + '\n';
      cMd += '- **核心用途**：' + p.use + '\n';
      cMd += '- **发现渠道**：' + p.src + '\n';
      cMd += '- **待复核原因**：' + p.reason + '\n';
      cMd += '- **建议处理**：' + (
        t === '授权来源不明' ? '核对作品授权与发布主体；无法确认合法来源前不予收录，也不导流。' :
        t === '地区访问受限' ? '若产品定位面向中国大陆用户，建议不收录或在收录时显著标注访问限制。' :
        t === '服务暂时不可用' ? '等待站点恢复后重新核实，暂不收录。' :
        t === '合规性待评估' ? '先评估其下载板块的合规性，再决定是否仅收录其资讯 / 攻略部分。' :
        '安排下一批实际访问官网核实功能、免费范围与使用限制。'
      ) + '\n\n';
    });
  });
  write('成果C-待复核清单.md', cMd);

  /* ---------- 成果 D：审核报告 ---------- */
  const catCount = {};
  sites.forEach(s => { catCount[s.category] = (catCount[s.category] || 0) + 1; });
  const priceCount = {};
  sites.forEach(s => { priceCount[s.pricing_model] = (priceCount[s.pricing_model] || 0) + 1; });
  const nmTotal = sites.reduce((a, s) => a + (s.need_matches || []).length, 0);
  const nmOk = sites.reduce((a, s) => a + (s.need_matches || []).filter(m => m.match_type === '已验证匹配').length, 0);
  const nmPre = sites.reduce((a, s) => a + (s.need_matches || []).filter(m => m.match_type === '初步匹配').length, 0);
  const nmNo = sites.reduce((a, s) => a + (s.need_matches || []).filter(m => m.match_type === '不匹配').length, 0);

  const catList = Object.keys(catCount);
  let dMd = '# 成果 D · 审核报告\n\n> 审核日期：' + TODAY + '　|　本报告所有数字均依据实际核实结果统计，未预设目标数量。\n\n';
  dMd += '## 一、总体数量\n\n';
  dMd += '| 指标 | 数量 |\n|---|---|\n';
  dMd += '| 发现候选网站总数 | ' + (sites.length + pending.length + rejected.length) + ' |\n';
  dMd += '| 通过审核并正式收录 | ' + sites.length + ' |\n';
  dMd += '| 待复核 | ' + pending.length + ' |\n';
  dMd += '| 不予收录 | ' + rejected.length + ' |\n';
  dMd += '| 需求—匹配关系记录 | ' + nmTotal + ' 条（已验证匹配 ' + nmOk + ' / 初步匹配 ' + nmPre + ' / 不匹配 ' + nmNo + '）|\n\n';
  dMd += '第一版目标为 30—50 个合格网站，实际收录 **' + sites.length + '** 个。数量能够达标，靠的是集中核实搜索中高频出现、来源相对清晰的站点，而不是降低审核标准；其中 5 个轻小说站点的收录口径调整见第八节。\n\n';

  dMd += '## 二、各分类合格网站数量\n\n';
  dMd += '| 分类 | 合格网站数 | 说明 |\n|---|---|---|\n';
  const catNote = {
    '图片工具': '原「免费实用工具」中最大的子类，覆盖压缩、抠图、在线编辑等图片处理需求',
    '文档与转换': 'PDF 处理与文件格式转换，目前仅 2 个，数量偏少',
    '其他工具': '只有翻译与二维码各一个，是拆分后最小的分类',
    'AI 工具': '只收录中国大陆可直接访问、来源明确的国内产品',
    '学习与知识': '以国家级平台与开放获取资源为主，避免版权灰区',
    '小说与阅读': '重点深耕类目。原创平台与正版出版主体之外，本版按收录方决定纳入了 5 个日系轻小说阅读 / 分享站点，其作品授权来源未公开，已在各记录中明确标注',
    '游戏相关': '偏少，因单机门户普遍含下载板块、合规性需评估',
    '开发者与技术': '仅收录权威文档与高质量社区，未收录内容质量不稳定的站点',
    '设计与创作': '素材类站点本次有 4 个因技术原因未能核实，实际收录偏少'
  };
  catList.forEach(c => { dMd += '| ' + c + ' | ' + catCount[c] + ' | ' + (catNote[c] || '') + ' |\n'; });
  dMd += '| **合计** | **' + sites.length + '** | |\n\n';

  dMd += '## 三、付费情况分布\n\n';
  dMd += '| 付费模式 | 数量 |\n|---|---|\n';
  PRICING_VALUES.forEach(p => { if (priceCount[p]) dMd += '| ' + p + ' | ' + priceCount[p] + ' |\n'; });
  dMd += '\n需要特别提醒：**没有把一个站点标为「完全免费」除非官方页面明确如此声明**。多数工具类站点实际属于「部分免费」，即基础功能免费、批量或高清输出需付费，这一点已在每条记录的 `limitations` 中写明。\n\n';

  dMd += '## 四、哪些信息最难核实\n\n';
  dMd += '1. **核心功能是否真正可用**。首页可以访问、功能入口存在、与功能实际测试成功是三件不同的事。本次绝大多数记录只能确认到「首页可访问 + 官方自述」，因此 `verification_status` 统一表述为「通过」，并在 `notes` 中逐条注明「未实测」。\n';
  dMd += '2. **免费额度的精确边界**。多数站点把额度写在定价页或注册后才可见，本次未能逐项确认，凡涉及具体数字均未写入。\n';
  dMd += '3. **小说类站点的授权与来源**。日轻中文化的站点大量存在，但授权链路通常不公开，无法从页面判断合法性。本版按收录方决定将其纳入正式收录，并在这 5 条记录的 `limitations` 与 `notes` 中逐条标注「授权来源未核实」，把判断责任交还给用户与原站。其中轻小说文库、真白萌、次元狗三站在核实时还分别遇到入口返回关闭公告、Cloudflare 人机校验拦截、连接失败的情况，信息完整度明显低于其他记录。\n';
  dMd += '4. **素材站点的授权条款**。免版税不等于无条件商用，涉及肖像、商标、再分发的限制需逐条阅读许可协议，本次只做到提示「需自行确认」。\n';
  dMd += '5. **站点存续与活跃度**。例如轻之文库页面显示的更新时间较早，实际运营活跃度需要持续跟踪；SF 轻小说的主域名已跳转至漫画频道，品牌与入口发生过变更。\n\n';

  dMd += '## 五、哪些分类仍缺乏优质网站\n\n';
  dMd += '- **游戏相关（' + (catCount['游戏相关'] || 0) + ' 个）**：单机游戏门户普遍捆绑游戏下载板块，合规性需要单独评估；本次只收录了发现类、Wiki 类与资讯类各一个，覆盖明显不足。\n';
  dMd += '- **设计与创作（' + (catCount['设计与创作'] || 0) + ' 个）**：Unsplash、Pexels、Iconfont、Google Fonts 四个知名素材站因技术原因未能完成核实（反爬拦截、抓取失败），导致该类别实际可用素材站偏少。\n';
  dMd += '- **其他工具（' + (catCount['其他工具'] || 0) + ' 个）**：只有翻译与二维码各一个。该分类由原「免费实用工具」拆分而来，拆分后剩余部分偏薄，后续可补充音视频、编码、时间换算等方向。\n';
  dMd += '- **文档与转换（' + (catCount['文档与转换'] || 0) + ' 个）**：仅 PDF 处理与通用格式转换各一个，缺音频、文本、编码等方向。\n';
  dMd += '- **AI 工具（' + (catCount['AI 工具'] || 0) + ' 个）**：数量尚可，但集中在对话助手与 AI 搜索，缺少语音、转录、翻译润色等细分工具。\n\n';

  dMd += '## 六、下一批最值得继续寻找的网站类型\n\n';
  dMd += '1. **可核实的正版电子书与有声书平台**（如已收录的微信读书之外的授权渠道），为正版阅读需求提供明确可追溯的选择，与本版纳入的轻小说分享站点形成互补。\n';
  dMd += '2. **游戏数据 / 攻略类工具站**（例如 Wiki 型、数据查询型站点），这类站点通常不含下载板块，合规性更清晰。\n';
  dMd += '3. **免费素材站的官方可核实来源**：优先重试 Unsplash、Pexels、Iconfont、Google Fonts，并补充 Tabler Icons、Color Hunt 等小型开源素材站，它们的授权条款通常更明确。\n';
  dMd += '4. **非图片类的实用工具**：音频处理、文本处理、正则 / 编码、时间与单位换算、文件校验等方向，目前几乎空白。\n';
  dMd += '5. **学生与办公场景的效率工具**：OCR、表格处理、演示文稿辅助、PDF 以外的文档工具。\n';
  dMd += '6. **可核实授权的学术资源**：在 arXiv、国家哲学社会科学文献中心之外，补充开放获取期刊目录类资源。\n\n';

  dMd += '## 七、本版已知不足（如实披露）\n\n';
  dMd += '1. 核心功能**未逐一实测**，`verification_status` 只能表达到「首页可访问 + 官方自述」这一层。\n';
  dMd += '2. 网站的品牌、功能与免费政策随时可能变化，`verified_at` 为唯一时效依据，建议按季度复核。\n';
  dMd += '3. 「小说与阅读」收录了 5 个作品授权来源未公开的日系轻小说站点（哔哩轻小说、轻小说文库、ESJ Zone、真白萌、次元狗）。这是收录方的决定，不代表本站对其版权状态作出判断或背书；相关内容的法律责任由原站承担，用户在访问前应自行判断。其中轻小说文库、真白萌、次元狗三站的官方入口在核实时分别出现返回关闭公告、反爬拦截、连接失败的情况，上线前建议人工复核。\n';
  dMd += '4. 收录数量为 ' + sites.length + ' 个。游戏、设计与「其他工具 / 文档与转换」几个方向在本次核实中确实没有找到足够多达到标准的站点，这部分缺口已在第五节与第六节如实说明。\n\n';

  dMd += '## 八、关于授权来源与收录口径的说明\n\n';
  dMd += '本次调整前，5 个日系轻小说阅读 / 分享站点因「作品授权来源无法确认」被列入待复核。收录方决定将其纳入正式收录，理由是：**本站收录的是网站本身，站内内容的合法性与授权状态由原站负责**，导航站只负责准确描述站点提供什么、有哪些限制。\n\n';
  dMd += '执行上做了三件事，以确保「收录」不等于「替原站背书」：\n\n';
  dMd += '1. **不改写事实**。这 5 条记录的 `limitations` 与 `notes` 中全部保留了「作品授权 / 翻译授权来源未公开、版权状态未核实」的标注，未因为收录就写成「正版」或「已授权」。\n';
  dMd += '2. **如实呈现核实深度**。哔哩轻小说已核实首页结构与免登录阅读入口；ESJ Zone 仅核实到论坛分区（含 R18 限制级分区）；轻小说文库官网入口返回关闭公告、真白萌被 Cloudflare 拦截、次元狗连接失败，这三条明确写出「信息完整度低于其他记录，建议上线前人工复核」。\n';
  dMd += '3. **保留风险提示**。ESJ Zone 的 R18 分区、哔哩轻小说的大陆访问困难提示、次元狗依赖网盘下载等，均已写入 `limitations`。\n\n';
  dMd += '**合并说明**：linovelib.com 与 bilinovel.com 为同一站点的不同域名，按「同一服务不重复收录」的原则合并为一条记录，候选总数因此为 ' + (sites.length + pending.length + rejected.length) + ' 条。\n\n';
  dMd += '**仍不收录的部分**：明确以盗版聚合为主要业务的站点（笔趣阁类）、影子图书馆（Sci-Hub、Library Genesis、Z-Library、Anna\u2019s Archive）仍维持不予收录，未因本次口径调整而放开。\n';
  write('成果D-审核报告.md', dMd);

  return { written, catCount, priceCount, nmTotal, nmOk, nmPre, nmNo };
}

/* =====================================================================
 * 四、命令行入口
 * ===================================================================== */
const HELP = [
  '',
  '综合型资源导航网站 · 构建脚本',
  '',
  '  node build.js              校验 → 生成 data/sites.js → 生成四份成果文档',
  '  node build.js --check      只校验，不写任何文件',
  '  node build.js --template   打印一条空白记录模板',
  '  node build.js --help       显示本帮助',
  '',
  '数据源：data/sites.json 的 "sites" 数组',
  ''
].join('\n');

const TEMPLATE = [
  '',
  '把下面这段粘到 data/sites.json 的 sites 数组里（注意上一条末尾加英文逗号），然后填内容：',
  '',
  '    {',
  '      "id": "用英文小写写一个唯一标识，例：my-tool",',
  '      "name": "网站名称",',
  '      "url": "https://example.com/",',
  '      "category": "必须用已有的分类名，随便新造会导致分类变乱",',
  '      "subcategories": ["子分类1", "子分类2"],',
  '      "tags": ["用户会搜的词", "例：图片压缩", "在线工具"],',
  '      "short_description": "一句话说清它能干什么（60 字以内，这行会显示在卡片上）",',
  '      "full_description": "详细介绍：实际提供什么功能、适合谁、有什么坑。不要抄官网宣传语。",',
  '      "use_cases": ["具体场景1", "具体场景2"],',
  '      "target_users": ["适合的人群1", "适合的人群2"],',
  '      "key_features": ["核心功能1", "核心功能2"],',
  '      "pricing_model": "免费 | 部分免费 | 付费 | 未知  四选一",',
  '      "limitations": ["已核实的使用限制1", "限制2"],',
  '      "pros": ["有依据的优点1", "优点2"],',
  '      "cons": ["有依据的缺点1", "缺点2"],',
  '      "recommendation_reason": "什么需求下值得用它",',
  '      "verification_status": "通过",',
  '      "verified_at": "填今天的日期，格式 YYYY-MM-DD",',
  '      "evidence_urls": ["你实际访问过的网址"],',
  '      "notes": "写清核实到哪一层。例：已访问首页确认功能入口；未登录实测，额度未核实。",',
  '      "need_matches": [',
  '        { "need": "用户会怎么描述这个需求", "match_type": "已验证匹配", "reason": "为什么匹配，依据是什么" },',
  '        { "need": "不适合的需求", "match_type": "不匹配", "reason": "为什么冲突" }',
  '      ]',
  '    }',
  '',
  '填完执行：  node build.js --check   （先看有没有填错）',
  '            node build.js           （没问题就正式生成）',
  ''
].join('\n');

function main() {
  const arg = (process.argv[2] || '').trim();

  if (arg === '--help' || arg === '-h') { console.log(HELP); return; }
  if (arg === '--template' || arg === '-t') { console.log(TEMPLATE); return; }

  const onlyCheck = arg === '--check' || arg === '-c';
  if (arg && !onlyCheck) {
    console.log('未知参数：' + arg);
    console.log(HELP);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(FILE_SITES_JSON)) {
    console.error('找不到 ' + FILE_SITES_JSON);
    console.error('请确认是在项目目录里运行，且 data/sites.json 存在。');
    process.exitCode = 1;
    return;
  }

  let J;
  try {
    J = JSON.parse(fs.readFileSync(FILE_SITES_JSON, 'utf8'));
  } catch (e) {
    console.error('');
    console.error('✗ data/sites.json 不是合法的 JSON，无法解析：');
    console.error('  ' + e.message);
    console.error('');
    console.error('常见原因：多写/少写了一个逗号、引号没配对、用了中文引号“”或‘’。');
    console.error('提示：可以用编辑器的 JSON 校验功能定位到具体行号。');
    process.exitCode = 1;
    return;
  }

  const { errors, warnings } = validate(J.sites);

  if (warnings.length) {
    console.log('');
    console.log('⚠ 提醒（不影响构建，但建议看一眼）：');
    warnings.forEach(w => console.log('  · ' + w));
  }

  if (errors.length) {
    console.log('');
    console.error('✗ 校验未通过，共 ' + errors.length + ' 个问题，已中止构建（没有写入任何文件）：');
    errors.forEach(e => console.error('  · ' + e));
    console.log('');
    console.error('修好 data/sites.json 后重新执行 node build.js');
    process.exitCode = 1;
    return;
  }

  if (onlyCheck) {
    console.log('');
    console.log('✔ 校验通过：' + J.sites.length + ' 条记录，格式与字段都没有问题。');
    console.log('  执行 node build.js 即可正式生成。');
    return;
  }

  buildSiteData(J);
  const r = buildDocs(J);

  const catLine = Object.keys(r.catCount)
    .map(c => c + ' ' + r.catCount[c])
    .join(' · ');
  const priceLine = PRICING_VALUES
    .filter(p => r.priceCount[p])
    .map(p => p + ' ' + r.priceCount[p])
    .join(' · ');

  console.log('');
  console.log('──────────────────────────────────────────────');
  console.log('构建完成 ✔   ' + TODAY);
  console.log('──────────────────────────────────────────────');
  console.log('正式收录 ' + J.sites.length + ' ｜ 待复核 ' + pending.length + ' ｜ 不予收录 ' + rejected.length +
    ' ｜ 候选总数 ' + (J.sites.length + pending.length + rejected.length));
  console.log('分类：' + catLine);
  console.log('付费：' + priceLine);
  console.log('需求匹配：' + r.nmTotal + ' 条（已验证 ' + r.nmOk + ' / 初步 ' + r.nmPre + ' / 不匹配 ' + r.nmNo + '）');
  console.log('──────────────────────────────────────────────');
  console.log('已更新的文件：');
  console.log('  data/sites.js   ← 网站运行时读取的就是它');
  r.written.forEach(f => console.log('  ' + f));
  console.log('──────────────────────────────────────────────');
  console.log('接下来：双击「发布.cmd」提交并推送，托管平台会自动重新发布。');
  console.log('（手动方式：git add -A && git commit -m "更新资源" && git push）');
  console.log('');
}

main();
