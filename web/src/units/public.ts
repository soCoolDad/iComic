import axios, { AxiosResponse } from "axios"
import type { App } from 'vue'
import { useAuthStore } from "../store";
import { ElMessage, ElMessageBox, ElNotification } from "element-plus";

export class Http {
    baseURL: string
    constructor(baseURL = "") {
        this.baseURL = baseURL
    }

    async send(url: string, method: string, data: object = {}) {
        try {
            const config: any = {
                url: this.baseURL + url,
                method,
                //headers,
                timeout: 30000
            }
            if (method.toLowerCase() === "get") {
                config.params = data
            } else {
                config.data = data
            }
            const response: AxiosResponse = await axios.request(config)
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
    http: Http
    msg: typeof ElMessage
    msgbox: typeof ElMessageBox
    tipbox: typeof ElNotification
    constructor() {
        this.http = new Http()
        this.msg = ElMessage
        this.msgbox = ElMessageBox
        this.tipbox = ElNotification
    }
}

const http = new Http()

export default {
    install(app: App) {
        app.config.globalProperties.$g = new GUnits()
    }
}