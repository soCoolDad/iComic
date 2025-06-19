<template>
    <div class="comicBox" @click="$emit('click')">
        <el-image 
            class="cover_image"
            :src="`/api/image/coverImage?library_id=${data?.id}&rnd=${(Math.random() * 1000).toFixed(2)}`"
            fit="cover"
            loading="lazy"
            lazy
        />
        <div class="comic_status">
            <el-tag type="primary" v-if="data?.status == 0">未解析</el-tag>
            <el-tag type="warning" v-if="data?.status == 1">解析中</el-tag>
            <el-tag type="success" v-if="data?.status == 2">解析完成</el-tag>
            <el-tag type="danger" v-if="data?.status == 3">解析失败</el-tag>
            <!-- 0已添加未解析 1解析中 2解析完成 3解析失败 -->
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
                <el-progress :status="progress_status" :percentage="(data?.read_page_progress / data?.page_count) * 100"
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
        progress_status() {
            let status = ["", "exception", "success", "exception"];
            //随机返回一个
            return status[Math.floor(Math.random() * 4)];
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