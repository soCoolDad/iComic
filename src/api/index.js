const fs = require('fs')
const path = require('path')

const apis = {}

function loadApis(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
            loadApis(fullPath)
        } else if (file !== 'index.js' && file.endsWith('.js')) {
            const name = path.basename(file, '.js')
            const ApiClass = require(fullPath)

            if(ApiClass && typeof ApiClass === 'function') {
                //apis[name] = new ApiClass()
                apis[name] = new ApiClass()
            }
        }
    })
}

loadApis(__dirname)

module.exports = apis