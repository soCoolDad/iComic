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

export default defineComponent({
  name: 'App',
  components: {
    PageHeader
  },
  mounted() {
    //console.log('onload');
  },
  methods: {
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