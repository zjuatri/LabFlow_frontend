
import { typstToBlocks } from '../lib/typst/parse';
import * as fs from 'fs';
import * as path from 'path';

const sampleTypst = `
= Heading 1
This is a paragraph with #strong[bold].

- List item 1
- List item 2

$ x^2 + y^2 = 1 $

#image("test.png")

\`\`\`python
print("Hello")
\`\`\`

#block(height: 5%)

/*LF_TABLE:eyJyb3dzIjoyLCJjb2xzIjoyLCJjZWxscyI6W1t7ImNvbnRlbnQiOiJBIn0seyJjb250ZW50IjoiQiJ9XSxbeyJjb250ZW50IjoiMSJ9LHsiY29udGVudCI6IjIifV1dfQ==*/

#figure(image("test.png", width: 50%), caption: [Test Caption])
`;


// Helper to remove IDs for comparison as they are generated randomly
function cleanIds(obj: any): any {
    if (Array.isArray(obj)) {
        return obj.map(cleanIds);
    } else if (obj !== null && typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
            if (key === 'id') continue;
            newObj[key] = cleanIds(obj[key]);
        }
        return newObj;
    }
    return obj;
}

const blocks = typstToBlocks(sampleTypst);
const cleaned = cleanIds(blocks);

console.log(JSON.stringify(cleaned, null, 2));
