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
          const params = variant.queryParams || '';
          const postData = variant.postData && variant.postData.text ? variant.postData.text : '';
          
          // 根据请求类型显示不同的参数信息
          let displayParams;
          if (group.method.toUpperCase() === 'POST' && postData) {
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
          const testUrl = group.path + (params ? '?' + params : '');
          
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