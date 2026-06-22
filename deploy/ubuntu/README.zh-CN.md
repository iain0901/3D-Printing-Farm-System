# 3DSTU FarmFlow Ubuntu 部署

本文说明如何在 Ubuntu 22.04/24.04 上部署 3DSTU FarmFlow。完整英文版请参考 [README.md](README.md)，繁体中文版请参考 [README.zh-TW.md](README.zh-TW.md)。

如果需要专业技术支持或安装设置服务，请联系 `support@3dstu.com`。

## 快速部署

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh deploy
```

部署完成后，服务默认监听 `127.0.0.1:8797`，建议使用 Nginx 反向代理与 HTTPS 对外提供服务。

## Nginx / HTTPS / 备份

```bash
scripts/ubuntu-setup.sh all your-domain.example owner@example.com
```

这个命令会安装基础组件、UFW、防火墙规则、Docker log rotation、Nginx site、Certbot HTTPS、备份 timer 与 ops-check timer。

## 上线检查

```bash
scripts/ubuntu-go-live-check.sh
```

上线检查会执行 Bash 语法检查、部署 doctor、可选的 host QC、live smoke、备份验证、restore drill 与 ops-check。

## 日常运维

```bash
scripts/ubuntu-deploy.sh update
scripts/ubuntu-deploy.sh ops-check
scripts/ubuntu-backup.sh backup
scripts/ubuntu-backup.sh restore-drill <archive.tgz>
scripts/ubuntu-deploy.sh support-bundle
```

## 兼容性说明

产品名称是 `3DSTU FarmFlow`，但为了避免破坏既有部署，Docker volume、systemd service、部分文件与环境变量仍使用 `layerpilot` / `LAYERPILOT_*`。
