<template>
    <div class="comicBox" @click="$emit('click')">
        <el-image
            class="cover_image"
            :src="coverUrl"
            fit="cover"
            loading="lazy"
            lazy
        >
            <template #error>
                <div class="cover_error"></div>
            </template>
        </el-image>
        <div class="comic_status">
            <template v-if="data?.is_task">
                <!-- 下载任务卡片：0等待 1下载中 2完成 3失败 4暂停 -->
                <el-tag type="info" v-if="data?.task_status == 0">{{ $t('library.task_wait') }}</el-tag>
                <el-tag type="primary" v-if="data?.task_status == 1 || data?.task_status == 6">{{ $t('library.task_downloading') }}</el-tag>
                <el-tag type="success" v-if="data?.task_status == 2">{{ $t('library.task_done') }}</el-tag>
                <el-tag type="danger" v-if="data?.task_status == 3">{{ $t('library.task_failed') }}</el-tag>
                <el-tag type="info" v-if="data?.task_status == 4">{{ $t('download_task.col_status_pause') }}</el-tag>
            </template>
            <template v-else>
                <el-tag type="primary" v-if="data?.status == 0">{{$t('library.status_not_parsed')}}</el-tag>
                <el-tag type="warning" v-if="data?.status == 1">{{$t('library.status_parsing')}}</el-tag>
                <el-tag type="success" v-if="data?.status == 2">{{$t('library.status_parsed')}}</el-tag>
                <el-tag type="danger" v-if="data?.status == 3">{{$t('library.status_parse_failed')}}</el-tag>
                <!-- 0已添加未解析 1解析中 2解析完成 3解析失败 -->
            </template>
        </div>
        <div class="infos">
            <div class="title">
                <p class="no-padding no-margin">{{ data?.name }}</p>
            </div>
            <div class="description" v-if="data?.description">
                <p>{{ data?.description }}</p>
            </div>
            <div class="tags" v-if="data?.tags?.length > 0">
                <template v-for="(tag, index) in data?.tags">
                    <el-tag type="danger" class="tag" v-if="index < 4">{{ tag.name }}</el-tag>
                </template>
            </div>
            <div class="progress">
                <el-progress :status="progress_status" :percentage="progress_percentage"
                    :show-text="false" />
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
    name: 'comic',
    computed: {
        coverUrl() {
            // 按需任务的书籍还未入库，封面来自任务分片
            if (this.data?.is_on_demand) {
                return `/api/download_task/getCover?task_id=${this.data.task_id}&rnd=${(Math.random() * 1000).toFixed(2)}`;
            }
            return `/api/parse/cover?library_id=${this.data?.id}&rnd=${(Math.random() * 1000).toFixed(2)}`;
        },
        progress_percentage() {
            const total = this.data?.page_count || 0;
            const current = this.data?.read_page_progress || 0;
            return total > 0 ? (current / total) * 100 : 0;
        },
        progress_status() {
            // 0:未解析 1:解析中 2:解析完成 3:解析失败
            const statusMap = ["", "warning", "success", "exception"];
            return statusMap[this.data?.status] || "";
        }
    },
    props: {
        data: Object
    }
})
</script>

<style scoped>
.comicBox {
    width: 100%;
    display: flex;
    flex-direction: row;
    position: relative;
    border-radius: 10px;
    overflow: hidden;
    border: 1px solid rgba(90, 172, 255, 0.1);
    box-shadow: rgba(90, 172, 255, 0.2) 0px 0px 0px;

    transition: border 0.2s ease-in-out, box-shadow 0.2s ease-in-out;

    .comic_status {
        position: absolute;
        right: 10px;
        top: 10px;
    }

    .cover_error {
        width: 100%;
        height: 100%;
        background: linear-gradient(135deg, #e8eef5 0%, #d4dde8 100%);
    }

    &:hover {
        cursor: pointer;
        border: 1px solid rgba(190, 190, 190, 0.4);
        box-shadow: rgba(90, 172, 255, 0.4) 0px 0px 20px;
    }

    .cover_image {
        width: 100%;
        height: 350px;
    }

    /* 如果设备宽度小于600px */
    @media screen and (max-width: 600px) {
        .cover_image{
            height: 450px;
        }
    }

    .infos {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 10px;
        color: #353535;
        background-color: rgba(255, 255, 255, 0.6);
        background-image: blur(2px);

        .tags {
            .tag {
                margin-right: 6px;
                margin-top: 6px;
            }
        }

        .title,
        .description {
            display: -webkit-box;
            line-clamp: 1;
            -webkit-line-clamp: 1;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: normal;
            /* 可以根据需要设置为 nowrap，但这里为了保持文本正常换行（直到达到行数限制）而设置为 normal */
        }

        .description {
            color: #666;
        }

        .title {
            font-size: 20px;
            font-weight: bold;
            margin-top: -10px;
        }

        p {
            margin: 0;
        }

        .no-padding {
            padding: 0;
        }

        .no-margin {
            margin: 10px 0;
        }

        .progress {
            padding-top: 10px;
            margin-bottom: -5px;
        }
    }
}
</style>