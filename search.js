const fs = require('fs');
const path = require('path');

function searchInDir(dir, keyword) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            if (file !== 'node_modules' && file !== '.next') {
                searchInDir(fullPath, keyword);
            }
        } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.toLowerCase().includes(keyword.toLowerCase())) {
                console.log(fullPath);
            }
        }
    }
}

searchInDir(path.join(__dirname, 'src'), 'upstreamUrl');
searchInDir(path.join(__dirname, 'src'), 'Upstream fetch failed');
searchInDir(path.join(__dirname, 'src'), 'storage.googleapis.com');
searchInDir(path.join(__dirname, 'src'), 'react-pdf');
searchInDir(path.join(__dirname, 'src'), 'MissingPDFException');
