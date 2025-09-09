// Dashboard JavaScript functionality
let apiData = [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function () {
  console.log('HAR Mock Server 测试面板已加载完成');
  loadAPIData();
});

// 加载API数据
async function loadAPIData() {
  try {
    const response = await fetch('/api/dashboard-data');
    const data = await response.json();

    apiData = data.apiList;
    updateStats(data.stats);
    renderAPIList(apiData);

    console.log('共找到', apiData.length, '个 API 组');
  } catch (error) {
    console.error('加载API数据失败:', error);
    document.getElementById('api-list').innerHTML =
      '<div style="text-align: center; padding: 40px; color: #dc3545;">加载API数据失败，请检查服务器连接</div>';
  }
}

// 更新统计信息
function updateStats(stats) {
  document.getElementById('api-count').textContent = stats.apiCount;
  document.getElementById('variant-count').textContent = stats.variantCount;
  document.getElementById('endpoint-count').textContent = stats.endpointCount;
}

// 渲染API列表
function renderAPIList(apiList) {
  const container = document.getElementById('api-list');

  const apiGroupsHtml = apiList.map((api, apiIndex) => {
    const variantsHtml = api.variants.map((variant, variantIndex) => {
      return `
      <div class="variant">
        <div class="variant-info">
          <div class="params"><strong>参数:</strong> ${variant.displayParams}</div>
        </div>
        <button class="test-btn" 
                data-method="${api.method}" 
                data-url="${variant.testUrl}" 
                data-post-data="${variant.encodedPostData}"
                data-api-index="${apiIndex}" 
                data-variant-index="${variantIndex}"
                onclick="testAPIClick(this)">
          测试
        </button>
      </div>`;
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

  container.innerHTML = apiGroupsHtml;
}

// 过滤API
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

// 测试API按钮点击处理
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

// 测试API
function testAPI(method, url, postData, apiIndex, variantIndex) {
  // 构建完整的请求URL
  const baseUrl = window.location.origin;
  const requestUrl = baseUrl + url;

  // 解析URL参数
  const [, queryString] = url.split('?');
  const params = queryString ? new URLSearchParams(queryString) : new URLSearchParams();

  // 打开新标签页并加载测试结果页面
  const testWindow = window.open('/test-result.html', '_blank');

  // 等待页面加载完成后初始化内容
  testWindow.addEventListener('load', function () {
    // 设置页面标题和基本信息
    testWindow.document.title = `API 测试结果 - ${method} ${url}`;
    testWindow.document.getElementById('method-badge').textContent = method;
    testWindow.document.getElementById('request-url').textContent = requestUrl;

    // 显示请求参数
    const requestParamsElement = testWindow.document.getElementById('request-params');
    let paramsContent = '';

    if (method.toUpperCase() === 'POST' && postData) {
      try {
        const jsonData = JSON.parse(postData);
        // 压缩JSON为一行显示，全部显示不截断
        paramsContent = JSON.stringify(jsonData);
      } catch (e) {
        // 如果不是有效JSON，显示原始数据，全部显示不截断
        paramsContent = postData;
      }
    } else if (params.size > 0) {
      // GET请求显示URL参数（一行显示）
      const paramItems = Array.from(params.entries()).map(([key, value]) =>
        `${key}=${value}`
      ).join('&');
      paramsContent = paramItems;
    } else {
      paramsContent = '无参数';
    }

    requestParamsElement.textContent = paramsContent;

    // 开始发送请求
    performAPITest(testWindow, requestUrl, method, postData);
  });
}

// 执行API测试请求
function performAPITest(testWindow, requestUrl, method, postData) {
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
      // 更新状态徽章
      const statusBadgeElement = testWindow.document.getElementById('status-badge');
      const statusBadgeClass = result.ok ? 'status-success' : 'status-error';
      statusBadgeElement.className = `status-badge ${statusBadgeClass}`;
      statusBadgeElement.textContent = `${result.status} ${result.statusText}`;

      // 显示响应数据
      const responseElement = testWindow.document.getElementById('response-data');
      let responseContent = '';

      if (result.data) {
        if (result.isText) {
          responseContent = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
        } else {
          responseContent = JSON.stringify(result.data, null, 2);
        }
      } else {
        responseContent = '无响应数据';
      }

      responseElement.textContent = responseContent;
      responseElement.className = 'code-block';
    })
    .catch(error => {
      // 更新状态徽章为错误状态
      const statusBadgeElement = testWindow.document.getElementById('status-badge');
      statusBadgeElement.className = 'status-badge status-error';
      statusBadgeElement.textContent = '请求失败';

      // 显示错误信息
      const responseElement = testWindow.document.getElementById('response-data');
      responseElement.textContent = `错误信息: ${error.message}`;
      responseElement.className = 'code-block';
    });
}