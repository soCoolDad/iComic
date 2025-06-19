<template>
    <div class="plugins">
        <h1 class="title">Plugins</h1>
        <div class="dataBox">
            <el-table :data="list" stripe style="width: 100%">
                <el-table-column label="插件">
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
                                    <el-tag v-if="scope.row.type == 'language'">语言包</el-tag>
                                    <el-tag v-if="scope.row.type == 'search'">搜索库</el-tag>
                                    <el-tag v-if="scope.row.type == 'file-parser'">文件解析</el-tag>
                                    <span>&nbsp;</span>
                                    <el-tag v-if="scope.row.installed == true" type="success">依赖安装完成</el-tag>
                                    <el-tag v-if="scope.row.installed == false && scope.row.need_install == true" type="danger">需安装依赖</el-tag>
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
                <el-table-column label="管理" width="180">
                    <template #default="scope">
                        <div class="downloadBtnBox">
                            <el-button type="danger" v-if="scope.row.need_install" :disabled="scope.row.need_install == false" :loading="ajaxWorking" @click="handlePlugin_install(scope.row)">安装依赖</el-button>
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
                        this.list = res.data;
                    } else {
                        this.$g.tipbox.error(res.msg);
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
                    this.$g.tipbox.success(res.msg);
                } else {
                    this.$g.tipbox.error(res.msg);
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