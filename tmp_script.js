const fs = require('fs');

const filePath = '/Users/fares/Documents/Projet TEST/gitsync/src/components/ProjectBoard.tsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(/fontWeight:\s*bold/g, "fontWeight: 'bold'");

// Remove unused imports in one line
content = content.replace("GripVertical, ", "");
content = content.replace("Edit2, ", "");
content = content.replace("Users, ", "");

fs.writeFileSync(filePath, content);
console.log('Fixed syntax and imports in ProjectBoard.tsx');
