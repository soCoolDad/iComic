<template>
    <div class="download">
        <h1 class="title">{{ $t('download.title') }}</h1>
        <el-row :gutter="10">
            <el-col :xs="23" :sm="23" :md="12" :lg="12" :xl="12">
                <el-input v-model="keyword" :placeholder="input_placeholder" />
            </el-col>
            <el-col :xs="8" :sm="8" :md="8" :lg="8" :xl="8">
                <el-select v-model="plugin_select" placeholder="select plugin" class="hidden-sm-and-down">
                    <el-option v-for="item in plugins" :label="item.name" :value="item.id" />
                </el-select>
            </el-col>
            <el-col :xs="4" :sm="4" :md="4" :lg="4" :xl="4" class="hidden-sm-and-down">
                <el-button @click="search" type="primary" :disabled="ajaxWorking" :loading="ajaxWorking">{{
                    $t('download.search') }}</el-button>
            </el-col>
        </el-row>
        <el-row class="hidden-sm-and-up padding-top-10 text-right">
            <el-col :xs="16" :sm="16" :md="16" :lg="16" :xl="16">
                <el-select v-model="plugin_select" placeholder="select plugin">
                    <el-option v-for="item in plugins" :label="item.name" :value="item.id" />
                </el-select>
            </el-col>
            <el-col :xs="7" :sm="7" :md="7" :lg="7" :xl="7">
                <el-button width="100%" @click="search" :Loading="ajaxWorking">{{ $t('download.search') }}</el-button>
            </el-col>
        </el-row>

        <div class="searchRetBox">
            <div class="empty" v-if="list.length == 0">
                <template v-if="keyword && ajaxWorking">
                    <el-empty :description="$t('download.searching', keyword)" />
                </template>
                <template v-else-if="keyword && !ajaxWorking && searched">
                    <el-empty :description="$t('download.no_result', keyword)" />
                </template>
                <template v-else>
                    <el-empty :description="$t('download.standby')" />
                </template>
            </div>
            <div class="hasData" v-else>
                <el-table :data="list" stripe style="width: 100%">
                    <el-table-column :label="$t('download.cover')" width="130">
                        <template #default="scope">
                            <div class="cover_image">
                                <el-image class="image" fit="cover" loading="lazy" :src="scope.row.cover_image" lazy />
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$t('download.detail')">
                        <template #default="scope">
                            <div class="detail">
                                <div class="title">
                                    <div>{{$t('download.col_title')}}</div>
                                    <div>
                                        <b>
                                            {{ scope.row.title }}
                                        </b>
                                    </div>
                                </div>
                                <div class="description">
                                    <div>{{$t('download.col_description')}}</div>
                                    <div class="showTowLine">
                                        {{ scope.row.description }}
                                    </div>
                                </div>
                            </div>
                        </template>
                    </el-table-column>
                    <el-table-column :label="$t('download.add_to_col')" width="130">
                        <template #default="scope">
                            <div class="downloadBtnBox">
                                <el-button type="primary" @click="handleDownload(scope.row)">{{ $t('download.add_to_task') }}</el-button>
                            </div>
                        </template>
                    </el-table-column>
                </el-table>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
    name: 'download',
    computed: {
        curPlugin() {
            return this.plugins.find(item => item.id === this.plugin_select);
        },
        input_placeholder() {
            return this.curPlugin ? this.curPlugin.placeholder : "请输入关键词";
        }
    },
    data() {
        return {
            keyword: "",
            plugin_select: "",
            searched: false,
            plugins: [] as Array<{ name: string, id: string, placeholder: string }>,
            list: [],
            ajaxWorking: false
        };
    },
    mounted() {
        this.load();
    },
    methods: {
        load() {
            this.ajaxWorking = true;
            this.$g.http.send('/api/plugin/getAllPlugins', 'get').then((res) => {
                //console.log('onLoad success', res);
                let plugins: Array<{ name: string, id: string, placeholder: string }> = [];

                (res.data || []).map(item => {
                    if (item.type === "search") {
                        plugins.push({
                            name: item.name,
                            id: item.id,
                            placeholder: item.placeholder
                        });
                    }
                });

                this.plugins = plugins;

                //this.plugins = res.data;
            }).catch((err) => {
                //console.log('onLoad error', err);
                this.$g.tipbox.error(err.msg);
            }).finally(() => {
                this.ajaxWorking = false;
            });

            //   this.$g.http.send('/api/user/create', 'post').then((res) => {
            //     console.log('onLoad success', res);
            //   }).catch((err) => {
            //     console.log('onLoad error', err);
            //   });
        },
        search() {
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;
            this.searched = false;
            this.$g.http.send('/api/download/search', 'post', {
                keyword: this.keyword,
                plugin_id: this.plugin_select,
            }).then((res) => {
                //console.log('onLoad success', res);
                if (res.status) {
                    this.list = res.data;
                } else {
                    this.$g.tipbox.error(res.msg);
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
                this.searched = true;
            });
        },
        handleDownload(row) {
            // 
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/download/download', 'post', {
                plugin_id: this.plugin_select,
                name: row.name,
                search_result: row
            }).then((res) => {
                //console.log('onLoad success', res);
                if (res.status) {
                    this.$g.tipbox.success(res.msg);
                    //自动开始下载
                    // this.$g.http.send('/api/download_task/begin', 'post', {
                    //     task_id: res.data.task_id
                    // }).then((res) => {
                    //     this.$g.tipbox.success(res.msg);
                    // }).catch((err) => {
                    //     this.$g.tipbox.error(err.message);
                    // });
                } else {
                    this.$g.tipbox.error(res.msg);
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });
        }
    },
});
</script>

<style scoped lang="scss">
.download {
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

    .searchRetBox {
        padding: 30px 0;
    }

    .downloadBtnBox {
        text-align: left;
    }

    .showTowLine {
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
    }
}
</style>