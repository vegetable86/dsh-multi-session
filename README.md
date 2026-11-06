# 多会话面板（dsh-multi-session）

在 DeepSeek Harness 里把多个会话并排看：一个独立的「多会话」主面板，格子数量不设上限，每格绑定一个已有会话，每格都是完整的原生对话（消息流 + 输入框）。

npm 包：`@vegataa/dsh-multi-session`

## 用法

1. 左侧边栏点「多会话」图标进入面板。
2. 首次打开自动填入最近两个会话；每格标题栏点会话名可以换一个会话（支持搜索）。
3. 工具条「+ 添加会话格」想加多少加多少；列数随面板宽度自适应 1–3 列（且不会多于格子数，免得右侧空出一格），格子多了面板整体滚动，每格保持可读高度。单格可最大化 / 还原，也可关闭（至少保留一格）。
4. 空格的「新建会话」按钮、以及每格选择器底部的「新建会话」，会直接在这一格里开一个新会话并绑定：优先建在该格当前会话所在的工作区，其次最近使用的工作区，都没有就交给 Host 的默认目录。
5. 布局、每格绑定的会话、最大化状态都会自动记住，刷新或重启后恢复；会话不存在时那一格显示「不可用」，可以重新选择。
6. 选择器默认不列子代理会话，也不列空白会话（当前格自己绑定的空白会话除外）。

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
scripts/        # 冒烟测试、发布打包、市场索引生成
market/         # 插件市场索引与目录提交模板
docs/superpowers/{specs,plans}/
LICENSE
```

## 许可证

MIT，见 [LICENSE](LICENSE)。
