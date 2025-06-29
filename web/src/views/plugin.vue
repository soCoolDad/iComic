<template>
    <div class="plugins">
        <h1 class="title">{{ $t('plugin.title') }}</h1>
        <div class="dataBox">
            <el-table :data="list" stripe style="width: 100%">
                <el-table-column :label="$t('plugin.plugin')">
                    <template #default="scope">
                        <div class="detail">
                            <div class="title">
                                <div class="padding-top-10">
                                    <span>&nbsp;</span>
                                    <b>
                                        {{ scope.row.name }}
                                    </b>
                                </div>
                            </div>
                            <div class="title">
                                <div class="padding-top-10">
                                    <el-tag v-if="scope.row.type == 'language'">{{ $t('plugin.type_language')
                                        }}</el-tag>
                                    <el-tag v-if="scope.row.type == 'search'">{{ $t('plugin.type_search') }}</el-tag>
                                    <el-tag v-if="scope.row.type == 'parser'">{{ $t('plugin.type_parse')
                                        }}</el-tag>
                                    <span>&nbsp;</span>
                                    <el-tag v-if="scope.row.installed == true" type="success">{{
                                        $t('plugin.install_success') }}</el-tag>
                                    <el-tag v-if="scope.row.installed == false && scope.row.need_install == true"
                                        type="danger">{{ $t('need_install') }}</el-tag>
                                </div>
                            </div>
                            <div class="description">
                                <div class="padding-top-10">
                                    {{ scope.row.description }}
                                </div>
                            </div>
                        </div>
                    </template>
                </el-table-column>
                <el-table-column :label="$t('plugin.manage')" width="180">
                    <template #default="scope">
                        <div class="downloadBtnBox">
                            <el-button type="danger" v-if="scope.row.need_install"
                                :disabled="scope.row.need_install == false" :loading="ajaxWorking"
                                @click="handlePlugin_install(scope.row)">{{ $t('plugin.install_dependency') }}</el-button>
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
    name: 'plugin_mgr',
    data() {
        return {
            list: [],
            ajaxWorking: false
        }
    },
    mounted() {
        this.onload();
    },
    methods: {
        onload() {
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/plugin/getAllPlugins', 'get')
                .then((res) => {
                    if (res.status) {
                        let plugins = res.data || [];

                        //按照type排序
                        plugins.sort((a, b) => {
                            return a.type.localeCompare(b.type, undefined, { numeric: true })
                        });

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
        handlePlugin_install(row) {
            //window.open(row.path, "_blank");
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/plugin/installPluginDependencies', 'post', {
                plugin_id: row.id
            }).then((res) => {
                if (res.status) {
                    this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
                this.onload();
            });
        }
    }
});
</script>

<style scoped lang="scss">
.plugins {
    color: #353535;
    max-width: 800px;
    margin: 0 auto;

    h1.title {
        font-size: 24px;
    }

    .detail {
        .title {
            padding-bottom: 5px;
            font-size: 16px;
            line-height: 30px;

            .padding-top-10 {
                >* {
                    vertical-align: middle;
                }
            }
        }

        .description {
            color: #666;
            padding: 5px;
        }
    }
}
</style>