# Real World Opera 𓂀

A real-time collaborative geospatial research platform that enables users to create projects, add locations, and visualize geographical data through both 2D satellite maps and 3D globe visualization.

## Overview

Real World Opera is a command-line interface styled web application that combines geospatial data visualization with real-time collaboration. Users can create projects, add locations by address or coordinates, and share research with collaborators through an intuitive CLI-based interface.

## Features

- **Real-Time Collaboration**: Multi-user support with WebSocket-based communication
- **Project Management**: Create and manage location-based research projects
- **Dual Visualization**: 
  - 3D interactive globe view (desktop)
  - 2D Mapbox satellite view with 3D buildings
- **Geospatial Tools**:
  - Geocoding (address → coordinates)
  - Reverse geocoding (coordinates → address)
  - Distance calculations
  - Area/polygon support
- **Mobile Responsive**: Optimized interface for mobile devices
- **CLI-Style Interface**: Command-based interactions for power users

## Tech Stack

### Backend
- **Node.js** (v22.11.0+)
- **Express** (v4.21.1) - Web server
- **Socket.io** (v4.8.0) - Real-time WebSocket communication
- **Supabase** (PostgreSQL + Auth) - Database and authentication
- **node-geocoder** (v4.4.0) - Geocoding services
- **@derhuerst/query-overpass** (v2.0.0) - OpenStreetMap queries
- **Winston** - Structured logging
- **Helmet** - Security headers
- **Joi** - Input validation

### Frontend
- **Vanilla JavaScript** - No framework dependencies
- **Mapbox GL JS** (v2.3.1) - 2D satellite mapping
- **Globe.gl** - 3D globe visualization
- **Geolocator.js** (v2.1.5) - Browser geolocation

## Installation

### Prerequisites
- Node.js v22.11.0 or higher
- npm or yarn package manager
- A Supabase account (free tier is fine - [sign up here](https://app.supabase.com))

### Quick Setup (5 minutes)

See [QUICKSTART.md](./QUICKSTART.md) for detailed setup instructions.

**TL;DR:**
1. `npm install`
2. Create Supabase project at https://app.supabase.com
3. Copy API keys to `.env`
4. Run `database/schema.sql` in Supabase SQL Editor
5. `npm start`
6. Open http://localhost:3000

### Detailed Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd realworldopera
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Supabase**
   
   Follow the complete guide in [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)
   
   Quick version:
   - Create project at https://app.supabase.com
   - Get API keys from Settings → API
   - Run `database/schema.sql` in SQL Editor

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```

5. **Start the server**
   ```bash
   npm start
   # Or for development with auto-restart:
   npm run dev
   ```

6. **Access the application**
   - Open your browser to `http://localhost:3000`
   - Click "ENTER" to begin (desktop) or start directly (mobile)
   - Register with `/register username password`

## Usage Guide

### Getting Started

1. **Register**: Type `/register yourusername yourpassword` in the command line
2. **Login**: Type `/login yourusername yourpassword` to sign in
3. **Request Location**: Type `/location` to enable geolocation services
4. **Create a Project**: Type `#projectname` to create or open a project

### Available Commands

#### User Commands
- `/register [username] [password]` - Register a new account
- `/login [username] [password]` - Login with username and password
- `/logout` - Logout from current session
- `/location` or `/loc` - Request user location
- `/calc [phrase]` - Calculate gematria value of a phrase
- `/who @[user]` - Get information about a user (partially implemented)

#### View Commands
- `/orbit` - Toggle camera rotation on/off
- `/center` - Center view on current project data

#### Project Commands
- `#projectname` - Create or open a project
- `+loc [address]` - Add a location to the current project by address
- `+coords [lat,lng]` - Add a location by coordinates
- `!itemname` - Query details about an item
- `!item +desc [description]` - Add description to an item

### Chat
Simply type any text without a command prefix to send a chat message to other users.

## Architecture

### Server Structure
```
realworldopera/
├── opera.js              # Main server entry point
├── server/
│   └── js/
│       ├── commands.js   # User command handlers
│       ├── gematria.js   # Gematria calculation system
│       ├── projects.js   # Project management logic
│       └── utils.js      # Utility functions (geocoding, distance, etc.)
└── client/
    ├── index.html        # Single page application
    └── js/
        ├── client.js     # Main client logic & socket handlers
        ├── gematria.js   # Client-side gematria
        ├── globe.js      # 3D globe visualization
        └── mobile-detect.js # Mobile device detection
```

### Data Flow
1. **Client connects** via Socket.io WebSocket
2. **User authenticates** with username (gematria validation)
3. **Commands are sent** as text messages with special prefixes (`/`, `#`, `+`, `!`)
4. **Server processes** commands and broadcasts updates
5. **Geospatial data** is fetched from Mapbox/OpenStreetMap APIs
6. **Real-time updates** are pushed to all connected clients

### Database (Supabase/PostgreSQL)
- **profiles**: User profiles linked to Supabase Auth
- **projects**: Research projects with access control
- **locations**: Geospatial data with PostGIS support
- **project_logs**: Activity history

### In-Memory Data
- `SOCKET_LIST`: Active WebSocket connections
- Socket sessions linked to Supabase Auth tokens

## Known Issues & Limitations

### Implemented ✅
- ✅ **Data Persistence**: Using Supabase PostgreSQL
- ✅ **Authentication**: Supabase Auth with JWT tokens
- ✅ **Secure API Keys**: Moved to environment variables
- ✅ **Port 3000**: No longer requires root privileges
- ✅ **Rate Limiting**: HTTP and Socket event rate limiting
- ✅ **Input Validation**: Joi schemas for all inputs
- ✅ **Updated Dependencies**: All packages on latest versions
- ✅ **Logging**: Winston structured logging
- ✅ **Security Headers**: Helmet middleware

### Still To Do
- **Client.js Refactoring**: 575 lines needs modularization (Priority 2)
- **Testing**: Zero test coverage (Priority 2)
- **Error Handling**: Needs improvement (Priority 2)
- **Offline Support**: Not implemented
- **User Profiles**: Basic functionality only
- **Mobile Testing**: Limited testing on mobile devices

## Roadmap

See [ROADMAP.md](ROADMAP.md) for detailed development plans including:
- Priority 1: Security and Infrastructure (Environment variables, database, auth)
- Priority 2: Code Quality (Testing, linting, logging)
- Priority 3: Features and Enhancements (TypeScript, monitoring, new features)

## Security Considerations

⚠️ **This is a development/prototype application. Do not use in production without addressing:**
- Proper authentication and authorization
- API key management (move to server-side)
- Input validation and sanitization
- Rate limiting and abuse prevention
- Data persistence and backup
- Security headers and HTTPS

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Guidelines
- Follow existing code style
- Add comments for complex logic
- Test all socket events
- Update documentation as needed

## License

ISC

## Author

Nick West

## Acknowledgments

- Mapbox for mapping services
- OpenStreetMap contributors
- Socket.io team
- Globe.gl visualization library

## Support

For issues, questions, or suggestions, please open an issue on the repository.

---

**Note**: This application is under active development. Features and APIs may change.

