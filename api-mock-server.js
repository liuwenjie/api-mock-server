#!/usr/bin/env node

/**
 * HAR Mock Server
 * A Node.js application that creates a mock server based on HAR (HTTP Archive) files
 * 
 * Usage: node api-mock-server.js [har-file-path] [options]
 * Options:
 *   --port, -p: Server port (default: 3000)
 *   --har, -h: Path to HAR file
 *   --verbose, -v: Enable verbose logging
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const querystring = require('querystring');
const commander = require('commander');
const chalk = require('chalk');
const morgan = require('morgan');

class ApiMockServer {
  constructor(harFilePath, options = {}) {
    this.harFilePath = harFilePath;
    this.port = options.port || 3000;
    this.verbose = options.verbose || false;
    this.app = express();
    this.harData = null;
    this.requestMap = new Map();
    this.apiGroups = new Map(); // 存储按路径分组的API变体
  }

  /**
   * Initialize the mock server
   */
  async init() {
    try {
      // Load and parse HAR file
      await this.loadHARFile();

      // Setup Express middleware
      this.setupMiddleware();

      // Process HAR entries and setup routes
      this.processHAREntries();

      // Setup default 404 handler
      this.setup404Handler();

      // Start server
      this.startServer();
    } catch (error) {
      console.error(chalk.red('❌ Failed to initialize server:'), error.message);
      process.exit(1);
    }
  }

  /**
   * Load and validate HAR file
   */
  async loadHARFile() {
    try {
      // Check if file exists
      if (!fs.existsSync(this.harFilePath)) {
        throw new Error(`HAR file not found: ${this.harFilePath}`);
      }

      // Read and parse HAR file
      const harContent = fs.readFileSync(this.harFilePath, 'utf8');
      this.harData = JSON.parse(harContent);

      // Validate HAR structure
      if (!this.harData.log || !this.harData.log.entries) {
        throw new Error('Invalid HAR file structure: missing log.entries');
      }

      console.log(chalk.green(`✅ Loaded HAR file: ${this.harFilePath}`));
      console.log(chalk.blue(`📊 Found ${this.harData.log.entries.length} entries`));
    } catch (error) {
      throw new Error(`Failed to load HAR file: ${error.message}`);
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Parse JSON bodies
    this.app.use(express.json({ limit: '50mb' }));

    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true, limit: '50mb' }));

    // Parse raw bodies for other content types (exclude JSON and form data)
    this.app.use(express.raw({
      type: (req) => {
        const contentType = req.get('content-type') || '';
        return !contentType.includes('application/json') &&
          !contentType.includes('application/x-www-form-urlencoded') &&
          !contentType.includes('multipart/form-data');
      },
      limit: '50mb'
    }));

    // Enable CORS with proper headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control, Pragma');
      res.header('Access-Control-Max-Age', '86400');

      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      next();
    });

    // Logging middleware (only if verbose mode)
    if (this.verbose) {
      this.app.use(morgan('combined'));
    }

    // Add dashboard routes
    this.app.get('/_dashboard', (req, res) => this.serveDashboard(req, res));
    this.app.get('/api/dashboard-data', (req, res) => this.getDashboardData(req, res));

    // Serve static files for dashboard
    this.app.get('/dashboard.js', (req, res) => {
      res.sendFile(path.join(__dirname, 'dashboard.js'));
    });

    this.app.get('/test-result.html', (req, res) => {
      res.sendFile(path.join(__dirname, 'test-result.html'));
    });
  }

  /**
   * Process HAR entries and create request mappings
   */
  processHAREntries() {
    this.harData.log.entries.forEach((entry, index) => {
      const request = entry.request;
      const response = entry.response;

      try {
        // Parse URL to get path and query using modern URL API
        const parsedUrl = new URL(request.url);
        const basePath = parsedUrl.pathname;
        const rawQueryParams = parsedUrl.search.slice(1); // Remove the '?' prefix

        // 规范化查询参数顺序以确保一致性匹配
        const normalizedQueryParams = this.sortQueryString(rawQueryParams);

        const requestKey = this.generateRequestKey(
          request.method,
          basePath,
          normalizedQueryParams,
          request.postData
        );

        // 检查是否已存在相同的请求键
        if (this.requestMap.has(requestKey)) {
          if (this.verbose) {
            console.log(chalk.yellow(`⚠️  重复的请求键，将覆盖: ${requestKey}`));
          }
        }

        // Store the exact mapping for request matching
        this.requestMap.set(requestKey, {
          request,
          response,
          index,
          path: basePath,
          method: request.method,
          originalUrl: request.url,
          queryParams: rawQueryParams, // 保留原始查询参数用于显示
          normalizedQueryParams: normalizedQueryParams // 保存规范化后的参数用于匹配
        });

        // Group APIs by method and path for summary display
        const apiKey = `${request.method}:${basePath}`;
        if (!this.apiGroups.has(apiKey)) {
          this.apiGroups.set(apiKey, {
            method: request.method,
            path: basePath,
            variants: []
          });
        }

        // Add this variant to the group
        this.apiGroups.get(apiKey).variants.push({
          queryParams: rawQueryParams, // 原始查询参数用于显示
          normalizedQueryParams: normalizedQueryParams, // 规范化参数用于匹配
          postData: request.postData,
          response: response,
          originalUrl: request.url,
          requestKey: requestKey,
          index: index
        });

        if (this.verbose) {
          console.log(chalk.gray(`📝 Mapped: ${request.method} ${basePath}${rawQueryParams ? '?' + rawQueryParams : ''}`));
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Failed to parse URL: ${request.url} - ${error.message}`));
      }
    });

    // Log API groups summary
    console.log(chalk.cyan(`📊 API Groups Summary:`));
    for (const [key, group] of this.apiGroups.entries()) {
      console.log(chalk.gray(`  ${key} - ${group.variants.length} variants`));

      // Print request path
      console.log(chalk.blue(`    Path: ${group.method} ${group.path}`));

      // Print all parameter variants for this API
      group.variants.forEach((variant, index) => {
        const params = variant.queryParams || '';

        if (params) {
          // Display parameters in one line connected with &
          console.log(chalk.gray(`    [${index + 1}] Parameters: ${params}`));
        } else {
          console.log(chalk.gray(`    [${index + 1}] Parameters: (no parameters)`));
        }

        // If there's POST data, show it too
        if (variant.postData && variant.postData.text) {
          const bodyPreview = variant.postData.text.length > 100 ?
            variant.postData.text.substring(0, 100) + '...' :
            variant.postData.text;
          console.log(chalk.gray(`        Body: ${bodyPreview}`));
        }
      });
      console.log(''); // Empty line between API groups
    }

    // Setup dynamic route handler (this should be last)
    this.app.use('*', (req, res) => this.handleRequest(req, res));
  }

  /**
   * Normalize JSON for consistent matching
   * 处理JSON字符串的规范化，包括多层嵌套结构
   */
  normalizeJson(jsonString) {
    if (!jsonString || typeof jsonString !== 'string') {
      return jsonString;
    }

    try {
      const obj = JSON.parse(jsonString);
      const normalized = this.sortObjectKeys(obj);
      return JSON.stringify(normalized);
    } catch (error) {
      // 如果JSON解析失败，尝试清理常见的格式问题
      try {
        // 移除多余的空白字符
        const cleaned = jsonString.replace(/\s+/g, ' ').trim();
        const obj = JSON.parse(cleaned);
        const normalized = this.sortObjectKeys(obj);
        return JSON.stringify(normalized);
      } catch {
        // 如果仍然失败，返回原始字符串
        return jsonString;
      }
    }
  }

  /**
   * Recursively sort object keys for consistent JSON comparison
   * 处理多层嵌套结构、数组、特殊值等边缘情况
   */
  sortObjectKeys(obj) {
    // 处理基本类型和null
    if (obj === null || obj === undefined) {
      return obj;
    }

    // 处理非对象类型（字符串、数字、布尔值等）
    if (typeof obj !== 'object') {
      return obj;
    }

    // 处理Date对象
    if (obj instanceof Date) {
      return obj.toISOString();
    }

    // 处理数组
    if (Array.isArray(obj)) {
      const processedArray = obj.map(item => this.sortObjectKeys(item));

      // 对于对象数组，可以考虑按某种规则排序以确保一致性
      // 但这可能会改变业务逻辑，所以暂时保持原顺序
      return processedArray;
    }

    // 处理普通对象
    const sortedObj = {};

    // 获取所有键并排序（包括不可枚举的键）
    const keys = Object.keys(obj).sort();

    keys.forEach(key => {
      const value = obj[key];

      // 递归处理值
      sortedObj[key] = this.sortObjectKeys(value);
    });

    return sortedObj;
  }

  /**
   * Generate a unique key for request matching
   */
  generateRequestKey(method, path, queryString, postData) {
    let key = `${method.toUpperCase()}:${path}`;

    // Include query parameters in key if present
    if (queryString && queryString.length > 0) {
      const sortedQuery = this.sortQueryString(queryString);
      key += `?${sortedQuery}`;
    }

    // Include POST data in key if present (with relaxed matching)
    if (postData && postData.text && postData.text.trim()) {
      // For JSON data, normalize for consistent matching
      const normalizedBody = this.normalizeJson(postData.text);
      if (normalizedBody !== postData.text) {
        // It was valid JSON, use normalized version
        key += `:body:${normalizedBody}`;
      } else {
        // Not JSON, normalize whitespace
        const normalizedText = postData.text.replace(/\s+/g, ' ').trim();
        key += `:body:${normalizedText}`;
      }
    }

    return key;
  }

  /**
   * Sort query string parameters for consistent matching
   * 处理各种边缘情况：参数顺序、数组参数、空值、编码等
   */
  sortQueryString(query) {
    if (!query) return '';

    try {
      // 先解码URL编码的字符，然后重新解析
      const decodedQuery = decodeURIComponent(query);
      const params = querystring.parse(decodedQuery);
      const sortedParams = [];

      // 按键名排序处理参数
      Object.keys(params).sort().forEach(key => {
        const value = params[key];

        if (Array.isArray(value)) {
          // 处理数组参数（如 ?tags=a&tags=b）
          value.sort().forEach(v => {
            sortedParams.push(`${key}=${v || ''}`);
          });
        } else {
          // 处理单个参数，包括空值情况
          sortedParams.push(`${key}=${value || ''}`);
        }
      });

      return sortedParams.join('&');
    } catch (error) {
      // 如果解析失败，尝试简单的字符串处理
      if (this.verbose) {
        console.warn('查询字符串解析失败，使用简单排序:', error.message);
      }
      return this.fallbackSortQuery(query);
    }
  }

  /**
   * 备用查询字符串排序方法
   */
  fallbackSortQuery(query) {
    if (!query) return '';

    return query
      .split('&')
      .map(param => param.trim())
      .filter(param => param.length > 0)
      .sort()
      .join('&');
  }



  /**
   * Handle incoming requests and match with HAR entries
   */
  handleRequest(req, res) {
    const method = req.method;
    // Use req.originalUrl to get the complete path including query
    const fullUrl = req.originalUrl;
    const [pathname, rawQueryString] = fullUrl.split('?');

    // 规范化查询字符串以确保参数顺序不影响匹配
    const normalizedQueryString = rawQueryString ? this.sortQueryString(rawQueryString) : '';

    console.log(chalk.blue(`🔍 Incoming: ${method} ${fullUrl}`));

    // Get request body if present
    let bodyText = null;
    if (req.body !== undefined) {
      if (Buffer.isBuffer(req.body)) {
        bodyText = req.body.toString();
      } else if (typeof req.body === 'object' && req.body !== null) {
        // For JSON objects, use the same normalization as HAR processing
        try {
          const normalizedBody = this.sortObjectKeys(req.body);
          bodyText = JSON.stringify(normalizedBody);
        } catch {
          bodyText = JSON.stringify(req.body);
        }
      } else {
        bodyText = String(req.body);
      }
    }

    console.log(chalk.blue(`🔍 Matching: ${method} ${pathname}${normalizedQueryString ? '?' + normalizedQueryString : ''}`));
    if (this.verbose && bodyText) {
      console.log(chalk.gray(`📝 Request body: ${bodyText.substring(0, 200)}${bodyText.length > 200 ? '...' : ''}`));

      // 显示JSON规范化信息
      if (bodyText.startsWith('{') || bodyText.startsWith('[')) {
        const normalizedBody = this.normalizeJson(bodyText);
        if (normalizedBody !== bodyText) {
          console.log(chalk.gray(`🔄 JSON normalized for matching`));
        }
      }
    }
    if (this.verbose && rawQueryString && rawQueryString !== normalizedQueryString) {
      console.log(chalk.gray(`🔄 Query normalized: ${rawQueryString} → ${normalizedQueryString}`));
    }

    // Try multiple matching strategies
    let matchedEntry = this.findMatchingEntry(method, pathname, normalizedQueryString, bodyText);

    if (matchedEntry && !matchedEntry.isPathExists) {
      // 找到精确匹配
      this.sendMockedResponse(req, res, matchedEntry);
    } else if (matchedEntry && matchedEntry.isPathExists) {
      // 路径存在但参数不匹配，返回统一响应
      this.sendDefaultResponse(req, res);
    } else {
      // 路径不存在，返回404
      console.log(chalk.yellow(`⚠️  路径不存在: ${method} ${pathname}${rawQueryString ? '?' + rawQueryString : ''}`));
      

      
      this.handleNotFound(req, res, method, pathname, rawQueryString || '');
    }
  }

  /**
   * Find matching entry using multiple strategies
   */
  findMatchingEntry(method, pathname, queryString, bodyText) {
    // Strategy 1: Exact match with body (for POST/PUT/PATCH requests)
    if (bodyText) {
      let requestKey = this.generateRequestKey(method, pathname, queryString, { text: bodyText });
      let matchedEntry = this.requestMap.get(requestKey);
      if (matchedEntry) return matchedEntry;
    }

    // Strategy 2: Exact match without body (for GET/DELETE requests)
    let requestKey = this.generateRequestKey(method, pathname, queryString, null);
    let matchedEntry = this.requestMap.get(requestKey);
    if (matchedEntry) return matchedEntry;

    // 精确匹配失败，返回特殊标识用于区分路径存在但参数不匹配的情况
    return { isPathExists: this.checkPathExists(method, pathname) };
  }

  /**
   * 检查路径是否存在（不考虑参数）
   */
  checkPathExists(method, pathname) {
    const apiKey = `${method}:${pathname}`;
    return this.apiGroups.has(apiKey);
  }

  /**
   * 发送默认响应（路径存在但参数不匹配时）
   */
  sendDefaultResponse(req, res) {
    const defaultResponse = {
      code: 200,
      msg: "成功",
      timestamp: new Date().toISOString(),
      data: []
    };

    res.status(200).json(defaultResponse);

    if (this.verbose) {
      console.log(chalk.green(`✅ 返回默认响应: ${req.method} ${req.originalUrl}`));
    }
  }

  /**
   * Handle 404 responses for non-existent paths
   */
  handleNotFound(req, res, method, pathname, queryString) {
    const errorResponse = {
      error: 'Endpoint not found',
      message: '请求的路径不存在',
      requested: {
        method,
        path: pathname,
        query: queryString || null,
        timestamp: new Date().toISOString()
      },
      availableEndpoints: this.getAvailableEndpoints()
    };

    res.status(404).json(errorResponse);

    if (this.verbose) {
      console.log(chalk.red(`❌ 路径不存在: ${method} ${pathname}${queryString ? '?' + queryString : ''}`));
    }
  }

  /**
   * Get list of available endpoints for debugging
   */
  getAvailableEndpoints() {
    const endpoints = [];
    for (const [key, entry] of this.requestMap.entries()) {
      endpoints.push({
        method: entry.method,
        path: entry.path,
        key: key
      });
    }
    return endpoints.slice(0, 10); // Limit to first 10 for readability
  }





  /**
   * Find entry by path pattern (supports simple wildcards)
   */
  findByPathPattern(method, pathname) {
    for (const [key, entry] of this.requestMap.entries()) {
      if (entry.method.toUpperCase() === method.toUpperCase()) {
        // Enhanced pattern matching: support multiple patterns
        let pattern = entry.path
          .replace(/\/\d+/g, '/\\d+')  // Match numeric IDs
          .replace(/\/[a-f0-9\-]{36}/gi, '/[a-f0-9\\-]{36}')  // Match UUIDs
          .replace(/\/[a-f0-9]{24}/gi, '/[a-f0-9]{24}')  // Match MongoDB ObjectIds
          .replace(/\//g, '\\/')  // Escape forward slashes
          .replace(/\./g, '\\.');  // Escape dots

        const regex = new RegExp(`^${pattern}$`, 'i');
        if (regex.test(pathname)) {
          return entry;
        }
      }
    }
    return null;
  }

  /**
   * Find entry by fuzzy matching (case insensitive, trailing slashes)
   */
  findByFuzzyMatch(method, pathname) {
    const normalizedPathname = pathname.toLowerCase().replace(/\/$/, '');

    for (const [key, entry] of this.requestMap.entries()) {
      if (entry.method.toUpperCase() === method.toUpperCase()) {
        const normalizedEntryPath = entry.path.toLowerCase().replace(/\/$/, '');
        if (normalizedEntryPath === normalizedPathname) {
          return entry;
        }
      }
    }
    return null;
  }

  /**
   * Send mocked response based on HAR entry
   */
  sendMockedResponse(req, res, matchedEntry) {
    const harResponse = matchedEntry.response;

    console.log(chalk.green(`✓ Matched: ${req.method} ${req.originalUrl} → Entry #${matchedEntry.index + 1}`));
    console.log(chalk.gray(`📄 Original URL: ${matchedEntry.originalUrl || 'N/A'}`));

    // Set status code
    const statusCode = harResponse.status || 200;
    res.status(statusCode);
    console.log(chalk.gray(`📊 Response status: ${statusCode}`));

    // Set headers with improved filtering
    if (harResponse.headers && Array.isArray(harResponse.headers)) {
      harResponse.headers.forEach(header => {
        // Skip headers that might cause issues
        const skipHeaders = [
          'content-encoding', 'content-length', 'transfer-encoding',
          'connection', 'upgrade', 'host', 'origin', 'referer'
        ];
        if (!skipHeaders.includes(header.name.toLowerCase())) {
          try {
            res.set(header.name, header.value);
            if (this.verbose) {
              console.log(chalk.gray(`📋 Header: ${header.name}: ${header.value}`));
            }
          } catch (error) {
            console.warn(chalk.yellow(`⚠️  Could not set header ${header.name}: ${error.message}`));
          }
        }
      });
    }

    // Ensure CORS headers are preserved
    if (!res.get('Access-Control-Allow-Origin')) {
      res.set('Access-Control-Allow-Origin', '*');
    }

    // Send response content
    if (harResponse.content && harResponse.content.text) {
      const contentType = this.getContentType(harResponse);
      console.log(chalk.gray(`📄 Content-Type: ${contentType || 'unknown'}`));
      console.log(chalk.gray(`📏 Content length: ${harResponse.content.text.length} chars`));

      // Handle different content types
      if (contentType && contentType.includes('application/json')) {
        try {
          const jsonContent = JSON.parse(harResponse.content.text);
          console.log(chalk.green(`📤 Sending JSON response`));
          res.json(jsonContent);
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Invalid JSON in response: ${error.message}`));
          console.log(chalk.green(`📤 Sending as text response`));
          res.send(harResponse.content.text);
        }
      } else {
        console.log(chalk.green(`📤 Sending text response`));
        res.send(harResponse.content.text);
      }
    } else {
      console.log(chalk.yellow(`📤 Sending empty response`));
      res.end();
    }
  }

  /**
   * Get content type from response headers
   */
  getContentType(harResponse) {
    if (harResponse.headers) {
      const contentTypeHeader = harResponse.headers.find(
        h => h.name.toLowerCase() === 'content-type'
      );
      return contentTypeHeader ? contentTypeHeader.value : null;
    }
    return null;
  }

  /**
   * Setup 404 handler for unmatched requests
   */
  setup404Handler() {
    // This is now handled in handleRequest method
    // Keep this method for backward compatibility but don't add middleware
    if (this.verbose) {
      console.log(chalk.gray('📝 404 handler integrated into main request handler'));
    }
  }

  /**
   * Serve dashboard page
   */
  serveDashboard(req, res) {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
  }

  /**
   * Get dashboard data as JSON
   */
  getDashboardData(req, res) {
    const apiList = Array.from(this.apiGroups.entries())
      .map(([key, group]) => ({
        method: group.method,
        path: group.path,
        variants: group.variants.map(variant => {
          const originalParams = variant.queryParams || '';
          const normalizedParams = variant.normalizedQueryParams || '';
          const postData = variant.postData && variant.postData.text ? variant.postData.text : '';

          // 根据请求类型显示不同的参数信息
          let displayParams;
          if (group.method.toUpperCase() === 'POST' && postData) {
            // POST请求显示压缩的JSON（一行显示）
            try {
              const jsonData = JSON.parse(postData);
              // 压缩JSON为一行，全部显示不截断
              displayParams = JSON.stringify(jsonData);
            } catch (e) {
              // 如果不是有效JSON，显示原始数据，全部显示不截断
              displayParams = postData;
            }
          } else if (originalParams) {
            // GET请求显示原始URL参数（用于显示）
            displayParams = originalParams;
          } else {
            displayParams = '无参数';
          }

          const shortUrl = variant.originalUrl;

          // 构建测试URL - 使用规范化后的参数确保能匹配到数据
          const testUrl = group.path + (normalizedParams ? '?' + normalizedParams : '');

          // 使用base64编码来安全传递JSON数据
          const encodedPostData = postData ? btoa(unescape(encodeURIComponent(postData))) : '';

          return {
            displayParams,
            shortUrl,
            testUrl,
            encodedPostData
          };
        })
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const totalVariants = apiList.reduce((sum, api) => sum + api.variants.length, 0);

    const stats = {
      apiCount: apiList.length,
      variantCount: totalVariants,
      endpointCount: this.requestMap.size
    };

    res.json({
      apiList,
      stats
    });
  }





  /**
   * Start the Express server
   */
  startServer() {

    // Start the server
    const server = this.app.listen(this.port, () => {
      console.log(chalk.green(`\n🚀 HAR Mock Server is running!`));
      console.log(chalk.blue(`📡 Server URL: http://localhost:${this.port}`));
      console.log(chalk.cyan(`📊 Dashboard: http://localhost:${this.port}/_dashboard`));
      console.log(chalk.gray(`📁 HAR File: ${this.harFilePath}`));
      console.log(chalk.gray(`📊 Total mocked endpoints: ${this.requestMap.size}`));
      

      
      console.log(chalk.yellow(`\n⌨️  Press Ctrl+C to stop the server\n`));
    });

    // Handle server startup errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(chalk.red(`❌ Port ${this.port} is already in use`));
        console.log(chalk.yellow(`💡 Please stop the process using port ${this.port} or use a different port`));
        process.exit(1);
      } else {
        console.error(chalk.red('❌ Server startup failed:'), error.message);
        process.exit(1);
      }
    });
  }
}

/**
 * CLI Configuration
 */
const program = new commander.Command();

program
  .name('api-mock-server')
  .description('Create a mock server from HAR files')
  .version('1.0.0')
  .argument('[har-file]', 'Path to HAR file')
  .option('-p, --port <number>', 'Server port', '3000')
  .option('-h, --har <path>', 'Path to HAR file')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action((harFile, options) => {
    // Determine HAR file path
    const harFilePath = harFile || options.har;

    if (!harFilePath) {
      console.error(chalk.red('❌ Error: HAR file path is required'));
      console.log('\nUsage: node api-mock-server.js <har-file> [options]');
      console.log('   or: node api-mock-server.js --har <har-file> [options]');
      process.exit(1);
    }

    // Resolve absolute path
    const absolutePath = path.resolve(harFilePath);

    // Create and start server
    const server = new ApiMockServer(absolutePath, {
      port: parseInt(options.port),
      verbose: options.verbose
    });

    server.init();
  });

// Parse command line arguments
program.parse(process.argv);

// Export for programmatic use
module.exports = ApiMockServer;