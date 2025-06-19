import { Http, GUnits } from '@/units/public'
import { ComponentCustomProperties } from 'vue'
declare module 'vue' {
  interface ComponentCustomProperties {
    // 在此添加自定义属性类型
    $g: GUnits
  }
}