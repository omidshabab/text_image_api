# Text Image API

A RESTful API service that generates beautiful images from text, with full support for Persian and Arabic text (RTL - Right-to-Left). The API creates 1080x1080 pixel images with custom styling and automatically uploads them to UploadThing for easy sharing.

## Features

- 🎨 **Text-to-Image Generation**: Convert text into high-quality PNG images
- 🌐 **RTL Support**: Full support for Persian and Arabic text with proper reshaping
- 📐 **Custom Styling**: Dark theme with white text, optimized typography
- 🔤 **Persian Font**: Uses Estedad font for beautiful Persian text rendering
- 📦 **Auto Upload**: Automatically uploads generated images to UploadThing
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
UPLOADTHING_TOKEN=your_uploadthing_token_here
PORT=3000
```

4. Ensure the font file exists at `assets/fonts/fa/Estedad-FD-Medium.woff2`

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `UPLOADTHING_TOKEN` | Your UploadThing API token | Yes | - |
| `PORT` | Server port number | No | 3000 |

### Getting UploadThing Token

1. Sign up at [UploadThing](https://uploadthing.com/)
2. Create a new project
3. Get your API token from the dashboard
4. Add it to your `.env` file

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

Generate an image from text.

**Request Body:**
```json
{
  "text": "Your text here"
}
```

**Response (Success):**
```json
{
  "url": "https://uploadthing.com/f/..."
}
```

**Response (Error):**
```json
{
  "error": "Error message"
}
```

**Error Codes:**
- `400`: Missing or invalid text, or text exceeds 5 lines
- `500`: Server error or UploadThing upload failure

### Example Usage

#### Using cURL

```bash
curl -X POST http://localhost:3000/image \
  -H "Content-Type: application/json" \
  -d '{"text": "سلام دنیا"}'
```

#### Using JavaScript/TypeScript

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
console.log('Image URL:', data.url);
```

#### Using Python

```python
import requests

response = requests.post(
    'http://localhost:3000/image',
    json={'text': 'سلام دنیا'}
)

data = response.json()
print('Image URL:', data['url'])
```

### Image Specifications

- **Dimensions**: 1080x1080 pixels
- **Format**: PNG
- **Background Color**: `#181A20` (dark gray)
- **Text Color**: `#FFFFFF` (white)
- **Font Size**: 64px
- **Font Family**: Estedad (Persian font) or sans-serif fallback
- **Letter Spacing**: -5px
- **Padding**: 80px
- **Max Lines**: 5 lines
- **Text Alignment**: Right-to-Left (RTL)

## Project Structure

```
text_image_api/
├── assets/
│   └── fonts/
│       └── fa/
│           └── Estedad-FD-Medium.woff2
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
- **UploadThing**: File upload service
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

## Limitations

- Maximum 5 lines of text per image
- Text is automatically wrapped to fit within the canvas
- Currently optimized for Persian/Arabic text (RTL)
- Requires UploadThing account for image hosting

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
| `UPLOADTHING_TOKEN` | `your_uploadthing_token` | Your UploadThing API token (required) |
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
- Ensure `UPLOADTHING_TOKEN` is valid

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

