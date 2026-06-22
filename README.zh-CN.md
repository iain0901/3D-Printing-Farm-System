# 3DSTU FarmFlow

3DSTU FarmFlow 是 3DSTU 为 3D 打印农场、工作室、学校与小型量产团队设计的生产作业系统。它把订单、模型文件、打印机能力、材料、排产、待办、维护、通知与审计整合到同一个 SaaS 控制台。

## 文档语言

- [English README](README.md)
- [繁體中文 README](README.zh-TW.md)
- [简体中文许可](LICENSE.zh-CN.md)
- [Ubuntu 部署说明](deploy/ubuntu/README.zh-CN.md)

如果需要专业技术支持或安装设置服务，请联系 `support@3dstu.com`。

## 许可

3DSTU FarmFlow 是 3DSTU 开发给 3DSTU 农场客户免费使用的 SaaS 平台。许可采用 [3DSTU Farm Customer Source-Available License](LICENSE.zh-CN.md)：客户可以自行部署、修改并用于自己的 3D 打印农场运营，也可以通过自己的打印件、设计、教育、维护或生产服务获利；但不得销售、转售、分发、重新打包、白标、托管、出租、发布源代码、Docker image、脚本、修改版或以本软件为基础的第三方商业服务。

## 本地运行

```bash
npm install
npm run dev
```

打开终端显示的 Vite 本地网址，通常是 `http://127.0.0.1:5173`。

另一个终端启动后端 API：

```bash
npm run api
```

API 默认监听 `http://127.0.0.1:8797`，数据保存在 `api/data/layerpilot.db.json`。

## Docker 运行

```bash
cp .env.example .env
# 编辑 .env，设置正式 owner email/password
docker compose up --build
```

完成后打开 `http://127.0.0.1:8797`。Docker Compose 会启动 API/Web 服务与后台 worker，数据保存在 `layerpilot-data` Docker volume。

## Ubuntu 部署

Ubuntu 22.04/24.04 部署资源在 `deploy/ubuntu/`。完整流程请看 [简体中文 Ubuntu 部署说明](deploy/ubuntu/README.zh-CN.md)。

快速部署：

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh deploy
```

上线前请在 Ubuntu 主机执行：

```bash
scripts/ubuntu-go-live-check.sh
```

## 主要功能

- Dashboard：今日任务、设备状态、待办事项、异常警报、生产进度、设备负载与交期风险。
- 打印机管理：状态、温度、材料、兼容能力、任务与连接桥接。
- 排产工具：待排任务、设备时间轴、材料冲突、尺寸不符、交期风险与自动排产。
- 待办系统：由任务状态自动生成切片、排产、换料、后处理与异常待办。
- 文件与模型管理：STL/3MF/G-code 上传、缩略图、版本、估时、估重与绑定任务。
- 云端切片 MVP：内置切片适配器、外部切片设置、G-code 产出与记录。
- 电商与订单：Shopify/Etsy/Manual/CSV intake、SKU 对应、自动生成生产任务。
- 维护与通知：维护模板、异常报告、Webhook、Slack/Discord/Email/自定义通知。
- 安全与运营：角色权限、2FA、API keys、审计、备份、还原、support bundle。

## 品牌与兼容性

产品名称是 `3DSTU FarmFlow`。为了避免破坏既有部署，部分环境变量、Docker volume、文件名与内部 namespace 仍保留 `LAYERPILOT_*` 或 `layerpilot`。
