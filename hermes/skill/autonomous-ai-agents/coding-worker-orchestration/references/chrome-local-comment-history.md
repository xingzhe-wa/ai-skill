# Chrome 本地评论与浏览历史扩展参考

适用场景：Chrome MV3 content script + options page + service worker，使用 File System Access API 将用户数据持久化到本地目录。

## 权限与连接状态

- `showDirectoryPicker()` 必须由 popup/options 页面中的用户点击触发。
- `requestPermission()` / `queryPermission()` 是可选能力；只在拥有用户手势的扩展页面中、存在方法时调用。
- 不要在 MV3 service worker 中无条件调用这两个方法。通过消息传入或从 IndexedDB 恢复的句柄可能没有这些方法。
- **不要通过 `chrome.runtime.sendMessage` 传递 `FileSystemDirectoryHandle`。** 句柄经过 MV3 消息通道后可能丢失原型/访问方法，后台会反复判定“未连接”。正确流程是：设置页请求权限 -> 设置页直接把真实句柄写入扩展 IndexedDB -> 只给后台发送 `{ type: 'connect-directory', directoryName }` -> 后台从 IndexedDB 恢复句柄并验证文件访问。
- service worker 应通过实际打开/读取或创建固定数据文件验证句柄可用性，并据此计算 connected 状态。
- 连接 UI 必须保留具体失败原因，区分取消选择、权限拒绝、IndexedDB 保存/读取失败、文件读写失败、schema 损坏和 runtime message 失败；不能在失败后立即用一次通用刷新覆盖错误。
- 连接进度和成功/失败结果要显示在“本地目录”区域内，而不是只放在全局页脚；用户选择目录后不应需要滚动才能看到“设置成功/失败”。

## 数据边界

- 评论和浏览历史使用独立文件及独立 schema，例如 `private-comments.json` 与 `yuque-history.json`。
- 历史按稳定 `documentKey` 去重，更新 `visitedAt` 与 `visitCount`；正常页面才记录。
- URL 排除规则应作为纯函数测试，而不是只依赖 manifest：精确路径应匹配根路径及子路径，不误伤相似路径、其他 host、非 HTTPS URL。
- 所有导入、读取和写入都先做 schema 校验；坏 JSON 不得静默覆盖。

## Content Script UX 验收

- 固定悬浮面板应提供拖动标题栏、收起为窄条/胶囊的控制；收起后不要保留完整面板宽度遮挡正文。
- 选中文本后显示“添加私有评论”入口，表单自动填入选中文本和锚点。
- 每条评论应能“定位原文”：按 `selectedText` 或 `anchor` 查找当前页面文本，滚动到匹配位置并短暂高亮；找不到时给明确提示。
- 评论正文、标题、历史列表等外部数据使用 `textContent`；历史链接只使用已校验 URL。
- 最终验收必须检查构建后的 `dist/content-script.js` 和 options bundle 中确实包含排除规则、record-visit、搜索/清空/打开链接交互，而不只检查源码。

## 推荐测试

- Message-shape test：`connect-directory` 只携带 `directoryName`，不含 `handle`。
- Settings flow test：权限请求 -> IndexedDB 保存句柄 -> runtime message without handle。
- Worker flow test：从 IndexedDB 加载已保存句柄 -> 验证文件访问 -> 写入 connected state。
- Handle-store test：设置页保存的句柄可被后台重新读取，清理后读取为空。
- URL exclusion tests：排除根路径及子路径，不误伤相似路径。
- Comment locator tests：可按选中文本或锚点找到 DOM 文本，找不到时返回失败而不是静默无效。

## 验证清单

```text
npm test
npx tsc --noEmit
npm run build
```

随后检查 `dist/manifest.json` 的所有脚本/HTML 引用存在，并重新加载或重新安装 unpacked extension；只验证源码不等于验证用户实际加载的扩展。