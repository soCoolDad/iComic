import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    name: '',
    token: '',
    isAdmin: false
  }),
  actions: {
    setUser(name: string, token: string, isAdmin: boolean) {
      this.name = name
      this.token = token
      this.isAdmin = isAdmin
    },
    clearUser() {
      this.name = ''
      this.token = ''
      this.isAdmin = false
    }
  }
})