/** Site copy in English and Simplified Chinese. The panel's own labels are not here: the demo
 * renders the extension's components, which read src/i18n/page.ts. */
export type Lang = 'en' | 'zh';

const en = {
  documentTitle: 'RoleHarbour: job ads, read for you',
  description:
    'A Chrome extension for SEEK New Zealand that reads job ads on your device: a preparation checklist, visa wording with its source, and an accredited-employer check. No account, no uploads.',
  nav: { demo: 'Demo', features: 'Features', privacy: 'Privacy', install: 'Install' },
  languageLabel: 'Language',
  hero: {
    titleStart: 'Job ads,',
    titleMarked: 'read for you.',
    lead: 'RoleHarbour is a Chrome extension for SEEK New Zealand. Open a job and it sets out what the ad asks for, what it says about visas and whether the employer is on the accredited list. All of it is worked out on your own device.',
    get: 'Install from Chrome Web Store',
    tour: 'Watch the 26-second tour',
    meta: 'Free on the Chrome Web Store. Chrome 116 or later. No account.',
    haruAlt: "Haru, RoleHarbour's mascot, holding a highlighter",
  },
  demo: {
    title: 'Point at an answer to see where it came from.',
    body: 'Job ads hide the years in one paragraph, the tech stack in a list and the visa line near the bottom. RoleHarbour gathers them into one panel, and every result keeps the sentence it was read from. Hover over a verdict or a skill, or tap it on a phone.',
    adLabel: 'Job ad',
    note: "The job ad and the employer result are illustrative. Everything else in the panel is RoleHarbour's actual reading of this ad.",
  },
  features: {
    title: 'What the panel tells you',
    items: {
      checklist: {
        name: 'Preparation checklist',
        body: 'The programming languages, tools, knowledge areas, qualifications and personal qualities the ad asks for, split into must-haves and nice-to-haves, plus documents to prepare, such as a cover letter.',
      },
      visa: {
        name: 'Visa wording',
        body: 'Whether the ad mentions visa sponsorship, asks for existing work rights or is limited to citizens and residents. Each verdict shows the sentence it came from.',
      },
      employer: {
        name: 'Accredited employer check',
        body: "The employer is checked against a dated snapshot of New Zealand's accredited employer list. Job cards in search results get a small badge too.",
      },
      occupation: {
        name: 'Occupation reference',
        body: 'An ANZSCO occupation, shown only when the job title itself names one.',
      },
      experience: {
        name: 'Experience',
        body: 'The years the ad states. When it states none, a local estimate, labelled as one.',
      },
      languages: {
        name: 'Five languages',
        body: "English, Simplified Chinese, Traditional Chinese, Japanese and Korean. Quotes from the ad stay in the ad's language.",
      },
    },
  },
  privacy: {
    title: 'The job ad never leaves your browser.',
    body: 'RoleHarbour reads the page you already have open and works out every result inside the extension. Results are kept in memory for that job and are gone when you move on.',
    points: [
      'No account, sign-in or API key.',
      'No job text, search or company name is sent anywhere.',
      'One download: the public accredited employer list, checked weekly.',
    ],
  },
  video: {
    title: 'RoleHarbour in 26 seconds',
    body: "Presented by Haru, RoleHarbour's mascot. The job ad and employer results in the video are illustrative.",
    label: 'RoleHarbour promo video',
  },
  install: {
    title: 'Install RoleHarbour',
    body: 'Add RoleHarbour from the Chrome Web Store, then open any job on SEEK New Zealand. The panel appears on the job page, with nothing to set up.',
    store: 'Open in Chrome Web Store',
    manualTitle: 'Or install it by hand from GitHub Releases',
    steps: [
      'Download the Chrome ZIP from GitHub Releases and extract it.',
      'Open chrome://extensions and turn on Developer mode.',
      'Choose Load unpacked and select the extracted folder, the one containing manifest.json.',
    ],
    download: 'Download from GitHub Releases',
    notes: [
      'The store version and a hand-installed copy are separate extensions with separate settings, so keep just one.',
      'To upgrade a hand-installed copy, replace the files in the folder Chrome already loads and reload the extension. Uninstalling deletes its data.',
    ],
  },
  limits: {
    title: 'Good to know',
    items: [
      "An employer-list match comes from a dated snapshot. It doesn't confirm current accreditation or that this job will be sponsored, and no match doesn't mean the employer isn't accredited.",
      "Visa and occupation labels describe the ad. They don't decide your own immigration eligibility.",
      'Results come from vocabulary and wording rules and can miss or misread things. Check the quoted sentences against the ad.',
      'RoleHarbour is independent of SEEK and Immigration New Zealand.',
    ],
  },
  footer: {
    tagline: 'Job ads, read for you.',
    store: 'Chrome Web Store',
    source: 'Source on GitHub',
    privacy: 'Privacy notice',
    changelog: 'Changelog',
    haru: 'Haru is AI-generated artwork.',
  },
};

export type Copy = typeof en;

const zh: Copy = {
  documentTitle: 'RoleHarbour：招聘广告，替你读完',
  description:
    '一款用于 SEEK 新西兰的 Chrome 扩展，在你的设备上读取招聘广告：求职准备清单、附原句的签证表述，以及认证雇主核对。无需账号，不上传任何内容。',
  nav: { demo: '演示', features: '功能', privacy: '隐私', install: '安装' },
  languageLabel: '语言',
  hero: {
    titleStart: '招聘广告，',
    titleMarked: '替你读完。',
    lead: 'RoleHarbour 是一款用于 SEEK 新西兰的 Chrome 扩展。打开一个职位，它就会整理出广告要求什么、对签证怎么说，以及雇主是否在认证雇主名单上。所有分析都在你自己的设备上完成。',
    get: '从 Chrome 网上应用店安装',
    tour: '观看 26 秒介绍',
    meta: '在 Chrome 网上应用店免费获取，支持 Chrome 116 及以上版本，无需账号。',
    haruAlt: 'RoleHarbour 的吉祥物 Haru，手里拿着荧光笔',
  },
  demo: {
    title: '指向任一结论，就能看到它出自哪一句。',
    body: '招聘广告常把年限写在某段话里，技术栈列在清单中，签证说明放在最底部。RoleHarbour 把它们集中到一个面板里，每个结果都保留了它所依据的原句。把鼠标移到面板里的判断或技能上（手机上轻点即可）试试。',
    adLabel: '招聘广告',
    note: '招聘广告和雇主匹配结果为示例；面板中的其余内容都是 RoleHarbour 对这则广告的实际读取结果。',
  },
  features: {
    title: '面板会告诉你什么',
    items: {
      checklist: {
        name: '求职准备清单',
        body: '广告要求的编程语言、工具、知识领域、资质和个人素质，分为必备和加分两类，并列出需要准备的材料，比如求职信。',
      },
      visa: {
        name: '签证表述',
        body: '广告是否提到签证担保、是否要求已有工作权、是否仅限公民和居民。每个判断都附有出处原句。',
      },
      employer: {
        name: '认证雇主核对',
        body: '将雇主与新西兰认证雇主名单的带日期快照进行比对。搜索结果中的职位卡片也会显示小标记。',
      },
      occupation: {
        name: '职业参考',
        body: '一个 ANZSCO 职业名称，只有当职位标题本身点明该职业时才会显示。',
      },
      experience: {
        name: '工作经验',
        body: '广告写明的年限；没有写明时给出本地估计，并标注为估计。',
      },
      languages: {
        name: '五种界面语言',
        body: '英语、简体中文、繁体中文、日语和韩语。引用的广告原文保持原有语言。',
      },
    },
  },
  privacy: {
    title: '招聘广告从不离开你的浏览器。',
    body: 'RoleHarbour 只读取你已经打开的页面，所有结果都在扩展内部算出。结果只为当前职位保存在内存里，离开即清除。',
    points: [
      '无需账号、登录或 API Key。',
      '不发送任何职位内容、搜索记录或公司名称。',
      '唯一的下载：公开的认证雇主名单，每周检查一次更新。',
    ],
  },
  video: {
    title: '26 秒了解 RoleHarbour',
    body: '由 RoleHarbour 的吉祥物 Haru 带你看一遍。视频中的招聘广告和雇主结果为示例。',
    label: 'RoleHarbour 宣传视频',
  },
  install: {
    title: '安装 RoleHarbour',
    body: '从 Chrome 网上应用店添加 RoleHarbour，然后打开任意 SEEK 新西兰职位，面板就会出现在职位页面上，无需任何设置。',
    store: '前往 Chrome 网上应用店',
    manualTitle: '也可以从 GitHub Releases 手动安装',
    steps: [
      '从 GitHub Releases 下载 Chrome ZIP 并解压。',
      '打开 chrome://extensions，开启“开发者模式”。',
      '点击“加载已解压的扩展程序”，选择解压后包含 manifest.json 的文件夹。',
    ],
    download: '前往 GitHub Releases 下载',
    notes: [
      '应用店版本和手动安装的版本是两个独立的扩展，设置互不共享，只保留其中一个即可。',
      '升级手动安装的版本时，替换 Chrome 正在加载的文件夹中的文件，再重新加载扩展。卸载会删除扩展数据。',
    ],
  },
  limits: {
    title: '使用须知',
    items: [
      '雇主名单匹配来自带日期的快照，不能证明雇主当前仍获认证，也不能证明这个职位一定提供担保；没有匹配也不代表雇主未获认证。',
      '签证和职业标签只描述广告内容，不判断你个人的移民资格。',
      '结果来自词库和措辞规则，可能遗漏或误读，请对照引用的原句核实。',
      'RoleHarbour 与 SEEK 和新西兰移民局（INZ）均无关联。',
    ],
  },
  footer: {
    tagline: '招聘广告，替你读完。',
    store: 'Chrome 网上应用店',
    source: 'GitHub 源码',
    privacy: '隐私说明',
    changelog: '更新日志',
    haru: 'Haru 形象由 AI 生成。',
  },
};

export const copy: Record<Lang, Copy> = { en, zh };
