const fs = require('fs');
const path = require('path');

function createPageRouteHandler(frontendDir) {
    const htmlFiles = new Set(
        fs.readdirSync(frontendDir)
            .filter((file) => file.endsWith('.html'))
            .map((file) => file.replace(/\.html$/, ''))
    );

    return function serveCleanPageRoute(req, res, next) {
        const slug = req.path.replace(/^\/+|\/+$/g, '');
        const pageName = slug || 'index';

        if (!htmlFiles.has(pageName)) {
            return next();
        }

        return res.sendFile(path.join(frontendDir, `${pageName}.html`));
    };
}

module.exports = { createPageRouteHandler };
