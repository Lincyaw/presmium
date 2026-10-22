# 远端环境：docker compose 模板

一台 Jupyter Server，文稿中 `kind: jupyter` 的环境连接它：代码块的 `:env:` 在它的内核中运行（构建时与浏览器中），`{terminal}` 打开它的终端。插件是 `@lincyaw/slidev-addon-exec-jupyter`。

| 文件 | 作用 |
|---|---|
| `compose.yaml` | Jupyter Server：固定摘要的 docker-stacks 镜像（`quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2…`）、令牌、允许的来源、空闲回收、资源限制 |
| `compose.gpu.yaml` | 覆盖配置：NVIDIA GPU |
| `compose.gvisor.yaml` | 覆盖配置：gVisor（`runtime: runsc`） |
| `.devcontainer/devcontainer.json` | 同一份定义作为开发容器，用于本地容器与环境复刻 |

## 启动

```sh
export JUPYTER_TOKEN=$(openssl rand -hex 24)
docker compose up -d --wait
docker compose down        # 停止；同样要求 JUPYTER_TOKEN 有值
```

| 变量 | 默认 | 含义 |
|---|---|---|
| `JUPYTER_TOKEN` | 必需 | 访问令牌；Jupyter Server 从环境读取，不在命令行中 |
| `JUPYTER_PORT` | `8888` | 发布的端口 |
| `JUPYTER_BIND` | `127.0.0.1` | 发布的地址；给其他机器用时在前面放 TLS 反向代理 |
| `JUPYTER_ALLOW_ORIGIN_PAT` | 空（不允许跨源） | 允许跨源调用的站点来源（正则表达式），`auth: prompt` 的静态站点需要，如 `https://course\.example\.edu` |
| `JUPYTER_CULL_IDLE_SECONDS` | `1200` | 空闲多久回收内核与终端（含浏览器仍连着的） |
| `JUPYTER_CPUS`、`JUPYTER_MEMORY`、`JUPYTER_PIDS` | `2`、`4g`、`512` | 资源限制 |
| `PRESMIUM_JUPYTER_IMAGE` | 见 `compose.yaml` | 换用其他固定摘要的镜像（如带 CUDA 的 `pytorch-notebook`）；文稿的 `image` 写同一个值 |
| `JUPYTER_GPUS` | `all` | `compose.gpu.yaml`：GPU 数量 |

容器以镜像的普通用户（jovyan）运行，去掉全部能力（`cap_drop: [ALL]`、`no-new-privileges`）。

## 文稿与运营者

文稿只写环境的名字与凭据方式，不写令牌：

```yaml
execute:
  environments:
    lab: { kind: jupyter, auth: proxy, image: 'quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a' }
```

运营者在运行 `presmium build`、`check`、`dev` 或 `serve` 的进程的环境中成对给出地址与令牌：

```sh
PRESMIUM_ENV_LAB_URL=http://127.0.0.1:8888/ PRESMIUM_ENV_LAB_TOKEN=$JUPYTER_TOKEN presmium dev
```

名字中的小写字母变为大写，其他字符变为 `_`（`my-gpu` 是 `PRESMIUM_ENV_MY_GPU_URL`）。令牌只发往同一对中的地址；文稿写了 `url` 而与它不同源时不连接并给出错误诊断，没有地址时不发送令牌。

| `auth` | 构建时 | 浏览器中 |
|---|---|---|
| `env`（默认） | 运营者的一对 | 不可用，显示录制的输出 |
| `proxy` | 运营者的一对 | 经 `presmium dev`、`presmium serve` 的代理 `/__presmium/presmium.execJupyter/env/<名>/`，服务端加上令牌；静态产物中不可用 |
| `prompt` | 运营者的一对 | 连接文稿的 `url`，学习者粘贴自己的令牌，令牌只在本页的 `sessionStorage` 中；需要 `JUPYTER_ALLOW_ORIGIN_PAT` 允许站点的来源 |
| `none` | 文稿的 `url`，不带令牌 | 同左 |

`presmium check --env` 连接每个声明的环境，不可达的报告为错误。

## 安全

这是一台单用户的 Jupyter Server：拿到令牌的人可以做容器中的一切，内核中的代码与服务器是同一个用户，读得到 `JUPYTER_TOKEN` 并能连接其他内核。会话按页面与学习者各用一个内核，所以变量互不可见，但这不是学习者之间的隔离。适合作者自己、助教与可信的小班；每个学习者需要隔离时，用 `../kubernetes/README.md` 中的 JupyterHub（每人一台服务器）。

## GPU 与 gVisor

```sh
docker compose -f compose.yaml -f compose.gpu.yaml up -d --wait      # 需要 NVIDIA Container Toolkit
docker compose -f compose.yaml -f compose.gvisor.yaml up -d --wait   # 需要在 Docker 中登记 runsc
```

两者不组合：gVisor 的 GPU 支持（nvproxy）在这份模板上没有验证（`docs/design-v0.7.md` 第 11 节），模板只提供验证过的配置。要在共用的 GPU 上隔离学习者，见 Kubernetes 文档中的 MIG 与 gVisor。

## 开发容器

`.devcontainer/devcontainer.json` 指向 `../compose.yaml`：VS Code 或 `devcontainer up --workspace-folder templates/env/compose` 在同一个镜像中工作。本地环境插件把它当作 `kind: devcontainer` 的环境（`path` 写这个目录）时，devcontainer 命令行以清理过的环境运行（`docs/architecture.md` 10.6 节），`JUPYTER_TOKEN` 要经运营者设置 `settings.presmium.exec.passEnv: [JUPYTER_TOKEN]` 传入。
