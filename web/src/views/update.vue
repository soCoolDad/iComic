<template>
    <div class="update">
        <h1 class="title">{{ $t('update.title') }}</h1>
        <div class="dataBox">
            <el-table :data="list" stripe style="width: 100%">
                <el-table-column :label="$t('download_task.col_name')" prop="name"></el-table-column>
                <el-table-column :label="$t('download_task.col_info')">
                    <template #default="scope">
                        <div class="detail">
                            <b>
                                <el-tag type="success" v-if="scope.row.update_count == 0">
                                    {{ scope.row.update_count }}
                                </el-tag>
                                <el-tag type="danger" v-if="scope.row.update_count > 0">
                                    {{ scope.row.update_count }}
                                </el-tag>
                            </b>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column :label="$t('download_task.col_action')">
                    <template #default="scope">
                        <div class="downloadBtnBox">
                            <el-button v-if="scope.row.update_count == 0" type="primary" :loading="ajaxWorking"
                                @click="handleDownload_check(scope.row)">{{
                                    $t('setting.check_new') }}</el-button>
                            <el-button v-if="scope.row.update_count > 0" type="danger" :loading="ajaxWorking"
                                @click="handleDownload_begin(scope.row)">{{
                                    $t('setting.update') }}</el-button>
                        </div>
                    </template>
                </el-table-column>
            </el-table>
        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
    name: 'update',
    data() {
        return {
            ajaxWorking: false,
            list: [],
        };
    },
    mounted() {
        this.onload();
    },
    methods: {
        onload() {
            //
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/library/getAllLibrary', 'get').then((res) => {
                if (res.status) {
                    this.list = (res.data || []).map((item) => {
                        if (item.status == 2) {
                            return {
                                id: item.id,
                                name: item.name,
                                page_count: item.page_count,
                                update_count: 0,
                                status: item.status,
                                search_plugin: item.search_plugin,
                                update_data: {}
                            };
                        } else {
                            return undefined;
                        }
                    }).filter(item => item !== undefined);
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

            let search_result = row.update_data;

            this.ajaxWorking = true;

            this.$g.http.send('/api/download/download', 'post', {
                plugin_id: row.search_plugin,
                name: row.name,
                task_type: 1,
                search_result: search_result
            }).then((res) => {
                //console.log('onLoad success', res);
                if (res.status) {
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
        handleDownload_check(row) {
            // /api/library/getLibraryConfig
            if (this.ajaxWorking) return;

            this.ajaxWorking = true;
            this.$g.http.send('/api/library/getLibraryUpdate', 'post', {
                library_id: row.id
            }).then((res) => {
                if (res.status) {
                    row.update_count = res.data?.update_count || 0;
                    row.update_data = res.data?.updata_data;
                    if (row.update_count == 0) {
                        this.$g.tipbox.success(this.$t('update.no_update'));
                    } else {
                        this.$g.tipbox.success(this.$t('update.has_update', { count: row.update_count }));
                    }
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
.update {
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

    .text-center {
        text-align: center;
    }

    .dataBox {
        padding: 30px 0;
    }
}
</style>