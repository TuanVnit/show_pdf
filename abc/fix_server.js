const fs = require('fs');

try {
    const content = fs.readFileSync('server.js', 'utf8');
    const marker = "console.log(`📁 Upload limit: ${uploadPdf.limits.fileSize / 1024 / 1024}MB`);";
    const markerIndex = content.lastIndexOf(marker);

    if (markerIndex !== -1) {
        const endBlockIndex = content.indexOf('});', markerIndex);
        if (endBlockIndex !== -1) {
            // Keep everything up to });
            const cleanContent = content.substring(0, endBlockIndex + 3);
            fs.writeFileSync('server.js', cleanContent);
            console.log('Successfully truncated server.js');
        } else {
            console.log('Could not find end of app.listen block');
        }
    } else {
        console.log('Could not find marker string');
    }
} catch (e) {
    console.error(e);
}
