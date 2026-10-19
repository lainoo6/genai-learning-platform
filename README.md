# GenAI Learning Platform

**English** · [简体中文](#中文说明)

An AI-assisted course platform where every lesson is built from interactive blocks.
Instructors author courses (manually or with an LLM), learners work through them with a
streaming AI tutor, and admins keep track of users and published courses.

Three roles share one codebase: **learner**, **instructor**, **admin**. The whole UI is
bilingual (English / 简体中文) and switches instantly from the header.

## What it does

**Learners**

- Browse the public catalog, enrol in a course and resume where they left off.
- Work through lessons composed of nine block types — reading, quiz, flashcards,
  reflection, slides, coding exercise, mini-game, simulation and roleplay.
- Track per-lesson progress and quiz scores; completing every block completes the lesson.
- Ask the AI tutor for help inside a lesson (streamed responses, lesson-aware context).
- Hit **Explain for me** on a block to get a simpler re-explanation, stored per user.
- Practise a conversation in the roleplay block and receive a rubric-based AI report.
- Generate a personal three-lesson mini-course from a topic (visible only to its author).

**Instructors**

- Create a course by hand, or describe a topic and let the wizard draft the outline and
  lessons (everything stays editable before publishing).
- Edit the full structure — modules, lessons, blocks — in a single-screen editor with
  per-field validation for all nine block types.
- Manage the student roster: import a CSV of emails, new accounts get a temporary
  password, and download the roster plus progress as a CSV.
- Review engagement analytics: daily active learners, completion rate, quiz averages and
  block-type mix.

**Admins**

- Platform overview, user management (roles), and course moderation
  (publish / unpublish / restore).

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Actions, `cacheComponents`) |
| UI | React 19, Tailwind CSS v4, Base UI primitives, Recharts, CodeMirror 6 |
| Data | PostgreSQL + Prisma 6 (typed client only, no raw SQL) |
| Auth | Auth.js (NextAuth v5) with JWT sessions and role claims |
| Validation | Zod 4 — one schema per block type, shared by client and server |
| AI | Vercel AI SDK 5 with the OpenAI provider |

## Getting started

Requirements: **Node.js 20.9+** and a running **PostgreSQL 16** instance.

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npx auth secret               # writes AUTH_SECRET into .env
npx prisma migrate dev        # create the schema
npm run db:seed               # demo users + three sample courses
npm run dev                   # http://localhost:3000
```

Set `DATABASE_URL` in `.env` first. Leaving `LLM_API_KEY` empty is supported: the app
then runs in **mock mode**, where every LLM call returns a deterministic fixture, so all
AI features stay clickable offline. To use a real model, set `LLM_API_KEY` and
`LLM_BASE_URL` (any OpenAI-compatible gateway, e.g. `https://openrouter.ai/api/v1`) plus
`LLM_MODEL`.

### Demo accounts

Created by `npm run db:seed`, all with the password `Demo1234!`:

| Email | Role |
| --- | --- |
| `learner@demo.com` | learner |
| `instructor@demo.com` | instructor |
| `admin@demo.com` | admin |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and serve |
| `npm run lint` | ESLint |
| `npm test` | Vitest unit tests (schemas, scoring, i18n, CSV, prompts) |
| `npm run verify` | Lint + `tsc --noEmit` + production build |
| `npm run db:seed` | Idempotent seed: demo users and sample courses |

## Project layout

```
src/
  app/                 routes — (auth), courses, learn, dashboard,
                       teach (wizard, editor, students, insights), admin, api
  components/          UI split by feature, plus blocks/ (one component per block type)
  lib/
    blocks/            block schema (single source of truth), registry, digest, scoring
    llm/               provider entry point, prompts, mock fixtures
    i18n/              dictionaries en.json / zh.json
  server/              server actions and read models (progress, courses, teach, admin)
prisma/
  schema.prisma        data model
  seed*.ts             demo data
```

## Notes

- Course content is stored as JSON and validated by Zod at every boundary; a malformed
  block is dropped from the player instead of failing the page.
- Locale lives in a cookie, so server and client components render the same language on
  the first paint.
- Progress and analytics are aggregated in the database rather than in memory, so the
  student roster and CSV export stay correct as courses grow.

---

## 中文说明

一个由 AI 辅助的课程平台：每节课都由可交互的内容块搭成。教师可以手写课程、也可以让大模型先起草，学习者通过流式 AI 导师边学边问，管理员负责用户与课程的运营。

三种角色共用一套代码库：**学习者（learner）**、**教师（instructor）**、**管理员（admin）**。全站中英双语，在页头一键切换。

### 功能

**学习者**

- 浏览公开课程目录，报名后从上次停下的位置继续。
- 课程由九种内容块组成：图文阅读、测验、单词卡、反思、幻灯片、编程练习、小游戏、模拟、角色扮演。
- 记录每节课的完成进度与测验得分；所有块都完成后该节课自动完成。
- 在课时内向 AI 导师提问（流式回答，自动带上当前课时的上下文）。
- 对任意块点「帮我讲解」，获得更通俗的重新解释，结果按用户保存。
- 在角色扮演块里练习对话，结束后拿到基于评分细则的 AI 反馈报告。
- 输入一个主题，自动生成三门课的个人迷你课程（仅作者本人可见）。

**教师**

- 手工创建课程，或输入主题让向导起草大纲与课时内容（发布前所有内容都可编辑）。
- 在单页编辑器里增删改模块、课时与内容块，九种块都有逐字段校验。
- 管理学生名单：CSV 批量导入邮箱，新账号自动生成临时密码；可导出名单与学习进度 CSV。
- 查看学情分析：每日活跃学习者、完成率、测验均分、内容块类型分布。

**管理员**

- 平台总览、用户角色管理、课程审核（发布 / 下架 / 恢复）。

### 技术栈

| 层次 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router、Server Actions、`cacheComponents`） |
| 界面 | React 19、Tailwind CSS v4、Base UI、Recharts、CodeMirror 6 |
| 数据 | PostgreSQL + Prisma 6（只用类型化客户端，不写裸 SQL） |
| 认证 | Auth.js（NextAuth v5），JWT 会话携带角色 |
| 校验 | Zod 4——每种内容块一个 schema，前后端共用 |
| AI | Vercel AI SDK 5 + OpenAI Provider |

### 快速开始

环境要求：**Node.js 20.9+**，以及一个正在运行的 **PostgreSQL 16**。

```bash
npm install
cp .env.example .env          # Windows 下用 copy .env.example .env
npx auth secret               # 生成 AUTH_SECRET 并写入 .env
npx prisma migrate dev        # 建表
npm run db:seed               # 演示账号 + 三门示例课程
npm run dev                   # http://localhost:3000
```

先在 `.env` 里填好 `DATABASE_URL`。`LLM_API_KEY` 可以留空：留空时应用运行在**模拟模式**，所有大模型调用返回确定性的固定内容，因此离线也能完整体验全部 AI 功能。要用真实模型，就填 `LLM_API_KEY`、`LLM_BASE_URL`（任何 OpenAI 兼容网关，例如 `https://openrouter.ai/api/v1`）和 `LLM_MODEL`。

#### 演示账号

由 `npm run db:seed` 创建，密码统一为 `Demo1234!`：

| 邮箱 | 角色 |
| --- | --- |
| `learner@demo.com` | 学习者 |
| `instructor@demo.com` | 教师 |
| `admin@demo.com` | 管理员 |

### 常用脚本

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` / `npm start` | 生产构建与启动 |
| `npm run lint` | ESLint |
| `npm test` | Vitest 单元测试（schema、计分、i18n、CSV、提示词） |
| `npm run verify` | Lint + `tsc --noEmit` + 生产构建 |
| `npm run db:seed` | 幂等种子数据：演示账号与示例课程 |

### 目录结构

```
src/
  app/                 路由——(auth)、courses、learn、dashboard、
                       teach（向导、编辑器、学生名单、学情）、admin、api
  components/          按功能拆分的界面组件，blocks/ 下是每种内容块的实现
  lib/
    blocks/            内容块 schema（唯一事实来源）、渲染注册表、摘要、计分
    llm/               大模型调用入口、提示词、模拟数据
    i18n/              中英字典 en.json / zh.json
  server/              Server Actions 与读取模型（progress、courses、teach、admin）
prisma/
  schema.prisma        数据模型
  seed*.ts             演示数据
```

### 实现要点

- 课程内容以 JSON 存储，每个出入口都用 Zod 校验；单个内容块损坏时只丢弃该块，不会让整页报错。
- 语言偏好存放在 cookie 里，服务端与客户端组件首屏渲染的语言一致，不会闪。
- 进度与学情都在数据库层聚合而非内存统计，学生名单和 CSV 导出在课程变大后仍然准确。
