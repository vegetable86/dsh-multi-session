# 多会话面板（@local/dsh-multi-session）

在 DeepSeek Harness 里把多个会话并排看：一个独立的「多会话」主面板，1–4 个格子，每格绑定一个已有会话，每格都是完整的原生对话（消息流 + 输入框）。

## 用法

1. 左侧边栏点「多会话」图标进入面板。
2. 首次打开自动填入最近两个会话；每格标题栏点会话名可以换一个会话（支持搜索）。
3. 工具条「+ 添加会话格」最多加到 4 格；单格可最大化 / 还原，也可关闭（至少保留一格）。
4. 布局、每格绑定的会话、最大化状态都会自动记住，刷新或重启后恢复；会话不存在时那一格显示「不可用」，可以重新选择。
5. 选择器默认不列子代理会话，也不列空白会话；新建会话仍在左侧栏进行。

## 实现要点

- 只注册一个 `main` 面板（key `multisession`）和一个 `sidebar.panellist` 图标，普通对话页完全不受影响。
- 每格通过 `<SessionProvider session={reference}>` 显式绑定会话，引用由 `sessions.retain(...)` 获取、卸载时 `release()`。
- 格子内部用官方 `conversation.content` 工厂槽（`variant: 'embedded'`）渲染，得到的是原生对话组件，不是自绘的聊天界面。
- 每格包一层错误边界：一格崩了不影响其他格。

## 开发

纯手写客户端 bundle，无需构建步骤。`client.js` 直接就是 `window.__ModuleLoader__.load(...)` 包。

```powershell
npm test   # 注册形态冒烟 + jsdom 渲染冒烟
```

## 目录

```
index.js        # Host 侧空实现（本插件纯客户端）
client.js       # 客户端 bundle：面板、格子、选择器、持久化、i18n
cordis.patch.yml
locale/*.json   # 面板名称与描述
icon.svg
scripts/        # 冒烟测试
docs/superpowers/{specs,plans}/
```
