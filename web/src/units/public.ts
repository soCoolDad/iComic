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

export interface TaskEventHandlers {
    onStatus?: (data: any) => void
    onProgress?: (data: any) => void
    onTasks?: (data: any) => void
    onDeleted?: (data: any) => void
    /** 长连接不可用（环境不支持 / 连不上 / 一直收不到数据）时回调，由页面退回定时轮询 */
    onFallback?: () => void
}

/**
 * 任务事件长连接（SSE）订阅：服务端有变化就推事件，替代前端定时轮询接口。
 * 断线由浏览器自动重连；连接建不起来或始终收不到数据时回调 onFallback，
 * 由页面退回原有轮询，保证任何环境下都能看到进度。
 */
export class EventStream {
    baseURL: string

    constructor(baseURL = "") {
        this.baseURL = baseURL
    }

    /**
     * @param url 接口地址，如 /api/download_task/events?task_id=xxx（不带 task_id 即全部任务）
     * @param handlers 事件回调
     * @param idleTimeout 多久收不到任何数据就判定长连接不可用（毫秒）
     * @returns 取消订阅
     */
    subscribe(url: string, handlers: TaskEventHandlers, idleTimeout = 20000) {
        let baseURL = this.baseURL
        let sendURL = url

        if (baseURL.endsWith("/")) baseURL = baseURL.substring(0, baseURL.length - 1);
        if (sendURL.startsWith("/")) sendURL = sendURL.substring(1);

        const realURL = baseURL + "/" + sendURL;

        // 环境不支持 SSE：直接交给页面的兜底逻辑
        if (typeof EventSource === "undefined") {
            handlers.onFallback && handlers.onFallback();
            return () => { };
        }

        const source = new EventSource(realURL);
        let closed = false;
        let received = false;
        let started = Date.now();

        const stop = () => {
            if (closed) return;
            closed = true;
            clearInterval(guard);
            source.close();
        };

        const fallback = () => {
            if (closed) return;
            stop();
            handlers.onFallback && handlers.onFallback();
        };

        // 可用性靠「有没有真的收到过数据」判断：只看 readyState === OPEN
        // 挡不住反向代理把响应体缓冲住、连接开着却没数据的情况。
        const guard = setInterval(() => {
            if (closed) return;
            if (source.readyState === EventSource.CLOSED) return fallback();
            if (!received && Date.now() - started > idleTimeout) return fallback();
        }, 3000);

        source.onopen = () => {
            started = Date.now();
        };

        source.onerror = () => {
            if (closed) return;
            // CLOSED 表示浏览器放弃了重连（如鉴权失败、接口 404），直接降级；
            // 其余（CONNECTING）会自动重连，交给守卫计时器兜底
            if (source.readyState === EventSource.CLOSED) return fallback();
        };

        const bind = (type: string, fn?: (data: any) => void) => {
            if (!fn) return;
            source.addEventListener(type, (ev: MessageEvent) => {
                received = true;
                try {
                    fn(JSON.parse(ev.data));
                } catch (e) {
                    // 数据不完整时忽略这一帧，等下一次推送
                }
            });
        };

        bind("status", handlers.onStatus);
        bind("progress", handlers.onProgress);
        bind("tasks", handlers.onTasks);
        bind("deleted", handlers.onDeleted);

        return stop;
    }
}

export class GUnits {
    http: Http;
    sse: EventStream;
    msg: typeof ElMessage;
    msgbox: typeof ElMessageBox;
    tipbox: typeof ElNotification;
    constructor() {
        this.http = new Http();
        this.sse = new EventStream();
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