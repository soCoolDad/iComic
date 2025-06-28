const fs = require('fs');
const http = require('http');
const https = require('https');
const cheerio = require('cheerio');

class iComic_http {
    timeout = 1000 * 60;
    constructor() {
        this.virtual_device = process.env.ICOMIC_VIRTUAL_DEVICE || ["ICOMIC/GETER V0.0.3"];
        this.virtual_device_index = process.env.ICOMIC_VIRTUAL_DEVICE_INDEX || 0;
    }

    setTimeout(timeout) {
        this.timeout = timeout;
    }

    normalizeUrl(url) {
        if (!url) return '';

        // 1. 去除首尾空格/换行
        url = url.trim();


        // 1. 允许 ASCII 安全字符 + 汉字
        // 严格兼容 RFC 3986 
        url = url.replace(/[^\w\-_.~!*'();:@&=+$,/?%#[\]\u4e00-\u9fa5]/g, '');

        // 2. 对汉字等非 ASCII 字符进行编码（可选）
        return encodeURI(url);
    }

    getHeader() {
        if (this.virtual_device.length > 0) {
            let userAgent = this.virtual_device[this.virtual_device_index];
            if (userAgent && userAgent.length > 0) {
                return {
                    "User-Agent": userAgent
                };
            } else {
                return {};
            }
        } else {
            return {};
        }
    }

    //通过url发送请求
    // 通过url发送POST请求
    async post(url, headers, data) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                throw new Error(`[http] 请求超时: ${url}`)
            }, this.timeout);

            try {
                // 解析URL以获取主机名和路径
                const urlObj = new URL(this.normalizeUrl(url));
                const hostname = urlObj.hostname;
                const path = urlObj.pathname + (urlObj.search || '');

                let isFormData = false;
                let send_data = "";

                if (headers && (headers['Content-Type'] == "application/x-www-form-urlencoded")) {
                    isFormData = true;
                }

                // 如果有数据，写入请求体并结束请求
                if (data) {
                    if (isFormData) {
                        // 将对象转换为表单字符串（如 key1=value1&key2=value2）
                        const formData = new URLSearchParams();
                        for (const key in data) {
                            formData.append(key, data[key]);
                        }

                        //console.log("formData.toString()", formData.toString())

                        send_data = formData.toString();

                        headers['Content-Length'] = Buffer.byteLength(send_data);
                    } else {
                        send_data = JSON.stringify(data);
                    }
                }

                //console.log('isFormData', isFormData);

                // 根据协议选择http或https模块
                const httpModule = urlObj.protocol === 'https:' ? https : http;

                const in_headers = {};

                if (headers) {
                    for (const key in headers) {
                        if (headers[key] == null) continue;
                        if (headers[key] == undefined) continue;
                        in_headers[key] = headers[key];
                    }
                }

                // 设置默认请求头
                const options = {
                    hostname,
                    path,
                    method: 'POST',
                    timeout: this.timeout,
                    headers: {
                        'Content-Type': 'text/html', // 默认内容类型为html
                        ...this.getHeader(),
                        ...in_headers // 允许传递自定义头部
                    }
                };

                //console.log("options", options);

                // 创建请求
                const req = httpModule.request(options, (res) => {
                    let responseBody = [];

                    res.on('data', (chunk) => {
                        //console.log("data coming")
                        responseBody.push(chunk);
                    });

                    res.on('end', () => {
                        resolve({
                            status: res.statusCode == 200,
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: Buffer.concat(responseBody)
                        });
                    });
                });

                //console.log("req", req);

                req.on('error', (e) => {
                    console.log("req error", e);
                    reject(e);
                });

                // 默认 JSON 格式
                req.write(send_data);

                req.end();
            } catch (error) {
                console.error("http post error", error);
                reject(error);
            } finally {
                clearTimeout(timeout);
            }
        });
    }

    async get(url, headers) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`[http] 请求超时: ${url}`));
            }, this.timeout);

            try {
                const urlObj = new URL(this.normalizeUrl(url));
                const httpModule = urlObj.protocol === 'https:' ? https : http;

                const in_headers = {};

                if (headers) {
                    for (const key in headers) {
                        if (headers[key] == null) continue;
                        if (headers[key] == undefined) continue;
                        in_headers[key] = headers[key];
                    }
                }

                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + (urlObj.search || ''),
                    method: 'GET',
                    timeout: this.timeout,
                    headers: {
                        ...this.getHeader(),
                        ...in_headers
                    }
                };

                const req = httpModule.get(options, (res) => {
                    // 根据 content-type 判断是否为二进制
                    // console.log("res:", url, res.headers);
                    // 二进制数组用来存储返回的二进制数据
                    const responseBody = [];

                    res.on('data', (chunk) => {
                        responseBody.push(chunk);
                    });

                    res.on('end', () => {
                        resolve({
                            status: res.statusCode == 200,
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: Buffer.concat(responseBody)
                        });
                    });
                });

                req.on('error', reject);
                req.end();
            } catch (error) {
                console.error("http get error", error);
                reject(error);
            } finally {
                clearTimeout(timeout);
            }
        });
    }

    virtual_device(device_index) {
        // let device = this.getDevice(device_index);

        // if (device['User-Agent']) {
        //     this.virtual_device_index = device_index;
        //     return true;
        // } else {
        //     return false;
        // }
    }
}

class iComic_html {
    /**
     * 使用CSS选择器解析HTML字符串并返回元素列表
     * @param {string} htmlStr - 要解析的HTML字符串
     * @param {string} cssStr - CSS选择器（如 ".class", "div#id"）
     * @returns {Array<{ text: string, html: string, attr: (name: string) => string }>} 匹配的元素集合
     */
    css(htmlStr, cssStr) {
        if (!htmlStr || !cssStr) return [];

        try {
            const $ = cheerio.load(htmlStr);
            const elements = $(cssStr);

            // 返回匹配到的DOM元素文本内容或属性，也可以封装为对象形式
            return elements.toArray().map(el => ({
                text: $(el).text(),
                html: $(el).html()
            }));
        } catch (error) {
            console.error('HTML解析失败:', error.message);
            return [];
        }
    }

    /**
     * 获取指定CSS选择器匹配元素的纯文本内容
     * @param {string} htmlStr - 要解析的HTML字符串
     * @param {string} cssStr - CSS选择器（如 "div.title", "p"）
     * @returns {string} 匹配到的第一个元素的纯文本内容
     */
    text(htmlStr, cssStr) {
        if (!htmlStr || !cssStr) return "";

        try {
            const elements = this.css(htmlStr, cssStr);
            if (elements.length === 0) return "";
            return elements[0].text;
        } catch (error) {
            console.error('HTML文本提取失败:', error.message);
            return "";
        }
    }

    /**
     * 获取指定CSS选择器第一个元素的某个属性值
     * @param {string} htmlStr - 要解析的HTML字符串
     * @param {string} cssStr - CSS选择器（如 "img", "a.title"）
     * @param {string} [attrName='src'] - 要获取的属性名，默认是 'src'
     * @returns {string} 属性值
     */
    attr(htmlStr, cssStr, attrName = 'src') {
        if (!htmlStr || !cssStr || !attrName) return "";

        try {
            const $ = cheerio.load(htmlStr);
            const element = $(cssStr).first();

            return element.attr(attrName) || "";
        } catch (error) {
            console.error('HTML属性提取失败:', error.message);
            return "";
        }
    }
}

class iComicCtrl {
    #http;
    #html;
    timeout = 30000;
    constructor() {
        this.#http = new iComic_http();
        this.#html = new iComic_html();

        this.#http.setTimeout(this.timeout);
    }

    setHttpTimeout(timeout) {
        this.timeout = timeout;
        this.#http.timeout = timeout;
    }

    //读取文件
    read(...args) {
        return fs.readFile(...args);
    }

    existsSync(...args) {
        return fs.existsSync(...args);
    }

    readFileSync(...args) {
        return fs.readFileSync(...args);
    }

    existsSync(...args) {
        return fs.existsSync(...args);
    }

    statSync(...args) {
        return fs.statSync(...args);
    }

    readdirSync(...args) {
        return fs.readdirSync(...args);
    }

    //虚拟网络设备
    Virtual_device(device_index) {
        return this.#html.virtual_device(device_index);
    }

    //发送post请求
    post(...args) {
        return this.#http.post(...args);
    }

    //发送get请求
    get(...args) {
        return this.#http.get(...args);
    }

    css(...args) {
        return this.#html.css(...args);
    }

    text(...args) {
        return this.#html.text(...args);
    }

    attr(...args) {
        return this.#html.attr(...args);
    }
}

module.exports = { iComic_http, iComic_html, iComicCtrl };