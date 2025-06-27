<template>
    <div class="download_task">
        <h1 class="title">{{ $t('download_task.title') }}</h1>
        <div class="dataBox">
            <el-table :data="list" stripe style="width: 100%">
                <el-table-column :label="$t('download_task.col_status')" width="80">
                    <template #default="scope">
                        <el-tag v-if="scope.row.type == '1'" type="success">{{ $t('update.update') }}</el-tag>
                        <el-tag v-if="scope.row.type == '0'" type="danger">{{ $t('download.add_to_task') }}</el-tag>
                    </template>
                </el-table-column>
                <el-table-column :label="$t('download_task.col_name')" prop="name"></el-table-column>
                <el-table-column :label="$t('download_task.col_progress')">
                    <template #default="scope">
                        <div class="detail">
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
                <el-table-column :label="$t('download_task.col_action')">
                    <template #default="scope">
                        <div class="downloadBtnBox">
                            <el-button v-if="scope.row.status == 0 || scope.row.status == 3 || scope.row.status == 4"
                                type="primary" @click="handleDownload_begin(scope.row)">{{
                                    $t('download_task.btn_action_start') }}</el-button>
                            <el-button v-if="scope.row.status == 1" type="primary"
                                @click="handleDownload_pause(scope.row)">{{ $t('download_task.btn_action_pause')
                                }}</el-button>
                            <el-button type="danger" @click="handleDownload_delete(scope.row)">{{
                                $t('download_task.btn_action_delete') }}</el-button>
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
    Warning
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
export default defineComponent({
    name: 'download_task',
    data() {
        return {
            curItem: {} as task_item,
            list: [],
            ajaxWorking: false,
            autoRefreshTimer: 0,
            showErrors: false
        };
    },
    mounted() {
        this.onload();
        this.autoRefreshTimer = setInterval(() => {
            this.onload();
        }, 2000);
    },
    unmounted() {
        clearInterval(this.autoRefreshTimer);
    },
    methods: {
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

            this.$g.msgbox.confirm(`确定删除《${row.name}》吗?`, '删除任务', {
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