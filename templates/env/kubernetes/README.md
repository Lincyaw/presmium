# 远端环境：Kubernetes（参考配置）

这里只给文档与清单片段，不维护 Helm chart，也不经测试：集群、GPU Operator、gVisor 或 Kata 的安装、入口与证书、身份提供方由你负责。单机与小班用 `../compose/`。

两种做法，文稿的写法相同（`kind: jupyter`，`docs/ir.md` 2.7 节）：

| 做法 | 适合 | 文稿 |
|---|---|---|
| [Zero to JupyterHub](https://z2jh.jupyter.org/)：每个学习者一台单用户服务器 | 一个班的学习者各自运行代码，彼此隔离 | `auth: prompt`，`url: https://hub.example.edu/user/{user}/`；学习者在 hub 的 `/hub/token` 页面取得令牌，粘贴到页面上，`{user}` 由令牌所属的用户代入 |
| [agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox)：按需的沙箱 Pod 中运行一台 Jupyter Server | 作者、构建与演示用的环境，一次性的隔离环境 | `auth: env` 或 `proxy`，运营者给出 `PRESMIUM_ENV_<名>_URL`、`_TOKEN` |

## Zero to JupyterHub

`values.yaml` 片段（z2jh 4.x）：

```yaml
hub:
  config:
    JupyterHub:
      # 页面在课程站点的源上，经 hub 的接口读出令牌所属的用户（{user}）：允许站点跨源调用。
      tornado_settings:
        headers:
          Access-Control-Allow-Origin: https://course.example.edu
          Access-Control-Allow-Headers: Authorization, Content-Type
    KubeSpawner:
      # 单用户服务器允许站点跨源调用内核与终端的接口。
      args:
        - --ServerApp.allow_origin_pat=https://course\.example\.edu

singleuser:
  image:
    name: quay.io/jupyter/base-notebook
    # 固定摘要；文稿的 image 写同一个值（quay.io/jupyter/base-notebook:2026-10-12@sha256:…）
    tag: "2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a"
  extraEnv:
    # 浏览器的 WebSocket 不能带请求头，令牌只能写在地址中。JupyterHub 5 起单用户服务器只在请求带
    # Sec-Fetch-Mode: websocket 时接受地址中的令牌，而 Chromium 的 WebSocket 握手不带它：不设置时
    # 内核与终端的 WebSocket 得到 403（docs/design-v0.7.md 第 11 节的先行验证）。
    JUPYTERHUB_ALLOW_TOKEN_IN_URL: "1"
  cpu: { limit: 2, guarantee: 0.5 }
  memory: { limit: 4G, guarantee: 1G }
  # 选择 CPU、整卡 GPU 或 MIG 切片；GPU 镜像要带 CUDA（例如 pytorch-notebook 的 cuda 标签，同样固定摘要）。
  profileList:
    - display_name: CPU
      default: true
      kubespawner_override:
        # CPU 的内核运行在 gVisor 中（需要集群中名为 gvisor 的 RuntimeClass）。GPU 配置不用它：GPU 节点上
        # 要用 gVisor 的 nvproxy 并按 gVisor 文档核对驱动版本，或改用 Kata，这一组合没有经过验证。
        extra_pod_config:
          runtimeClassName: gvisor
    - display_name: GPU
      kubespawner_override:
        image: quay.io/jupyter/pytorch-notebook:cuda12-2026-10-12@sha256:<摘要>
        extra_resource_limits: { nvidia.com/gpu: "1" }
    - display_name: GPU（MIG 1g.10gb）
      kubespawner_override:
        image: quay.io/jupyter/pytorch-notebook:cuda12-2026-10-12@sha256:<摘要>
        extra_resource_limits: { nvidia.com/mig-1g.10gb: "1" }
  networkPolicy:
    enabled: true

# 回收空闲的服务器：空闲 20 分钟，最长 8 小时。
cull:
  enabled: true
  timeout: 1200
  every: 300
  maxAge: 28800
```

要点：

- 人多卡少时用 MIG 切分的普通容器，或者只让主讲现场运行、学习者看录制的输出（`:run: compile`）。
- 学习者的令牌只在页面的 `sessionStorage` 中（关闭标签页即清除），只发往文稿的地址；它的权限由 hub 的令牌范围决定，建议学习者创建有期限的令牌。
- 构建时（`presmium build`）没有学习者：运营者用自己的令牌录制输出，地址写在 `PRESMIUM_ENV_<名>_URL` 中（如 `https://hub.example.edu/user/author/`），与文稿的 `url` 同源。

## agent-sandbox

agent-sandbox（Kubernetes SIG Apps）为每个沙箱建一个有固定身份的 Pod；`SandboxTemplate` 由管理员维护，`SandboxWarmPool` 预热，`SandboxClaim` 取用。下面的模板在沙箱中运行一台 Jupyter Server（扩展的 API 组为 `extensions.agents.x-k8s.io/v1beta1`，以你安装的版本为准）：

```yaml
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxTemplate
metadata:
  name: presmium-jupyter
spec:
  podTemplate:
    spec:
      runtimeClassName: gvisor
      securityContext:
        runAsUser: 1000
        runAsNonRoot: true
      containers:
        - name: jupyter
          image: quay.io/jupyter/base-notebook:2026-10-12@sha256:3fc2b8023bb7e3f11a09bd77aa07575c1ece16a0b9b64556757e34c52f667a1a
          env:
            - name: DOCKER_STACKS_JUPYTER_CMD
              value: server
            - name: JUPYTER_TOKEN
              valueFrom:
                secretKeyRef: { name: presmium-jupyter-token, key: token }
          args:
            - start-notebook.py
            - --MappingKernelManager.cull_idle_timeout=1200
            - --MappingKernelManager.cull_connected=True
          ports:
            - containerPort: 8888
          resources:
            limits: { cpu: "2", memory: 4Gi }
---
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxWarmPool
metadata:
  name: presmium-jupyter
spec:
  replicas: 1
  sandboxTemplateRef:
    name: presmium-jupyter
---
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxClaim
metadata:
  name: presmium-build
spec:
  warmPoolRef:
    name: presmium-jupyter
  lifecycle:
    shutdownPolicy: Delete
```

按 agent-sandbox 的文档把沙箱的 8888 端口暴露给运行 `presmium build`、`dev` 或 `serve` 的进程，再把地址与令牌作为 `PRESMIUM_ENV_<名>_URL`、`PRESMIUM_ENV_<名>_TOKEN` 给它。用 NetworkPolicy 只允许这些进程连接沙箱。
