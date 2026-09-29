<!-- PageProgressBar.vue
     按需下载进度条：每一页渲染一个色块，直接看出「哪些页已下载、哪些页没下载」。
     相邻同态的色块会自然连成一段，整体呈现为条码状的下载密度图。 -->
<template>
    <div class="page-progress-bar" :class="{ 'text-inside': textInside }">
        <div class="bar-track" :style="{ height: height + 'px' }">
            <span v-for="seg in segments" :key="seg.index" class="seg" :class="seg.state"></span>
            <span v-if="textInside && label" class="bar-label inside"
                :style="{ fontSize: labelFontSize + 'px' }">{{ label }}</span>
        </div>
        <span v-if="!textInside && label" class="bar-label outside">{{ label }}</span>
    </div>
</template>

<script>
export default {
    name: 'PageProgressBar',
    props: {
        // 总页数
        total: {
            type: Number,
            default: 0
        },
        // 已下载的页索引
        downloaded: {
            type: Array,
            default: () => []
        },
        // 正在下载的页索引
        downloading: {
            type: Array,
            default: () => []
        },
        // 排队等待下载的页索引
        queued: {
            type: Array,
            default: () => []
        },
        // 条高（px）
        height: {
            type: Number,
            default: 10
        },
        // 文字是否压在条内（居中），false 时显示在条右侧
        textInside: {
            type: Boolean,
            default: false
        },
        // 条上/条旁的文字，为空则不显示
        label: {
            type: String,
            default: ''
        }
    },
    computed: {
        segments() {
            let total = this.total || 0;
            let downloaded = new Set(this.downloaded || []);
            let downloading = new Set(this.downloading || []);
            let queued = new Set(this.queued || []);

            let list = [];
            for (let i = 0; i < total; i++) {
                let state = 'pending';
                if (downloaded.has(i)) {
                    state = 'downloaded';
                } else if (downloading.has(i)) {
                    state = 'downloading';
                } else if (queued.has(i)) {
                    state = 'queued';
                }
                list.push({ index: i, state });
            }
            return list;
        },
        // 条很细时文字要跟着缩，否则会溢出进度条
        labelFontSize() {
            return this.height < 16 ? 10 : 12;
        }
    }
}
</script>

<style scoped lang="scss">
.page-progress-bar {
    display: flex;
    align-items: center;
    width: 100%;

    .bar-track {
        position: relative;
        flex: 1;
        min-width: 0;
        display: flex;
        overflow: hidden;
        border-radius: 5px;
        background-color: #ebeef5;

        .seg {
            flex: 1 1 0;
            min-width: 0;
            height: 100%;

            &.downloaded {
                background-color: #409eff;
            }

            &.downloading {
                background-color: #e6a23c;
                animation: ppb-pulse 1.2s ease-in-out infinite;
            }

            &.queued {
                background-color: #f5d6a3;
            }

            &.pending {
                background-color: #ebeef5;
            }
        }
    }

    .bar-label {
        &.outside {
            flex-shrink: 0;
            margin-left: 8px;
            font-size: 12px;
            color: #606266;
            line-height: 1;
        }

        &.inside {
            position: absolute;
            left: 50%;
            top: 0;
            bottom: 0;
            transform: translateX(-50%);
            display: flex;
            align-items: center;
            white-space: nowrap;
            padding: 0 6px;
            color: #fff;
            line-height: 1;
            // 半透明底糊：压在蓝/橙/浅橙/浅灰任意色块上都能看清
            background-color: rgba(0, 0, 0, 0.35);
            border-radius: 3px;
            pointer-events: none;
        }
    }

    &.text-inside {
        .bar-track {
            flex: 1;
        }
    }
}

@keyframes ppb-pulse {
    0%,
    100% {
        opacity: 1;
    }

    50% {
        opacity: 0.3;
    }
}
</style>
