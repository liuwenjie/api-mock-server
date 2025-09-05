# HAR Mock Server

A powerful Node.js mock server that automatically creates API mocks from HAR (HTTP Archive) files.

## Installation

```bash
npm install
```

## Usage

### Basic Usage

```bash
# Run with HAR file
node api-mock-server.js ./path/to/your.har

# Specify custom port
node api-mock-server.js ./path/to/your.har --port 8080

# Enable verbose logging
node api-mock-server.js ./path/to/your.har --verbose
```

### Command Line Options

- `--port, -p`: Server port (default: 3000)
- `--har, -h`: Alternative way to specify HAR file path
- `--verbose, -v`: Enable verbose logging for debugging

### Example

```bash
# Start mock server on port 5000 with verbose logging
node api-mock-server.js api-recording.har -p 5000 -v
```

## Features

- **Automatic Request Matching**: Matches incoming requests with HAR entries based on:
  - HTTP method
  - URL path
  - Query parameters
  - Request body (for POST/PUT requests)
  
- **Smart Matching**: Falls back to pattern matching if exact match isn't found

- **Full Response Replication**: Returns exact responses from HAR including:
  - Status codes
  - Headers
  - Response body
  
- **CORS Support**: Automatically handles CORS headers

- **Error Handling**: Graceful handling of invalid HAR files and unmatched requests

- **Verbose Mode**: Detailed logging for debugging

## Programmatic Usage

```javascript
const HARMockServer = require('./api-mock-server');

const server = new HARMockServer('./my-api.har', {
  port: 3000,
  verbose: true
});

server.init();
```

## HAR File Generation

You can generate HAR files using:
- Chrome DevTools (Network tab → Export HAR)
- Firefox Developer Tools
- Postman
- Charles Proxy
- Any HTTP debugging proxy

## Example HAR Structure

```json
{
  "log": {
    "version": "1.2",
    "creator": {
      "name": "Chrome DevTools"
    },
    "entries": [
      {
        "request": {
          "method": "GET",
          "url": "https://api.example.com/users/123",
          "headers": [...]
        },
        "response": {
          "status": 200,
          "headers": [...],
          "content": {
            "text": "{\"id\":123,\"name\":\"John\"}"
          }
        }
      }
    ]
  }
}
```