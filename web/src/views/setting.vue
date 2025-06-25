<template>
    <div class="setting">
        <h1 class="title">{{ $t('setting.title') }}</h1>
        <div class="setting_box">
            <div class="sub_box">
                <div class="sub_title">{{ $t('setting.about_me') }}</div>
                <div class="desc">{{ $t('setting.about_me_info') }}</div>
                <div class="buttons">
                    <el-button round type="primary" @click="openGithub">{{ $t('setting.github') }}</el-button>
                </div>
            </div>
            <div class="sub_box">
                <div class="sub_title">{{ $t('setting.GitHub_PAT') }}</div>
                <div class="desc">{{ $t('setting.GitHub_PAT_Info') }}</div>
                <div class="desc">
                    <el-input v-model="GITHUB_PAT" placeholder="Github Personal Access token"></el-input>
                </div>
                <div class="buttons">
                    <el-button round type="primary" :loading="ajaxWorking" @click="saveSystem('GitHub PAT')">{{
                        $t('setting.save') }}</el-button>
                </div>
            </div>
            <div class="sub_box">
                <div class="sub_title">{{ $t('setting.language') }}</div>
                <div class="desc">
                    <el-select v-model="lang" placeholder="Language">
                        <el-option v-for="item in langs" :label="item.label" :value="item.value">
                            {{ item.label }}
                        </el-option>
                    </el-select>
                </div>
                <div class="buttons">
                    <el-button round type="primary" :loading="ajaxWorking" @click="saveSystem('Language')">{{
                        $t('setting.save') }}</el-button>
                </div>
            </div>
            <div class="sub_box">
                <div class="sub_title">{{ $t('setting.device_title') }}</div>
                <div class="desc">{{ $t('setting.device_desc') }}</div>
                <div class="desc">
                    <el-select v-model="device" allow-create filterable placeholder="Devices">
                        <el-option v-for="(item, index) in devices" :label="item" :value="index">
                        </el-option>
                    </el-select>
                </div>
                <div class="buttons">
                    <el-button round type="primary" :loading="ajaxWorking" @click="saveSystem('Device')">{{
                        $t('setting.save') }}</el-button>
                </div>
            </div>
            <div class="sub_box">
                <div class="sub_title">{{ $t('setting.version') }}</div>
                <div class="desc">
                    <el-tag type="primary">{{ version }}</el-tag>
                    <span>&nbsp;</span>
                    <el-tag type="danger" v-if="has_update">{{ $t('setting.has_new_version',
                        { version: has_update_new_version })
                    }}</el-tag>
                </div>
                <div class="buttons">
                    <el-button round type="primary" :loading="ajaxWorking" @click="checkUpdate">{{
                        $t('setting.check_new') }}</el-button>
                    <el-button round v-if="has_update" type="danger" :loading="ajaxWorking"
                        @click="show_update = true">{{ $t('setting.update') }}</el-button>
                </div>
            </div>
            <div class="sub_box">
                <div class="sub_title">{{ $t('setting.cache') }}</div>
                <div class="desc">
                    {{ cache_size_parse }}
                </div>
                <div class="buttons">
                    <el-button round type="primary" :loading="getCacheSizeWorking" @click="clearCache">{{
                        $t('setting.clear_cache') }}</el-button>
                </div>
            </div>
        </div>
        <div class="hide">
            <el-dialog v-model="show_update" :title="`${$t('update.new_version')}[${has_update_new_version}]`"
                width="500" align-center>
                <div class="readToBox">
                    <div class="releaseNotes">
                        <div class="tips title">{{ $t('update.update_info') }}</div>
                        <div class="tips">
                            <b style="color: red;">
                                {{ $t('update.warning') }}
                            </b>
                        </div>
                        <div class="tips">{{ $t('update.warning_tip') }}</div>
                        <div class="tips">{{ $t('update.warning_tip2') }}</div>
                        <div class="tips title">{{ $t('update.releaseNotes') }}:{{ has_update_date }}</div>
                        <div class="tips">{{ has_update_releaseNotes }}</div>
                    </div>
                    <div class="tips text-right">
                        <el-button type="danger" size="large" :loading="ajaxWorking" :disabled="ajaxWorking"
                            @click="onUpdateSystem">{{ $t('update.update') }}</el-button>
                    </div>
                </div>
            </el-dialog>
        </div>
    </div>
</template>

<script lang="ts">
import { defineComponent, version } from 'vue';
import { i18n } from '../main';
export default defineComponent({
    name: 'setting',
    computed: {
        cache_size_parse() {
            //格式化cache_size 
            //返回对应的bytes,KB,MB,GB
            if (this.cache_size == 0) {
                return "0B";
            }

            if (this.cache_size < 1024) {
                return this.cache_size + "B";
            } else if (this.cache_size < 1024 * 1024) {
                return (this.cache_size / 1024).toFixed(2) + "KB";
            } else if (this.cache_size < 1024 * 1024 * 1024) {
                return (this.cache_size / 1024 / 1024).toFixed(2) + "MB";
            } else if (this.cache_size < 1024 * 1024 * 1024 * 1024) {
                return (this.cache_size / 1024 / 1024 / 1024).toFixed(2) + "GB";
            }

            return this.cache_size + "B";
        }
    },
    data() {
        return {
            version: "0.0.0",
            has_update: false,
            has_update_new_version: "",
            has_update_releaseNotes: "",
            has_update_date: "",
            ajaxWorking: false,
            show_update: false,
            github_repo: "",
            cache_size: 0,
            getCacheSizeWorking: false,
            langs: [] as { value: string, label: string }[],
            lang: "",
            device: 0,
            devices: [] as string[],
            clearCacheWorking: false,
            GITHUB_PAT: ""
        }
    },
    mounted() {
        this.sysConfig();
        this.getCacheSize();
        this.getAllLang();
    },
    methods: {
        saveSystem(key) {
            if (this.ajaxWorking) return;

            let config_name, config_value;

            if (key == "Language") {
                i18n.global.locale.value = this.lang;
                localStorage.setItem('lang', this.lang);
                config_name = "LANGUAGE";
                config_value = this.lang;
            } else if (key == "GitHub PAT") {
                config_name = "GITHUB_PAT";
                config_value = this.GITHUB_PAT;
            } else if (key == "Device") {
                config_name = "ICOMIC_VIRTUAL_DEVICE_INDEX";
                config_value = this.device;
            } else {
                return;
            }

            this.ajaxWorking = true;
            this.$g.http.send('/api/setting/saveConfig', 'post', {
                config_name,
                config_value
            }).then((res) => {
                if (res.status) {
                    this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
                this.sysConfig();
            });
        },
        getAllLang() {
            this.$g.http.send('/api/setting/getAllLang', 'get').then((res) => {
                if (res.status) {
                    this.langs = (res.data || []).map((item) => {
                        return {
                            value: item.id,
                            label: item.name
                        }
                    });
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.getCacheSizeWorking = false;
            });
        },
        getCacheSize() {
            if (this.getCacheSizeWorking) return;
            this.getCacheSizeWorking = true;
            this.$g.http.send('/api/setting/getCacheSize', 'get').then((res) => {
                if (res.status) {
                    this.cache_size = res.data.size;
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.getCacheSizeWorking = false;
            });
        },
        //清理缓存
        clearCache() {
            if (this.clearCacheWorking) return;

            this.clearCacheWorking = true;

            this.$g.http.send('/api/setting/clearCache', 'get').then((res) => {
                if (res.status) {
                    this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                } else {
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.clearCacheWorking = false;
                this.getCacheSize();
            });
        },
        sysConfig() {
            if (this.ajaxWorking) return;

            this.ajaxWorking = true;
            this.$g.http.send('/api/setting/sysConfig', 'get').then((res) => {
                if (res.status) {
                    this.version = res.data.version;
                    this.github_repo = res.data.UPDATE_REPO;
                    this.GITHUB_PAT = res.data.GITHUB_PAT;
                    this.lang = localStorage.getItem('lang') || res.data.LANGUAGE;
                    this.devices = res.data.ICOMIC_VIRTUAL_DEVICE;
                    this.device = res.data.ICOMIC_VIRTUAL_DEVICE_INDEX;
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
                        this.$g.tipbox.success(this.$t('setting.find_new_version', { version: this.has_update_new_version }));
                    } else if (res.data?.isCurrentHigher) {
                        this.$g.tipbox.success(this.$t('setting.current_version_is_higher', { version: this.version }));
                    } else {
                        this.$g.tipbox.success(this.$t('setting.current_version_is_new', { version: this.version }));
                    }
                } else {
                    this.version = res.currentVersion;
                    this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                }
            }).catch((err) => {
                this.$g.tipbox.error(err.message);
            }).finally(() => {
                this.ajaxWorking = false;
            });
        },
        onUpdateSystem() {
            this.$g.msgbox.confirm(this.$t('update.data_loss_warning2'), this.$t('update.data_loss_warning'), {
                confirmButtonText: this.$t('update.update'),
                cancelButtonText: this.$t('update.cancel'),
                beforeClose: (action, instance, done) => {
                    if (action === 'confirm') {
                        instance.confirmButtonLoading = true
                        instance.confirmButtonText = this.$t('update.updating');

                        this.ajaxWorking = true;

                        this.$g.http.send('/api/setting/update', 'post', {}, 1000 * 60 * 10).then((res) => {
                            if (res.status) {
                                this.$g.tipbox.success(this.$t(res.msg, res.i18n));
                            } else {
                                this.$g.tipbox.error(this.$t(res.msg, res.i18n));
                            }
                        }).catch((err) => {
                            this.$g.tipbox.error(err.message);
                        }).finally(() => {
                            done();
                            setTimeout(() => {
                                instance.confirmButtonLoading = false;
                                // window.location.reload();
                                // 刷新页面
                                setTimeout(() => {
                                    window.location.reload();
                                }, 2000);
                            }, 500)
                            this.ajaxWorking = false;
                        });
                    } else {
                        done();
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