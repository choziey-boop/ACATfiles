# 校园猫咪相册小程序(P0)

校园流浪猫档案展示与领养申请小程序。前端为微信小程序原生框架,后端使用微信云开发。

## 目录结构

```
miniprogram/          ← 用微信开发者工具打开本目录
├── miniprogram/      # 小程序前端代码
│   ├── pages/        # 页面(见下)
│   ├── components/   # cat-card / skeleton / empty / privacy-modal
│   ├── utils/        # 常量、云函数封装、管理员判断
│   └── images/       # tabBar 图标(tools/gen-icons.js 生成,可替换)
├── cloudfunctions/   # 云函数:login / adminAuth / submitAdoption / saveCat / deleteCat
└── tools/            # 辅助脚本(图标生成,与运行无关)
```

## 首次部署步骤

### 1. 创建项目
1. 微信开发者工具 → 导入项目 → 选择本目录(`miniprogram/`)。
2. `project.config.json` 中 `appid` 默认为 `touristappid`(测试号),正式发布前替换为你自己的小程序 AppID。

### 2. 开通云开发
1. 开发者工具顶部点击「云开发」,开通环境,复制**环境 ID**。
2. ~~把 `miniprogram/app.js` 里的 `env: 'your-env-id'` 替换为该环境 ID~~ ✅ 已配置为 `cloudbase-d1gmx9xlhccbfd3d6`

### 3. 初始化数据库与首个管理员(一键)
1. 开发者工具中编译运行小程序,切到「关于我们」Tab。
2. **1 秒内连点页面底部「非盈利校园公益项目 · 不涉及任何费用」这行文字 7 次**,触发隐藏的初始化入口。
3. 云函数 `initDb` 会自动创建全部 5 个集合(`cats` / `cat_images` / `activities` / `adoption_applications` / `admins`),并把你登记为首个管理员(仅当 admins 为空时生效,重复触发无副作用)。
4. 完成后「关于我们」页底部会出现「进入管理后台 →」入口。

> 初始化成功后,建议在云开发控制台删除 `initDb` 云函数。

**权限设置(控制台 → 数据库 → 集合 → 权限设置)**:
- `cats` / `cat_images` / `activities` → 「所有用户可读,仅创建者及管理端可写」
- `adoption_applications` / `admins` → 「所有用户不可读写」

### 4. 部署云函数
对 `cloudfunctions/` 下 6 个文件夹分别右键 → **「上传并部署:云端安装依赖」**(`initDb` 为初始化专用)。

`submitAdoption` 需配置环境变量(云函数 → 配置 → 环境变量):

| 变量 | 说明 |
| --- | --- |
| `CONTACT_KEY` | 联系方式加密密钥,任意随机字符串(如 32 位字母数字),**勿泄露** |

### 5. 添加更多管理员
在 `admins` 集合中添加记录:`{ "openid": "对方的openid" }`。
对方的 openid 可从 `adminAuth` 云函数的日志中获取(对方打开「关于我们」页后,日志中会打印 `[adminAuth] openid: xxx`)。

### 6. 隐私合规(发布前必做)
1. 代码中 `app.json` 的 `__usePrivacyCheck__` 当前为 `false`(开发阶段绕过校验,因为指引未过审会拦截 `wx.chooseMedia` 等接口)。**隐私指引审核通过后,必须改回 `true` 再上传提审**。
2. 登录 [mp.weixin.qq.com](https://mp.weixin.qq.com) → 左下角头像 → 账号设置 → 服务内容声明 → **用户隐私保护指引**,声明收集的信息类型:
   - 「你主动选择的图片或视频」→ 用于管理员上传猫咪照片(不声明会导致 `wx.chooseMedia` 被拦截,报 "api scope is not declared in the privacy agreement")
   - 「你主动填写的联系方式」→ 用于领养申请审核
3. 指引文案需与 `components/privacy-modal` 中的说明保持一致。

## 功能清单(P0)

| 模块 | 页面 | 功能 |
| --- | --- | --- |
| 首页 | `pages/home/index` | 公告置顶区 + 官方动态列表(5 分钟本地缓存) |
| 猫咪档案 | `pages/cats/index` | 关键词搜索(昵称/标签)、性别/绝育/校区筛选、骨架屏、隐藏已领养 |
| 猫咪详情 | `pages/cat-detail/index` | 头图轮播、基础档案、故事、相册预览、已领养横幅、领养入口 |
| 领养中心 | `pages/adopt/index` | 待领养列表、急寻领养角标 |
| 领养申请 | `pages/adopt-apply/index` | 表单(联系方式/原因/居住情况)、服务端防重复、隐私授权前置 |
| 管理后台 | `pages/admin/*` | openid 鉴权、猫咪增删改、状态切换、图片上传与相册排序 |

## P1 待办(已预留)

- 首页动态点赞、`activities` 后台发布器(目前可先在控制台手工录入数据)
- 「给 TA 塞小鱼干」:`feed_logs` 集合 + 24h 冷却云函数(详情页已留占位注释)
- 领养审核管理页(通过/拒绝 + 拒绝原因)
- 相册沉浸式预览升级为自绘全屏组件(当前用 `wx.previewImage` 已支持双指缩放)

## 数据模型

详见 `../docs/猫咪档案需求文档.md` 第 5 节。`cats` 集合额外包含 `urgent`(急寻领养角标)与 `popularity`(人气值,P1 使用)字段。

## 注意事项

- 猫咪/动态等数据客户端**只读**,所有写操作走云函数并做管理员鉴权。
- 领养申请的联系方式以 AES-256-CBC 加密存储(`iv:ciphertext` 的 hex 格式),密钥只在 `submitAdoption` 云函数环境变量中。
- tabBar 图标为脚本生成的简易图形,可在 `miniprogram/images/` 直接替换为设计稿切图(建议 81×81 PNG)。
