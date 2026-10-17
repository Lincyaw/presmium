---
title: 课程站点
lang: zh-CN
translations: { en: lecture.en.md }
renderers:
  web:
    nav:
      - { text: 课程主页, link: 'https://course.example.edu/' }
      - { text: 第二章, link: /chapter2.html }
    footer: { message: 课程资料按 CC BY 4.0 发布, copyright: 2026 课程组 }
    head: { description: 一门检查站点外壳的课程, image: media/cover.png }
    sitemap: { hostname: 'https://course.example.edu' }
  slides: {}
---

# 课程站点

封面的讲解。

(start)=
# 第一章 起步

章首的讲解。

(starter)=
## 起始代码

本节的起始代码可以下载，整个起始目录也可以。

:::{slide}
- [起始代码](starter/main.py)
- [整个起始目录](starter/)

<video controls poster="media/cover.png"><source src="media/clip.webm" type="video/webm"></video>
:::

(practice)=
## 起步的练习

[缺失的讲义](handouts/missing.pdf)无法发布。

[隐藏的目录](.handouts/)不发布。

<p>原始 HTML 中的文字 <code> href=not-a-file.txt</code> 不是属性。</p>

(chapter2)=
# 第二章 深入

(deep)=
## 深入的内容

第二章讲鹦鹉螺。
