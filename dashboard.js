// Dashboard JavaScript functionality
let apiData = [];

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
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
          <div class="url-info">${variant.shortUrl}</div>
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