import axios from 'axios';
import fs from 'fs';
import path from 'path';

async function download() {
  const dir = path.resolve('src/assets/fonts');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const fonts = [
    { name: 'Roboto-Regular.ttf', url: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf' },
    { name: 'Roboto-Bold.ttf', url: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Medium.ttf' }, // Using Medium as Bold fallback if Bold is not there, or check Bold
    { name: 'Roboto-Italic.ttf', url: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Italic.ttf' }
  ];

  for (const font of fonts) {
    console.log(`Downloading ${font.name}...`);
    const res = await axios.get(font.url, { responseType: 'arraybuffer' });
    fs.writeFileSync(path.join(dir, font.name), Buffer.from(res.data));
    console.log(`Saved ${font.name}`);
  }
}

download().catch(console.error);
