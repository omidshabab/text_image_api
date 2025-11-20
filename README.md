# Text Image API

A RESTful API service that generates beautiful images from text, with full support for Persian and Arabic text (RTL - Right-to-Left). The API creates 1080x1080 pixel images with custom styling and automatically uploads them to UploadThing for easy sharing.

## Features

- 🎨 **Text-to-Image Generation**: Convert text into high-quality PNG images
- 🌐 **RTL Support**: Full support for Persian and Arabic text with proper reshaping
- 📐 **Custom Styling**: Dark theme with white text, optimized typography
- 🔤 **Persian Font**: Uses Estedad font for beautiful Persian text rendering
- 📦 **Auto Upload**: Automatically uploads generated images to Liara object storage (S3-compatible) with UploadThing fallback
- 🧩 **Scene Builder**: Describe frames, groups, and auto-layout stacks (Figma-style) as JSON and get rendered images or PDFs
- 🚀 **Express API**: Fast and lightweight REST API built with Express.js
- 📝 **Text Wrapping**: Intelligent text wrapping with a maximum of 5 lines
- ✅ **TypeScript**: Fully typed with TypeScript for better development experience

## Prerequisites

- Node.js (v18 or higher recommended)
- npm, yarn, or bun package manager
- UploadThing account and API token

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd text_image_api
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
bun install
```

3. Create a `.env` file in the root directory:
```env
# Liara Object Storage (S3-compatible) - Primary storage
LIARA_ACCESS_KEY=your_liara_access_key
LIARA_SECRET_KEY=your_liara_secret_key
LIARA_BUCKET=your_bucket_name
LIARA_ENDPOINT=https://storage.iran.liara.space
LIARA_REGION=us-east-1
LIARA_PUBLIC_URL=https://your-bucket.storage.iran.liara.space

# UploadThing - Fallback storage (optional, but recommended)
UPLOADTHING_TOKEN=your_uploadthing_token_here

# Server Configuration
PORT=3000
```

4. Ensure the font file exists at `assets/fonts/fa/Estedad-FD-Medium.woff2`

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `LIARA_ACCESS_KEY` | Your Liara object storage access key | Yes* | - |
| `LIARA_SECRET_KEY` | Your Liara object storage secret key | Yes* | - |
| `LIARA_BUCKET` | Your Liara bucket name | Yes* | - |
| `LIARA_ENDPOINT` | Liara S3 endpoint URL | No | `https://storage.iran.liara.space` |
| `LIARA_REGION` | Liara region | No | `us-east-1` |
| `LIARA_PUBLIC_URL` | Public URL for accessing uploaded files | No | Auto-generated |
| `UPLOADTHING_TOKEN` | Your UploadThing API token | Yes* | - |
| `PORT` | Server port number | No | 3000 |

\* Either Liara or UploadThing credentials are required. Liara is used by default, with UploadThing as fallback.

### Getting Liara Object Storage Credentials

1. Sign up at [Liara](https://liara.ir/)
2. Create an object storage bucket
3. Get your access key and secret key from the dashboard
4. Add them to your `.env` file
5. Set `LIARA_PUBLIC_URL` to your bucket's public URL (if you have a custom domain/CDN)

### Getting UploadThing Token (Fallback)

1. Sign up at [UploadThing](https://uploadthing.com/)
2. Create a new project
3. Get your API token from the dashboard
4. Add it to your `.env` file (used as fallback if Liara fails)

## Usage

### Development Mode

Run the server in development mode with hot reload:

```bash
npm run dev
# or
yarn dev
# or
bun run dev
```

The server will start on `http://localhost:3000` (or your configured PORT).

### Production Mode

1. Build the project:
```bash
npm run build
```

2. Start the server:
```bash
npm start
```

### API Endpoints

#### Health Check

**GET** `/`

Check if the API is running.

**Response:**
```json
{
  "status": "ok",
  "message": "Text Image API is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Generate Image

**POST** `/image`

Generate an image (or multiple images) from text with automatic pagination support. If the text is too long to fit on a single page, the API automatically creates multiple images, similar to how Word or Google Docs handle page breaks.

**Request Body:**
```json
{
  "text": "Your text here",
  "width": 1080,
  "height": 1080,
  "bgColor": "#181A20",
  "textColor": "#fff",
  "fontName": "Estedad",
  "fontWeight": "Bold",
  "fontSize": 64,
  "letterSpacing": -5,
  "padding": 80,
  "useUploadThing": false,
  "outputFormat": "image",
  "pdfLayout": "combined"
}
```

**Request Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `text` | string | ✅ Yes | - | The text to convert to an image. Supports Persian and Arabic text with RTL layout. |
| `width` | number | ❌ No | `1080` | Width of the image in pixels. Must be between 100 and 10000. |
| `height` | number | ❌ No | `1080` | Height of the image in pixels. Must be between 100 and 10000. |
| `bgColor` | string | ❌ No | `"#181A20"` | Background color in hex format (e.g., `"#181A20"`, `"#FFFFFF"`). |
| `textColor` | string | ❌ No | `"#fff"` | Text color in hex format (e.g., `"#FFFFFF"`, `"#000000"`). |
| `fontName` | string | ❌ No | `"Estedad"` | Supported font family name. Currently `Estedad` fonts are bundled from `assets/fonts/fa/Estedad` (alias `@Estedad`). |
| `fontWeight` | string or number | ❌ No | `"Medium"` | Font weight to use for the selected family. Supports `Thin`, `ExtraLight`, `Light`, `Regular`, `Medium`, `SemiBold`, `Bold`, `ExtraBold`, `Black` (or CSS numeric equivalents `100`-`900`). |
| `fontSize` | number | ❌ No | `64` | Font size in pixels. |
| `letterSpacing` | number | ❌ No | `-5` | Letter spacing in pixels. Negative values bring letters closer together. |
| `padding` | number | ❌ No | `80` | Padding around the text in pixels. Must be non-negative and less than half of the smallest dimension. |
| `useUploadThing` | boolean | ❌ No | `false` | Set to `true` to force using UploadThing instead of Liara. Default: `false` (uses Liara by default). |
| `outputFormat` | string | ❌ No | `"image"` | Set to `"pdf"` to receive PDF output. When `"image"`, the API behaves exactly as before. |
| `pdfLayout` | string | ❌ No | `"combined"` | Applies when `outputFormat` is `"pdf"` and there are multiple pages. Use `"combined"` to align every page inside a single multi-page PDF (first image becomes the first page). Use `"separate"` to get one PDF per page. |

**Response (Success - Single Page):**
When the text fits on a single page:
```json
{
  "url": "https://uploadthing.com/f/..."
}
```

**Response (Success - Multiple Pages):**
When the text is split across multiple pages:
```json
{
  "urls": [
    "https://uploadthing.com/f/page1...",
    "https://uploadthing.com/f/page2...",
    "https://uploadthing.com/f/page3..."
  ],
  "pageCount": 3,
  "message": "Text was split into 3 pages"
}
```

#### Render Scene (Groups & Auto Layout)

**POST** `/scene`

Render a complex scene defined as a JSON tree (frames, groups, auto layout containers, rectangles, text layers, and images). The layout logic mimics Figma's group + auto layout behavior (padding, spacing, grow/shrink, absolute children, stretch, RTL/LTR text, etc.) and returns both the rendered asset and computed layout metrics.

**Request Body:**

```json
{
  "scene": {
    "type": "FRAME",
    "width": 1080,
    "height": 1080,
    "backgroundColor": "#181A20",
    "layoutMode": "VERTICAL",
    "padding": { "top": 80, "right": 80, "bottom": 80, "left": 80 },
    "itemSpacing": 32,
    "children": [
      {
        "id": "title",
        "type": "TEXT",
        "text": "سلام دنیا 👋",
        "fontSize": 72,
        "textColor": "#ffffff",
        "textDirection": "RTL",
        "letterSpacing": -4,
        "width": "fill"
      },
      {
        "id": "card",
        "type": "FRAME",
        "layoutMode": "HORIZONTAL",
        "padding": 40,
        "itemSpacing": 24,
        "backgroundColor": "#222632",
        "cornerRadius": 32,
        "grow": 1,
        "children": [
          {
            "type": "RECT",
            "width": 160,
            "height": 160,
            "cornerRadius": 24,
            "backgroundColor": "#8b5cf6"
          },
          {
            "type": "TEXT",
            "text": "Stack sections with primary/counter axis alignment, stretch, grow/shrink and even absolute nodes.",
            "fontSize": 36,
            "wrap": true
          }
        ]
      }
    ]
  },
  "backgroundColor": "#10121A",
  "outputFormat": "image",
  "useUploadThing": false
}
```

**Key Scene Properties:**

| Property | Description |
|----------|-------------|
| `type` | `FRAME`, `GROUP`, `RECT`, `TEXT`, or `IMAGE` |
| `layoutMode` | `NONE`, `HORIZONTAL`, or `VERTICAL` (Auto Layout) |
| `primaryAxisAlign` | `MIN`, `CENTER`, `MAX`, `SPACE_BETWEEN` |
| `counterAxisAlign` | `MIN`, `CENTER`, `MAX`, `STRETCH` |
| `padding` | Number or object `{ top, right, bottom, left }` |
| `itemSpacing` | Gap between auto-layout children |
| `width` / `height` | Number, `"auto"`, `"fill"`, or percentage string (e.g. `"50%"`) |
| `grow` / `shrink` | Flex-like grow/shrink weights for auto layout |
| `absolute`, `x`, `y` | Absolute children inside auto layout containers |
| `text`, `fontSize`, `textColor`, `textDirection`, `wrap`, `maxLines` | Text configuration |
| `imageUrl` | Remote image URL for `IMAGE` nodes |

**Response:**

```json
{
  "url": "https://storage.iran.liara.space/.../scene.png",
  "format": "image",
  "dimensions": {
    "width": 1080,
    "height": 1080
  },
  "layout": {
    "id": "root-1",
    "type": "FRAME",
    "layoutMode": "VERTICAL",
    "x": 0,
    "y": 0,
    "width": 1080,
    "height": 1080,
    "children": [
      {
        "id": "title",
        "type": "TEXT",
        "layoutMode": "NONE",
        "x": 80,
        "y": 80,
        "width": 920,
        "height": 108,
        "children": []
      }
    ]
  }
}
```

Set `"outputFormat": "pdf"` to receive a single-page PDF instead of PNG. Use `"useUploadThing": true` to bypass Liara and upload directly to UploadThing.

**Response (Success - Combined PDF):**
When `outputFormat` is `"pdf"` (default layout `combined`):
```json
{
  "url": "https://uploadthing.com/f/text.pdf",
  "format": "pdf",
  "pageCount": 3,
  "layout": "combined"
}
```

**Response (Success - Separate PDFs):**
When requesting `outputFormat: "pdf"` with `pdfLayout: "separate"`:
```json
{
  "urls": [
    "https://uploadthing.com/f/page1.pdf",
    "https://uploadthing.com/f/page2.pdf"
  ],
  "format": "pdf",
  "pageCount": 2,
  "layout": "separate",
  "message": "Generated 2 separate PDF files covering 2 pages."
}
```

**Response (Error):**
```json
{
  "error": "Error message"
}
```

**Error Codes:**
- `400`: Missing or invalid text, invalid dimensions, or invalid padding
- `500`: Server error or upload failure (both Liara and UploadThing failed)

**Pagination Algorithm:**
The API automatically calculates how many lines of text can fit on each page based on:
- Image height
- Font size
- Padding
- Line height (1.5x font size)

If the text exceeds the available space on one page, it automatically creates additional pages, similar to how Word or Google Docs handle page breaks. Each page is a separate image that can be displayed sequentially.

### Available Fonts

- **Estedad (`@Estedad`)**: Persian font family bundled under `assets/fonts/fa/Estedad`.
  - Supported weights: `Thin`, `ExtraLight`, `Light`, `Regular`, `Medium`, `SemiBold`, `Bold`, `ExtraBold`, `Black`.
  - Pass `fontName: "Estedad"` and one of the listed `fontWeight` values (or CSS numeric equivalents like `400` for Regular) in the request body.

### Example Usage

#### Basic Example (Default Settings)

**Using cURL:**
```bash
curl -X POST http://localhost:3000/image \
  -H "Content-Type: application/json" \
  -d '{"text": "سلام دنیا"}'
```

**Using JavaScript/TypeScript:**
```javascript
const response = await fetch('http://localhost:3000/image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'سلام دنیا'
  })
});

const data = await response.json();
if (data.url) {
  console.log('Single page image URL:', data.url);
} else if (data.urls) {
  console.log('Multiple pages:', data.urls);
  console.log('Total pages:', data.pageCount);
}
```

**Using Python:**
```python
import requests

response = requests.post(
    'http://localhost:3000/image',
    json={'text': 'سلام دنیا'}
)

data = response.json()
if 'url' in data:
    print('Single page image URL:', data['url'])
elif 'urls' in data:
    print('Multiple pages:', data['urls'])
    print('Total pages:', data['pageCount'])
```

#### Custom Dimensions Example

**Using cURL:**
```bash
curl -X POST http://localhost:3000/image \
  -H "Content-Type: application/json" \
  -d '{
    "text": "این یک متن طولانی است که ممکن است به چند صفحه تقسیم شود...",
    "width": 1920,
    "height": 1080,
    "fontSize": 48,
    "padding": 100
  }'
```

**Using JavaScript/TypeScript:**
```javascript
const response = await fetch('http://localhost:3000/image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: 'این یک متن طولانی است که ممکن است به چند صفحه تقسیم شود...',
    width: 1920,
    height: 1080,
    bgColor: '#000000',
    textColor: '#FFFFFF',
    fontSize: 48,
    letterSpacing: -3,
    padding: 100
  })
});

const data = await response.json();
if (data.urls) {
  console.log(`Generated ${data.pageCount} pages:`);
  data.urls.forEach((url, index) => {
    console.log(`Page ${index + 1}: ${url}`);
  });
}
```

#### Long Text with Automatic Pagination

When you send a long text, the API automatically creates multiple images:

```javascript
const longText = `
این یک متن بسیار طولانی است که قطعاً به چندین صفحه تقسیم خواهد شد.
متن ادامه دارد و ادامه دارد و ادامه دارد...
`;
#### PDF Output Example

Generate a single multi-page PDF (default layout is `combined`):
```bash
curl -X POST http://localhost:3000/image \
  -H "Content-Type: application/json" \
  -d '{
    "text": "خروجی PDF با چند صفحه...",
    "outputFormat": "pdf"
  }'
```

Request separate PDFs per page:
```javascript
const response = await fetch('http://localhost:3000/image', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    text: 'هر صفحه در یک PDF جداگانه می‌آید.',
    outputFormat: 'pdf',
    pdfLayout: 'separate'
  })
});

const data = await response.json();
console.log(data);
```

const response = await fetch('http://localhost:3000/image', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    text: longText,
    width: 1200,
    height: 1600,  // Portrait orientation
    fontSize: 56
  })
});

const data = await response.json();
if (data.urls && data.urls.length > 1) {
  console.log(`Text was automatically split into ${data.pageCount} pages`);
  // Display pages sequentially like a document
  data.urls.forEach((url, index) => {
    console.log(`Page ${index + 1}: ${url}`);
  });
}
```

### Image Specifications

**Default Settings:**
- **Dimensions**: 1080x1080 pixels (customizable via `width` and `height` parameters)
- **Format**: PNG
- **Background Color**: `#181A20` (dark gray, customizable via `bgColor`)
- **Text Color**: `#FFFFFF` (white, customizable via `textColor`)
- **Font Size**: 64px (customizable via `fontSize`)
- **Font Family**: Estedad with `Medium` weight (configurable via `fontName` + `fontWeight`)
- **Letter Spacing**: -5px (customizable via `letterSpacing`)
- **Padding**: 80px (customizable via `padding`)
- **Text Alignment**: Right-to-Left (RTL) for Persian/Arabic text
- **Pagination**: Automatic - text is split across multiple images if it doesn't fit on one page

**Customization:**
All visual parameters can be customized via the request body. The API automatically calculates how many lines fit on each page based on the provided dimensions, font size, and padding.

## Project Structure

```
text_image_api/
├── assets/
│   └── fonts/
│       └── fa/
│           └── Estedad/
│               ├── Estedad-FD-Black.woff2
│               ├── Estedad-FD-Bold.woff2
│               ├── ...
│               └── Estedad-FD-Thin.woff2
├── dist/                    # Compiled JavaScript (after build)
├── node_modules/            # Dependencies
├── index.ts                 # Main application file
├── package.json             # Project configuration
├── tsconfig.json            # TypeScript configuration
├── Dockerfile               # Docker configuration for deployment
├── .dockerignore            # Files to exclude from Docker build
├── .env                     # Environment variables (create this)
└── README.md               # This file
```

## Technologies Used

- **Express.js**: Web framework for Node.js
- **TypeScript**: Type-safe JavaScript
- **@napi-rs/canvas**: High-performance canvas implementation
- **arabic-persian-reshaper**: Persian/Arabic text reshaping for proper display
- **@aws-sdk/client-s3**: AWS SDK for S3-compatible storage (Liara)
- **UploadThing**: File upload service (fallback)
- **dotenv**: Environment variable management
- **uuid**: Unique identifier generation

## Development

### Scripts

- `npm run dev`: Start development server with hot reload (using tsx)
- `npm run build`: Compile TypeScript to JavaScript
- `npm start`: Run the production build

### Code Style

The project uses strict TypeScript configuration with:
- Strict type checking
- No implicit any
- Strict null checks
- No unchecked indexed access

## Features

- ✅ **Automatic Pagination**: Like Word or Google Docs, long texts are automatically split across multiple pages
- ✅ **Customizable Dimensions**: Set any width and height (100-10000 pixels)
- ✅ **Customizable Styling**: Control colors, font size, spacing, and padding
- ✅ **RTL Support**: Full support for Persian and Arabic text with proper reshaping
- ✅ **Intelligent Text Wrapping**: Text automatically wraps to fit within the canvas width
- ✅ **No Line Limits**: No artificial limits - text can span as many pages as needed
- ✅ **Professional Layout**: Each page is centered and properly formatted

## Deployment

### Deploying on VPS with Coolify

[Coolify](https://coolify.io/) is an open-source, self-hosted platform that simplifies deploying applications on your VPS. This guide will walk you through deploying the Text Image API using Coolify.

#### Prerequisites

- A VPS (Virtual Private Server) with:
  - Ubuntu 20.04+ or Debian 11+ (recommended)
  - Minimum 2GB RAM (4GB+ recommended)
  - Docker and Docker Compose installed
- Domain name (optional, for custom domain)
- SSH access to your VPS
- Git repository (GitHub, GitLab, or self-hosted)

#### Step 1: Install Coolify on Your VPS

1. **SSH into your VPS:**
```bash
ssh root@your-vps-ip
```

2. **Install Coolify:**
```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

3. **Follow the installation prompts** and note the admin credentials.

4. **Access Coolify dashboard:**
   - Open `http://your-vps-ip:8000` in your browser
   - Login with the credentials from step 3

#### Step 2: Configure Your Project in Coolify

1. **Create a New Project:**
   - Click "New Project" in Coolify dashboard
   - Enter a project name (e.g., "Text Image API")
   - Click "Create"

2. **Add a New Resource:**
   - Click "New Resource" in your project
   - Select "Docker Compose" or "Dockerfile" (recommended: Dockerfile)

3. **Connect Your Git Repository:**
   - Choose your Git provider (GitHub, GitLab, etc.)
   - Authorize Coolify to access your repositories
   - Select the `text_image_api` repository
   - Choose the branch (usually `main` or `master`)

#### Step 3: Configure Build Settings

1. **Build Pack Configuration:**
   - **Build Pack**: Select "Dockerfile" (since we've included a Dockerfile)
   - **Dockerfile Location**: `./Dockerfile` (default)
   - **Dockerfile Context**: `.` (root directory)

2. **Port Configuration:**
   - **Port**: `3000` (or your configured PORT)
   - Coolify will automatically map this port

3. **Build Command** (if using source build instead of Dockerfile):
   - Build Command: `npm run build`
   - Start Command: `npm start`
   - Install Command: `npm ci`

#### Step 4: Configure Environment Variables

In Coolify, navigate to your application's environment variables section and add:

| Variable | Value | Description |
|----------|-------|-------------|
| `LIARA_ACCESS_KEY` | `your_liara_access_key` | Your Liara access key (required for primary storage) |
| `LIARA_SECRET_KEY` | `your_liara_secret_key` | Your Liara secret key (required for primary storage) |
| `LIARA_BUCKET` | `your_bucket_name` | Your Liara bucket name (required for primary storage) |
| `LIARA_ENDPOINT` | `https://storage.iran.liara.space` | Liara endpoint (optional) |
| `LIARA_PUBLIC_URL` | `https://your-bucket.storage.iran.liara.space` | Public URL for files (optional) |
| `UPLOADTHING_TOKEN` | `your_uploadthing_token` | Your UploadThing API token (required for fallback) |
| `PORT` | `3000` | Server port (optional, defaults to 3000) |
| `NODE_ENV` | `production` | Node environment (optional) |

**To add environment variables in Coolify:**
1. Go to your application settings
2. Navigate to "Environment Variables" section
3. Click "Add Variable"
4. Enter the variable name and value
5. Click "Save"

#### Step 5: Configure Domain (Optional)

1. **Add Domain:**
   - Go to your application settings
   - Navigate to "Domains" section
   - Click "Add Domain"
   - Enter your domain (e.g., `api.yourdomain.com`)
   - Coolify will automatically configure SSL with Let's Encrypt

2. **DNS Configuration:**
   - Add an A record pointing to your VPS IP:
     ```
     Type: A
     Name: api (or @ for root domain)
     Value: your-vps-ip
     TTL: 3600
     ```

#### Step 6: Deploy

1. **Review Configuration:**
   - Double-check all settings
   - Ensure environment variables are set correctly

2. **Start Deployment:**
   - Click "Deploy" or "Save & Deploy"
   - Coolify will:
     - Clone your repository
     - Build the Docker image
     - Start the container
     - Configure networking

3. **Monitor Deployment:**
   - Watch the build logs in real-time
   - Check for any errors
   - Wait for "Deployment successful" message

#### Step 7: Verify Deployment

1. **Check Health Endpoint:**
```bash
curl http://your-domain-or-ip:3000/
# or
curl https://api.yourdomain.com/
```

Expected response:
```json
{
  "status": "ok",
  "message": "Text Image API is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

2. **Test Image Generation:**
```bash
curl -X POST http://your-domain-or-ip:3000/image \
  -H "Content-Type: application/json" \
  -d '{"text": "سلام دنیا"}'
```

#### Troubleshooting

**Build Fails:**
- Check build logs in Coolify dashboard
- Ensure all system dependencies are installed (Dockerfile handles this)
- Verify Node.js version compatibility

**Application Won't Start:**
- Check application logs in Coolify
- Verify environment variables are set correctly
- Ensure `LIARA_ACCESS_KEY`, `LIARA_SECRET_KEY`, and `LIARA_BUCKET` are set (or `UPLOADTHING_TOKEN` for fallback)

**Canvas/Image Generation Errors:**
- The Dockerfile includes all required system libraries for `@napi-rs/canvas`
- If issues persist, check that the container has sufficient memory
- Verify font file exists at `assets/fonts/fa/Estedad-FD-Medium.woff2`

**Port Issues:**
- Ensure port 3000 is not blocked by firewall
- Check Coolify's port mapping configuration
- Verify your VPS firewall allows the port

**SSL Certificate Issues:**
- Ensure DNS is properly configured
- Wait a few minutes for Let's Encrypt propagation
- Check domain DNS propagation with `dig your-domain.com`

#### Updating Your Deployment

1. **Automatic Updates (Recommended):**
   - Enable "Auto Deploy" in Coolify
   - Coolify will automatically redeploy on git push

2. **Manual Updates:**
   - Click "Redeploy" in Coolify dashboard
   - Or push to your git repository if auto-deploy is enabled

#### Monitoring and Logs

- **View Logs:**
  - Go to your application in Coolify
  - Click "Logs" tab
  - View real-time application logs

- **Resource Usage:**
  - Monitor CPU, Memory, and Network usage
  - Set up alerts if needed

#### Additional Coolify Features

- **Backups**: Configure automatic backups
- **Health Checks**: Set up health check endpoints
- **Scaling**: Scale your application horizontally
- **Rollbacks**: Rollback to previous deployments if needed

### Alternative: Manual Docker Deployment

If you prefer to deploy manually without Coolify:

1. **Build the Docker image:**
```bash
docker build -t text-image-api .
```

2. **Run the container:**
```bash
docker run -d \
  --name text-image-api \
  -p 3000:3000 \
  -e UPLOADTHING_TOKEN=your_token_here \
  -e PORT=3000 \
  text-image-api
```

3. **Verify it's running:**
```bash
docker ps
curl http://localhost:3000/
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is private.

## Support

For issues and questions, please open an issue on the repository.

