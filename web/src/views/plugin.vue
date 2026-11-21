<template>
    <div class="plugins">
        <h1 class="title">{{ $t('plugin.title') }}</h1>
        <div class="dataBox">
            <el-table :data="list" stripe style="width: 100%" :row-class-name="rowClassName"
                @row-click="onRowClick">
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
                                        type="danger">{{ $t('plugin.need_install') }}</el-tag>
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
                        <div class="manageBox">
                            <el-button type="danger" v-if="scope.row.need_install"
                                :disabled="scope.row.need_install == false" :loading="ajaxWorking"
                                @click="handlePlugin_install(scope.row)">{{ $t('plugin.install_dependency') }}</el-button>
                            <!-- 参数入口：右侧箭头，点击弹出参数弹窗 -->
                            <el-button v-if="scope.row.params && scope.row.params.length > 0" class="params_entry"
                                text :title="$t('plugin.params_title')" @click="handlePlugin_params(scope.row)">
                                <el-icon><ArrowRight /></el-icon>
                            </el-button>
                        </div>
                    </template>
                </el-table-column>
            </el-table>
        </div>
        <div class="hide">
            <el-dialog v-model="show_params" :title="paramPlugin ? `${paramPlugin.name} - ${$t('plugin.params_title')}` : ''"
                width="500" align-center destroy-on-close>
                <template v-if="paramRows.length > 0">
                    <div class="paramRow" v-for="p in paramRows" :key="p.key">
                        <div class="paramName">
                            <div class="name">{{ paramName(p.key) }}</div>
                            <div class="default">{{ $t('plugin.param_default', { value: p.default }) }}</div>
                        </div>
                        <el-input-number v-model="p.value" :min="p.min" :max="p.max" :step="1" step-strictly />
                    </div>
                    <div class="paramTips">{{ $t('plugin.params_desc') }}</div>
                </template>
                <div class="paramTips" v-else>{{ $t('plugin.no_params') }}</div>
                <template #footer>
                    <div class="dialogFooter">
                        <el-button v-if="paramRows.length > 0" :disabled="ajaxWorking" @click="resetParams">{{
                            $t('plugin.params_reset') }}</el-button>
                        <el-button v-if="paramRows.length > 0" type="primary" :loading="ajaxWorking"
                            :disabled="ajaxWorking" @click="saveParams">{{ $t('setting.save') }}</el-button>
                    </div>
                </template>
            </el-dialog>
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
            ajaxWorking: false,
            show_params: false,
            paramPlugin: null as any,
            paramRows: [] as { key: string, value: number, default: number, min: number, max: number }[]
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
        },
        // 有可调参数的行整行可点击打开参数弹窗（右侧箭头只是视觉提示）
        onRowClick(row, column, event) {
            // 按钮自己处理点击（安装依赖 / 箭头），避免重复触发
            if (event?.target?.closest?.('button')) return;

            if (row.params && row.params.length > 0) {
                this.handlePlugin_params(row);
            }
        },
        // 有可调参数的行显示手型光标提示可点击
        rowClassName({ row }) {
            return (row.params && row.params.length > 0) ? 'row_has_params' : '';
        },
        //打开参数弹窗：数据来自列表接口附带的 params，无需再请求
        handlePlugin_params(row) {
            this.paramPlugin = row;
            this.paramRows = (row.params || []).map((item) => {
                return {
                    key: item.key,
                    value: item.value,
                    default: item.default,
                    min: item.min,
                    max: item.max
                }
            });
            this.show_params = true;
        },
        //参数名优先取语言包（plugin.param_xxx），语言包没有时回退显示原始键名
        paramName(key) {
            let i18nKey = `plugin.param_${key}`;
            let text = this.$t(i18nKey);
            return text === i18nKey ? key : text;
        },
        //恢复默认：把表单值还原为 config.json 的声明值（需再点保存才会生效）
        resetParams() {
            this.paramRows.forEach((p) => {
                p.value = p.default;
            });
        },
        saveParams() {
            if (this.ajaxWorking || !this.paramPlugin) {
                return;
            }

            let params = {};
            this.paramRows.forEach((p) => {
                params[p.key] = p.value;
            });

            this.ajaxWorking = true;

            this.$g.http.send('/api/plugin/savePluginParams', 'post', {
                plugin_id: this.paramPlugin.id,
                params
            }).then((res) => {
                if (res.status) {
                    this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                    this.show_params = false;
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

    .manageBox {
        display: flex;
        align-items: center;

        // 参数入口箭头：始终贴在管理列右侧
        .params_entry {
            margin-left: auto;
        }
    }

    // 有可调参数的行：手型光标提示整行可点击
    :deep(.row_has_params) {
        cursor: pointer;
    }

    //弹窗内容是本组件模板的插槽，带 scoped 属性，直接用顶层选择器；
    //el-dialog 自身的宽度交给下面的全局样式块处理
    .paramRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 0;

        .paramName {
            .name {
                font-size: 15px;
                font-weight: bold;
            }

            .default {
                font-size: 12px;
                color: #999;
                margin-top: 2px;
            }
        }
    }

    .paramTips {
        color: #999;
        font-size: 12px;
        line-height: 20px;
        margin-top: 10px;
    }

    .dialogFooter {
        text-align: right;

        .el-button+.el-button {
            margin-left: 8px;
        }
    }
}
</style>

<style lang="scss">
//弹窗小屏适配：始终钳制最大宽度，桌面端（width=500）不受影响
.plugins .el-dialog {
    max-width: calc(100vw - 16px);
}
</style>
