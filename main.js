const { app, BrowserWindow, clipboard, ipcMain, Tray, globalShortcut, nativeImage, systemPreferences } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { exec } = require('child_process');
const fs = require('fs');

const store = new Store();
let mainWindow;
let tray;
let isAlwaysOnTop = false; // 添加置顶状态跟踪

// 添加文件类型映射
const FILE_TYPES = {
  // 文件夹
  folder: ['folder', 'directory'],
  // 图片
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'raw', 'heic', 'heif', 'avif'],
  // 文档
  document: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'pages', 'numbers', 'key'],
  // 开发
  code: ['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'scss', 'less', 'sass', 'json', 'xml', 'yaml', 'yml', 
         'php', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'swift', 'go', 'rs', 'rb', 'sql', 'sh'],
  // 压缩包
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'iso'],
  // 音视频
  media: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm'],
  // 设计
  design: ['psd', 'ai', 'xd', 'sketch', 'fig', 'aep', 'prproj', 'afdesign', 'afphoto'],
  // 3D和CAD
  cad: ['obj', 'fbx', 'stl', 'dxf', 'dwg', '3ds', 'blend'],
  // 字体
  font: ['ttf', 'otf', 'woff', 'woff2', 'eot'],
};

function getFileTypeIcon(filename) {
  // 检查是否是文件夹
  if (!filename.includes('.')) {
    return 'bi-folder';
  }
  
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  // 根据扩展名返回对应的 Bootstrap 图标类名
  if (FILE_TYPES.image.includes(ext)) return 'bi-file-earmark-image';
  if (FILE_TYPES.document.includes(ext)) return 'bi-file-earmark-text';
  if (FILE_TYPES.code.includes(ext)) return 'bi-file-earmark-code';
  if (FILE_TYPES.archive.includes(ext)) return 'bi-file-earmark-zip';
  if (FILE_TYPES.media.includes(ext)) {
    return ext.match(/^(mp3|wav|ogg|flac|m4a|aac)$/) 
      ? 'bi-file-earmark-music'
      : 'bi-file-earmark-play';
  }
  if (FILE_TYPES.design.includes(ext)) return 'bi-file-earmark-richtext';
  if (FILE_TYPES.cad.includes(ext)) return 'bi-box';
  if (FILE_TYPES.font.includes(ext)) return 'bi-file-earmark-font';
  
  return 'bi-file-earmark';
}

function registerShortcuts() {
  // 注册 Command+Shift+V 快捷键（Windows/Linux 上用 Ctrl+Shift+V）
  globalShortcut.register('CommandOrControl+Shift+V', () => {
    if (!mainWindow.isVisible()) {
      showWindowAtRightCenter();
    } else {
      mainWindow.hide();
    }
  });
}

function createWindow() {
  // 创建和设置应用图标
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  
  // 设置 dock 图标
  if (process.platform === 'darwin') {
    app.dock.setIcon(icon);
  }
  
  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minHeight: MIN_WINDOW_HEIGHT,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
    title: 'Lime-CtrlCV',
    resizable: true,
    minWidth: WINDOW_WIDTH,
    maxWidth: WINDOW_WIDTH,
    backgroundColor: '#000000', // 设置窗口背景色为黑色
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    icon: icon
  });

  mainWindow.loadFile('index.html');
  
  // 添加窗口加载完成的处理
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.show();
  });

  // 监听置顶状态变化
  ipcMain.on('toggle-always-on-top', () => {
    isAlwaysOnTop = !isAlwaysOnTop;
    mainWindow.setAlwaysOnTop(isAlwaysOnTop, 'floating');
    mainWindow.setVisibleOnAllWorkspaces(isAlwaysOnTop);
    mainWindow.webContents.send('always-on-top-changed', isAlwaysOnTop);
  });

  // 监听窗口拖动事件
  ipcMain.on('window-drag-start', (event, { mouseX, mouseY }) => {
    const { x, y } = mainWindow.getBounds();
    event.sender.startDrag({
      bounds: { x, y },
      mouseX,
      mouseY,
    });
  });
  
  // 添加内容类型判断函数
  function getClipboardContent() {
    const formats = clipboard.availableFormats();
    let content = {
      type: 'text',
      data: null,
      preview: null
    };

    // 1. 首先处理图片
    if (formats.includes('image/png') || formats.includes('image/jpeg')) {
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        // 获取原始图片尺寸
        const size = image.getSize();
        
        // 计算预览图的尺寸，保持宽高比
        let previewWidth = 200;
        let previewHeight = Math.round((size.height / size.width) * previewWidth);
        
        // 如果高度超过200，以高度为基准重新计算
        if (previewHeight > 200) {
          previewHeight = 200;
          previewWidth = Math.round((size.width / size.height) * previewHeight);
        }
        
        // 创建预览图
        const previewImage = image.resize({
          width: previewWidth,
          height: previewHeight,
          quality: 'good'
        });

        content = {
          type: 'image',
          data: image.toDataURL(),
          preview: previewImage.toDataURL(),
          dimensions: {
            width: size.width,
            height: size.height,
            previewWidth,
            previewHeight
          }
        };
      }
    } 
    // 2. 处理文本内容
    else if (formats.includes('text/plain') || formats.includes('text/uri-list')) {
      const text = clipboard.readText();
      
      // 先设置为文本内容，如果后续判断是其他类型会被覆盖
      if (text.trim()) {
        content = {
          type: 'text',
          data: text,
          preview: text
        };
      }
      
      // 3. 检查是否是从 Finder 复制的文件
      let actualFilePath = '';
      let isFinderFile = false;
      let isFromFinder = false;
      
      if (process.platform === 'darwin') {
        try {
          const { execSync } = require('child_process');
          const finderPath = execSync(
            'osascript -e \'tell application "Finder" to get the POSIX path of (selection as alias)\'',
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
          ).trim();
          
          // 只有当 Finder 是前台应用时，才认为是从 Finder 复制的文件
          const frontApp = execSync(
            'osascript -e \'tell application "System Events" to name of first application process whose frontmost is true\'',
            { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
          ).trim();
          
          isFromFinder = frontApp === 'Finder';
          if (isFromFinder && finderPath) {
            actualFilePath = finderPath;
            isFinderFile = true;
          }
        } catch (error) {
          // 忽略错误
        }
      }

      // 4. 判断内容类型
      // 4.1 首先检查是否是 URL
      if (text.startsWith('http://') || text.startsWith('https://') || text.includes('www.')) {
        content = {
          type: 'url',
          data: text,
          preview: text
        };
      }
      // 4.2 然后检查是否是从 Finder 复制的文件
      else if (isFromFinder && isFinderFile && actualFilePath && fs.existsSync(actualFilePath)) {
        // 处理从 Finder 复制的文件
        const decodedPath = actualFilePath;
        const isDirectory = fs.statSync(decodedPath).isDirectory();
        const fileName = decodedPath.split(/[\/\\]/).pop() || decodedPath;
        const fileIcon = isDirectory ? 'bi-folder' : getFileTypeIcon(fileName);
        
        content = {
          type: 'file',
          data: decodedPath,
          preview: fileName,
          fileIcon: fileIcon,
          isDirectory: isDirectory,
          originalPath: text
        };
      }
      // 4.3 检查是否是文件 URL
      else if (text.startsWith('file://')) {
        const filePath = text.replace('file://', '');
        const decodedPath = decodeURIComponent(filePath);
        
        if (fs.existsSync(decodedPath)) {
          const isDirectory = fs.statSync(decodedPath).isDirectory();
          const fileName = decodedPath.split(/[\/\\]/).pop() || decodedPath;
          const fileIcon = isDirectory ? 'bi-folder' : getFileTypeIcon(fileName);
          
          content = {
            type: 'file',
            data: decodedPath,
            preview: fileName,
            fileIcon: fileIcon,
            isDirectory: isDirectory,
            originalPath: text
          };
        } else {
          // 如果文件不存在，作为普通文本处理
          content = {
            type: 'text',
            data: text,
            preview: text
          };
        }
      }
      // 4.4 其他情况作为普通文本处理
      else {
        // 确保文本内容不为空
        if (text.trim()) {
          content = {
            type: 'text',
            data: text,
            preview: text
          };
        }
      }
    }

    return content;
  }

  // 修改剪贴板监听部分
  let lastContent = null;  // 用于存储上一次的完整内容对象

  setInterval(() => {
    const content = getClipboardContent();
    const savedItems = store.get('clipboardItems') || [];
    
    // 检查是否与上一次内容相同
    const isSameContent = lastContent && (
      // 如果当前或上次是文件类型，使用更严格的比较
      (content.type === 'file' || lastContent.type === 'file') ? (
        content.data === lastContent.data && 
        content.type === lastContent.type &&
        content.preview === lastContent.preview
      ) : (
        // 其他类型使用简单比较
        content.type === lastContent.type && 
        content.data === lastContent.data
      )
    );
    
    if (isSameContent) {
      return;
    }
    
    // 检查是否已经存在相同的内容
    const isDuplicate = savedItems.some(item => {
      // 对于文件类型，需要更严格的比较
      if (content.type === 'file' || item.type === 'file') {
        return item.data === content.data && 
               item.type === content.type &&
               item.preview === content.preview;
      }
      // 其他类型使用简单比较
      return item.type === content.type && 
             item.data === content.data;
    });

    // 检查内容是否有效且不重复
    const isValidContent = content.data && !isDuplicate;
    
    if (isValidContent) {
      const activeApp = process.platform === 'darwin' 
        ? getActiveAppInfo()
        : { name: 'Unknown', icon: null };

      const now = new Date();
      const timeString = now.toLocaleTimeString('zh-CN', { 
        hour: '2-digit', 
        minute: '2-digit'
      });

      savedItems.unshift({
        type: content.type,
        data: content.data,
        preview: content.preview,
        fileIcon: content.fileIcon,
        originalPath: content.originalPath,  // 保存原始路径
        timestamp: now.getTime(),
        timeString: timeString,
        source: {
          name: activeApp.name,
          icon: activeApp.icon
        }
      });

      // 限制保存的数量
      if (savedItems.length > 50) {
        savedItems.pop();
      }

      store.set('clipboardItems', savedItems);
      mainWindow.webContents.send('clipboard-update', savedItems);
    }
    
    // 更新最后处理的内容对象
    lastContent = content;
  }, 500);

  // 添加窗口拖动支持
  ipcMain.on('window-drag', (event, { mouseX, mouseY }) => {
    const { screen } = require('electron');
    const cursor = screen.getCursorScreenPoint();
    const { x, y } = mainWindow.getBounds();
    
    const moveWindow = () => {
      const newCursor = screen.getCursorScreenPoint();
      const deltaX = newCursor.x - cursor.x;
      const deltaY = newCursor.y - cursor.y;
      mainWindow.setPosition(x + deltaX, y + deltaY);
    };
    
    const stopMoving = () => {
      screen.removeListener('mousemove', moveWindow);
      screen.removeListener('mouseup', stopMoving);
    };
    
    screen.on('mousemove', moveWindow);
    screen.on('mouseup', stopMoving);
  });

  // 处理窗口控制按钮事件
  ipcMain.on('window-control', (event, action) => {
    switch (action) {
      case 'minimize':
        mainWindow.minimize();
        break;
      case 'maximize':
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
        break;
      case 'close':
        mainWindow.hide(); // 关闭时只隐藏窗口
        break;
    }
  });

  // 处理窗口显示/隐藏
  ipcMain.on('hide-window', () => {
    mainWindow.hide();
  });

  // 当窗口关闭时只隐藏
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  icon.setTemplateImage(true);
  
  try {
    tray = new Tray(icon);
    
    const contextMenu = require('electron').Menu.buildFromTemplate([
      {
        label: '显示/隐藏',
        click: () => {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            showWindowAtRightCenter();
          }
        }
      },
      { type: 'separator' },
      {
        label: '置顶窗口',
        type: 'checkbox',
        checked: isAlwaysOnTop,
        click: () => {
          isAlwaysOnTop = !isAlwaysOnTop;
          mainWindow.setAlwaysOnTop(isAlwaysOnTop, 'floating');
          mainWindow.setVisibleOnAllWorkspaces(isAlwaysOnTop);
        }
      },
      {
        label: '偏好设置',
        submenu: [
          {
            label: '开机启动',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: () => {
              const settings = app.getLoginItemSettings();
              app.setLoginItemSettings({
                openAtLogin: !settings.openAtLogin
              });
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: '关于',
        click: () => {
          require('electron').dialog.showMessageBox(mainWindow, {
            title: '关于 Lime-CtrlCV',
            message: 'Lime-CtrlCV',
            detail: '版本 1.0.0\n一个简单的剪贴板管理工具',
            buttons: ['确定'],
            icon: icon
          });
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit();
        }
      }
    ]);

    // 设置右键菜单，但不设置为默认菜单
    tray.on('right-click', () => {
      tray.popUpContextMenu(contextMenu);
    });
    
    // 左键点击只控制窗口显示/隐藏
    tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        showWindowAtRightCenter();
      }
    });

    tray.setToolTip('Lime-CtrlCV');
  } catch (error) {
  }
}

app.whenReady().then(() => {
  try {
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
    createWindow();
    createTray();
    registerShortcuts();
    
    // 在 Mac 上，点击 dock 图标时显示窗口
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else if (!mainWindow.isVisible()) {
        showWindowAtRightCenter();
      }
    });
  } catch (error) {
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 添加快捷键清理
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// 在 app.whenReady() 中添加
app.on('before-quit', () => {
  app.isQuitting = true;
});

// 修改获取活动应用信息的函数
function getActiveAppInfo() {
  try {
    const { execSync } = require('child_process');
    const appName = execSync('osascript -e \'tell application "System Events" to name of first application process whose frontmost is true\'', { encoding: 'utf8' }).trim();
    
    return {
      name: appName || 'Unknown',
      icon: null
    };
  } catch (error) {
    return { name: 'Unknown', icon: null };
  }
}

function showWindowAtRightCenter() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
  
  // 获取当前窗口高度，如果窗口不存在则使用默认高度
  const currentBounds = mainWindow.getBounds();
  const windowHeight = currentBounds.height || DEFAULT_WINDOW_HEIGHT;
  
  // 设置窗口位置在屏幕右侧中间
  const x = Math.floor(screenWidth - WINDOW_WIDTH - 20);
  const y = Math.floor((screenHeight - windowHeight) / 2);
  
  // 先设置位置，再显示窗口
  mainWindow.setBounds({
    x: x,
    y: y,
    width: WINDOW_WIDTH,
    height: windowHeight // 保持当前高度
  });
  
  mainWindow.show();
}

// 为了确保窗口尺寸一致，也可以将尺寸定义为常量
const WINDOW_WIDTH = 400;
const MIN_WINDOW_HEIGHT = 800; // 设置最小高度
const DEFAULT_WINDOW_HEIGHT = 800; // 设置默认高度 

// 添加文件预览处理
ipcMain.on('preview-file', (event, filePath) => {
  if (process.platform === 'darwin') {
    if (!fs.existsSync(filePath)) {
      const currentDir = process.cwd();
      const localPath = path.join(currentDir, path.basename(filePath));
      
      if (fs.existsSync(localPath)) {
        filePath = localPath;
      } else {
        return;
      }
    }
    
    exec(`open "${filePath}"`, (error) => {
      if (error) {
        require('electron').shell.showItemInFolder(filePath);
      }
    });
  } else {
    // 非 macOS 系统直接打开文件所在文件夹
    require('electron').shell.showItemInFolder(filePath);
  }
}); 