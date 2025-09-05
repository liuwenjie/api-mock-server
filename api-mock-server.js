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

class HARMockServer {
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

    // Add dashboard route
    this.app.get('/_dashboard', (req, res) => this.serveDashboard(req, res));
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
        const queryParams = parsedUrl.search.slice(1); // Remove the '?' prefix

        const requestKey = this.generateRequestKey(
          request.method,
          basePath,
          queryParams,
          request.postData
        );

        // Store the exact mapping for request matching
        this.requestMap.set(requestKey, {
          request,
          response,
          index,
          path: basePath,
          method: request.method,
          originalUrl: request.url,
          queryParams: queryParams
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
          queryParams: queryParams,
          postData: request.postData,
          response: response,
          originalUrl: request.url,
          requestKey: requestKey,
          index: index
        });

        if (this.verbose) {
          console.log(chalk.gray(`📝 Mapped: ${request.method} ${basePath}${queryParams ? '?' + queryParams : ''}`));
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
   */
  normalizeJson(jsonString) {
    try {
      const obj = JSON.parse(jsonString);
      return JSON.stringify(this.sortObjectKeys(obj));
    } catch {
      return jsonString;
    }
  }

  /**
   * Recursively sort object keys for consistent JSON comparison
   */
  sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObjectKeys(item));
    }

    const sortedObj = {};
    Object.keys(obj).sort().forEach(key => {
      sortedObj[key] = this.sortObjectKeys(obj[key]);
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
   */
  sortQueryString(query) {
    if (!query) return '';
    const params = querystring.parse(query);
    const sortedParams = Object.keys(params).sort().map(key => {
      return `${key}=${params[key]}`;
    });
    return sortedParams.join('&');
  }

  /**
   * Handle incoming requests and match with HAR entries
   */
  handleRequest(req, res) {
    const method = req.method;
    // Use req.originalUrl to get the complete path including query
    const fullUrl = req.originalUrl;
    const [pathname, queryString] = fullUrl.split('?');

    console.log(chalk.blue(`🔍 Incoming: ${method} ${fullUrl}`));

    // Get request body if present
    let bodyText = null;
    if (req.body !== undefined) {
      if (Buffer.isBuffer(req.body)) {
        bodyText = req.body.toString();
      } else if (typeof req.body === 'object' && req.body !== null) {
        // For JSON objects, normalize the key order to match HAR format
        try {
          bodyText = JSON.stringify(req.body, Object.keys(req.body).sort());
        } catch {
          bodyText = JSON.stringify(req.body);
        }
      } else {
        bodyText = String(req.body);
      }
    }

    console.log(chalk.blue(`🔍 Matching: ${method} ${pathname}${queryString ? '?' + queryString : ''}`));
    if (this.verbose && bodyText) {
      console.log(chalk.gray(`📝 Request body: ${bodyText.substring(0, 200)}${bodyText.length > 200 ? '...' : ''}`));
    }

    // Try multiple matching strategies
    let matchedEntry = this.findMatchingEntry(method, pathname, queryString || '', bodyText);

    if (matchedEntry) {
      this.sendMockedResponse(req, res, matchedEntry);
    } else {
      console.log(chalk.yellow(`⚠️  No match found for: ${method} ${pathname}${queryString ? '?' + queryString : ''}`));
      console.log(chalk.gray(`📊 Available endpoints: ${this.requestMap.size}`));
      if (this.verbose) {
        console.log(chalk.gray('🔍 Available request keys:'));
        Array.from(this.requestMap.keys()).slice(0, 5).forEach(key => {
          console.log(chalk.gray(`  - ${key}`));
        });
      }
      this.handleNotFound(req, res, method, pathname, queryString || '');
    }
  }

  /**
   * Find matching entry using multiple strategies
   */
  findMatchingEntry(method, pathname, queryString, bodyText) {
    // Strategy 1: Exact match with body
    if (bodyText) {
      let requestKey = this.generateRequestKey(method, pathname, queryString, { text: bodyText });
      let matchedEntry = this.requestMap.get(requestKey);
      if (matchedEntry) return matchedEntry;
    }

    // Strategy 2: Match without body
    let requestKey = this.generateRequestKey(method, pathname, queryString, null);
    let matchedEntry = this.requestMap.get(requestKey);
    if (matchedEntry) return matchedEntry;

    // Strategy 3: Match without query parameters (return first variant)
    requestKey = this.generateRequestKey(method, pathname, '', null);
    matchedEntry = this.requestMap.get(requestKey);
    if (matchedEntry) return matchedEntry;

    // Strategy 4: Find by API group (return first variant)
    const apiKey = `${method}:${pathname}`;
    if (this.apiGroups.has(apiKey)) {
      const group = this.apiGroups.get(apiKey);
      if (group.variants.length > 0) {
        // Return the first variant's data
        const firstVariant = group.variants[0];
        return this.requestMap.get(firstVariant.requestKey);
      }
    }

    // Strategy 5: Flexible pattern matching
    matchedEntry = this.findByPathPattern(method, pathname);
    if (matchedEntry) return matchedEntry;

    // Strategy 6: Fuzzy matching (case insensitive, ignore trailing slashes)
    matchedEntry = this.findByFuzzyMatch(method, pathname);
    if (matchedEntry) return matchedEntry;

    return null;
  }

  /**
   * Handle 404 responses with better error information
   */
  handleNotFound(req, res, method, pathname, queryString) {
    const errorResponse = {
      error: 'No matching request found in HAR file',
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
      console.log(chalk.yellow(`⚠️  No match for: ${method} ${pathname}${queryString ? '?' + queryString : ''}`));
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
    const dashboardHtml = this.generateDashboardHtml();
    res.set('Content-Type', 'text/html');
    res.send(dashboardHtml);
  }

  /**
   * Generate dashboard HTML content
   */
  generateDashboardHtml() {
    const apiList = Array.from(this.apiGroups.entries())
      .map(([key, group]) => ({
        method: group.method,
        path: group.path,
        variants: group.variants
      }))
      .sort((a, b) => a.path.localeCompare(b.path));

    const totalVariants = apiList.reduce((sum, api) => sum + api.variants.length, 0);

    const apiGroupsHtml = apiList.map((api, apiIndex) => {
      const variantsHtml = api.variants.map((variant, variantIndex) => {
        const params = variant.queryParams || '';
        const postData = variant.postData && variant.postData.text ? variant.postData.text : '';

        // 根据请求类型显示不同的参数信息
        let displayParams;
        if (api.method.toUpperCase() === 'POST' && postData) {
          // POST请求显示压缩的JSON（一行显示）
          try {
            const jsonData = JSON.parse(postData);
            // 压缩JSON为一行，并限制显示长度
            const compactJson = JSON.stringify(jsonData);
            if (compactJson.length > 200) {
              // 如果JSON太长，显示前200个字符
              displayParams = compactJson.substring(0, 200) + '...';
            } else {
              displayParams = compactJson;
            }
          } catch (e) {
            // 如果不是有效JSON，显示原始数据的前200个字符
            displayParams = postData.length > 200 ?
              postData.substring(0, 200) + '...' :
              postData;
          }
        } else if (params) {
          // GET请求显示URL参数
          displayParams = params;
        } else {
          displayParams = '无参数';
        }
        const shortUrl = variant.originalUrl.length > 100 ?
          variant.originalUrl.substring(0, 100) + '...' :
          variant.originalUrl;

        // 构建测试URL
        const testUrl = api.path + (params ? '?' + params : '');

        // 使用base64编码来安全传递JSON数据
        const encodedPostData = postData ? btoa(unescape(encodeURIComponent(postData))) : '';

        return `
        <div class="variant">
          <div class="variant-info">
            <div class="params"><strong>参数:</strong> ${displayParams}</div>
            <div class="url-info">${shortUrl}</div>
          </div>
          <button class="test-btn" 
                  data-method="${api.method}" 
                  data-url="${testUrl}" 
                  data-post-data="${encodedPostData}"
                  data-api-index="${apiIndex}" 
                  data-variant-index="${variantIndex}"
                  onclick="testAPIClick(this)">
            测试
          </button>
        </div>
        <div class="test-result" id="result-${apiIndex}-${variantIndex}"></div>`;
      }).join('');

      return `
      <div class="api-group">
        <div class="api-header">
          <span class="method ${api.method}">${api.method}</span>
          <span class="api-path">${api.path}</span>
          <span class="variant-count">${api.variants.length} 个变体</span>
        </div>
        <div class="variants">
          ${variantsHtml}
        </div>
      </div>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HAR Mock Server - API 测试面板</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      color: #333;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }
    
    .header {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      padding: 30px;
      border-radius: 15px;
      text-align: center;
      margin-bottom: 30px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .header p {
      font-size: 1.1rem;
      color: #666;
    }
    
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .stat-card {
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      padding: 20px;
      border-radius: 12px;
      text-align: center;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .stat-number {
      font-size: 2rem;
      font-weight: bold;
      color: #667eea;
      margin-bottom: 5px;
    }
    
    .stat-label {
      color: #666;
      font-size: 0.9rem;
    }
    
    .controls {
      display: flex;
      gap: 15px;
      margin-bottom: 25px;
      align-items: center;
      background: rgba(255, 255, 255, 0.9);
      backdrop-filter: blur(10px);
      padding: 20px;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    
    .controls select,
    .controls input {
      padding: 12px 16px;
      border: 2px solid #e1e5e9;
      border-radius: 8px;
      font-size: 14px;
      transition: all 0.3s ease;
      background: white;
    }
    
    .controls select:focus,
    .controls input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .api-group {
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(10px);
      margin-bottom: 20px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      transition: all 0.3s ease;
    }
    
    .api-group:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
    }
    
    .api-header {
      background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 15px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .method {
      padding: 8px 16px;
      border-radius: 25px;
      color: white;
      font-size: 12px;
      font-weight: bold;
      text-transform: uppercase;
      min-width: 70px;
      text-align: center;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    }
    
    .GET { background: linear-gradient(135deg, #28a745, #20c997); }
    .POST { background: linear-gradient(135deg, #fd7e14, #e83e8c); }
    .PUT { background: linear-gradient(135deg, #007bff, #6f42c1); }
    .DELETE { background: linear-gradient(135deg, #dc3545, #fd7e14); }
    .PATCH { background: linear-gradient(135deg, #6f42c1, #e83e8c); }
    
    .api-path {
      font-family: 'Courier New', monospace;
      font-size: 16px;
      font-weight: 600;
      flex: 1;
      color: #495057;
    }
    
    .variant-count {
      color: #6c757d;
      font-size: 13px;
      background: rgba(108, 117, 125, 0.1);
      padding: 6px 12px;
      border-radius: 15px;
      border: 1px solid rgba(108, 117, 125, 0.2);
    }
    
    .variants {
      max-height: 400px;
      overflow-y: auto;
    }
    
    .variant {
      display: flex;
      align-items: center;
      padding: 15px 20px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      transition: background-color 0.2s ease;
    }
    
    .variant:hover {
      background: rgba(102, 126, 234, 0.05);
    }
    
    .variant:last-child {
      border-bottom: none;
    }
    
    .variant-info {
      flex: 1;
      margin-right: 15px;
    }
    
    .params {
      font-family: 'Courier New', monospace;
      font-size: 14px;
      color: #495057;
      margin-bottom: 4px;
      word-break: break-all;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: rgba(248, 249, 250, 0.8);
      padding: 8px;
      border-radius: 4px;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .url-info {
      font-size: 11px;
      color: #6c757d;
      word-break: break-all;
    }
    
    .test-btn {
      background: linear-gradient(135deg, #28a745, #20c997);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.3s ease;
      min-width: 70px;
      box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
    }
    
    .test-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
    }
    
    .test-btn:disabled {
      background: #6c757d;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }
    
    .test-result {
      display: none;
      margin: 0 20px 15px 20px;
      border-radius: 12px;
      max-height: 500px;
      overflow-y: auto;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .test-result.success {
      background: linear-gradient(135deg, #f8fff9, #e8f5e8);
      border-left: 4px solid #28a745;
    }
    
    .test-result.error {
      background: linear-gradient(135deg, #fff8f8, #f5e8e8);
      border-left: 4px solid #dc3545;
    }
    
    .result-section {
      padding: 20px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .result-section:last-child {
      border-bottom: none;
    }
    
    .result-title {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 12px;
      color: #495057;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .result-content {
      background: rgba(255, 255, 255, 0.8);
      border-radius: 8px;
      padding: 16px;
      font-family: 'Courier New', monospace;
      font-size: 13px;
      line-height: 1.5;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .param-item {
      margin-bottom: 8px;
      padding: 8px 12px;
      background: rgba(102, 126, 234, 0.1);
      border-radius: 6px;
      border-left: 3px solid #667eea;
    }
    
    .param-key {
      font-weight: 600;
      color: #495057;
    }
    
    .param-value {
      color: #6c757d;
      margin-left: 8px;
    }
    
    .json-content {
      white-space: pre-wrap;
      word-break: break-word;
      color: #495057;
    }
    
    .status-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
    }
    
    .status-success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
    }
    
    .status-error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
    }
    
    .hidden { 
      display: none !important; 
    }
    
    /* 滚动条样式 */
    ::-webkit-scrollbar {
      width: 8px;
    }
    
    ::-webkit-scrollbar-track {
      background: rgba(0, 0, 0, 0.1);
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb {
      background: rgba(102, 126, 234, 0.5);
      border-radius: 4px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: rgba(102, 126, 234, 0.7);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚀 HAR Mock Server</h1>
      <p>API 测试面板 - 基于 HAR 文件的 Mock 服务</p>
    </div>
    
    <div class="stats">
      <div class="stat-card">
        <div class="stat-number">${apiList.length}</div>
        <div class="stat-label">API 接口</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${totalVariants}</div>
        <div class="stat-label">参数变体</div>
      </div>
      <div class="stat-card">
        <div class="stat-number">${this.requestMap.size}</div>
        <div class="stat-label">Mock 端点</div>
      </div>
    </div>
    
    <div class="controls">
      <select id="methodFilter" onchange="filterAPIs()">
        <option value="">所有方法</option>
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="DELETE">DELETE</option>
        <option value="PATCH">PATCH</option>
      </select>
      <input type="text" id="searchInput" placeholder="搜索 API 路径..." oninput="filterAPIs()">
    </div>
    
    <div class="api-list">
      ${apiGroupsHtml}
    </div>
  </div>
  
  <script>
    function filterAPIs() {
      const methodFilter = document.getElementById('methodFilter').value;
      const searchText = document.getElementById('searchInput').value.toLowerCase();
      
      document.querySelectorAll('.api-group').forEach(group => {
        const method = group.querySelector('.method').textContent;
        const path = group.querySelector('.api-path').textContent.toLowerCase();
        
        const methodMatch = !methodFilter || method === methodFilter;
        const pathMatch = !searchText || path.includes(searchText);
        
        if (methodMatch && pathMatch) {
          group.classList.remove('hidden');
        } else {
          group.classList.add('hidden');
        }
      });
    }
    
    function testAPIClick(button) {
      const method = button.getAttribute('data-method');
      const url = button.getAttribute('data-url');
      const encodedPostData = button.getAttribute('data-post-data');
      const apiIndex = button.getAttribute('data-api-index');
      const variantIndex = button.getAttribute('data-variant-index');
      
      // 解码POST数据
      let postData = '';
      if (encodedPostData) {
        try {
          postData = decodeURIComponent(escape(atob(encodedPostData)));
        } catch (e) {
          console.error('解码POST数据失败:', e);
          postData = '';
        }
      }
      
      testAPI(method, url, postData, apiIndex, variantIndex);
    }
    
    function testAPI(method, url, postData, apiIndex, variantIndex) {
      const resultId = 'result-' + apiIndex + '-' + variantIndex;
      const resultElement = document.getElementById(resultId);
      const btnElement = event.target;
      
      if (!resultElement) {
        console.error('找不到结果显示元素:', resultId);
        return;
      }
      
      const originalBtnText = btnElement.textContent;
      
      // 更新按钮状态
      btnElement.disabled = true;
      btnElement.textContent = '测试中...';
      btnElement.style.background = '#6c757d';
      
      // 显示结果区域
      resultElement.style.display = 'block';
      resultElement.className = 'test-result';
      resultElement.innerHTML = '<div class="result-section"><div class="result-content">正在发送请求，请稍候...</div></div>';
      
      // 构建完整的请求URL
      const baseUrl = window.location.origin;
      const requestUrl = baseUrl + url;
      
      // 解析URL参数
      const [path, queryString] = url.split('?');
      const params = queryString ? new URLSearchParams(queryString) : new URLSearchParams();
      
      // 发送请求
      const fetchOptions = {
        method: method,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Cache-Control': 'no-cache'
        },
        cache: 'no-cache'
      };
      
      // 如果是POST请求且有body数据，添加到请求中
      if (method.toUpperCase() === 'POST' && postData) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = postData;
      }
      
      fetch(requestUrl, fetchOptions)
      .then(response => {
        const contentType = response.headers.get('content-type') || '';
        
        // 处理不同类型的响应
        if (contentType.includes('application/json')) {
          return response.json().then(data => ({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            data: data
          })).catch(() => {
            return response.text().then(text => ({
              ok: response.ok,
              status: response.status,
              statusText: response.statusText,
              data: text,
              isText: true
            }));
          });
        } else {
          return response.text().then(text => ({
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            data: text,
            isText: true
          }));
        }
      })
      .then(result => {
        // 设置成功或错误的样式
        resultElement.className = 'test-result ' + (result.ok ? 'success' : 'error');
        
        // 构建参数显示
        let paramsHtml = '';
        
        // 如果是POST请求且有body数据，显示JSON参数
        if (method.toUpperCase() === 'POST' && postData) {
          try {
            const jsonData = JSON.parse(postData);
            const jsonFormatted = JSON.stringify(jsonData, null, 2);
            paramsHtml = '<div class="result-content"><div class="json-content">' + jsonFormatted + '</div></div>';
          } catch (e) {
            // 如果不是有效的JSON，直接显示原始数据
            paramsHtml = '<div class="result-content"><div class="json-content">' + postData + '</div></div>';
          }
        } 
        // 如果有URL参数，显示URL参数
        else if (params.size > 0) {
          const paramItems = Array.from(params.entries()).map(([key, value]) => 
            '<div class="param-item"><span class="param-key">' + key + ':</span><span class="param-value">' + value + '</span></div>'
          ).join('');
          paramsHtml = '<div class="result-content">' + paramItems + '</div>';
        } 
        // 没有参数
        else {
          paramsHtml = '<div class="result-content">无参数</div>';
        }
        
        // 构建响应数据显示
        let responseHtml = '';
        if (result.data) {
          if (result.isText) {
            responseHtml = '<div class="result-content"><div class="json-content">' + 
              (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)) + 
              '</div></div>';
          } else {
            responseHtml = '<div class="result-content"><div class="json-content">' + 
              JSON.stringify(result.data, null, 2) + 
              '</div></div>';
          }
        } else {
          responseHtml = '<div class="result-content">无响应数据</div>';
        }
        
        // 组合最终HTML
        const statusBadge = result.ok ? 
          '<span class="status-badge status-success">' + result.status + ' ' + result.statusText + '</span>' :
          '<span class="status-badge status-error">' + result.status + ' ' + result.statusText + '</span>';
        
        resultElement.innerHTML = 
          '<div class="result-section">' +
            '<div class="result-title">📥 请求参数</div>' +
            paramsHtml +
          '</div>' +
          '<div class="result-section">' +
            '<div class="result-title">📤 响应数据' + statusBadge + '</div>' +
            responseHtml +
          '</div>';
      })
      .catch(error => {
        resultElement.className = 'test-result error';
        
        // 构建参数显示（即使出错也显示参数）
        let paramsHtml = '';
        
        // 如果是POST请求且有body数据，显示JSON参数
        if (method.toUpperCase() === 'POST' && postData) {
          try {
            const jsonData = JSON.parse(postData);
            const jsonFormatted = JSON.stringify(jsonData, null, 2);
            paramsHtml = '<div class="result-content"><div class="json-content">' + jsonFormatted + '</div></div>';
          } catch (e) {
            // 如果不是有效的JSON，直接显示原始数据
            paramsHtml = '<div class="result-content"><div class="json-content">' + postData + '</div></div>';
          }
        } 
        // 如果有URL参数，显示URL参数
        else if (params.size > 0) {
          const paramItems = Array.from(params.entries()).map(([key, value]) => 
            '<div class="param-item"><span class="param-key">' + key + ':</span><span class="param-value">' + value + '</span></div>'
          ).join('');
          paramsHtml = '<div class="result-content">' + paramItems + '</div>';
        } 
        // 没有参数
        else {
          paramsHtml = '<div class="result-content">无参数</div>';
        }
        
        resultElement.innerHTML = 
          '<div class="result-section">' +
            '<div class="result-title">📥 请求参数</div>' +
            paramsHtml +
          '</div>' +
          '<div class="result-section">' +
            '<div class="result-title">❌ 请求失败<span class="status-badge status-error">错误</span></div>' +
            '<div class="result-content"><div class="json-content">错误信息: ' + error.message + '</div></div>' +
          '</div>';
      })
      .finally(() => {
        // 恢复按钮状态
        btnElement.disabled = false;
        btnElement.textContent = originalBtnText;
        btnElement.style.background = '';
      });
    }
    
    // 页面加载完成后的初始化
    document.addEventListener('DOMContentLoaded', function() {
      console.log('HAR Mock Server 测试面板已加载完成');
      console.log('共找到', document.querySelectorAll('.api-group').length, '个 API 组');
      console.log('共找到', document.querySelectorAll('.test-btn').length, '个测试按钮');
    });
  </script>
</body>
</html>`;
  }



  /**
   * Start the Express server
   */
  startServer() {
    const targetPort = 3000; // Always use port 3000

    // Start the server
    const server = this.app.listen(targetPort, () => {
      console.log(chalk.green(`\n🚀 HAR Mock Server is running!`));
      console.log(chalk.blue(`📡 Server URL: http://localhost:${targetPort}`));
      console.log(chalk.cyan(`📊 Dashboard: http://localhost:${targetPort}/_dashboard`));
      console.log(chalk.gray(`📁 HAR File: ${this.harFilePath}`));
      console.log(chalk.gray(`📊 Total mocked endpoints: ${this.requestMap.size}`));
      console.log(chalk.yellow(`\n⌨️  Press Ctrl+C to stop the server\n`));
    });

    // Handle server startup errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(chalk.red(`❌ Port ${targetPort} is already in use`));
        console.log(chalk.yellow(`💡 Please stop the process using port ${targetPort} or use a different port`));
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
    const server = new HARMockServer(absolutePath, {
      port: parseInt(options.port),
      verbose: options.verbose
    });

    server.init();
  });

// Parse command line arguments
program.parse(process.argv);

// Export for programmatic use
module.exports = HARMockServer;