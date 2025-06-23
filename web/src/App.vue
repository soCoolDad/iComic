<template>
  <div id="app">
    <el-header>
      <PageHeader></PageHeader>
    </el-header>
    <el-container>
      <el-container>
        <el-main>
          <router-view />
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import PageHeader from './components/PageHeader.vue';
import { i18n } from './main'; 

export default defineComponent({
  name: 'App',
  components: {
    PageHeader
  },
  mounted() {
    //console.log('onload');
      this.load();
  },
  methods: {
      load() {
          this.$g.http.send('/api/setting/getAllLang', 'get').then((res) => {
              if (res.status) {
                  let langs = (res.data || [])

                  langs.forEach((item) => {
                      try {
                          i18n.global.setLocaleMessage(item.id, item.data)
                      } catch (error) {
                          console.log("set lang error",error);
                      }
                  });

                  this.$nextTick(() => {
                    i18n.global.locale.value = localStorage.getItem('lang') || 'lang_zh_cn';
                  });
              }
          });
      }
  }
});
</script>

<style lang="scss">
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;

  .el-cascader-menu {
    min-width: none;
  }
}
</style>