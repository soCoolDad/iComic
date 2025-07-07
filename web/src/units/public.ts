import axios, { AxiosResponse } from "axios"
import type { App } from 'vue'
import { ElMessage, ElMessageBox, ElNotification } from "element-plus";

export class Http {
    baseURL: string
    constructor(baseURL = "") {
        this.baseURL = baseURL
    }

    async send(url: string, method: string, data: object = {}, timeout = 30000) {
        try {
            //拼接url，处理baseURL和url可能出现/地址问题
            let baseURL = this.baseURL, sendURL = url;
            let realURL = "";

            if (baseURL.endsWith("/")) {
                baseURL = baseURL.substring(0, baseURL.length - 1);
            }

            if (sendURL.startsWith("/")) {
                sendURL = sendURL.substring(1);
            }

            realURL = baseURL + "/" + sendURL;

            const config: any = {
                url: realURL,
                method,
                timeout
            }

            if (method.toLowerCase() === "get") {
                config.params = data;
            } else {
                config.data = data;
            }

            const response: AxiosResponse = await axios.request(config);

            return {
                status: response.status,
                ...response.data
            }
        } catch (error: any) {
            return {
                status: false,
                data: null,
                msg: error?.message || "请求失败"
            }
        }
    }
}

export class GUnits {
    http: Http;
    msg: typeof ElMessage;
    msgbox: typeof ElMessageBox;
    tipbox: typeof ElNotification;
    constructor() {
        this.http = new Http();
        this.msg = ElMessage;
        this.msgbox = ElMessageBox;
        this.tipbox = ElNotification;
    }
}

const http = new Http()

export default {
    install(app: App) {
        app.config.globalProperties.$g = new GUnits()
    }
}