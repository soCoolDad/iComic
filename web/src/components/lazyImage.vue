<!-- lazyImage.vue -->
<template>
    <div class="lazy-image-container" :style="{ 'min-height': containerHeight }">
        <!-- 占位符/加载状态 -->
        <div v-if="!loaded && !loadError" class="image-placeholder" :style="{ 'min-height': containerHeight }">
            <div class="loading-spinner" v-if="loading"></div>
        </div>

        <!-- 加载失败状态 -->
        <div v-if="loadError" class="error-placeholder" :style="{ 'min-height': containerHeight }" @click="retryLoad">
            <span>点击重试</span>
        </div>

        <!-- 实际图片 -->
        <img v-show="loaded" ref="imageRef" :src="currentSrc" :alt="alt" @load="onImageLoad" @error="onImageError"
            class="lazy-image" />
    </div>
</template>

<script>
export default {
    name: 'LazyImage',
    props: {
        src: {
            type: String,
            required: true
        },
        alt: {
            type: String,
            default: ''
        },
        // 初始占位高度
        placeholderHeight: {
            type: [String, Number],
            default: '200px'
        },
        // 向下偏移量（提前加载）
        loadOffset: {
            type: Number,
            default: 200
        },
        // 向上偏移量（延迟销毁）
        destroyOffset: {
            type: Number,
            default: 200
        },
        // 直接显示图片
        directLoad: {
            type: Boolean,
            default: false
        }
    },
    data() {
        return {
            loaded: false,
            loading: false,
            loadError: false,
            containerHeight: this.placeholderHeight,
            calcedHeight: 0,
            currentSrc: '',
            // 图片原始尺寸
            naturalWidth: 0,
            naturalHeight: 0,
            // 兼容性检测
            isIntersectionObserverSupported: typeof window !== 'undefined' && 'IntersectionObserver' in window,
            // 用于滚动监听的变量
            scrollHandler: null,
            resizeHandler: null,
            // 跟踪是否已经加载过
            hasBeenLoaded: false,
            // 用于IntersectionObserver的标识
            isIntersecting: false
        }
    },
    mounted() {
        this.initLazyLoad()
    },
    beforeUnmount() {
        this.destroyLazyLoad()
    },
    methods: {
        initLazyLoad() {
            if (this.directLoad) {
                this.loadImage()
            } else if (this.isIntersectionObserverSupported) {
                this.initIntersectionObserver()
            } else {
                this.initScrollListener()
            }
        },

        destroyLazyLoad() {
            if (this.isIntersectionObserverSupported) {
                if (this.observer) {
                    this.observer.disconnect()
                }
            } else {
                this.removeScrollListener()
            }

            // 清理定时检查器
            if (this.visibilityCheckTimer) {
                clearInterval(this.visibilityCheckTimer)
            }
        },

        initIntersectionObserver() {
            const options = {
                rootMargin: `${this.loadOffset}px 0px ${this.destroyOffset}px 0px`,
                threshold: 0
            }

            this.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    // 更新相交状态
                    if (entry.target === this.$el) {
                        this.isIntersecting = entry.isIntersecting

                        if (entry.isIntersecting) {
                            this.loadImage()
                        } else {
                            // 启动延迟销毁检查
                            this.scheduleDestroyCheck()
                        }
                    }
                })
            }, options)

            this.observer.observe(this.$el)
        },

        initScrollListener() {
            // 节流处理滚动事件
            this.scrollHandler = this.throttle(this.checkElementInViewport, 200)
            this.resizeHandler = this.throttle(this.checkElementInViewport, 200)

            window.addEventListener('scroll', this.scrollHandler, { passive: true })
            window.addEventListener('resize', this.resizeHandler, { passive: true })

            // 初始化时检查一次
            this.$nextTick(() => {
                this.checkElementInViewport()
            })

            // 定时检查元素可见性
            this.visibilityCheckTimer = setInterval(() => {
                this.checkElementInViewport()
            }, 500)
        },

        removeScrollListener() {
            if (this.scrollHandler) {
                window.removeEventListener('scroll', this.scrollHandler)
            }
            if (this.resizeHandler) {
                window.removeEventListener('resize', this.resizeHandler)
            }
            if (this.visibilityCheckTimer) {
                clearInterval(this.visibilityCheckTimer)
            }
        },

        checkElementInViewport() {
            if (!this.$el) return

            const rect = this.$el.getBoundingClientRect()
            const windowHeight = window.innerHeight || document.documentElement.clientHeight
            const windowWidth = window.innerWidth || document.documentElement.clientWidth

            // 检查元素是否在视口附近（考虑偏移量）
            const isNearViewport = (
                rect.top <= windowHeight + this.loadOffset &&
                rect.bottom >= -this.destroyOffset &&
                rect.left <= windowWidth &&
                rect.right >= 0
            )

            if (isNearViewport) {
                this.loadImage()
            } else {
                // 启动延迟销毁检查
                this.scheduleDestroyCheck()
            }
        },

        // 延迟检查是否需要销毁图片
        scheduleDestroyCheck() {
            // 清除之前的定时器
            if (this.destroyCheckTimer) {
                clearTimeout(this.destroyCheckTimer)
            }

            // 设置新的定时器，在destroyOffset毫秒后检查是否需要销毁
            this.destroyCheckTimer = setTimeout(() => {
                this.destroyImageIfNeeded()
            }, this.destroyOffset)
        },

        loadImage() {
            // 清除销毁检查定时器
            if (this.destroyCheckTimer) {
                clearTimeout(this.destroyCheckTimer)
            }

            if (this.loaded || this.loading) return

            this.loading = true
            this.loadError = false

            /**
             * 增加后缀随机数，避免缓存问题
             * 加载图片
             */
            this.currentSrc = this.src + `&v=${Math.ceil(Math.random() * 10000)}`
        },

        onImageLoad(event) {
            this.loading = false
            this.loaded = true
            this.loadError = false
            this.hasBeenLoaded = true

            // 获取图片原始尺寸
            const img = event.target
            this.naturalWidth = img.naturalWidth
            this.naturalHeight = img.naturalHeight

            // 根据容器宽度动态计算高度
            this.calculateContainerHeight()

            img.calcedHeight = this.calcedHeight;

            this.$emit('load', img)
        },

        // 根据容器宽度动态计算containerHeight
        calculateContainerHeight() {
            if (this.naturalWidth > 0 && this.naturalHeight > 0) {
                // 获取容器实际宽度
                const containerWidth = this.$el ? this.$el.clientWidth : 0

                if (containerWidth > 0) {
                    // 根据宽高比计算高度
                    const aspectRatio = this.naturalHeight / this.naturalWidth
                    const calculatedHeight = Math.floor(containerWidth * aspectRatio);
                    this.containerHeight = `${calculatedHeight}px`
                    this.calcedHeight = calculatedHeight;
                }
            }
        },

        // 完善图片销毁逻辑
        destroyImageIfNeeded() {
            let shouldDestroy = false

            if (this.isIntersectionObserverSupported) {
                // 使用IntersectionObserver的情况
                shouldDestroy = !this.isIntersecting
            } else if (this.$el) {
                // 使用滚动监听的情况
                const rect = this.$el.getBoundingClientRect()
                const windowHeight = window.innerHeight || document.documentElement.clientHeight

                // 判断是否远离视图（超过destroyOffset范围）
                shouldDestroy = (
                    rect.top > windowHeight + this.destroyOffset ||
                    rect.bottom < -this.destroyOffset
                )
            }

            // 执行销毁动作（只有当图片已经被加载过才销毁）
            if (shouldDestroy && this.hasBeenLoaded) {
                this.destroyImage()
            }
        },

        // 销毁图片资源
        destroyImage() {
            // 只有在已加载状态下才执行销毁
            if (!this.hasBeenLoaded) return;

            this.loaded = false
            this.loading = false
            this.currentSrc = ''
            //保留占位高度，不去除；
            //this.containerHeight = this.placeholderHeight; // 如果需要还原占位高度，可以取消这行注释
            this.naturalWidth = 0
            this.naturalHeight = 0

            //console.log('destroyImage');
        },

        onImageError() {
            this.loading = false
            this.loaded = false
            this.loadError = true

            this.$emit('error')
        },

        retryLoad() {
            this.loadImage()
        },

        // 节流函数
        throttle(func, wait) {
            let timeout
            let lastExecTime = 0

            return function executedFunction(...args) {
                const currentTime = Date.now()

                if (currentTime - lastExecTime > wait) {
                    func.apply(this, args)
                    lastExecTime = currentTime
                } else {
                    clearTimeout(timeout)
                    timeout = setTimeout(() => {
                        func.apply(this, args)
                        lastExecTime = Date.now()
                    }, wait - (currentTime - lastExecTime))
                }
            }
        }
    }
}
</script>

<style scoped>
.lazy-image-container {
    width: 100%;
    position: relative;
    overflow: hidden;
    background-color: #f5f5f5;
}

.image-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

.loading-spinner {
    width: 30px;
    height: 30px;
    border: 3px solid #e0e0e0;
    border-top: 3px solid #666;
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    0% {
        transform: rotate(0deg);
    }

    100% {
        transform: rotate(360deg);
    }
}

.error-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #ffebee;
    color: #f44336;
    cursor: pointer;
    font-size: 16px;
    font-weight: bold;
}

.lazy-image {
    width: 100%;
    height: auto;
    display: block;
    transition: opacity 0.3s ease;
}

.lazy-image[v-show="loaded"] {
    opacity: 1;
}
</style>