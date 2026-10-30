# 影片中的照片

故事场景的背景是实拍照片，来自 Wikimedia Commons。每张裁成 16:9、缩到 2560 px 宽，存为 webp。

| 文件 | 用在 | 原图 | 作者 | 许可 | 处理 |
|---|---|---|---|---|---|
| `photo-night-desk.webp` | 深夜提问；视频与回复（`film-story.ts` 的 `question`、`video`） | [Incandescent bulb lamp glowing on a desk at night](https://commons.wikimedia.org/wiki/File:Incandescent_bulb_lamp_glowing_on_a_desk_at_night.jpg) | Sihyeon0621 | CC BY-SA 4.0 | 从第 500 行起裁 16:9，高斯模糊半径 4 px，作为景深外的背景 |
| `photo-chalkboard.webp` | 黑板（`board`） | [Blackboard in library](https://commons.wikimedia.org/wiki/File:Blackboard_in_library.jpg) | Daniellemichel | CC BY-SA 4.0 | 从第 720 行起裁 16:9，去掉上方的字母条，保留粉笔槽 |
| `photo-lecture-hall.webp` | 课堂（`film-product.ts` 的 `lesson`） | [Alex presenting GoSweat](https://commons.wikimedia.org/wiki/File:Alex_presenting_GoSweat.jpg) | DefinitelyOwen | CC BY-SA 4.0 | 从第 450 行起裁 16:9；投影画面在原图 x 718–1993、y 797–1514，被幻灯片盖住 |
| `photo-lecture-front.webp` | 课堂，盖在幻灯片上面 | 同上 | 同上 | 同上 | 投影区域内的人头与吊灯按亮度与颜色抠出的透明图层，与 `photo-lecture-hall.webp` 对齐 |
