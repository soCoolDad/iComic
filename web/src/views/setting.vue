<template>
    <div class="setting">
        <h1 class="title">Setting</h1>
        <div class="setting_box">
            <div class="sub_box">
                <div class="sub_title">about Me</div>
                <div class="desc">iComic is an e-comic reading application with support for third-party plugins to fetch
                    and parse files. Happy reading!</div>
                <div class="buttons">
                    <el-button round type="primary" @click="openGithub">GitHub</el-button>
                </div>
            </div>
            <div class="sub_box">
                <div class="sub_title">Version</div>
                <div class="desc">
                    <el-tag type="primary">{{ version }}</el-tag>
                    <span>&nbsp;</span>
                    <el-tag type="danger" v-if="has_update">新:{{ has_update_new_version }}</el-tag>
                </div>
                <div class="buttons">
                    <el-button round type="primary" :loading="ajaxWorking" @click="checkUpdate">检查更新</el-button>
                    <el-button round v-if="has_update" type="danger" :loading="ajaxWorking"
                        @click="show_update = true">更新</el-button>
                </div>
            </div>
        </div>
        <div class="hide">
            <el-dialog v-model="show_update" :title="`新版本[${has_update_new_version}]`" width="500" align-center>
                <div class="readToBox">
                    <div class="releaseNotes">
                        <div class="tips title">更新须知</div>
                        <div class="tips">
                            <b style="color: red;">
                                请备份好数据！请备份好数据！请备份好数据！
                            </b>
                        </div>
                        <div class="tips">如果您的数据没有持久化保存，更新后将会丢失(插件，库，数据)</div>
                        <div class="tips">更新过程中会关闭服务，具体进度请在Docker里查看对应的容器日志</div>
                        <div class="tips title">更新日志:{{ has_update_date }}</div>
                        <div class="tips">{{ has_update_releaseNotes }}</div>
                    </div>
                    <div class="tips text-right">
                        <el-button type="danger" size="large" :loading="ajaxWorking" :disabled="ajaxWorking"
                            @click="onUpdateSystem">更新</el-button>
                    </div>
                </div>
            </el-dialog>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
    name: 'setting',
    data() {
        return {
            version: "0.0.0",
            has_update: false,
            has_update_new_version: "",
            has_update_releaseNotes: "",
            has_update_date: "",
            ajaxWorking: false,
            show_update: false,
            github_repo: ""
        }
    },
    mounted() {
        this.sysConfig();
    },
    methods: {
        sysConfig() {
            if (this.ajaxWorking) return;

            this.ajaxWorking = true;
            this.$g.http.send('/api/setting/sysConfig', 'get').then((res) => {
                if (res.status) {
                    this.version = res.data.version;
                    this.github_repo = res.data.github_repo
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });
        },
        checkUpdate() {
            if (this.ajaxWorking) return;

            this.ajaxWorking = true;
            this.$g.http.send('/api/setting/checkUpdate', 'get').then((res) => {
                if (res.status) {
                    this.version = res.data.currentVersion;
                    this.has_update = res.data.hasUpdate;
                    this.has_update_new_version = res.data.latestVersion;
                    this.has_update_releaseNotes = res.data.releaseNotes;
                    this.has_update_date = res.data.publishedAt;

                    if (this.has_update) {
                        this.$g.tipbox.success(`发现新版本:[${this.has_update_new_version}]`);
                    } else if (res.data?.isCurrentHigher) {
                        this.$g.tipbox.success(`版本:[${this.version}]是最新版本`);
                    } else {
                        this.$g.tipbox.success(`当前已是最新版本`);
                    }
                } else {
                    this.version = res.currentVersion;
                    this.$g.tipbox.error(res.msg);
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });
        },
        onUpdateSystem() {
            this.$g.msgbox.confirm(`确定更新吗?如果数据没有备份或持久化，更新后将会丢失`, '数据警告', {
                beforeClose: (action, instance, done) => {
                    if (action === 'confirm') {
                        instance.confirmButtonLoading = true
                        instance.confirmButtonText = 'Update...'

                        this.ajaxWorking = true;

                        this.$g.http.send('/api/setting/delete', 'post', {
                            
                        }).then((res) => {
                            if (res.status) {
                                this.$g.tipbox.success(res.msg);
                            } else {
                                this.$g.tipbox.error(res.msg);
                            }
                        }).catch((err) => {
                            this.$g.tipbox.error(err.message);
                        }).finally(() => {
                            done()
                            setTimeout(() => {
                                instance.confirmButtonLoading = false
                            }, 300)
                            this.ajaxWorking = false;
                        });
                    } else {
                        done()
                    }
                }
            });
        },
        openGithub() {
            window.open(`https://github.com/${this.github_repo}`, '_blank');
        }
    }
})
</script>

<style lang="scss" scoped>
.setting {
    color: #353535;
    max-width: 800px;
    margin: 0 auto;

    h1.title {
        font-size: 24px;
    }

    .setting_box {
        margin-top: 20px;
    }

    .sub_box {
        background-color: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(5px); // 模糊程度
        -webkit-backdrop-filter: blur(5px); // Safari兼容
        margin-bottom: 20px;
        padding: 20px;
        border: 1px solid rgba(190, 190, 190, 0);
        border-radius: 10px;
        box-shadow: rgba(90, 172, 255, 0.2) 0px 0px 0px;
        transition: border 0.2s ease-in-out, box-shadow 0.2s ease-in-out;

        &:hover {
            border: 1px solid rgba(190, 190, 190, 0.4);
            box-shadow: rgba(90, 172, 255, 0.4) 0px 0px 20px;
        }

        .sub_title {
            font-size: 18px;
            font-weight: bold;
        }

        .desc {
            margin-top: 15px;
        }

        .buttons {
            margin-top: 15px;
        }
    }

    .readToBox {
        .title {
            font-size: 18px;
            font-weight: bold;
        }

        .tips {
            margin: 10px 0;
        }

        .releaseNotes {
            min-height: 200px;
            max-height: 300px;
            overflow-y: scroll;
        }
    }
}
</style>