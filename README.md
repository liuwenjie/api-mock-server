# 🚀 HAR Mock Server

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**[English](README.md) | [中文](README_zh.md)**

A powerful and intuitive Node.js mock server that automatically creates API mocks from HAR (HTTP Archive) files. Perfect for frontend development, API testing, and offline development scenarios.

## ✨ Features

### 🎯 **Smart Request Matching**
- **Exact Matching**: Method, URL path, query parameters, and request body
- **Fuzzy Matching**: Pattern-based matching for dynamic URLs
- **Parameter Variants**: Support for multiple parameter combinations
- **POST JSON Support**: Intelligent JSON body matching and normalization

### 🖥️ **Interactive Dashboard**
- **Visual API Explorer**: Browse all available endpoints with a beautiful web interface
- **Real-time Testing**: Test APIs directly from the dashboard
- **Parameter Display**: View request parameters in an organized format
- **Response Preview**: Inspect API responses with syntax highlighting

### 🔧 **Developer Experience**
- **Zero Configuration**: Works out of the box with any HAR file
- **Hot Reloading**: Automatically detects HAR file changes
- **Verbose Logging**: Detailed request/response logging for debugging
- **CORS Support**: Built-in CORS handling for frontend development

### 📊 **Advanced Features**
- **Multiple HTTP Methods**: GET, POST, PUT, DELETE, PATCH support
- **Content Type Handling**: JSON, XML, plain text, and binary data
- **Error Simulation**: Test error scenarios with 4xx/5xx responses
- **Request Variants**: Handle different parameter combinations for the same endpoint

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/liuwenjie/api-mock-server.git
cd api-mock-server

# Install dependencies
npm install
```

### Basic Usage

```bash
# Start with a HAR file
node api-mock-server.js your-api.har

# Custom port
node api-mock-server.js your-api.har --port 8080

# Enable verbose logging
node api-mock-server.js your-api.har --verbose
```

### 🎮 Try the Demo

```bash
# Use the included test HAR file
node api-mock-server.js test.har

# Open the dashboard
open http://localhost:3000/_dashboard
```

## 📖 Usage Guide

### Command Line Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--port` | `-p` | Server port | `3000` |
| `--har` | `-h` | HAR file path | Required |
| `--verbose` | `-v` | Enable verbose logging | `false` |

### Examples

```bash
# Basic usage
node api-mock-server.js api-recording.har

# Custom configuration
node api-mock-server.js api-recording.har -p 5000 -v

# Alternative syntax
node api-mock-server.js --har api-recording.har --port 8080 --verbose
```

## 🎨 Dashboard Features

Access the interactive dashboard at `http://localhost:3000/_dashboard`

### 📋 **API Explorer**
- View all available endpoints organized by HTTP method
- See parameter variants for each endpoint
- Browse request/response examples

### 🧪 **Built-in Testing**
- Test APIs directly from the browser
- View formatted request parameters
- Inspect response data with syntax highlighting
- Test different parameter combinations

### 📊 **Statistics**
- Total API endpoints
- Parameter variants count
- Mock endpoint statistics

## 📁 HAR File Generation

### Browser DevTools
1. **Chrome**: DevTools → Network → Export HAR
2. **Firefox**: Developer Tools → Network → Save All As HAR
3. **Safari**: Web Inspector → Network → Export

### API Tools
- **Postman**: Collection → Export → HAR
- **Insomnia**: Export → HAR
- **Charles/Whistle Proxy**: File → Export Session → HAR

## 🎯 Use Cases

### 🔨 **Frontend Development**
- Mock backend APIs during frontend development
- Test different API response scenarios
- Develop offline without backend dependencies

### 🧪 **API Testing**
- Create test environments with recorded API interactions
- Simulate error conditions and edge cases
- Performance testing with consistent responses

### 📚 **API Documentation**
- Interactive API exploration
- Live examples with real request/response data
- Team collaboration and API understanding

### 🔄 **Integration Testing**
- Mock external service dependencies
- Consistent test environments
- Reproducible test scenarios

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- HAR specification by the [Web Performance Working Group](https://w3c.github.io/web-performance/specs/HAR/Overview.html)
- Inspired by various mock server tools in the community
- Built with ❤️ for the developer community

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/liuwenjie/api-mock-server/issues)
- 💡 **Feature Requests**: [GitHub Discussions](https://github.com/liuwenjie/api-mock-server/discussions)
- 📖 **Documentation**: [Wiki](https://github.com/liuwenjie/api-mock-server/wiki)

---

<div align="center">

**[⭐ Star this repo](https://github.com/liuwenjie/api-mock-server)** if you find it useful!

Made with ❤️ by developers, for developers.

</div>