const { ipcRenderer, clipboard, nativeImage } = require('electron');
const Store = require('electron-store');
const store = new Store();

let allItems = [];

function createClipContent(item) {
  const contentDiv = document.createElement('div');
  contentDiv.className = 'clip-content';

  switch (item.type) {
    case 'image':
      const img = document.createElement('img');
      img.src = item.preview;
      img.className = 'clip-image';
      
      // 如果有尺寸信息，设置样式
      if (item.dimensions) {
        img.style.width = `${item.dimensions.previewWidth}px`;
        img.style.height = `${item.dimensions.previewHeight}px`;
      }
      
      img.onclick = (e) => {
        e.stopPropagation();
        const fullImg = document.createElement('div');
        fullImg.className = 'full-image-preview';
        fullImg.innerHTML = `
          <img src="${item.data}" alt="Full size image">
          <button class="close-preview">×</button>
          ${item.dimensions ? `<div class="image-dimensions">${item.dimensions.width} × ${item.dimensions.height}</div>` : ''}
        `;
        document.body.appendChild(fullImg);
        
        fullImg.querySelector('.close-preview').onclick = () => {
          fullImg.remove();
        };
        
        fullImg.onclick = () => {
          fullImg.remove();
        };
      };
      contentDiv.appendChild(img);
      break;

    case 'url':
      const urlContainer = document.createElement('div');
      urlContainer.className = 'url-container';
      
      const link = document.createElement('a');
      link.href = '#';
      link.className = 'clip-url';
      link.innerHTML = `<i class="bi bi-link-45deg"></i> ${item.preview}`;
      
      // 点击链接打开浏览器
      link.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const urlStr = item.data.startsWith('http') ? item.data : `https://${item.data}`;
          const url = new URL(urlStr);
          require('electron').shell.openExternal(url.href);
        } catch (error) {
          showToast('无效的 URL');
        }
      };

      // 点击容器复制链接
      urlContainer.onclick = (e) => {
        if (e.target === urlContainer) {
          clipboard.writeText(item.data);
          showToast('已复制到剪贴板');
        }
      };

      urlContainer.appendChild(link);
      contentDiv.appendChild(urlContainer);
      break;

    case 'file':
      const fileDiv = document.createElement('div');
      fileDiv.className = 'clip-file';
      
      // 创建图标和文件名的容器
      const fileContent = document.createElement('div');
      fileContent.className = 'file-content';
      // 检查是否是图片文件
      const isImage = item.fileIcon === 'bi-file-earmark-image';
      
      fileContent.innerHTML = `
        <div class="file-info" data-bs-toggle="tooltip" data-bs-title="点击调用系统文件打开" data-bs-placement="top">
          <i class="${item.fileIcon || 'bi-file-earmark'}"></i>
          <span class="file-name">${item.preview}</span>
        </div>
      `;
      
      fileDiv.appendChild(fileContent);
      
      // 初始化 tooltip
      const tooltips = fileContent.querySelectorAll('[data-bs-toggle="tooltip"]');
      tooltips.forEach(element => {
        new bootstrap.Tooltip(element);
      });
      
      // 点击文件名打开预览
      const openFilePreview = (e) => {
        e.stopPropagation();
        if (item.isDirectory) {
          // 如果是文件夹，直接在 Finder 中打开
          require('electron').shell.showItemInFolder(item.data);
        } else if (isImage) {
          // 如果是图片，使用内置预览
          const fullImg = document.createElement('div');
          fullImg.className = 'full-image-preview';
          fullImg.innerHTML = `
            <img src="${item.data}" alt="Full size image">
            <button class="close-preview">×</button>
          `;
          document.body.appendChild(fullImg);
          
          fullImg.querySelector('.close-preview').onclick = () => {
            fullImg.remove();
          };
          
          fullImg.onclick = () => {
            fullImg.remove();
          };
        } else {
          // 使用系统预览
          const filePath = item.data.replace('file://', '');
          require('electron').ipcRenderer.send('preview-file', filePath);
        }
      };
      
      // 点击文件信息触发预览
      fileContent.querySelector('.file-info').onclick = openFilePreview;
      
      contentDiv.appendChild(fileDiv);
      break;

    default:
      contentDiv.textContent = item.preview;
  }

  return contentDiv;
}

function updateClipboardList(items, searchTerm = '') {
  const container = document.getElementById('clipboard-list');
  
  // 清理现有的 tooltips
  const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltips.forEach(element => {
    const tooltip = bootstrap.Tooltip.getInstance(element);
    if (tooltip) {
      tooltip.dispose();
    }
  });
  
  container.innerHTML = '';
  
  const filteredItems = searchTerm
    ? items.filter(item => {
        const searchText = item.preview?.toLowerCase() || '';
        return searchText.includes(searchTerm.toLowerCase());
      })
    : items;
  
  filteredItems.forEach(item => {
    const div = document.createElement('div');
    div.className = `clip-item clip-item-${item.type}`;
    
    const contentDiv = createClipContent(item);
    const sourceDiv = document.createElement('div');
    sourceDiv.className = 'clip-source';
    
    if (item.source?.name && item.source.name !== 'Unknown') {
      if (item.source.icon) {
        const iconImg = document.createElement('img');
        iconImg.src = item.source.icon;
        iconImg.className = 'source-icon';
        sourceDiv.appendChild(iconImg);
      }
      
      const sourceText = document.createElement('span');
      sourceText.textContent = `${item.source.name} · ${item.timeString || ''}`;
      sourceDiv.appendChild(sourceText);
    } else if (item.timeString) {
      const sourceText = document.createElement('span');
      sourceText.textContent = item.timeString;
      sourceDiv.appendChild(sourceText);
    }
    
    div.appendChild(contentDiv);
    div.appendChild(sourceDiv);
    
    div.onclick = () => {
      switch (item.type) {
        case 'image':
          clipboard.writeImage(nativeImage.createFromDataURL(item.data));
          break;
        case 'url':
        case 'file':
        case 'text':
          clipboard.writeText(item.data);
          break;
      }

      div.classList.add('copied');
      showToast('已复制到剪贴板');
      
      setTimeout(() => {
        div.classList.remove('copied');
      }, 1000);
    };
    
    container.appendChild(div);
  });
}

// 初始化显示已保存的剪贴板内容
allItems = store.get('clipboardItems') || [];
updateClipboardList(allItems);

// 监听剪贴板更新
ipcRenderer.on('clipboard-update', (event, items) => {
  allItems = items;
  updateClipboardList(items, document.getElementById('search-input').value);
});

// 添加搜索功能
document.getElementById('search-input').addEventListener('input', (e) => {
  updateClipboardList(allItems, e.target.value);
});

// 添加键盘快捷键支持
document.addEventListener('keydown', (e) => {
  // ESC 键关闭窗口
  if (e.key === 'Escape') {
    ipcRenderer.send('hide-window');
  }
  
  // 上下键选择
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    const items = document.getElementsByClassName('clip-item');
    if (items.length === 0) return;
    
    const currentFocus = document.activeElement;
    let index = Array.from(items).indexOf(currentFocus);
    
    if (e.key === 'ArrowUp') {
      index = index <= 0 ? items.length - 1 : index - 1;
    } else {
      index = index === -1 || index === items.length - 1 ? 0 : index + 1;
    }
    
    items[index].focus();
    e.preventDefault();
  }
  
  // 回车键复制
  if (e.key === 'Enter' && document.activeElement.classList.contains('clip-item')) {
    document.activeElement.click();
  }
});

// 添加置顶按钮处理
const pinButton = document.getElementById('pin-button');
let isAlwaysOnTop = false;

pinButton.addEventListener('click', () => {
  ipcRenderer.send('toggle-always-on-top');
});

ipcRenderer.on('always-on-top-changed', (event, value) => {
  isAlwaysOnTop = value;
  const pinButton = document.getElementById('pin-button');
  pinButton.classList.toggle('active', isAlwaysOnTop);
  // 更新图标
  pinButton.querySelector('i').className = isAlwaysOnTop 
    ? 'bi bi-pin-angle-fill' 
    : 'bi bi-pin-angle';
});

// 添加清空按钮处理
document.getElementById('clear-button').addEventListener('click', () => {
  // 添加确认对话框
  if (confirm('确定要清空所有剪贴板历史记录吗？')) {
    allItems = [];
    store.set('clipboardItems', []);
    updateClipboardList([]);
  }
});

// 添加 showToast 函数
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="toast-body">
      ${message}
    </div>
  `;
  
  document.body.appendChild(toast);
  new bootstrap.Toast(toast, { delay: 1000 }).show();
  
  setTimeout(() => {
    toast.remove();
  }, 1100);
} 