<template>
    <div class="read">
        <div class="loading" v-show="page_loading || page_error">
            <el-alert v-if="page_loading" type="primary" title="Loading..." description="Page loading, please wait..."
                show-icon />
            <el-alert v-if="page_error" type="error" title="Error" :description="`Page error:${page_error}`"
                show-icon />
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
                    <div class="image_box" v-for="item in items">
                        <el-image class="image" loading="lazy" :src="item" lazy>
                            <template #placeholder>
                                <div class="image-slot">
                                    <div>iComic</div>
                                </div>
                            </template>
                        </el-image>
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
                        <el-select @change="onSelectChange()" v-model="chapter_index" placeholder="select chapter">
                            <el-option v-for="(item, index) in file_page_list" :label="item.title" :value="index">
                                {{ item.title }}
                            </el-option>
                        </el-select>
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
    status: number
}

interface page_list_item {
    title: string,
    region: number[]
}

export default defineComponent({
    name: 'reader',
    computed: {
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
        }
    },
    watch: {
        chapter_index(newVal) {
            //console.log("change page", newVal, oldVal);
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
            show_bar: true
        }
    },
    mounted() {
        this.onload();
    },
    methods: {
        onBack() {
            this.$router.go(-1);
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
                this.page_error = '阅读插件不存在';
                this.$g.tipbox.error('阅读插件不存在');
                return;
            }

            if (!library_id) {
                this.page_error = '阅读文件不存在';
                this.$g.tipbox.error('阅读文件不存在');
                return;
            }

            if (!chapter_index) {
                chapter_index = 0;
            }

            if (this.page_loading) {
                return;
            }

            this.page_loading = true;

            this.$g.http.send('/api/library/getLibraryById', 'post', {
                library_id: this.$route.query.library_id,
                need_config: true
            }).then((res) => {
                if (res.status) {
                    this.file = res.data;
                    this.file_page_list = res.data?.config?.page_list || [];

                    let local_chapter_index = sessionStorage.getItem(`${this.$route.query.library_id}_chapter_index`);

                    if (local_chapter_index === null || local_chapter_index === undefined) {
                        this.chapter_index = res.data.read_page_progress
                    } else {
                        this.chapter_index = Number(local_chapter_index);
                        sessionStorage.removeItem(`${this.$route.query.library_id}_chapter_index`);
                    }

                    this.initItems();
                } else {
                    this.page_error = res.msg;
                    this.$g.tipbox.error(res.msg);
                }
            }).catch((err) => {
                //...
                this.page_error = err.message;
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                //...
                this.page_loading = false;
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
                image_urls.push(`/api/image/pageImage?pi=${this.$route.query.plugin_id}&li=${this.$route.query.library_id}&page=${this.chapter_index}&img=${region}`);
            });

            //console.log('image_urls', image_urls);

            this.items = image_urls;

            // 滚动到顶部
            btn_scrollTop && this.$nextTick(() => {
                const scroller = this.$refs.scroller;

                if (scroller) {
                    (scroller as any).scroll(0, 0); // 直接操作DOM作为备选方案
                }
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
        background-color: rgba(255, 255, 255, 1);

        .header {
            display: flex;
            position: absolute;
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
            position: absolute;
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

        &.hide_bar {
            .header {
                top: -80px;
            }

            .footer {
                bottom: -80px;
            }
        }

        .scroller {
            position: absolute;
            left: 0;
            top: 0;
            right: 0;
            bottom: 0;
            padding: 80px 0px;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.05);

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
}
</style>