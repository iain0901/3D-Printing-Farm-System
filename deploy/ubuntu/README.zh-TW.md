# 3DSTU FarmFlow Ubuntu 部署

本文件說明如何在 Ubuntu 22.04/24.04 上部署 3DSTU FarmFlow。完整英文版請參考 [README.md](README.md)，簡體中文版請參考 [README.zh-CN.md](README.zh-CN.md)。

如果需要專業技術支援或安裝設定服務，請聯絡 `support@3dstu.com`。

## 快速部署

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh deploy
```

部署完成後，服務預設監聽 `127.0.0.1:8797`，建議使用 Nginx 反向代理與 HTTPS 對外提供服務。

## Nginx / HTTPS / 備份

```bash
scripts/ubuntu-setup.sh all your-domain.example owner@example.com
```

這個指令會安裝基礎套件、UFW、防火牆規則、Docker log rotation、Nginx site、Certbot HTTPS、備份 timer 與 ops-check timer。

## 上線檢查

```bash
scripts/ubuntu-go-live-check.sh
```

上線檢查會執行 Bash 語法檢查、部署 doctor、可選的 host QC、live smoke、備份驗證、restore drill 與 ops-check。

## 日常維運

```bash
scripts/ubuntu-deploy.sh update
scripts/ubuntu-deploy.sh ops-check
scripts/ubuntu-backup.sh backup
scripts/ubuntu-backup.sh restore-drill <archive.tgz>
scripts/ubuntu-deploy.sh support-bundle
```

## 相容性說明

產品名稱是 `3DSTU FarmFlow`，但為了避免破壞既有部署，Docker volume、systemd service、部分檔案與環境變數仍使用 `layerpilot` / `LAYERPILOT_*`。
