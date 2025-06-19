const fs = require('fs')
const path = require('path')

const helpers = {}

function loadHelpers(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)
        if (stat.isDirectory()) {
            loadHelpers(fullPath)
        } else if (file !== 'index.js' && file.endsWith('.js')) {
            const name = path.basename(file, '.js')
            const HelperClass = require(fullPath)

            if(HelperClass && typeof HelperClass === 'function') {
                //helpers[name] = new HelperClass()
                helpers[name] = new HelperClass()
            }
        }
    })
}

loadHelpers(__dirname)

module.exports = helpers