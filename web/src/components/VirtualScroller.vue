<!-- src/components/VirtualScroller.vue -->
<template>
    <div class="virtual-scroller" ref="scroller" @scroll="handleScroll">
        <div class="scroll-placeholder" :style="{ 'min-height': totalHeight + 'px' }"></div>
        <div class="visible-items">
            <div v-for="item in visibleItems" :key="item.index" class="virtual-item" :style="{
                position: 'absolute',
                top: item.offsetTop + 'px',
                left: 0,
                right: 0,
                height: item.height + 'px'
            }">
                <slot :item="item.data" :index="item.index"></slot>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    name: 'VirtualScroller',
    props: {
        items: {
            type: Array,
            required: true
        },
        itemHeight: {
            type: Number,
            default: 400 // 默认图片高度
        },
        bufferSize: {
            type: Number,
            default: 5
        }
    },
    data() {
        return {
            scrollTop: 0,
            containerHeight: 0,
            itemHeights: [], // 存储每项的实际高度
            estimatedHeight: this.itemHeight
        }
    },
    computed: {
        totalHeight() {
            // 计算总高度
            if (this.itemHeights.length === this.items.length) {
                return this.itemHeights.reduce((sum, height) => sum + height, 0);
            }
            // 如果还没有实际高度数据，使用估算高度
            return this.items.length * this.estimatedHeight;
        },
        visibleItems() {
            const startIndex = this.getStartIndex();
            const visibleCount = this.getVisibleCount();

            const items = [];
            let offsetTop = this.getItemOffsetTop(startIndex);

            for (let i = startIndex; i < Math.min(startIndex + visibleCount + this.bufferSize, this.items.length); i++) {
                const itemHeight = this.itemHeights[i] || this.estimatedHeight;
                items.push({
                    index: i,
                    data: this.items[i],
                    height: itemHeight,
                    offsetTop: offsetTop
                });
                offsetTop += itemHeight;
            }

            return items;
        }
    },
    mounted() {
        this.updateContainerHeight();
        window.addEventListener('resize', this.updateContainerHeight);

        // 初始化高度数组
        this.itemHeights = new Array(this.items.length).fill(this.estimatedHeight);
    },
    beforeUnmount() {
        window.removeEventListener('resize', this.updateContainerHeight);
    },
    watch: {
        items: {
            handler(newItems, oldItems) {
                // 当items变化时，更新高度数组
                this.itemHeights = new Array(newItems.length).fill(this.estimatedHeight);

                if(this.$refs.scroller){
                    this.scrollTop = 0;
                    this.$refs.scroller.scrollTop = 0;
                }
            }
        }
    },
    methods: {
        handleScroll(event) {
            this.scrollTop = event.target.scrollTop;
            this.$emit('scroll', event);
        },
        updateContainerHeight() {
            if (this.$refs.scroller) {
                this.containerHeight = this.$refs.scroller.clientHeight;
            }
        },
        getStartIndex() {
            if (this.itemHeights.length === this.items.length) {
                // 使用实际高度计算
                let height = 0;
                for (let i = 0; i < this.items.length; i++) {
                    height += this.itemHeights[i];
                    if (height > this.scrollTop) {
                        return Math.max(0, i - this.bufferSize);
                    }
                }
                return Math.max(0, this.items.length - 1);
            } else {
                // 使用估算高度
                const index = Math.floor(this.scrollTop / this.estimatedHeight);
                return Math.max(0, index - this.bufferSize);
            }
        },
        getVisibleCount() {
            if (this.containerHeight === 0) return 10;
            return Math.ceil(this.containerHeight / this.estimatedHeight) + this.bufferSize;
        },
        getItemOffsetTop(index) {
            if (this.itemHeights.length === this.items.length) {
                // 使用实际高度计算
                return Math.floor(this.itemHeights.slice(0, index).reduce((sum, height) => sum + height, 0));
            } else {
                // 使用估算高度
                return Math.floor(index * this.estimatedHeight);
            }
        },
        // 更新特定项的高度
        updateItemHeight(index, height) {
            if (this.itemHeights[index] !== height) {
                this.itemHeights.splice(index, 1, height);

                // 更新估算高度
                const loadedHeights = this.itemHeights.filter(h => h !== this.estimatedHeight);
                if (loadedHeights.length > 0) {
                    this.estimatedHeight = loadedHeights.reduce((sum, h) => sum + h, 0) / loadedHeights.length;
                }
            }
        }
    }
}
</script>

<style lang="scss" scoped>
.virtual-scroller {
    position: relative;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;

    &::-webkit-scrollbar {
        display: none;
    }

    // 隐藏滚动条 - Firefox
    scrollbar-width: none;

    // 隐藏滚动条 - IE/Edge
    -ms-overflow-style: none;
}

.scroll-placeholder {
    position: absolute;
    width: 100%;
    height: 1px;
}

.visible-items {
    position: relative;
    width: 100%;
}

.virtual-item {
    font-size: 0;
    /* 消除inline-block元素间的空白 */
}

.virtual-item img {
    display: block;
    width: 100%;
}
</style>