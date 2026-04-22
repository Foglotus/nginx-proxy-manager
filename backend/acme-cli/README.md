# ACME Standalone CLI

该目录提供独立命令行证书工具，仅保留 Let's Encrypt 申请与自动续期能力，不依赖 Nginx/Docker/管理后台。

## 1. 配置方式（POM 驱动）

以本地 `pom.xml` 作为唯一配置源。建议先复制模板：

```bash
cp /home/runner/work/nginx-proxy-manager/nginx-proxy-manager/backend/acme-cli/pom.example.xml /your/workdir/pom.xml
```

核心字段（`<project><acme>...</acme></project>`）：

- `email`: 注册邮箱
- `domains.domain`: 证书域名列表
- `challenge`: `http` 或 `dns`
- `webroot`: HTTP-01 时必须
- `dns.provider` / `dns.credentials` / `dns.propagationSeconds`: DNS-01 时使用
- `outputDir`: 证书输出目录
- `certAlias`: 输出证书名称前缀（生成 `<alias>.crt` 和 `<alias>.key`）
- `certName`: certbot 证书名（默认与 `certAlias` 一致）
- `renewBeforeDays`: 小于等于该阈值时触发续期
- `checkIntervalMinutes`: daemon 模式轮询间隔
- `archiveEnabled` / `archiveDir`: 是否保存历史归档副本
- `stateFile`: 本地状态文件路径

## 2. 命令

在 backend 目录执行：

```bash
npm run acme-cli -- validate --config /absolute/path/pom.xml
npm run acme-cli -- issue --config /absolute/path/pom.xml
npm run acme-cli -- renew --config /absolute/path/pom.xml
npm run acme-cli -- daemon --config /absolute/path/pom.xml
```

- `validate`: 校验配置、目录可写性、certbot 可执行
- `issue`: 立即申请证书并部署到输出目录
- `renew`: 检查是否接近过期，满足阈值才续期
- `daemon`: 常驻执行定时续期，单线程防并发

## 3. 输出与命名

申请/续期成功后：

- 证书：`<outputDir>/<certAlias>.crt`
- 私钥：`<outputDir>/<certAlias>.key`

写入采用原子覆盖，避免半写入文件。

当 `archiveEnabled=true` 时，同时写入：

- `<archiveDir>/<certAlias>-<timestamp>.crt`
- `<archiveDir>/<certAlias>-<timestamp>.key`

## 4. systemd 示例（daemon）

`/etc/systemd/system/acme-certbot.service`：

```ini
[Unit]
Description=ACME Certbot Standalone CLI
After=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/runner/work/nginx-proxy-manager/nginx-proxy-manager/backend
ExecStart=/usr/bin/npm run acme-cli -- daemon --config /absolute/path/pom.xml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 5. cron 示例（定时 renew）

```cron
0 * * * * cd /home/runner/work/nginx-proxy-manager/nginx-proxy-manager/backend && /usr/bin/npm run acme-cli -- renew --config /absolute/path/pom.xml >> /var/log/acme-cli.log 2>&1
```

## 6. 本地状态文件

每次 `issue/renew` 会更新 `stateFile`（JSON），记录最近动作、证书路径和过期时间，便于审计与排障。
