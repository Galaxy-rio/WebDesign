# galaxyrio Design / Pigment Studio

Astro 静态网站，部署域名为 `design.galaxyrio.top`。

| 路径 | 内容 |
| --- | --- |
| `/` | 设计工具总入口。当前包含 Pigment Studio，后续可添加其他工具卡片。 |
| `/pigment/` | Pigment Studio 渐变编辑器。 |
| `/404.html` | 未找到页面。 |

## 本地使用

要求 Node.js 22.12 或更高版本；`.node-version` 固定为已用于本地验证的 `26.5.1`，Cloudflare Pages 构建时也会读取此文件。

```sh
npm ci
npm run dev
```

开发服务器地址以终端输出为准。完成编辑后：

```sh
npm test
npm run build
npm run preview
```

Astro 7 的开发服务器可能在启动后转到后台运行，可通过 `npx astro dev status`、`npx astro dev logs`、`npx astro dev stop` 管理。
