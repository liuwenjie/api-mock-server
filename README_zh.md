# 🚀 HAR Mock Server

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**[English](README.md) | [中文](README_zh.md)**

一个强大且直观的 Node.js Mock 服务器，可以自动从 HAR（HTTP Archive）文件创建 API Mock。非常适合前端开发、API 测试和离线开发场景。只需提供一个 HAR 文件，服务器将创建与记录的 API 请求匹配的模拟端点。

## ✨ 功能特性

### 🎯 **请求匹配**
- **精确匹配**：HTTP 方法、URL 路径、查询参数和请求体
- **参数变体**：支持多种参数组合
- **POST JSON 支持**：智能 JSON 请求体匹配和规范化，支持递归键排序
- **查询参数规范化**：无论参数顺序如何，都能保持一致匹配

### 🖥️ **交互式仪表板**
- **可视化 API 浏览器**：通过美观的 Web 界面浏览所有可用端点
- **实时测试**：直接从仪表板测试 API
- **参数显示**：以有序格式查看请求参数
- **响应预览**：使用语法高亮检查 API 响应

### 🔧 **开发者体验**
- **零配置**：开箱即用，支持任何 HAR 文件
- **热重载**：自动检测 HAR 文件变化
- **详细日志**：用于调试的详细请求/响应日志
- **CORS 支持**：内置 CORS 处理，适用于前端开发
- **API 分组摘要**：清晰的控制台输出，显示所有可用端点和变体

### 📊 **高级功能**
- **多种 HTTP 方法**：支持 GET、POST、PUT、DELETE、PATCH、OPTIONS
- **内容类型处理**：JSON、XML、纯文本和二进制数据
- **错误模拟**：使用 4xx/5xx 响应测试错误场景
- **请求变体**：处理同一端点的不同参数组合
- **健康检查端点**：内置健康检查端点 `/api/health`
- **灵活的内容解析**：使用适当的正文解析器处理各种内容类型

## 🚀 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/liuwenjie/api-mock-server.git
cd api-mock-server

# 安装依赖
npm install
```

### 基本用法

```bash
# 使用 HAR 文件启动
node api-mock-server.js your-api.har

# 自定义端口
node api-mock-server.js your-api.har --port 8080

# 启用详细日志
node api-mock-server.js your-api.har --verbose
```

### 🎮 试用演示

```bash
# 使用包含的测试 HAR 文件
node api-mock-server.js test.har

# 打开仪表板
open http://localhost:3000/_dashboard
```

## 📖 使用指南

### 命令行选项

| 选项 | 简写 | 描述 | 默认值 |
|------|------|------|--------|
| `--port` | `-p` | 服务器端口 | `3000` |
| `--har` | `-h` | HAR 文件路径 | 必需 |
| `--verbose` | `-v` | 启用详细日志 | `false` |

### 示例

```bash
# 基本用法
node api-mock-server.js api-recording.har

# 自定义配置
node api-mock-server.js api-recording.har -p 5000 -v

# 替代语法
node api-mock-server.js --har api-recording.har --port 8080 --verbose
```

## 🎨 仪表板功能

访问交互式仪表板：`http://localhost:3000/_dashboard`

### 📋 **API 浏览器**
- 查看按 HTTP 方法组织的所有可用端点
- 查看每个端点的参数变体
- 浏览请求/响应示例

### 🧪 **内置测试**
- 直接从浏览器测试 API
- 查看格式化的请求参数
- 使用语法高亮检查响应数据
- 测试不同的参数组合

### 📊 **统计信息**
- API 端点总数
- 参数变体数量
- Mock 端点统计

## 📁 HAR 文件生成

### 浏览器开发者工具
1. **Chrome**：开发者工具 → Network → Export HAR
2. **Firefox**：开发者工具 → Network → Save All As HAR
3. **Safari**：Web Inspector → Network → Export

### API 工具
- **Postman**：Collection → Export → HAR
- **Insomnia**：Export → HAR
- **Charles/Whistle Proxy**：File → Export Session → HAR

## 🎯 使用场景

### 🔨 **前端开发**
- 在前端开发期间 Mock 后端 API
- 测试不同的 API 响应场景
- 在没有后端依赖的情况下离线开发

### 🧪 **API 测试**
- 使用记录的 API 交互创建测试环境
- 模拟错误条件和边缘情况
- 使用一致响应进行性能测试

### 📚 **API 文档**
- 交互式 API 探索
- 使用真实请求/响应数据的实时示例
- 团队协作和 API 理解

### 🔄 **集成测试**
- Mock 外部服务依赖
- 一致的测试环境
- 可重现的测试场景

## 📝 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- HAR 规范由 [Web Performance Working Group](https://w3c.github.io/web-performance/specs/HAR/Overview.html) 制定
- 受社区中各种 Mock 服务器工具的启发
- 为开发者社区用 ❤️ 构建

## 📞 支持

- 🐛 **Bug 报告**：[GitHub Issues](https://github.com/liuwenjie/api-mock-server/issues)
- 💡 **功能请求**：[GitHub Discussions](https://github.com/liuwenjie/api-mock-server/discussions)
- 📖 **文档**：[Wiki](https://github.com/liuwenjie/api-mock-server/wiki)

---

<div align="center">

**[⭐ 给这个仓库点星](https://github.com/liuwenjie/api-mock-server)** 如果你觉得它有用！

由开发者为开发者用 ❤️ 制作。

</div>