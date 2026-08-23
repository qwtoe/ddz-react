# 欢乐斗地主 · 人机对战

纯前端斗地主单机游戏：1 名真人 + 2 个 AI，经典规则（叫分制、全牌型、炸弹/春天计分）。

## 本地运行

```bash
npm install
npm run dev        # 开发：http://localhost:5173
npm run test       # 单元测试（36 个，含 200 局 AI 对局模拟）
npm run build      # 构建产物输出到 dist/
```

## 部署（任选其一，均为免费静态托管）

构建产物是纯静态文件（`dist/`），无需服务器：

**Vercel**（最简单）
```bash
npm i -g vercel && vercel --prod
```

**Netlify**
```bash
npm i -g netlify-cli && netlify deploy --prod --dir=dist
```

**GitHub Pages**
```bash
npm run build
npx gh-pages -d dist   # npm i -D gh-pages 后执行；仓库设置里开启 Pages
```

已配置 `base: './'`（相对路径），部署到任意子路径（如 GitHub Pages 的 `user.github.io/repo/`）均可直接工作。

## 项目结构

```
src/
├── engine/          # 纯逻辑引擎（无 DOM 依赖）
│   ├── types.ts     # 牌与牌型类型
│   ├── deck.ts      # 牌堆 / 洗牌 / 排序
│   ├── pattern.ts   # 牌型解析 parseCards + 比较 canBeat
│   ├── hints.ts     # 合法出牌枚举 findHints
│   └── scoring.ts   # 计分（底分×叫分×炸弹×春天）
├── ai/              # AI 决策（启发式）
│   ├── bidAi.ts     # 叫分
│   └── playAi.ts    # 出牌（贪心分解 + 队友配合）
├── game/
│   └── controller.ts # DdzGame 对局控制器（状态机 + 订阅）
├── ui/
│   └── PlayingCard.tsx # 纯 CSS 扑克牌组件
└── App.tsx          # 牌桌界面
```

## 规则要点

- 54 张牌，3 人各 17 张，3 张底牌归地主
- 叫分 1/2/3，叫 3 分立即成为地主；全不叫重新发牌
- 支持全部牌型：单张/对子/三张/三带一二/顺子/连对/飞机(带单带对)/四带二/炸弹/王炸
- 计分 = 底分(100) × 叫分 × 2^炸弹数 × 春天(×2)，地主 ±2 倍结算
