<template>
    <div class="read" :class="{ 'read_mode': plugin_content_type }">
        <div class="loading" v-show="page_loading || page_error">
            <el-alert v-if="page_loading" type="primary" :title="$t('reader.loading_title')"
                :description="$t('reader.loading_description')" show-icon />
            <el-alert v-if="page_error" type="error" :title="$t('reader.loading_error_title')"
                :description="$t('reader.loading_error_description', page_error)" show-icon />
        </div>

        <div class="reader_box" :class="{ 'hide_bar': !show_bar }" @click="show_bar = !show_bar">
            <div class="header" @click.stop>
                <el-page-header @back="onBack" :icon="ArrowLeft">
                    <template #content>
                        <el-row class="titles">
                            <el-col class="font-600 line-one">
                                {{ current_title }}
                            </el-col>
                        </el-row>
                        <el-row class="titles">
                            <el-col class="desc line-one">
                                {{ file.description }}
                            </el-col>
                        </el-row>
                    </template>
                </el-page-header>
            </div>
            <!-- 虚拟滚动开始 -->
            <div class="scroller" :class="{ 'text_mode': plugin_content_type == 'text' }">
                <div class="scroller_content">
                    <!-- 使用虚拟滚动 -->
                    <VirtualScroller
                        v-if="plugin_content_type == 'image'"
                        ref="virtualScroller"
                        :items="items"
                        :itemHeight="400"
                        :bufferSize="10"
                    >
                        <template #default="{ item, index }">
                            <div class="image_box">
                                <LazyImage
                                    :src="item"
                                    :placeholderHeight="'400px'"
                                    :loadOffset="400"
                                    :destroy-offset="400"
                                    :directLoad = "true"
                                    @load="(img) => onImageLoad(index, img)"
                                />
                            </div>
                        </template>
                    </VirtualScroller>

                    <div class="text_box" v-for="item in items" v-if="plugin_content_type == 'text'">
                        <div class="text" v-html="getBlockText(item)"></div>
                    </div>

                    <!-- 文本模式的滚动内容尾部间隔：底栏出现时把内容顶上去（滚动容器自身的尾部 padding 部分浏览器不生效） -->
                    <div class="bar_spacer" v-if="plugin_content_type == 'text'"
                        :style="{ height: show_bar ? '80px' : '0px' }"></div>
                </div>
            </div>

            <div class="footer" @click.stop>
                <el-row style="width: 100%;" :gutter="20">
                    <el-col :span="6" :xs="4" style="text-align: right;">
                        <el-button circle type="primary" @click="handlePrev" :icon="ArrowLeftBold"></el-button>
                    </el-col>
                    <el-col :span="12" :xs="16">
                        <div ref="cascader_wrap" style="width: 100%;">
                            <el-cascader style="width: 100%;" :options="options" :show-all-levels="false"
                                v-model="cascader_value" placeholder="select chapter"
                                popper-class="reader-cascader-popper" @visible-change="onCascaderVisible"
                                @change="onSelectChange()">
                                <template #default="{ data }">
                                    <span class="chapter_option">
                                        <span class="chapter_label">{{ data.label }}</span>
                                        <span v-if="data.isNew" class="new_dot"></span>
                                    </span>
                                </template>
                            </el-cascader>
                        </div>
                        <div v-if="on_demand_mode" class="on-demand-progress">
                            <PageProgressBar :total="total_pages_count" :downloaded="downloaded_pages"
                                :downloading="server_downloading_pages" :queued="server_queued_pages" :height="10"
                                :text-inside="true" :label="`${downloaded_pages_count}/${total_pages_count}`" />
                        </div>
                    </el-col>
                    <el-col :span="6" :xs="4">
                        <el-button circle type="primary" @click="handleNext" :icon="ArrowRightBold"></el-button>
                    </el-col>
                </el-row>
            </div>

            <!-- 按需模式：翻到未下载页时就地显示下载进度 -->
            <div class="page_downloading" v-if="page_downloading">
                <el-progress type="circle" :percentage="pageProgressPct" :width="90" />
                <div class="tips">{{ $t('reader.downloading_page') }}</div>
            </div>

            <!-- 按需模式：打开阅读器拉取到最新目录后的确认弹窗，逐项列出差异，确认后才应用 -->
            <el-dialog v-model="show_catalog_update" :title="$t('reader.catalog_update_title')" width="460px"
                align-center :close-on-click-modal="false">
                <template v-if="catalog_update?.append_only">
                    <div class="catalog_tips">{{ $t('reader.catalog_new_pages', { count: catalog_update?.new_pages?.length || 0 }) }}</div>
                    <div class="catalog_diff_list">
                        <div class="diff_item" v-for="p in catalog_update?.new_pages || []" :key="p.index">
                            <span class="idx">{{ p.index + 1 }}.</span>
                            <span class="title">{{ p.title }}</span>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <el-alert type="warning" :closable="false" show-icon :title="$t('reader.catalog_structural_warning')"
                        :description="$t('reader.catalog_structural_desc', { old: catalog_update?.old_total || 0, new: catalog_update?.total_pages || 0 })" />
                    <div class="catalog_diff_list">
                        <div class="diff_item" v-for="(c, i) in catalog_update?.changes || []" :key="i">
                            <span class="idx">{{ c.index + 1 }}.</span>
                            <span class="title">{{ c.old_title || '—' }} → {{ c.new_title || '—' }}</span>
                        </div>
                    </div>
                </template>
                <template #footer>
                    <el-button @click="show_catalog_update = false">{{ $t('reader.catalog_update_cancel') }}</el-button>
                    <el-button type="primary" :loading="catalog_updating" @click="onApplyCatalogUpdate">
                        {{ $t('reader.catalog_update_apply') }}</el-button>
                </template>
            </el-dialog>
        </div>
    </div>
</template>
<script lang="ts" setup>
import {
    ArrowLeft,
    ArrowLeftBold,
    ArrowRightBold
} from '@element-plus/icons-vue'
</script>
<script lang="ts">
import { defineComponent } from 'vue';
import LazyImage from '../components/lazyImage.vue';
//import type VirtualScroller from '../components/VirtualScroller.vue';
import VirtualScroller from '../components/VirtualScroller.vue';
import PageProgressBar from '../components/PageProgressBar.vue';

interface file_item {
    id: string,
    name: string,
    page_count: number,
    author: string,
    description: string,
    status: number,
    read_page_progress: number
}

interface page_list_item {
    title: string,
    region: number[]
}

export default defineComponent({
    name: 'reader',
    components: {
        LazyImage,
        VirtualScroller,
        PageProgressBar
    },
    computed: {
        cascader_value: {
            get() {
                return this.chapter_index;
            },
            set(val) {
                this.chapter_index = val[val.length - 1]; // 通常取最后一级的值
            }
        },
        downloaded_pages_count() {
            return this.downloaded_pages.length;
        },
        current_title() {
            let name = this.file?.name;
            let title = this.file_page_list[this.chapter_index]?.title;

            if (name && title) {
                return `${title} - ${name}`;
            }

            return name;
        },
        current_chapter() {
            return this.file_page_list[this.chapter_index];
        },
        options() {
            const MAX_GROUP_SIZE = 50; // 每组最大数量
            let newOptions = [] as any[];

            // 1. 生成原始选项列表（按需模式下新页带标注）
            const rawOptions = this.file_page_list.map((item, index) => ({
                value: index,
                label: item.title,
                isNew: this.new_page_from >= 0 && index >= this.new_page_from
            }));

            // 2. 分组处理
            if (rawOptions.length > MAX_GROUP_SIZE) {
                const groupCount = Math.ceil(rawOptions.length / MAX_GROUP_SIZE);

                for (let i = 0; i < groupCount; i++) {
                    const startIdx = i * MAX_GROUP_SIZE;
                    const endIdx = startIdx + MAX_GROUP_SIZE;
                    const groupItems = rawOptions.slice(startIdx, endIdx);

                    newOptions.push({
                        value: `${startIdx}-${endIdx}`,
                        label: `${startIdx}-${endIdx}`,
                        children: groupItems
                    });
                }
            } else {
                newOptions = rawOptions; // 不足10个直接返回
            }

            return newOptions;
        },
        total_pages_count() {
            return this.file_page_list.length;
        },
        pageProgressPct() {
            let prog = this.server_page_progress[this.page_downloading_index];
            if (!prog || !prog.total) return 0;
            return Math.min(100, Math.round((prog.done / prog.total) * 100));
        }
    },
    watch: {
        chapter_index(newVal) {
            // 按需模式还没有 library 记录，进度先存本地，入库前也能续读
            if (this.on_demand_mode) {
                sessionStorage.setItem(`on_demand_${this.task_id}_chapter_index`, String(newVal));
                return;
            }
            this.send_read_progress(newVal);
        }
    },
    data() {
        return {
            file: {} as file_item,
            file_page_list: [] as page_list_item[],
            page_loading: false,
            next_page_loading: false,
            page_error: "",
            pages: [],
            chapter_index: 0,
            items: [] as Array<string>,
            show_bar: true,
            plugin_content_type: "",
            text_cache: {},
            // 按需下载模式
            on_demand_mode: false,
            task_id: "",
            downloaded_pages: [] as number[],
            page_block_counts: [] as number[],
            page_titles: [] as string[],
            page_downloading: false,
            page_downloading_index: -1,
            downloading_pages: [] as number[],
            server_page_progress: {} as any,
            // 服务端上报的「正在下载」「排队中」页索引，进度条据此区分状态
            server_downloading_pages: [] as number[],
            server_queued_pages: [] as number[],
            progress_timer: null as any,
            download_timer: null as any,
            // 目录刷新（按需模式）：打开阅读器时拉最新目录，差异弹窗确认后应用并标注新页
            new_page_from: -1,
            catalog_update: null as any,
            show_catalog_update: false,
            catalog_updating: false,
            // 目录下拉面板宽度同步的监听句柄（展开期间跟随触发框宽度）
            cascader_resize_observer: null as any,
            cascader_width_sync: null as any
        }
    },
    mounted() {
        this.onload();
    },
    beforeUnmount() {
        this.stopPolling();
        this.stopProgressPolling();
        this.stopCascaderWidthWatch();
    },
    methods: {
        onBack() {
            this.$router.go(-1);
        },
        // 目录下拉：把面板宽度同步为触发框（整个下拉控件）的宽度
        // 面板被 teleport 到 body 且 Element 不会自动锁宽，只能运行时量。
        // 注意：el-cascader 是多根组件，$refs 的 $el 是 fragment 锚点（文本节点），
        // 拿不到尺寸，所以量的是外层包裹 div。
        applyCascaderPopperWidth() {
            const wrap = this.$refs.cascader_wrap;
            const popper = document.querySelector('.reader-cascader-popper');
            if (!(wrap instanceof Element) || !(popper instanceof Element)) return false;

            const width = Math.round(wrap.getBoundingClientRect().width);
            if (width > 0) popper.style.width = width + 'px';
            return true;
        },
        // 展开期间挂监听：窗口缩放 / 布局尺寸变化时宽度实时跟随，不再只量一次
        startCascaderWidthWatch() {
            this.stopCascaderWidthWatch();

            const sync = () => this.applyCascaderPopperWidth();
            this.cascader_width_sync = sync;

            if (typeof ResizeObserver !== 'undefined' && this.$refs.cascader_wrap instanceof Element) {
                this.cascader_resize_observer = new ResizeObserver(sync);
                this.cascader_resize_observer.observe(this.$refs.cascader_wrap);
            }
            window.addEventListener('resize', sync);
        },
        stopCascaderWidthWatch() {
            if (this.cascader_resize_observer) {
                this.cascader_resize_observer.disconnect();
                this.cascader_resize_observer = null;
            }
            if (this.cascader_width_sync) {
                window.removeEventListener('resize', this.cascader_width_sync);
                this.cascader_width_sync = null;
            }
        },
        onCascaderVisible(visible) {
            if (!visible) {
                this.stopCascaderWidthWatch();
                return;
            }

            this.$nextTick(() => {
                // 首次展开时 popper 可能还没挂到 body，补一帧兜底
                if (!this.applyCascaderPopperWidth()) {
                    requestAnimationFrame(() => this.applyCascaderPopperWidth());
                }
                this.startCascaderWidthWatch();
            });
        },
        getBlockText(url) {
            //将所有/替换为_
            let key = url.replace(/\//g, "_");
            let content = this.text_cache[key];

            if (content) {
                return content;
            } else {
                this.$g.http.send(url, 'get').then((res) => {
                    //..
                    if (res.status) {
                        let str = res.data;

                        //将所有<替换为&lt;
                        str = str.replaceAll("<", "&lt;");
                        //将所有>替换为&gt;
                        str = str.replaceAll(">", "&gt;");
                        //将所有&替换为&amp;
                        str = str.replaceAll("&", "&amp;");
                        //将所有"替换为&quot;
                        str = str.replaceAll('"', "&quot;");
                        //将所有'替换为&apos;
                        str = str.replaceAll("'", "&apos;");
                        //将所有\n替换为<br>
                        let divs = str.split('\n');
                        let new_strs = divs.map((div) => {
                            return `<div>${div}</div>`;
                        });



                        this.text_cache[key] = new_strs.join('');
                    } else {
                        this.text_cache[key] = `load error:${res.msg}`;
                    }
                }).catch((err) => {
                    this.text_cache[key] = `load error:${err.message}`;
                    return ""
                });
                return "loading...";
            }
        },
        send_read_progress(newVal) {
            //发送阅读进度
            let read_page_progress = newVal;
            let library_id = this.$route.query.library_id;

            this.$g.http.send('/api/library/saveReadProgress', 'post', {
                read_page_progress,
                library_id
            }).then((res) => {
                //..
            }).catch((err) => {
                //..
            });
        },
        onload() {
            // 按需下载模式
            if (this.$route.query.mode === 'on_demand' && this.$route.query.task_id) {
                this.on_demand_mode = true;
                this.task_id = String(this.$route.query.task_id);
                return this.onloadOnDemand();
            }

            let plugin_id = String(this.$route.query.plugin_id);
            let library_id = String(this.$route.query.library_id);

            if (!plugin_id) {
                this.page_error = this.$t('server.no_plugin_select');
                this.$g.tipbox.error(this.$t('server.no_plugin_select'));
                return;
            }

            if (!library_id) {
                this.page_error = this.$t('reader.no_file_select');
                this.$g.tipbox.error(this.$t('reader.no_file_select'));
                return;
            }

            if (this.page_loading) return;
            this.page_loading = true;

            let getLibraryById = this.$g.http.send('/api/library/getLibraryById', 'post', {
                library_id: this.$route.query.library_id,
                need_config: true
            }).then((res) => {
                if (res.status) {
                    this.file = res.data;
                    this.file_page_list = res.data?.config?.page_list || [];
                } else {
                    this.page_error = this.$t(res.msg, res.i18n);
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.page_error = err.message;
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.page_loading = false;
            });

            let getPluginById = this.$g.http.send('/api/plugin/getPluginById', 'post', {
                plugin_id: this.$route.query.plugin_id
            }).then((res) => {
                if (res.status) {
                    this.plugin_content_type = res.data.content_type;
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            });

            Promise.all([getLibraryById, getPluginById]).then(() => {
                let local_chapter_index = sessionStorage.getItem(`${this.$route.query.library_id}_chapter_index`);

                if (local_chapter_index === null || local_chapter_index === undefined) {
                    this.chapter_index = this.file?.read_page_progress
                } else {
                    this.chapter_index = Number(local_chapter_index);
                    sessionStorage.removeItem(`${this.$route.query.library_id}_chapter_index`);
                }

                this.initItems();
            });
        },
        async onloadOnDemand() {
            if (this.page_loading) return;
            this.page_loading = true;

            try {
                let res = await this.$g.http.send(`/api/download_task/getPageStatus?task_id=${this.task_id}`, 'get');
                if (!res.status) {
                    this.page_error = this.$t(res.msg, res.i18n);
                    return;
                }

                let data = res.data;
                this.plugin_content_type = data.content_type || "image";

                // 构建 page_list：每个页作为一个 chapter（同时更新书籍信息）
                this.buildOnDemandPages(data);

                // 启动轮询刷新下载状态
                this.startPolling();

                // 每次打开按需阅读器时拉取一次源站最新目录（失败不打扰阅读，保持本地目录）
                this.refreshCatalogCheck();
            } catch (err: any) {
                this.page_error = err.message;
                this.$g.tipbox.error(err.message);
            } finally {
                this.page_loading = false;
            }

            this.initItems();
        },
        // 用 getPageStatus 的数据构建按需模式的页面列表（元数据就绪前后都可调用）
        buildOnDemandPages(data) {
            let total = data.total_pages || 0;

            this.file = {
                id: data.task_id,
                name: data.name,
                page_count: total,
                author: data.book_meta?.author || "",
                description: data.book_meta?.description || "",
                status: data.status,
                read_page_progress: 0
            } as any;

            this.downloaded_pages = data.downloaded_pages || [];
            this.server_downloading_pages = data.downloading_pages || [];
            this.server_queued_pages = data.queued_pages || [];
            this.page_block_counts = data.page_block_counts || [];
            // 目录标题：getDetail 时随 book_meta 持久化的每页标题，缺省回退"第N页"
            this.page_titles = data.page_titles || [];

            this.file_page_list = [];
            for (let i = 0; i < total; i++) {
                this.file_page_list.push({
                    title: this.page_titles[i] || `第${i + 1}页`,
                    region: []
                });
            }

            // 首次拿到元数据时恢复上次阅读位置
            if (this.chapter_index === 0) {
                let saved = sessionStorage.getItem(`on_demand_${this.task_id}_chapter_index`);
                if (saved !== null && Number(saved) > 0 && Number(saved) < total) {
                    this.chapter_index = Number(saved);
                }
            }
        },
        // 打开阅读器后拉取源站最新目录，发现变化时弹窗逐项列出差异（用户确认前不写任何数据）
        async refreshCatalogCheck() {
            let res = await this.$g.http.send('/api/download_task/refreshCatalog', 'post', {
                task_id: this.task_id
            }).catch(() => null);

            if (!res || !res.status || !res.data?.changed) return;

            this.catalog_update = res.data;
            this.show_catalog_update = true;
        },
        // 应用最新目录：入库并在目录下拉中标注新页，当前阅读进度保持不变
        async onApplyCatalogUpdate() {
            if (this.catalog_updating) return;
            this.catalog_updating = true;

            try {
                let res = await this.$g.http.send('/api/download_task/refreshCatalog', 'post', {
                    task_id: this.task_id,
                    apply: true
                });

                if (!res.status) {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                    return;
                }

                this.show_catalog_update = false;

                if (!res.data?.changed) return;

                this.new_page_from = Number.isInteger(res.data.marked_from) ? res.data.marked_from : -1;

                let statusRes = await this.$g.http.send(`/api/download_task/getPageStatus?task_id=${this.task_id}`, 'get');
                if (statusRes.status) {
                    this.buildOnDemandPages(statusRes.data);

                    // 当前章超出新目录（章节被删）时回收到最后一页
                    if (this.chapter_index >= this.file_page_list.length) {
                        this.chapter_index = Math.max(0, this.file_page_list.length - 1);
                        this.initItems();
                    }
                }
            } catch (err: any) {
                this.$g.tipbox.error(err.message);
            } finally {
                this.catalog_updating = false;
            }
        },
        startPolling() {
            this.stopPolling();
            this.download_timer = setInterval(() => {
                this.$g.http.send(`/api/download_task/getPageStatus?task_id=${this.task_id}`, 'get').then((res) => {
                    if (!res.status) {
                        // 任务不存在（已删除或服务异常），停止轮询
                        this.stopPolling();
                        return;
                    }
                    let data = res.data;
                    let prevCount = this.downloaded_pages.length;
                    this.downloaded_pages = data.downloaded_pages || [];
                    this.server_downloading_pages = data.downloading_pages || [];
                    this.server_queued_pages = data.queued_pages || [];
                    this.page_block_counts = data.page_block_counts || [];

                    // 目录标题有更新（新页下载后）时同步章节列表
                    if ((data.page_titles || []).length > 0 &&
                        JSON.stringify(data.page_titles) !== JSON.stringify(this.page_titles)) {
                        this.page_titles = data.page_titles;
                        this.file_page_list = this.file_page_list.map((item, i) => ({
                            title: this.page_titles[i] || item.title,
                            region: item.region
                        }));
                    }

                    // 插件未声明 content_type 时，类型要从已下载分片推断，
                    // 推断结果可能晚于首次加载，变化后重新按正确方式渲染
                    if (data.content_type && this.plugin_content_type !== data.content_type) {
                        this.plugin_content_type = data.content_type;
                        this.initItems();
                    }

                    // 任务未开始/失败/暂停/删除：停止轮询并提示，避免无限空转
                    const statusMsg = {
                        0: 'download_task.col_status_wait',
                        3: 'download_task.col_status_error',
                        4: 'download_task.col_status_pause',
                        5: 'download_task.col_status_delete'
                    };
                    if (statusMsg[data.status] !== undefined) {
                        this.stopPolling();
                        this.page_error = this.$t(statusMsg[data.status]);
                        return;
                    }

                    // 元数据就绪后重建页面列表（"立即阅读"入口可能早于元数据返回）
                    if ((data.total_pages || 0) > this.file_page_list.length) {
                        this.buildOnDemandPages(data);
                        this.initItems();
                    }

                    // 全部下载完成开始合并入库，停止轮询
                    if (data.is_complete || data.status == 2) {
                        this.stopPolling();
                        return;
                    }

                    // 如果当前页新下载完成，刷新 items
                    if (this.downloaded_pages.length > prevCount && this.downloaded_pages.includes(this.chapter_index)) {
                        this.initItems();
                    }
                }).catch(() => { });
            }, 3000);
        },
        stopPolling() {
            if (this.download_timer) {
                clearInterval(this.download_timer);
                this.download_timer = null;
            }
        },
        // 翻到未下载页：立即就地显示下载进度，完成后自动渲染
        startPageDownload(pageIndex: number) {
            if (!this.downloading_pages.includes(pageIndex)) {
                this.downloading_pages.push(pageIndex);
                this.ensurePageDownloaded(pageIndex).then((ok) => {
                    this.downloading_pages = this.downloading_pages.filter(p => p !== pageIndex);
                    if (this.page_downloading_index === pageIndex) {
                        this.page_downloading = false;
                        this.stopProgressPolling();
                    }
                    if (ok && this.chapter_index === pageIndex) {
                        this.initItems();
                    }
                });
            }
            if (this.page_downloading_index !== pageIndex) {
                this.page_downloading_index = pageIndex;
                this.page_downloading = true;
            }
            this.startProgressPolling();
        },
        // 下载期间每秒轮询页内块进度
        startProgressPolling() {
            if (this.progress_timer) return;
            this.progress_timer = setInterval(() => {
                this.$g.http.send(`/api/download_task/getPageStatus?task_id=${this.task_id}`, 'get').then((res) => {
                    if (!res.status) return;
                    let data = res.data;
                    this.server_page_progress = data.page_progress || {};
                    this.downloaded_pages = data.downloaded_pages || this.downloaded_pages;
                    this.server_downloading_pages = data.downloading_pages || this.server_downloading_pages;
                    this.server_queued_pages = data.queued_pages || this.server_queued_pages;
                    this.page_block_counts = data.page_block_counts || this.page_block_counts;

                    // 当前页下载完成：渲染
                    if (this.page_downloading && this.downloaded_pages.includes(this.page_downloading_index)) {
                        this.page_downloading = false;
                        this.stopProgressPolling();
                        this.initItems();
                    } else if (!this.page_downloading && this.downloading_pages.length === 0) {
                        this.stopProgressPolling();
                    }
                }).catch(() => { });
            }, 1000);
        },
        stopProgressPolling() {
            if (this.progress_timer) {
                clearInterval(this.progress_timer);
                this.progress_timer = null;
            }
        },
        async ensurePageDownloaded(pageIndex: number): Promise<boolean> {
            if (this.downloaded_pages.includes(pageIndex)) return true;

            let res = await this.$g.http.send('/api/download_task/downloadPage', 'post', {
                task_id: this.task_id,
                page: pageIndex
            });

            if (res.status) {
                // 刷新状态
                let statusRes = await this.$g.http.send(`/api/download_task/getPageStatus?task_id=${this.task_id}`, 'get');
                if (statusRes.status) {
                    this.downloaded_pages = statusRes.data.downloaded_pages || [];
                    this.server_downloading_pages = statusRes.data.downloading_pages || [];
                    this.server_queued_pages = statusRes.data.queued_pages || [];
                    this.page_block_counts = statusRes.data.page_block_counts || [];
                    this.page_titles = statusRes.data.page_titles || this.page_titles;
                    this.file_page_list = this.file_page_list.map((item, i) => ({
                        title: this.page_titles[i] || item.title,
                        region: item.region
                    }));

                    // 内容类型可能在首次加载后（分片下载完成）才推断出来，
                    // 这里与轮询同步，避免本页先用图片模式渲染出占位/裂图
                    if (statusRes.data.content_type && this.plugin_content_type !== statusRes.data.content_type) {
                        this.plugin_content_type = statusRes.data.content_type;
                    }
                }
                return true;
            } else {
                this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                return false;
            }
        },
        initItems(btn_scrollTop = true) {
            let current_chapter = this.current_chapter;

            if (!current_chapter) return;

            // 按需下载模式
            if (this.on_demand_mode) {
                let pageIndex = this.chapter_index;
                if (!this.downloaded_pages.includes(pageIndex)) {
                    // 立即切页：清空上一页的图片/文字，就地显示下载进度，完成后自动渲染
                    this.items = [];
                    this.startPageDownload(pageIndex);
                    return;
                }
                this.page_downloading = false;

                let blockCount = this.page_block_counts[pageIndex] || 0;
                let image_urls = [] as Array<string>;
                for (let b = 0; b < blockCount; b++) {
                    image_urls.push(`/api/download_task/getBlock?task_id=${this.task_id}&page=${pageIndex}&block=${b}`);
                }
                this.items = [];
                this.$nextTick(() => {
                    this.items = image_urls;
                });
                return;
            }

            let image_urls = [] as Array<string>;
            this.items = [];

            current_chapter.region.forEach(region => {
                image_urls.push(`/api/parse/block?pi=${this.$route.query.plugin_id}&li=${this.$route.query.library_id}&page=${this.chapter_index}&block=${region}`);
            });

            this.$nextTick(() => {
                this.items = image_urls;
            });
        },
        handleNext() {
            let chapter_index = this.chapter_index + 1;

            if (chapter_index >= this.file_page_list.length) {
                chapter_index = this.file_page_list.length - 1;
            }

            if (chapter_index == this.chapter_index) return;

            this.chapter_index = chapter_index;
            this.initItems();
        },
        handlePrev() {
            let chapter_index = this.chapter_index - 1;

            if (chapter_index < 0) {
                chapter_index = 0;
            }

            if (chapter_index == this.chapter_index) return;

            this.chapter_index = chapter_index;
            this.initItems();
        },
        onSelectChange() {
            //console.log("change page", this.chapter_index);
            //this.chapter_index = this.chapter_index;
            this.initItems();
        },
        // 添加图片加载完成的处理函数
        onImageLoad(index, img) {
            // 获取图片实际高度并更新到虚拟滚动组件
            if (this.$refs.virtualScroller) {
                this.$nextTick(() => {
                    //忽略该错误
                    //console.log("img.calcedHeight", img.calcedHeight);
                    (this.$refs.virtualScroller as any).updateItemHeight(index, img.calcedHeight);
                });
            }
        }
    }
});
</script>
<style scoped lang="scss">
.read {
    color: #353535;

    .loading {
        position: absolute;
        top: 50%;
        left: 50%;
        //background-color: #353535;
        max-width: 600px;
        min-width: 320px;
        max-height: 300px;
        min-height: 300px;
        transform: translate(-50%, -50%);
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .page_downloading {
        position: fixed;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        background-color: rgba(255, 255, 255, 0.92);
        border-radius: 10px;
        padding: 20px 30px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.12);

        .tips {
            margin-top: 10px;
            font-size: 14px;
            color: #666;
        }
    }

    // 目录下拉里的新页标注（下拉渲染在 body 层，靠 scoped 属性匹配）
    .chapter_option {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        width: 100%;

        .chapter_label {
            flex: 1;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        // 新增页标记：绿色圆点（固定在下拉行最右侧，与标题保持间距）
        .new_dot {
            flex-shrink: 0;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: #67c23a;
        }
    }

    // 目录更新确认弹窗
    .catalog_tips {
        font-size: 14px;
        color: #353535;
    }

    .catalog_diff_list {
        max-height: 220px;
        overflow: auto;
        margin-top: 10px;
        border-top: 1px solid #f0f0f0;

        .diff_item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 0;
            font-size: 14px;
            color: #353535;
            border-bottom: 1px dashed #f0f0f0;

            .idx {
                flex-shrink: 0;
                min-width: 2.5em;
                text-align: right;
                color: #999;
            }

            .title {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        }
    }

    .reader_box {
        position: fixed;
        left: 0;
        top: 0;
        right: 0;
        bottom: 0;

        .header {
            position: fixed;
            display: flex;
            left: 0;
            top: 0;
            right: 0;

            background-color: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(5px); // 模糊程度
            -webkit-backdrop-filter: blur(5px); // Safari兼容


            align-items: center;
            height: 80px;
            overflow: auto;
            padding: 0 20px;
            z-index: 1;

            transition: top 0.2s ease-in-out;
        }

        .footer {
            position: fixed;
            display: flex;
            left: 0;
            right: 0;
            bottom: 0;
            align-items: center;
            justify-content: center;
            height: 80px;
            background-color: rgba(255, 255, 255, 0.8);
            backdrop-filter: blur(5px); // 模糊程度
            -webkit-backdrop-filter: blur(5px); // Safari兼容
            overflow: auto;
            padding: 0 20px;

            transition: bottom 0.2s ease-in-out;
        }

        .scroller {
            position: absolute;
            left: 0;
            top: 0;
            right: 0;
            bottom: 0;
            padding: 80px 0px;
            overflow: auto;
            transition: padding 0.2s ease-in-out;
            background-color: rgba(255, 255, 255, 1);
            box-sizing: border-box;

            // 文本模式的滚动容器就是自身，尾部间隔改由内容内的 bar_spacer 提供，
            // 避免部分浏览器丢弃滚动容器尾部 padding 导致末尾内容被底栏遮住
            &.text_mode {
                padding-bottom: 0;
            }

            .bar_spacer {
                width: 100%;
                transition: height 0.2s ease-in-out;
            }
            .scroller_content {
                max-width: 600px;
                margin: 0 auto;
                position: relative;
                height: 100%;

                .image_box {
                    height: 100%;
                    width: 100%;

                    margin: 0; // 清除默认外边距
                    padding: 0; // 清除默认内边距
                    line-height: 0px; // 防止行高导致的间隙

                    +.image_box {
                        margin-top: 0; // 清除相邻图片盒子的间距
                    }

                    .image {
                        //display: block; // 确保图片本身是块级元素
                        width: 100%;
                        height: auto;
                    }
                }

                .text_box {
                    font-family: 'Helvetica Neue', 'Hiragino Sans GB', Helvetica, Arial, 'Microsoft YaHei', '微软雅黑', 'SimSun', '宋体', sans-serif;
                    //background-color: rgb(250, 247, 237);
                    font-size: 20px;
                    font-weight: 400;
                    line-height: 40px;
                    margin: 0; // 清除默认外边距
                    padding: 0; // 清除默认内边距

                    +.text_box {
                        margin-top: 0; // 清除相邻图片盒子和文本盒子的间距
                    }

                    .text {
                        text-indent: 2em;
                        overflow-wrap: break-word;
                        text-align: justify;
                        line-height: 2.4em;
                        outline: 0px;
                    }
                }

                /* 如果设备宽度小于600px */
                @media screen and (max-width: 600px) {
                    .text_box {
                        padding: 0 30px;
                        font-size: 22px;

                        .text {
                            text-indent: 8px;
                        }
                    }
                }
            }
        }

        &.hide_bar {
            .header {
                top: -80px;
            }

            .footer {
                bottom: -80px;
            }

            .scroller {
                padding: 0;
            }
        }

        .font-600 {
            font-weight: 600;
        }

        .titles {
            font-size: 16px;

            .desc {
                font-size: 14px;
            }
        }

        .line-one {
            display: -webkit-box;
            -webkit-box-orient: vertical;
            line-clamp: 1;
            -webkit-line-clamp: 1;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .on-demand-progress {
            margin-top: 4px;
        }
    }

    &.read_mode {
        .scroller {
            background-color: #fcfcfc;
            color: black;
        }
    }
}
</style>

<!-- 目录下拉（cascader）面板：宽度与触发框严格一致、去掉气泡小三角
     面板被 teleport 到 body，scoped 样式命中不了，故用非 scoped 块 + popper-class 限定作用域 -->
<style lang="scss">
.reader-cascader-popper {
    // 0. 兜底 + 让写入的宽度包含 1px 边框（popper 默认是 content-box，会导致比触发框宽 2px）
    box-sizing: border-box;
    min-width: 180px;

    // 1. 去掉指向触发框的小三角
    .el-popper__arrow {
        display: none;
    }

    // 2. 面板铺满 popper（popper 宽度由 onCascaderVisible 运行时锁为触发框宽度）
    .el-cascader-panel {
        width: 100%;
    }

    // 3. 末列（页标题）：吃掉剩余宽度，保证面板总宽恒等于触发框宽度
    .el-cascader-menu:last-child {
        flex: 1 1 0;
        width: auto;
        min-width: 0;
    }

    // 4. 非末列（第一列：0-50 / 50-100 这类分组）：按自身文字宽度自适应，
    //    不再与末列等分；覆盖 Element 默认的 min-width:180px。
    //    flex-shrink 保留 1，只有位置不够时才收缩（标题会走省略号）
    .el-cascader-menu:not(:last-child) {
        flex: 0 1 auto;
        width: max-content;
        min-width: 0;
    }

    // 5. 选项允许收缩，保证标题省略号生效、不把面板顶宽
    .el-cascader-node {
        min-width: 0;
    }
}
</style>
