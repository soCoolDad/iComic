<template>
  <div class="hidden-sm-and-down">
    <el-menu mode="horizontal" default-active="/library" @select="handleSelect">
      <el-menu-item index="/library">
        <h1>iComic</h1>
      </el-menu-item>
      <template v-for="menu in menus" :key="menu.key">
        <el-sub-menu v-if="menu.subs && menu.subs.length > 0" :index="menu.key">
          <template #title>{{ menu.title }}</template>
          <el-menu-item v-for="sub in menu.subs" :key="sub.key" :index="sub.key">{{ sub.title }}</el-menu-item>
        </el-sub-menu>
        <el-menu-item v-else :index="menu.key">
          {{ menu.title }}
        </el-menu-item>
      </template>
    </el-menu>
  </div>
  <div class="hidden-sm-and-up">
    <div class="title-center">
      <div class="icon" :onclick="openMenu">
        <el-icon v-if="isCollapse">
          <Fold />
        </el-icon>
        <el-icon v-if="!isCollapse">
          <Expand />
        </el-icon>
      </div>
      <h1>
        <div>iComic</div>
      </h1>
    </div>
    <div class="drawer-box">
      <el-drawer v-model="isCollapse" direction="ltr" size="50%" class="no-padding" :with-header="false">
        <el-menu mode="vertical" default-active="/" @select="handleSelect" class="no-padding">
          <el-menu-item index="/">
            <h1>iComic</h1>
          </el-menu-item>
          <template v-for="menu in menus" :key="menu.key">
            <el-sub-menu v-if="menu.subs && menu.subs.length > 0" :index="menu.key">
              <template #title>{{ menu.title }}</template>
              <el-menu-item v-for="sub in menu.subs" :key="sub.key" :index="sub.key">{{ sub.title }}</el-menu-item>
            </el-sub-menu>
            <el-menu-item v-else :index="menu.key">
              {{ menu.title }}
            </el-menu-item>
          </template>
        </el-menu>
      </el-drawer>
    </div>

  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
export default defineComponent({
  name: 'PageHeader',
  data: () => ({
    activeIndex: '/library',
    isCollapse: false,
    menus: [
      // { title: "库", path: "/", key: "library" },
      {
        title: "下载", key: "download",
        subs: [
          { title: "下载", path: "/download", key: "download" },
          { title: "任务", path: "/download_task", key: "download_task" },
        ]
      },
      { title: "插件", path: "/plugin", key: "plugin" },
      { title: "设置", path: "/setting", key: "setting" }
    ]
  }),
  methods: {
    handleSelect(key: string, keyPath: string[]) {
      //console.log(key, keyPath)
      //路由跳转
      //获取keyPath数组最后一个元素
      let lastPath = keyPath[keyPath.length - 1];

      this.$router.push({ path: lastPath });
    },
    openMenu() {
      this.isCollapse = !this.isCollapse
    }
  }
});
</script>
<style scoped lang="scss">
.title-center {
  position: relative;
  color: #409eff;

  h1 {
    text-align: center;
  }
}

.drawer-box .no-padding {
  margin: 0 calc(var(--el-drawer-padding-primary) * -1);
}

.icon {
  font-size: 40px;
  position: absolute;
  left: -5px;
  right: 10px;
  width: 50px;
  height: 50px;
  background-color: rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
}
</style>