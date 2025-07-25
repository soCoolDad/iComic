<template>
    <div class="library">
        <el-row>
            <el-col :span="12">
                <h1 class="title">{{ $t('library.title') }}</h1>
            </el-col>
            <el-col :span="12" class="center right">
                <el-button type="primary" @click="onScan" :loading="ajaxWorking">{{ $t('library.scan') }}</el-button>
            </el-col>
        </el-row>
        <div class="empty" v-if="list.length == 0">
            <el-empty :description="$t('library.empty')" />
        </div>
        <div class="has_data" v-else>
            <div class="data_box" v-if="continues.length > 0">
                <div class="title">{{ $t('library.continue') }}</div>
                <el-row :gutter="20">
                    <el-col :xs="24" :sm="12" :md="8" :lg="8" :xl="8" class="padding-button-20"
                        v-for="item in continues" :key="item.id">
                        <comic :data="item" @click="onComicClick(item)" />
                    </el-col>
                </el-row>
            </div>
            <div class="data_box" v-if="new_adds.length > 0">
                <div class="title">{{ $t('library.not_parsed') }}</div>
                <el-row :gutter="20">
                    <el-col :xs="24" :sm="12" :md="8" :lg="8" :xl="8" class="padding-button-20" v-for="item in new_adds"
                        :key="item.id">
                        <comic :data="item" @click="onComicClick(item)" />
                    </el-col>
                </el-row>
            </div>
            <div class="data_box">
                <div class="title">{{ $t('library.all_files') }}</div>
                <el-row :gutter="20">
                    <el-col :xs="24" :sm="12" :md="8" :lg="8" :xl="8" class="padding-button-20" v-for="item in list"
                        :key="item.id">
                        <comic :data="item" @click="onComicClick(item)" />
                    </el-col>
                </el-row>
            </div>
        </div>
        <div class="hide">
            <el-dialog v-model="showReadTo" :title="curItem?.name" width="500" align-center>
                <div class="readToBox" v-if="curItem?.status == 0 || curItem?.status == 3">
                    <div class="tips desc line-tow">{{ curItem?.description }}</div>
                    <div class="tips title">{{ $t('library.not_parsed_file') }}</div>
                    <div class="tips">{{ $t('library.select_parse_plugin') }}</div>
                    <el-select v-model="select_plugin" placeholder="select plugin">
                        <el-option v-for="item in plugin_list" :label="item.name" :value="item.id">
                            {{ item.name }}
                        </el-option>
                    </el-select>

                    <div class="tips text-right">
                        <!-- <el-button type="danger" size="large" :loading="ajaxWorking" :disabled="ajaxWorking"
                            @click="onReadToParse">删除</el-button> -->
                        <el-button type="primary" size="large" :loading="ajaxWorking" :disabled="ajaxWorking"
                            @click="onReadToParse">{{ $t('library.parse') }}</el-button>
                    </div>
                </div>
                <div class="readToBox" v-else-if="curItem?.status == 2">
                    <div class="tips desc line-tow">{{ curItem?.description }}</div>
                    <div class="tips title">{{ $t('library.select_chapter') }}</div>
                    <!-- <el-select v-model="select_chapter" placeholder="select chapter">
                        <el-option v-for="(item, index) in chapter_list" :label="item.title" :value="index">
                            {{ item.title }}
                        </el-option>
                    </el-select> -->
                    <el-cascader style="width: 100%;" :options="options" :show-all-levels="false"
                        v-model="cascader_value" placeholder="select chapter"></el-cascader>

                    <div class="tips">{{ $t('library.select_parse_plugin') }}</div>
                    <el-select v-model="select_plugin" placeholder="select plugin">
                        <el-option v-for="item in plugin_list" :label="item.name" :value="item.id">
                            {{ item.name }}
                        </el-option>
                    </el-select>
                    <div class="tips text-right">
                        <!-- <el-button type="danger" size="large" :loading="ajaxWorking" :disabled="ajaxWorking"
                            @click="onReadToParse">删除</el-button> -->
                        <el-button type="primary" size="large" :loading="ajaxWorking" :disabled="ajaxWorking"
                            @click="onReadToRead">{{ $t('library.start_read') }}</el-button>
                    </div>
                </div>
            </el-dialog>
        </div>
    </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue';
import comic from '../components/comic.vue';

interface ComicItem {
    id: number;
    name: string;
    tags: string[];
    status: number;
    description: string;
    read_page_progress: number;
    read_update_time: number;
    parse_plugin: string;
    search_plugin: string;
}

interface plugin_reader_item {
    id: string;
    name: string;
    region: number[]
}

interface chapter_item {
    title: string,
    region: number[]
}

export default defineComponent({
    name: 'library',
    components: {
        comic
    },
    computed: {
        cascader_value: {
            get() {
                return this.select_chapter;
            },
            set(val) {
                this.select_chapter = val[val.length - 1]; // 通常取最后一级的值
            }
        },
        options() {
            const MAX_GROUP_SIZE = 50; // 每组最大数量
            let newOptions = [] as any[];

            // 1. 生成原始选项列表
            const rawOptions = this.chapter_list.map((item, index) => ({
                value: index,
                label: item.title
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
        }
    },
    data() {
        return {
            isUnmounted: false,
            ajaxWorking: false,
            curItem: {} as ComicItem,
            new_adds: [] as ComicItem[],
            continues: [] as ComicItem[],
            list: [] as ComicItem[],
            showReadTo: false,
            plugin_list: [] as plugin_reader_item[],
            select_plugin: '',
            select_chapter: 0,
            chapter_list: [] as chapter_item[]
        }
    },
    mounted() {
        this.onload();
        this.isUnmounted = false;
    },
    unmounted() {
        this.isUnmounted = true;
    },
    methods: {
        onParseChange(item) {
            if (this.isUnmounted) {
                return;
            }
            let old_item = item;

            setTimeout(() => {
                let old_status = old_item?.status;
                let changed = false;

                if (this.isUnmounted) {
                    return;
                }

                if (old_item) {
                    //getLibraryById
                    this.$g.http.send('/api/library/getLibraryById', 'post', {
                        library_id: old_item?.id
                    }).then((res) => {
                        if (res.status) {
                            for (let i = 0; i < this.list.length; i++) {
                                let cur = this.list[i];

                                if (cur?.id == res?.data?.id) {
                                    changed = res?.data?.status != old_status;

                                    if (changed) {
                                        this.list[i] = res.data;
                                    } else {
                                        this.onParseChange(old_item);
                                    }

                                    break;
                                }
                            }
                        }
                    }).catch((err) => {
                        //...
                    }).finally(() => {
                        //...
                    });
                }
            }, 1000);
        },
        onReadToParse() {
            //
            let item = this.curItem;
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/library/parse', 'post', {
                library_id: item?.id,
                plugin_id: this.select_plugin
            }).then((res) => {
                if (res.status) {
                    this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                    item.status = 1;
                    this.onParseChange(item);
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
                this.onload();
                this.showReadTo = false;
            });
        },
        onReadToRead() {
            //判断是否选了插件
            if (this.select_plugin === '') {
                this.$g.tipbox.error(this.$t('server.no_plugin_select'));
                return;
            }
            //判断curItem是否为空
            if (this.curItem == null) {
                this.$g.tipbox.error(this.$t('server.no_file_select'));
                return;
            }
            //转到页面
            this.$router.push({
                name: 'reader',
                query: {
                    plugin_id: this.select_plugin,
                    library_id: this.curItem?.id,
                }
            });

            sessionStorage.setItem(`${this.curItem?.id}_chapter_index`, String(this.select_chapter));
        },
        onComicClick(item: ComicItem) {
            //
            this.curItem = item;
            this.showReadTo = true;

            this.select_chapter = 0;

            this.select_plugin = item.parse_plugin;
            if (item.status == 2) {
                //请求config
                if (this.ajaxWorking) {
                    return;
                }

                this.ajaxWorking = true;
                this.$g.http.send('/api/library/getLibraryConfig', 'post', {
                    library_id: item.id
                }).then((res) => {
                    if (res.status) {
                        let read_page_progress = item?.read_page_progress || 0;
                        this.chapter_list = res.data?.page_list;
                        this.select_chapter = read_page_progress;
                    } else {
                        this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                    }
                }).catch((err) => {
                    this.$g.tipbox.error(err.message);
                }).finally(() => {
                    this.ajaxWorking = false;
                });
            }
        },
        onload() {
            //
            if (this.ajaxWorking) {
                return;
            }

            this.ajaxWorking = true;

            this.$g.http.send('/api/library/getAllLibrary', 'get').then((res) => {
                if (res.status) {
                    let continues = [] as ComicItem[];
                    let new_adds = [] as ComicItem[];
                    let list = res.data;

                    //按照名称排序
                    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

                    list.forEach((item) => {
                        //转换时间为时间戳
                        item.read_update_time = (new Date(item.read_update_time).getTime()) || 0;

                        //console.log(item.read_update_time)

                        if (item.status == 2 && item.read_page_progress > 0) {
                            continues.push(item);
                        } else if (item.status == 0) {
                            new_adds.push(item);
                        }
                    });

                    //按照read_page_time排序
                    continues.sort((a, b) => {
                        return b.read_update_time - a.read_update_time;
                    });

                    this.list = list;
                    this.continues = continues;
                    this.new_adds = new_adds;
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });

            this.$g.http.send('/api/plugin/getPluginByType', 'post', { type: 'parser' }).then((res) => {
                if (res.status) {
                    this.plugin_list = res.data;
                }
            }).catch((err) => {
                //
            }).finally(() => {
                //
            });
        },
        onScan() {
            this.ajaxWorking = true;
            this.$g.http.send('/api/library/scan', 'post').then((res) => {
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
})
</script>
<style lang="scss" scoped>
.library {
    max-width: 800px;
    margin: 0 auto;

    h1.title {
        font-size: 24px;
    }

    .empty {
        padding-top: 2em;
    }

    .center {
        text-align: center;
        align-items: center;
        justify-content: center;
        display: flex;
    }

    .right {
        text-align: right;
        justify-content: right;
    }

    .text-right {
        text-align: right;
    }

    .padding-button-20 {
        padding-bottom: 20px;
    }

    .data_box {
        padding: 0px 0;
        margin: 0px 0;
        color: #353535;

        .title {
            font-size: 18px;
            font-weight: 600;
            padding: 15px 0;
        }
    }

    .line-tow {
        display: -webkit-box;
        line-clamp: 2;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: normal;
    }

    .readToBox {
        .tips {
            margin: 15px 0;
            font-size: 16px;
            color: #353535;

            &:first-child {
                margin-top: 0;
            }

            &:last-child {
                margin-bottom: 0;
            }

            &.title {
                font-weight: bold;
            }
        }

        .desc {
            font-size: 14px;
            color: #666;
        }
    }
}
</style>