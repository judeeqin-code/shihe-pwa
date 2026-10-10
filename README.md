# 史河科技 · 售后服务管理系统（移动端 PWA）

纯静态前端，**零后端、零第三方依赖**，数据保存在手机浏览器（IndexedDB），**离线可用**，可「添加到主屏幕」像 App 一样使用。与 Win 桌面端通过「互通数据包」互导数据（含现场照片）。

## 功能
- 登录（默认账号 `admin / admin123`，请在「我的」中修改密码）
- 首页概览、底部导航
- 客户档案（增删改查）
- 备件台账（安全库存预警）+ 出入库流水（自动更新库存结存）
- 服务工单：状态流转（派单→到场→完成/挂起/关闭）、备件领用、跟进记录
- **工单现场照片：拍摄（调用相机）/ 相册选择**，随工单保存，可看大图、可删除
- 我的：导出 / 导入互通数据包、修改密码、清空本机数据

## 本地预览（开发态）
PWA 要求通过 http(s) 或 localhost 访问（service worker 需要安全上下文）：

```bash
cd shihe_pwa
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```

> 手机访问同一台电脑预览：手机与电脑连同一 WiFi，浏览器打开 `http://<电脑局域网IP>:8000`。

## 部署到手机正式使用（无需常开电脑）
把 `shihe_pwa/` 整个目录托管到任意**免费静态网站**（自动提供 HTTPS），手机浏览器打开后「添加到主屏幕」即可：

- GitHub Pages / Netlify / Cloudflare Pages / Vercel 任选其一，上传本目录即可。
- 部署后访问分配的 https 地址，登录即用；之后离线也能用（service worker 已缓存）。

## 与 Win 桌面端互导
1. 手机端「我的 → 导出数据包」下载一个 `.json`（含全部业务数据 + 现场照片 base64）。
2. 拷贝到 Win 电脑，桌面端「数据管理 → 导入互通数据包」载入。
3. 反向同理：桌面端「导出互通数据包」→ 手机端「导入数据包」。
- 互通格式：单文件 JSON，`format: "shihe-package"`，业务表整体覆盖（不覆盖账号与系统设置）。

## 目录结构
```
shihe_pwa/
├── index.html
├── manifest.webmanifest
├── sw.js                  # 离线缓存 service worker
├── css/style.css
├── js/db.js               # IndexedDB 数据层 + 互通导入/导出
├── js/app.js              # 界面与业务逻辑
└── icons/                 # PWA 图标（192/512/maskable）
```
