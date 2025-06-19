// 基础插件接口
class BasePlugin {
  constructor(id, name, config, path) {
    this.id = id;
    this.name = name;
    this.config = config;
    this.version = config.version;
    this.description = config.description;
    this.need_install = config.need_install;
    this.path = path || "";

    this.type = ''; // 'language' | 'search' | 'file-parser'
  }

  // 初始化方法
  async init() { }

  // 卸载清理方法
  async destroy() { }

  //使用npm安装依赖
  async installDependencies() {
    const { spawnSync } = require('child_process');

    if (this.path === "") {
      return;
    }

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const result = spawnSync(npmCmd, ['install'], {
      cwd: this.path,
      stdio: 'inherit'
    });

    if (result.error || result.status !== 0) {
      throw new Error(`Failed to install dependencies for ${path.basename(pluginPath)}`);
    }
  }
}

// 语言数据插件
class LanguagePlugin extends BasePlugin {
  constructor(id, name, config, path) {
    super(id, name, config);
    this.type = 'language';
    this.path = path;
  }

  // 获取所有语言数据
  async getAllData() {
    throw new Error('Not implemented');
  }
}

// 搜索插件
class SearchPlugin extends BasePlugin {
  constructor(id, name, config, path) {
    super(id, name, config);
    this.type = 'search';
    this.path = path;
    this.placeholder = config.placeholder;
  }

  // 搜索方法
  async search(query) {
    throw new Error('Not implemented');
  }

  // 获取书本详情
  async getDetail(bookId) {
    throw new Error('Not implemented');
  }

  // 获取章节详情
  async getPageDetail(chapterId) {
    throw new Error('Not implemented');
  }

  async parseFile(fileBuffer) {
    return fileBuffer;
  }
}

// 文件解析插件
class FileParserPlugin extends BasePlugin {
  constructor(id, name, config, path) {
    super(id, name, config);
    this.type = 'file-parser';
    this.support_file = config.support_file;
    this.path = path;
  }

  // 解析文件
  async parseFile(file_path, config_path, cbx_success, cbx_error) {
    throw new Error('Not implemented');
  }

  async parsePageImage(file_path, config_path, page, image) {
    throw new Error('Not implemented');
  }
}

module.exports = { BasePlugin, LanguagePlugin, SearchPlugin, FileParserPlugin };