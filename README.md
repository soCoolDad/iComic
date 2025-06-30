# 关于iComic
###  安装平台
iComic按道理说可以运行在任何平台，Pc/Mac/Linux

### 宝塔
宝塔支持docker和nodejs项目

### Docker
不太建议部署在小内存容器中，其中牵扯更新版本。会用到安装依赖、编译web源码。这两个动作挺吃内存的！

而且很容易触碰到内存上限而导致报错！

### 硬件最小环境
```
cpu：2 核心
内存：1G
```

## 项目初衷
mango停止维护之后，感觉缺了一个简洁的电子漫画阅读工具，而且还是部署在docker上的，最主要是能通过插件访问一些莫名其妙的网站进行友好的借鉴交流！就尝试对进行一部分改造，也修改了许多地方，让他可以支持更新漫画，多线程下载等。
也写了几个莫名其妙的网站的插件！

可是奈何Crystal让我欲仙欲死。遂放弃！

重新用```Element-plus```,```Node.js```造了个轮子。放弃了多用户，tag标签的展示（主要用不上，在库页面展示一下就行了），目前实现功能```库```，```阅读器```，```三方插件```，```更新```

## 提前感谢
[Mango](https://github.com/getmango/Mango)

[Element-plus](https://element-plus.org/)

[Node.js](https://nodejs.org/)

[Docker](https://www.docker.com)

# 关于Mango插件的兼容
本来想兼容mango的插件,可插件体系改动挺大的（函数名,函数返回,支持依赖）,如果想用之前的Mango插件,跟着规范修改也能支持。我会贴上iComic的规范。你可以很容易的将mango插件导入到iComic里来。

# 目前支持的格式
因为对zip有莫名的崇拜，所以iComic推荐库文件用zip来存储，如 ```cbz```。

iComic实现了基础的 ```cbz``` ```ictz``` 格式解析插件（而且是iComic规范的存储格式）。

因为iComic能通过扩展插件来实现对文件的解析。

所以你也可以扩展iComic的插件来支持其他格式文件。注意返回iComic所支持的规范即可。

### ```cbz```
漫画包文件

### ```ictz```
小说包文件

# 约定规范
为了iComic能强壮的运行，我和你约定了以下的规范！
### 库文件目录
```
|-configs
|----library
|--------library name
|------------library name.cbz
|------------library name.json
|--------library name1
|------------library name1.ictz
|------------library name1.json
```

### 文件包目录
#### 请注意！！清晰的目录结构会让解析插件更好的通过排序来确定章节次序
以下是推荐的包目录
```
第一话\第一话名称.png
第1章\第1章名称.png
...
```
如果你的章节名称或者目录名称没有次序的话

解析插件可能没那么智能的返回你想要的章节次序！
### 以下是iComic支持的包文件目录
#### ```.cbz```
```
name.cbz
|----cover
|--------cover.png
|----page_name
|--------page_Detail_0_0.png
|--------page_Detail_0_1.jpg
|-------- ...
|----page_name2
|--------page_Detail_1_0.png
|--------page_Detail_1_1.png
|-------- ...
|---- ...
```
#### ```ictz```
```
name.ictz
|----cover
|--------cover.png
|----page_name
|--------page_Detail_0_0.txt
|----page_name2
|--------page_Detail_1_0.txt
|---- ...
```

#### library name.json
如果库文件所对应的json文件不存在，我们约定解析插件会生成，但是你所使用的解析插件生成json文件还需遵守以下约定
```json
{
  "name": "文件名，展示在库里",//必须项
  "type": "类型：comic/text/或者其他解析插件所定义的",//必须项
  "author": "作者名",
  "page_count": 0,//总页数 必须项
  "cover_image": "Base64 图片字符串",
  "tags": ["标签1", "标签2"],
  "description": "简介",
  "page_list": [{//插件解析 你也可以实现其他解析结构 必须项
    "title": "章节标题",
    "region": [1, 2, 3, 4]//对应在zip文件中的次序
  }],
  "parse_plugin": "解析插件id",//解析插件需写入此项
  "search_plugin": "搜索插件id",//主程序会自动写入此项
  "search_result": {//调用插件search时返回的结构，用于更新，否则更新时候提示找不到配置
    "url": "漫画或者小说的详情页"
  }
}
```

### 三方插件规范约定
你可以编写iComic支持的三方插件来实现解析文件/文件夹和访问莫名其妙的网站

### 插件目录定义
```
configs/plugin
｜---- plugin-name
｜-------- config.json
｜-------- main.js
｜-------- package.json
```
### 插件工作流程
iComic将插件分为三种
#### ```search```
你需要在main.js里实现以下方法
```typescript
class search_class extends SearchPlugin{
    //1.主程序在向压缩包写入数据时先会询问你想把文件存储成什么格式
    async saveFileExtension(){
        return ".cbz" //返回你喜欢的格式就行
    }
    //2.开始向插件查询 “某某某”
    async search(query){
        try{
            return [ //返回一个搜索结果
                {
                    title,          //标题
                    url,            //地址
                    cover_image,    //封面图
                    description,    //描述
                }
            ]
        }catch(error){
            //出错返回
            return { status: false, msg: error.message };
        }
    }

    //3.获取页面详情的时候
    async getDetail(searchResult){
        //你需要根据你返回的搜索结果来返回详情
        try{
            return { //返回详情
                title: title,
                author: author,
                description: description,
                cover_image: cover_image,
                tags: tags,
                pages: [
                    {
                        title: deleteIllegalCharacters(element.text),
                        url: iComic.attr(element.html, "a", "href")
                    }
                ]
            }
        }catch(error){
            //出错返回
            return { status: false, msg: error.message };
        }
    }
    //4.获取某一章节的详情
    async getPageDetail(pageResult) {
        try {
            return {
                title,
                blocks:[
                    "url", //可以是url
                    "text" //也可以是text
                ]
            }
        } catch (error) {
            //出错返回
            return { status: false, msg: error.message };
        }
    }

    //5.处理章节详情的块，主程序会将第4步所拿到的blocks里的block传入
    // 你需要返回一个二进制的数组用于存储到zip包里
    async getPageDetailBlock(block){
        try {
            return Buffer //返回一个二进制数组
        } catch (error) {
            //出错返回
            return { status: false, msg: error.message };
        }
    }

    //6.如果你对Block有特殊的处理
    // 主程序在存入zip之前会向你询问
    // 你返回处理后的二进制数组即可
    async parseFile(fileBuffer) {
        try {
            return fileBuffer;
        } catch (error) {
            return { status: false, msg: error.message };
        }
    }
}

module.exports = {
    Plugin: search_class
};
```

#### ```parser```

```typescript
class parse_class extends FileParserPlugin {
    /**
     * 解析文件
     * file_path    文件路径
     * config_path  配置文件路径
     * cbx_success  成功后调用
     * cbx_error    失败后调用
     */
    async parseFile(file_path, config_path, cbx_success, cbx_error) {
        // 生成基础json对象
        try {
            let config = {
                name,
                type,
                author,
                cover_image,
                tags: [],
                description: "",
                page_count,
                page_list: [{page}]
            };
            //你需要返回以上对象
            //需要注意，如果该文件存在的话请将原来的键值复制过去
            cbx_success(config);
        } catch(error) {
            //如果出错，返回对应格式
            cbx_error({ status: false, msg: "错误信息" });
        }
    }

    /**
     * 解析插件也需要负责文件输出
     * file_path    文件路径
     * config_path  配置文件路径
     * page         当前阅读章节的次序
     * block_index  当前块的次序
     */
    async parsePageBlock(file_path, config_path, page, block_index) {
        /**
         * 成功从zip文件里拿到块数据后
         * serverbacktype
         * 你需要告诉主程序serverbacktype是什么
         * 目前支持 image/text
         * 
         * data
         * 文件的二进制数组
         * 
         * ext
         * 文件的扩展名
         */
        return { 
            serverbacktype: 'image', 
            data: imageBuffer, 
            ext: fileExt 
        };

        /**
         * 如果出错你需要返回对应格式
        */
        return { status: false, msg: error.message };
    }

    /**
     * 当然，你也需要在库目录里查找所能支持的文件
     */
    async scan(library_path) {
        //你需要返回以下对象让主程序知道有哪些文件
        let scan_files = [
            {
                name: "文件名称",
                path: "文件路径",
                config_path: "配置文件路径",
                config: {
                    //配置
                }
            }
        ];

        return scan_files;
    }
}

module.exports = {
    Plugin: parse_class
};

```

#### ```language```
如果你想节目展示其他语言，你可以参考lang-zh-cn插件来实现！
```typescript
class language_class extends LanguagePlugin {
    async getAllData() {
        return {
            //参考lang-zh-cn插件
        };
    }
}
//global.Plugin = EnglishLanguagePlugin;
module.exports = {
    Plugin: language_class
};
```
#### ```iComic```
插件里可能需要文件访问，网络访问，iComic提供了```iComic```对象来使用
```typescript
//如
async search(query) {
    iComic.get(url,header)
    iComic.post(url,header,data,timeout)
}

class iComic{
    //设置超时
    setHttpTimeout(timeout)

    //读取文件
    //同fs.readFile
    read() 

    //同fs.existsSync
    existsSync()

    //同fs.readFileSync
    readFileSync()

    //同fs.existsSync
    existsSync()

    //同fs.statSync
    statSync()

    //同fs.readdirSync
    readdirSync()

    //发送post请求
    post(url,headers,data)

    //发送get请求
    get(url,headers)

    css(html,css)

    text(html,css)

    attr(html,css,attr)
}
```

#### ```plugin config.json```
插件的配置文件
```json
{
    "id": "插件id,用英文以防奇怪的问题",
    "name": "插件名称",
    "type": "search", //插件类型 [language/search/parser]
    "description": "插件描述",
    "placeholder": "搜索框展示",
    "author": "作者名",
    "version": "版本",
    //page并发，建议1，因为我还没处理UI展示混乱问题
    "page_concurrency": 1,  
    //block并发，建议不超过cpu数量，主程序会限制最大为cpu数量
    "block_concurrency": 4, 
    //part包合并并发，建议不超过cpu数量，主程序会限制最大为cpu数量
    "merge_concurrency": 4, 
    //调用插件方法如果报错后重试次数
    "retry_count": 3,
    //需不需要安装package.json里定义的依赖
    //为true需在插件页里安装
    "need_install": false
}
```

#### ```plugin package.json```
插件的配置文件
```json
{
    "name": "插件名",
    "version": "版本",
    "description": "描述",
    "author": "作者",
    //人口文件
    "main": "main.js",
    "scripts": {},
    //插件依赖
    "dependencies": {}
}
```

#### 以上就是整个iComic的规范