const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function fixBOM(filePath) {
    if (!fs.existsSync(filePath)) return;
    
    const buffer = fs.readFileSync(filePath);
    if (buffer.length === 0) return;

    let hasBOM = false;
    let newBuffer = buffer;

    // Check UTF-8 BOM (EF BB BF)
    if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        console.log(`Found UTF-8 BOM in ${filePath}`);
        hasBOM = true;
        newBuffer = buffer.slice(3);
    }
    // Check UTF-16 LE BOM (FF FE)
    else if (buffer[0] === 0xff && buffer[1] === 0xfe) {
        console.log(`Found UTF-16 LE BOM in ${filePath}`);
        hasBOM = true;
        newBuffer = Buffer.from(buffer.slice(2).toString('utf16le'), 'utf8');
    }
    // Check UTF-16 BE BOM (FE FF)
    else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
        console.log(`Found UTF-16 BE BOM in ${filePath}`);
        hasBOM = true;
        const swapped = Buffer.alloc(buffer.length - 2);
        for (let i = 2; i < buffer.length - 1; i += 2) {
            swapped[i - 2] = buffer[i + 1] || 0;
            swapped[i - 1] = buffer[i];
        }
        newBuffer = Buffer.from(swapped.toString('utf16le'), 'utf8');
    }
    
    if (hasBOM) {
        fs.writeFileSync(filePath, newBuffer);
        console.log(`Fixed ${filePath} -> saved as UTF-8 without BOM`);
    } else {
        // Double check for null bytes which might indicate UTF-16 without BOM
        if (buffer.includes(0x00)) {
            console.log(`Warning: Found null bytes in ${filePath}. Could be UTF-16 without BOM or binary file.`);
        }
    }
}

function scanDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
        } else if (file.match(/\.(ts|tsx|js|jsx|css|html|json|md)$/)) {
            fixBOM(fullPath);
        }
    }
}

console.log("Scanning client/src/entitiesSystem/ ...");
scanDir(path.join(__dirname, 'client/src/entitiesSystem'));

// Check specifically requested file just in case it's located there
fixBOM(path.join(__dirname, 'client/src/views/EntitiesSystemView.tsx'));

// Check recent git files
try {
    console.log("Scanning recently modified git files ...");
    // Get modified files in the working directory and staging area, plus the last commit
    const gitFiles = execSync('git diff --name-only HEAD~1 HEAD').toString().split('\n').filter(Boolean);
    const gitStatusFiles = execSync('git ls-files -m').toString().split('\n').filter(Boolean);
    
    const allFiles = new Set([...gitFiles, ...gitStatusFiles]);
    
    for (const file of allFiles) {
        const fullPath = path.join(__dirname, file);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile() && file.match(/\.(ts|tsx|js|jsx|css|html|json|md)$/)) {
            fixBOM(fullPath);
        }
    }
} catch (e) {
    console.log("Could not check git history:", e.message);
}

console.log("Done checking encoding.");
