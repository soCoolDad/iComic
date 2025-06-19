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
            /*
            const authStore = useAuthStore(); // 获取 Pinia 的 store 实例
            const token = authStore.token; // 从状态管理中获取用户登录授权信息 
            const headers = {
                Authorization: `Bearer ${token}` // 设置请求头部，携带用户登录授权信息
            };

            const whitelist = ['/api/user/login', 
                               '/api/user/create' , 
                               '/api/setting/getAllLang'] 

            if (!token && !whitelist.includes(url)) {
                return {
                    status: false,
                    data: null,
                    msg: "请先登录"
                }
            }
            */

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