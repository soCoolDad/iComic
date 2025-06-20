# iComic
iComic is an e-comic reading application with support for third-party plugins to fetch and parse files. Happy reading!

## 项目初衷
mango停止维护之后，感觉缺了一个简洁的电子漫画阅读工具，而且还是部署在docker上的，最主要是能通过插件访问一些莫名其妙的网站进行友好的借鉴交流！就尝试对进行一部分改造，也修改了许多地方，让他可以支持更新漫画，多线程下载等。
也写了几个莫名其妙的网站的插件！

可是奈何Crystal让我欲仙欲死。遂放弃！

重新用```Element-plus```,```Node.js```造了个轮子。放弃了多用户，tag标签的展示（主要用不上，在库页面展示一下就行了），实现了功能```库```，```阅读器```，```三方插件```，其他的暂时不想，主要也没其他需求了！有时间就实现```文件通过三方插件更新```吧，主要插件体系改变挺大，现在主要精力放在主程序上。

## 提前感谢
[Mango](https://github.com/getmango/Mango)

[Element-plus](https://element-plus.org/)

[Node.js](https://nodejs.org/)

[Docker](https://www.docker.com)


# 关于Mango插件的兼容
本来想兼容mango的插件,确实在插件里修改改个调用也就支持了。但是考虑到一些后续的开发计划。不得已放弃。我会贴上iComic的规范。你可以很容易的将mango插件导入到iComic里来

# 目前支持的格式
```cbz```

对zip有莫名的崇拜，库文件用zip来存储，如cbz。所以整个iComic对于外部导入到库的文件目前只实现了cbz的解析插件（而且是iComic规范的存储格式）。你也可以增加扩展iComic的插件来支持其他格式文件。

以后可能看时间会支持其他的文件格式。比如压缩包的电子书呀啥的！现在主阅读器只支持image的查看（给予对于本人莫名其妙的需求嘛）。

# 规范

### 库文件规范[基于插件cbz_file_parse]
#### 目录
```
|-configs
|----library
|--------library name
|------------library name.cbz
|------------library name.json
|--------library name1
|------------library name1.cbz
|------------library name1.json
```
#### library name.cbz
```
library name1.cbz
|----cover
|--------cover.png          //缩略图
|----page_name
|--------page_Detail_0_0.png
|--------page_Detail_0_1.png
|-------- ...
|----page_name2
|--------page_Detail_1_0.png
|--------page_Detail_1_1.png
|-------- ...
|---- ...
```
#### library name.json
```
｜-library name.json
｜----name
｜----type          //"comic"
｜----cover_image   //Base64
｜----author
｜----description
｜----tags          //["tag1","tag2"...]
｜----page_count    //100
｜----page_list     //[{}] 解析插件来解析
```

### 三方插件规范
你可以编写iComic支持的三方插件来实现解析文件夹和访问莫名其妙的网站

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
#### ```language```
语言包支持，打算支持，现在，emmm。。。页面上都有吧,有时间再实现吧

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
            //出错是返回带状态的错误信息
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
            //出错是返回带状态的错误信息
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
            return { status: false, msg: error.message };
        }
    }

    //5.处理章节详情的块
    async getPageDetailBlock(block){
        try {
            return Buffer //返回一个二进制数组
        } catch (error) {
            return { status: false, msg: error.message };
        }
    }

    //6.如果你对Block有特殊的处理
    async parseFile(fileBuffer) {
        try {
            return fileBuffer;
        } catch (error) {
            return { status: false, msg: error.message };
        }
    }
}
```

#### ```file-parser```

#### 先写到这！！！