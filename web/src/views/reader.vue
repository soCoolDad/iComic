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
            <div class="scroller" ref="scroller">
                <div class="scroller_content">
                    <div class="image_box" v-for="item in items" v-if="plugin_content_type == 'image'">
                        <el-image class="image" loading="lazy" :src="item" lazy>
                            <template #placeholder>
                                <div class="image-slot">
                                    <div>iComic</div>
                                </div>
                            </template>
                        </el-image>
                    </div>
                    <div class="text_box" v-for="item in items" v-if="plugin_content_type == 'text'">
                        <div class="text" v-html="getBlockText(item)"></div>
                    </div>
                </div>
            </div>

            <div class="footer" @click.stop>
                <el-row style="width: 100%;" :gutter="20">
                    <el-col :span="6" :xs="4" style="text-align: right;">
                        <el-button circle type="primary" @click="handlePrev" :icon="ArrowLeftBold"></el-button>
                    </el-col>
                    <el-col :span="12" :xs="16">
                        <!-- file_page_list -->
                        <!-- <el-select @change="onSelectChange()" v-model="chapter_index" placeholder="select chapter">
                            <el-option v-for="(item, index) in file_page_list" :label="item.title" :value="index">
                                {{ item.title }}
                            </el-option>
                        </el-select> -->
                        <el-cascader style="width: 100%;" :options="options" :show-all-levels="false"
                            v-model="cascader_value" placeholder="select chapter"
                            @change="onSelectChange()"></el-cascader>
                    </el-col>
                    <el-col :span="6" :xs="4">
                        <el-button circle type="primary" @click="handleNext" :icon="ArrowRightBold"></el-button>
                    </el-col>
                </el-row>
            </div>
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
    computed: {
        cascader_value: {
            get() {
                return this.chapter_index;
            },
            set(val) {
                this.chapter_index = val[val.length - 1]; // 通常取最后一级的值
            }
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

            // 1. 生成原始选项列表
            const rawOptions = this.file_page_list.map((item, index) => ({
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
    watch: {
        chapter_index(newVal) {
            console.log("change page", newVal);
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
            text_cache: {}
        }
    },
    mounted() {
        this.onload();
    },
    methods: {
        onBack() {
            this.$router.go(-1);
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
                    this.text_cache[key] = `load error:${err.massage}`;
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
            //获取文件配置
            //getLibraryById
            let plugin_id = String(this.$route.query.plugin_id);
            let library_id = String(this.$route.query.library_id);
            let chapter_index = 0;

            //console.log(this.$route.query);
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

            if (!chapter_index) {
                chapter_index = 0;
            }

            if (this.page_loading) {
                return;
            }

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
                //...
                this.page_error = err.message;
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                //...
                this.page_loading = false;
            });

            let getPluginById = this.$g.http.send('/api/plugin/getPluginById', 'post', {
                plugin_id: this.$route.query.plugin_id
            }).then((res) => {
                if (res.status) {
                    //
                    this.plugin_content_type = res.data.content_type;
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            });

            //
            let load_queue = [getLibraryById, getPluginById];

            Promise.all(load_queue).then(() => {
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
        getPageRange(pageIndex) {
            //
            let page_list = this.file_page_list[pageIndex];

            if (!page_list) {
                //
            }

            //this.file_config
        },
        initItems(btn_scrollTop = true) {
            //
            let current_chapter = this.current_chapter;

            //console.log('current_chapter', current_chapter);

            if (!current_chapter) {
                return;
            }

            let image_urls = [] as Array<string>;
            this.items = [];

            current_chapter.region.forEach(region => {
                image_urls.push(`/api/parse/block?pi=${this.$route.query.plugin_id}&li=${this.$route.query.library_id}&page=${this.chapter_index}&block=${region}`);
            });

            //console.log('image_urls', image_urls);

            this.items = image_urls;

            // 滚动到顶部
            btn_scrollTop && this.$nextTick(() => {
                const scroller = this.$refs.scroller;

                if (scroller) {
                    (scroller as any).scroll(0, 0); // 直接操作DOM作为备选方案
                }

                window.scrollTo(0, 0);
            });
        },
        handlePrev() {
            let chapter_index = this.chapter_index - 1;

            if (chapter_index < 0) {
                chapter_index = 0;
            }

            if (chapter_index == this.chapter_index) {
                return;
            }

            this.chapter_index = chapter_index;

            this.initItems();
        },
        handleNext() {
            let chapter_index = this.chapter_index + 1;

            if (chapter_index >= this.file_page_list.length) {
                chapter_index = this.file_page_list.length - 1;
            }

            if (chapter_index == this.chapter_index) {
                return;
            }

            this.chapter_index = chapter_index;

            this.initItems();
        },
        onSelectChange() {
            //console.log("change page", this.chapter_index);
            //this.chapter_index = this.chapter_index;
            this.initItems();
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

    .reader_box {
        position: absolute;
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
            position: relative;
            left: 0;
            top: 0;
            right: 0;
            bottom: 0;
            padding: 80px 0px;
            overflow: auto;
            transition: padding 0.2s ease-in-out;
            background-color: rgba(255, 255, 255, 1);

            .scroller_content {
                max-width: 600px;
                margin: 0 auto;

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

                    :deep(.el-image__wrapper) {
                        position: relative;
                        display: block;
                        margin: 0; // 清除默认外边距
                        padding: 0; // 清除默认内边距
                        line-height: 10px;
                    }

                    :deep(.el-image__inner.is-loading) {
                        display: inline-block;
                    }

                    .image-slot {
                        color: #bbb;
                        font-size: 42px;
                        font-weight: bold;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        width: 100%;
                        height: 400px;
                        background-color: rgba(0, 0, 0, 0.1);
                        margin-top: 0;
                        padding-top: 0;
                        border-top: 1px solid rgba(0, 0, 0, 0.1);
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
            overflow: hidden; // 隐藏溢出内容
            text-overflow: ellipsis;
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