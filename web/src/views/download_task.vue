<template>
    <div class="download_task">
        <h1 class="title">{{ $t('download_task.title') }}</h1>
        <div class="dataBox">
            <el-table :data="list" stripe style="width: 100%">
                <el-table-column :label="$t('download_task.col_status')" width="110">
                    <template #default="scope">
                        <el-tag v-if="scope.row.type == '0'" type="danger">{{ $t('download.add_to_task') }}</el-tag>
                        <el-tag v-if="scope.row.type == '1'" type="success">{{ $t('update.update') }}</el-tag>
                        <el-tag v-if="scope.row.type == '2'" type="warning">{{ $t('download_task.col_status_on_demand') }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column :label="$t('download_task.col_name')" prop="name"></el-table-column>
                <el-table-column :label="$t('download_task.col_progress')">
                    <template #default="scope">
                        <!-- 按需下载任务 -->
                        <div v-if="scope.row.type == '2'" class="detail">
                            <PageProgressBar :total="scope.row.page_count || 0"
                                :downloaded="scope.row.downloaded_pages || []"
                                :downloading="scope.row.downloading_pages || []"
                                :queued="scope.row.queued_pages || []" :height="20" :text-inside="true"
                                :label="`${scope.row.downloaded_count || 0}/${scope.row.page_count || 0}`" />
                        </div>
                        <!-- 普通下载任务 -->
                        <div v-else class="detail">
                            <div class="title">
                                <div class="padding-top-10">
                                    <el-progress :text-inside="true" :stroke-width="20" :percentage="(((scope.row.current_page_complete_count +
                                        scope.row.current_page_fail_count)
                                        / scope.row.current_page_count) || 0) * 100" status="exception">
                                        <span>{{ scope.row.current_page_complete_count +
                                            scope.row.current_page_fail_count
                                        }}/{{ scope.row.current_page_count }}</span>
                                    </el-progress>
                                </div>
                            </div>
                            <div class="description">
                                <div class="padding-top-10">
                                    <el-progress :text-inside="true" :stroke-width="20"
                                        :percentage="(((scope.row.page_complete_count + scope.row.page_fail_count) / scope.row.page_count) || 0) * 100"
                                        status="exception">
                                        <span>{{ scope.row.page_complete_count +
                                            scope.row.page_fail_count
                                            }}/{{ scope.row.page_count }}</span>
                                    </el-progress>
                                </div>
                            </div>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column :label="$t('download_task.col_info')" width="180">
                    <template #default="scope">
                        <el-row class="downloadStatus">
                            <el-col :span="12">
                                <div class="downloadStatus">
                                    <!-- 0已添加未开始 1正在下载 2下载完成 3下载失败 4暂停下载 5已删除 -->
                                    <span v-if="scope.row.status == 0">{{ $t('download_task.col_status_wait') }}</span>
                                    <span v-if="scope.row.status == 1">{{ $t('download_task.col_status_downloading')
                                        }}</span>
                                    <span v-if="scope.row.status == 2">{{ $t('download_task.col_status_finish')
                                        }}</span>
                                    <span v-if="scope.row.status == 3">{{ $t('download_task.col_status_error') }}</span>
                                    <span v-if="scope.row.status == 4">{{ $t('download_task.col_status_pause') }}</span>
                                    <span v-if="scope.row.status == 5">{{ $t('download_task.col_status_delete')
                                        }}</span>
                                    <span v-if="scope.row.status == 6">{{ $t('download_task.col_status_on_demand') }}</span>
                                </div>
                            </el-col>
                            <el-col :span="12">
                                <div class="infoBtn" v-if="scope.row.errors && scope.row.errors.length > 0">
                                    <el-button @click="showErrorBox(scope.row)" type="danger" :icon="Warning" circle />
                                </div>
                            </el-col>
                        </el-row>
                    </template>
                </el-table-column>
                <el-table-column width="150" :label="$t('download_task.col_action')">
                    <template #default="scope">
                        <div class="downloadBtnBox">
                            <!-- 按需下载任务按钮 -->
                            <template v-if="scope.row.type == '2'">
                                <el-tooltip :content="$t('download_task.btn_action_start')" placement="top">
                                    <el-button v-if="scope.row.status == 0 || scope.row.status == 3 || scope.row.status == 4"
                                        circle type="primary" :icon="VideoPlay"
                                        @click="handleDownload_begin(scope.row)" />
                                </el-tooltip>
                                <el-tooltip :content="$t('download_task.btn_read')" placement="top">
                                    <el-button v-if="scope.row.status == 6" circle type="success" :icon="Reading"
                                        @click="handleReadOnDemand(scope.row)" />
                                </el-tooltip>
                                <el-tooltip :content="$t('download_task.btn_prefetch')" placement="top">
                                    <el-button v-if="scope.row.status == 6 && !scope.row.is_complete" circle type="warning"
                                        :icon="Download" @click="handlePrefetch(scope.row)" />
                                </el-tooltip>
                                <el-tooltip :content="$t('download_task.btn_action_delete')" placement="top">
                                    <el-button circle type="danger" :icon="Delete"
                                        @click="handleDownload_delete(scope.row)" />
                                </el-tooltip>
                            </template>
                            <!-- 普通下载任务按钮 -->
                            <template v-else>
                                <el-tooltip :content="$t('download_task.btn_action_start')" placement="top">
                                    <el-button v-if="scope.row.status == 0 || scope.row.status == 3 || scope.row.status == 4"
                                        circle type="primary" :icon="VideoPlay"
                                        @click="handleDownload_begin(scope.row)" />
                                </el-tooltip>
                                <el-tooltip :content="$t('download_task.btn_action_pause')" placement="top">
                                    <el-button v-if="scope.row.status == 1" circle type="warning" :icon="VideoPause"
                                        @click="handleDownload_pause(scope.row)" />
                                </el-tooltip>
                                <el-tooltip :content="$t('download_task.btn_action_delete')" placement="top">
                                    <el-button circle type="danger" :icon="Delete"
                                        @click="handleDownload_delete(scope.row)" />
                                </el-tooltip>
                            </template>
                        </div>
                    </template>
                </el-table-column>
            </el-table>
        </div>
        <div class="hide">
            <el-dialog v-model="showErrors" :title="curItem?.name" width="500" align-center>
                <div class="readToBox">
                    <div class="tips title">{{ $t('download_task.errbox_title') }}</div>
                    <div class="errorBox">
                        <ul class="scrollBox">
                            <li class="scrollItem" v-for="item in curItem?.errors">
                                <div>{{ item }}</div>
                            </li>
                        </ul>
                    </div>
                    <div class="tips text-right">
                        <el-button type="primary" size="large" :loading="ajaxWorking" :disabled="ajaxWorking"
                            @click="showErrors = false">{{ $t('download_task.errbox_btn_colse') }}</el-button>
                    </div>
                </div>
            </el-dialog>
        </div>
    </div>
</template>
<script lang="ts" setup>
import {
    Warning,
    VideoPlay,
    VideoPause,
    Reading,
    Download,
    Delete
} from '@element-plus/icons-vue';
</script>
<script lang="ts">
interface task_item {
    id: number;
    name: string;
    status: number;
    errors: string[];
}

import { defineComponent } from 'vue';
import PageProgressBar from '../components/PageProgressBar.vue';
export default defineComponent({
    name: 'download_task',
    components: {
        PageProgressBar
    },
    data() {
        return {
            curItem: {} as task_item,
            list: [],
            ajaxWorking: false,
            autoRefreshTimer: null as number | null,
            // 任务事件长连接的取消句柄（SSE）；为 null 表示当前走降级轮询
            task_event_stream: null as any,
            showErrors: false
        };
    },
    mounted() {
        this.onload();
        // 任务列表改为长连接订阅：有任务变化时服务端主动推，不再每 2 秒轮询一次
        this.startEventStream();
    },
    unmounted() {
        this.stopTaskUpdates();
    },
    methods: {
        // 订阅全部任务的事件流；长连接不可用时退回原来的定时轮询
        startEventStream() {
            this.task_event_stream = this.$g.sse.subscribe(
                '/api/download_task/events',
                {
                    onTasks: (data: any) => {
                        this.list = data || [];
                    },
                    onFallback: () => {
                        this.task_event_stream = null;
                        this.startPollingFallback();
                    }
                }
            );
        },
        stopEventStream() {
            if (this.task_event_stream) {
                this.task_event_stream();
                this.task_event_stream = null;
            }
        },
        stopTaskUpdates() {
            this.stopEventStream();
            if (this.autoRefreshTimer) {
                clearInterval(this.autoRefreshTimer);
                this.autoRefreshTimer = null;
            }
        },
        // 长连接不可用时的兜底：恢复定时轮询
        startPollingFallback() {
            if (this.autoRefreshTimer) return;
            this.autoRefreshTimer = setInterval(() => {
                this.onload();
            }, 2000);
        },
        showErrorBox(item) {
            this.curItem = item;
            this.showErrors = true;
        },
        onload() {
            //
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/download_task/getAllTasks', 'get').then((res) => {
                if (res.status) {
                    this.list = res.data;
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });
        },
        handleDownload_begin(row) {
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/download_task/begin', 'post', {
                task_id: row.id
            }).then((res) => {
                if (res.status) {
                    row.status = 1;
                    this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });
        },
        handleDownload_pause(row) {
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/download_task/pause', 'post', {
                task_id: row.id
            }).then((res) => {
                if (res.status) {
                    row.status = 4;
                    this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });
        },
        handleDownload_delete(row) {
            if (this.ajaxWorking) {
                return;
            }

            this.$g.msgbox.confirm(this.$t('download_task.confirm_delete_description',{name:row.name}), this.$t('download_task.confirm_delete_title'), {
                type: 'warning',
                confirmButtonClass: 'el-button--danger',
                confirmButtonText: this.$t('download_task.confirm_delete_delete'),
                cancelButtonText: this.$t('download_task.confirm_delete_cancel'),
                beforeClose: (action, instance, done) => {
                    if (action === 'confirm') {
                        instance.confirmButtonLoading = true
                        instance.confirmButtonText = 'Loading...'

                        this.ajaxWorking = true;

                        this.$g.http.send('/api/download_task/delete', 'post', {
                            task_id: row.id
                        }).then((res) => {
                            if (res.status) {
                                row.status = 5;
                                this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                            } else {
                                this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                            }
                        }).catch((err) => {
                            this.$g.tipbox.error(err.message);
                        }).finally(() => {
                            done()
                            setTimeout(() => {
                                instance.confirmButtonLoading = false
                            }, 300)
                            this.ajaxWorking = false;
                        });
                    } else {
                        done()
                    }
                }
            });
        },
        handleReadOnDemand(row) {
            this.$router.push({
                path: '/reader',
                query: { task_id: row.id, mode: 'on_demand' }
            });
        },
        handlePrefetch(row) {
            if (this.ajaxWorking) return;
            this.ajaxWorking = true;

            // 预下载未下载的页
            let downloaded = row.downloaded_pages || [];
            let total = row.page_count || 0;
            let pages = [];
            for (let i = 0; i < total; i++) {
                if (!downloaded.includes(i)) {
                    pages.push(i);
                }
            }

            if (pages.length === 0) {
                this.ajaxWorking = false;
                return;
            }

            this.$g.http.send('/api/download_task/prefetch', 'post', {
                task_id: row.id,
                pages: pages
            }).then((res) => {
                if (res.status) {
                    this.$g.tipbox.success(this.$t(res.msg, res.i18n || { count: pages.length }));
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });
        }
    }
});
</script>
<style lang="scss" scoped>
.download_task {
    max-width: 800px;
    margin: 0 auto;

    h1.title {
        font-size: 24px;
    }

    .downloadBtnBox {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: nowrap;

        .el-button+.el-button {
            margin-left: 8px;
        }
    }

    .padding-top-10 {
        padding-top: 10px;
    }

    .text-right {
        text-align: right;
    }

    .cover_image {
        .image {
            width: 110px;
            height: 150px;
            border-radius: 5px;
        }
    }

    .dataBox {
        padding: 30px 0;
    }

    .downloadStatus {
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .readToBox {
        color: #353535;

        .title {
            font-size: 18px;
        }

        .errorBox {
            min-height: 200px;
            max-height: 350px;
            overflow: auto;
            padding-bottom: 10px;

            .scrollBox {
                .scrollItem {
                    list-style-type: decimal;
                    padding: 10px;
                    border: none;
                }
            }
        }
    }
}
</style>