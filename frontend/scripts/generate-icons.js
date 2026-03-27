import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function drawIcon(canvas, isMaskable = false) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const padding = isMaskable ? size * 0.2 : 0; // 20% padding for maskable
    const iconSize = size - (padding * 2);

    // Background (transparent for standard, dark for maskable)
    if (isMaskable) {
        ctx.fillStyle = '#0c0c0c';
        ctx.fillRect(0, 0, size, size);
    }

    // Draw sand-colored rounded square
    const cornerRadius = iconSize * 0.1;
    ctx.fillStyle = '#c8b89a';
    ctx.beginPath();
    ctx.roundRect(padding, padding, iconSize, iconSize, cornerRadius);
    ctx.fill();

    // Add subtle gradient overlay for depth
    const gradient = ctx.createLinearGradient(padding, padding, padding + iconSize, padding + iconSize);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.1)');
    ctx.fillStyle = gradient;
    ctx.fill();
}

function generateIcon(size, filename, isMaskable = false) {
    const canvas = createCanvas(size, size);
    drawIcon(canvas, isMaskable);

    const buffer = canvas.toBuffer('image/png');
    const outputPath = join(__dirname, '..', 'public', 'icons', filename);
    writeFileSync(outputPath, buffer);
    console.log(`✓ Generated ${filename}`);
}

// Ensure icons directory exists
const iconsDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

// Generate all icons
console.log('Generating Rumi PWA icons...\n');
generateIcon(192, 'icon-192.png', false);
generateIcon(512, 'icon-512.png', false);
generateIcon(192, 'icon-maskable-192.png', true);
generateIcon(512, 'icon-maskable-512.png', true);
console.log('\n✓ All icons generated successfully!');

// Made with Bob
