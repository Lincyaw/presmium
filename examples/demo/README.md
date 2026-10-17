# 示例讲义：BPE 分词

一份面向初学者的完整讲义“BPE 分词：从字节到词元”：先说明为什么需要分词，再手算 BPE，然后用 Python 实现训练、编码与解码，延伸一章把同样的统计交给 C 程序和 GPU 来做，最后回顾。入口是 `lecture.md`（头部与封面），各章在 `pages/` 下，讲义引用的代码在 `../sample-repo/src/bpe.py`。

同一份讲义也是示例工作区 `../workspace` 中的文档 `bpe/`，在那里可以体验 `presmium serve` 的编辑模式与 AI 修改（见 `../workspace/README.md`）。

## 构建与预览

在仓库根目录运行（先 `pnpm install`）：

| 命令 | 作用 |
|---|---|
| `pnpm demo:check` | 编译并运行全部检查，只输出诊断 |
| `pnpm demo:build` | 构建网页、幻灯片与 notebook，产物在 `examples/demo/dist/` |
| `pnpm demo:ir` | 把中间表示输出到标准输出 |
| `pnpm --filter presmium-demo dev` | 开发服务器，保存源码后页面就地更新 |

构建后服务整个 `dist/`，网页在 `/web/`，幻灯片在 `/slides/`：

```sh
pnpm exec sirv examples/demo/dist --single slides/index.html --port 8080
```

## 讲义中运行的代码

讲义中的代码在构建时运行，输出录在 `.presmium/freeze/` 中并随讲义提交，所以别人构建时不需要这些运行环境，看到的输出也相同：

- Python：本机的 `python3`。延伸一章的三个代码块属于同一个会话（`:session: bpe`），先训练、再编码，其中生成规则表的一块只显示输出（`:echo: false`）。
- C：在 WebAssembly 中由随插件发布的 clang 编译、运行，构建机不需要 C 编译器；网页与幻灯片中点“运行”，浏览器下载同一个编译器（约 50 MB）再运行。
- WGSL 计算着色器：在 Playwright 的 Chromium 中运行。有显卡时用显卡（现有的录制来自 RTX 5090），没有时用 CPU 模拟的 SwiftShader。浏览器没有 WebGPU 或没有可用的显卡时，面板显示这份录制并写明原因。

录制记下了运行环境（Python 版本、Playwright 的 Chromium 版本与显卡）。在别的环境中构建时（例如 Python 3.12、没有 RTX 50 系列显卡的机器，或升级了 Playwright 之后），代码没有改动就沿用录制，并对每个这样的代码块给出警告 `recorded output was made with …`，所以 `pnpm demo:build` 只在录制它们的环境中没有警告；冒烟用例 `e2e/smoke.spec.ts` 只容许这一种警告。要在本机重新运行并替换录制，在头部写 `execute: { rerun: environment }`。

## 讲授：用火山引擎合成并回放

讲解就是讲授的脚本：讲解中的 `{cue}` 在说到某个字时聚光一段代码、显示录制的输出或停顿，`{say}` 让 `BPE` 读作“B P E”。头部的 `renderers` 列出了讲授渲染端 `lecture`，但 `pnpm demo:build` 不构建它：合成要调用收费的语音服务，需要凭据。所以默认构建的网页中，“视图”菜单的“讲授”只写着“这份讲义还没有讲授”。配置火山引擎后这样合成并回放：

1. 在运行 `presmium` 的终端中设置火山引擎的 API Key（不要写进仓库）：

   ```sh
   export PRESMIUM_SPEECH_VOLCENGINE_KEY=<火山引擎控制台的 API Key>
   # 旧版控制台的密钥另需：export PRESMIUM_SPEECH_VOLCENGINE_APPID=<APP ID>
   ```

2. 在 `lecture.md` 头部选一个音色，把 `lecture: {}` 改为：

   ```yaml
   lecture: { voice: { engine: volcengine, voice: zh_female_xiaohe_uranus_bigtts } }
   ```

   可选的音色还有 `zh_female_vv_uranus_bigtts`（Vivi 2.0）、`zh_male_m191_uranus_bigtts`（云舟 2.0）、`zh_male_taocheng_uranus_bigtts`（小天 2.0）。

3. 构建网页与讲授：`pnpm --filter presmium-demo lecture:build`（即 `presmium build --to web,lecture`）。每一步的讲解合成为讲授 `script`，发布在 `dist/lecture/`；合成的片段存进合成缓存 `.presmium/speech/` 与 `.presmium/speech.lock.json`。提交它们之后，别人构建时不再调用语音服务，也不需要凭据。

4. 服务 `dist/`（同上），打开 `/web/?view=lecture&track=script`：放映视图下方是播放栏，播放、倍速、字幕与逐字稿都在那里，界面写明“AI 合成语音（火山引擎）”。

也可以不构建，直接 `pnpm --filter presmium-demo dev` 后打开网页的 `?view=lecture&track=script`，服务端按需合成。

写上音色之后，没有设置凭据、合成缓存中又缺少某句话时，`presmium check` 与构建对每一句给出错误，所以只在设置了凭据的地方写音色，或者把合成缓存一起提交。
