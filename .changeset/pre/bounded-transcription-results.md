---
"@lincyaw/mcp": patch
"@lincyaw/skills": patch
---

限制 MCP 转写结果的默认返回量，支持按字段选择和不可变候选的精确 Unicode 分片续读，避免长转写一次占满模型上下文；小结果保持兼容，不增加工具或验证参数。
