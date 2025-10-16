# Real World Opera - Development Roadmap

## Executive Summary

Real World Opera is a real-time collaborative geospatial research platform. This roadmap outlines the analysis, priorities, and implementation plan for transforming it from a prototype into a production-ready application.

**Current State**: Functional prototype with 3-year-old dependencies, in-memory data storage, and security vulnerabilities.

**Target State**: Production-ready application with persistent storage, modern security, comprehensive testing, and maintainable codebase.

---

## Codebase Analysis

### Current Metrics
- **Total Lines**: ~1,100 lines of application code
- **Largest File**: `client.js` (575 lines) - needs refactoring
- **Languages**: JavaScript (ES5/ES6 mix)
- **Dependencies**: 7 npm packages (all 3+ years old)
- **Test Coverage**: 0%
- **Documentation**: None (prior to this roadmap)

### Architecture Assessment

**Strengths:**
- Clean separation of client/server code
- Modular server-side file structure
- Real-time WebSocket communication working well
- Dual visualization (2D/3D) is innovative
- Mobile-responsive design

**Weaknesses:**
- No data persistence (in-memory only)
- Global variables for state management
- No error handling or logging
- Hardcoded API keys in client code
- Mixed concerns (no clear MVC/layered architecture)
- No input validation or sanitization

### Security Assessment

**Critical Vulnerabilities:**
1. **Exposed API Keys**: Mapbox token visible in client source code
2. **No Authentication**: Gematria system is trivially bypassable
3. **No Input Validation**: XSS and injection vulnerabilities
4. **No Rate Limiting**: Open to DoS attacks
5. **Port 80**: Requires root privileges (security risk)
6. **No HTTPS**: Sensitive data transmitted in clear text

**Compliance Issues:**
- No data privacy controls
- No audit logging
- No user consent mechanisms
- No data retention policies

### Dependency Analysis

| Package | Current | Latest | Severity | Notes |
|---------|---------|--------|----------|-------|
| express | 4.17.2 | 4.21.1 | HIGH | Security patches needed |
| socket.io | 4.4.1 | 4.8.0 | MEDIUM | Performance improvements |
| node-geocoder | 4.3.0 | 4.4.0 | LOW | Minor updates |
| @derhuerst/query-overpass | 2.0.0 | 2.0.0 | OK | Current |
| get-distance-between-points | 1.2.0 | 1.2.0 | OK | Current |
| horseman-article-parser | 0.8.52 | ? | UNKNOWN | May be deprecated |
| serp | 2.2.2 | 2.2.2 | OK | Current |

**Risk Level**: HIGH - Multiple packages have known vulnerabilities

---

## Implementation Priorities

### Priority 1: Critical Infrastructure (Immediate - Week 1-2)
*Without these, the application is not production-ready*

#### 1.1 Environment Variables & Configuration
**Effort**: 2-4 hours  
**Risk**: Low

Tasks:
- Create `.env` and `.env.example` files
- Install `dotenv` package
- Move all secrets and configuration to environment variables:
  - Mapbox API key
  - Port number
  - Database connection strings
  - Session secrets
- Create server endpoint to provide API key to authenticated clients
- Update `.gitignore` to exclude `.env`

**Success Criteria:**
- No hardcoded secrets in repository
- Application configurable without code changes
- Different configs for dev/staging/production

#### 1.2 Dependency Updates
**Effort**: 4-8 hours  
**Risk**: Medium (breaking changes possible)

Tasks:
- Update Express 4.17.2 → 4.21.x
- Update Socket.io 4.4.1 → 4.8.x
- Update node-geocoder to latest
- Run `npm audit fix` for security patches
- Test all functionality after updates
- Document any breaking changes
- Update package-lock.json

**Success Criteria:**
- All dependencies on latest stable versions
- `npm audit` shows no high/critical vulnerabilities
- All existing features working correctly

#### 1.3 Database Integration
**Effort**: 16-24 hours  
**Risk**: High (architectural change)

**Database Choice**: MongoDB with Mongoose
- **Rationale**: Document-oriented structure fits project data model, excellent geospatial support, easier to get started than PostgreSQL+PostGIS

Tasks:
- Install MongoDB and Mongoose
- Design schemas for:
  - Users (username, passwordHash, createdAt, lastLogin)
  - Projects (name, key, locked, userList, locations, log, createdAt)
  - Locations (name, coords/bbox, address, description, notes, links)
- Implement database connection with retry logic
- Create data access layer (DAL) to abstract database operations
- Migrate SOCKET_LIST to session-based tracking
- Migrate USERS to User model
- Migrate PROJECTS to Project model
- Add indexes for performance (geospatial indexes, username, project key)
- Implement graceful shutdown

**Success Criteria:**
- Data persists across server restarts
- All CRUD operations working
- Response times < 100ms for reads
- Proper error handling for DB failures

#### 1.4 Security Hardening
**Effort**: 16-24 hours  
**Risk**: High (requires careful testing)

##### Authentication (JWT)
- Install `jsonwebtoken` and `bcryptjs`
- Replace gematria system with password-based auth
- Implement `/api/register` and `/api/login` endpoints
- Hash passwords with bcrypt (10 rounds)
- Issue JWT tokens on successful login
- Add JWT verification middleware
- Update Socket.io to authenticate with JWT
- Keep gematria as a fun username validation feature (optional)

##### Rate Limiting
- Install `express-rate-limit` and `socket.io-rate-limit`
- Configure HTTP rate limits:
  - General: 100 req/15min per IP
  - Login: 5 attempts/15min per IP
  - Register: 3 attempts/hour per IP
- Configure Socket event rate limits:
  - Commands: 20/minute per user
  - Chat: 10/minute per user
- Add informative error messages for rate limit hits

##### Input Validation
- Install `joi` for schema validation
- Create validation schemas for:
  - User registration/login
  - Project creation
  - Location addition
  - Chat messages
- Sanitize all HTML output (install `dompurify`)
- Validate socket event payloads
- Add validation middleware

##### Security Headers & Configuration
- Install `helmet` for security headers
- Configure CORS properly (whitelist domains)
- Change port from 80 to 3000 (configurable via env)
- Add CSP (Content Security Policy)
- Add HSTS if using HTTPS
- Disable X-Powered-By header

**Success Criteria:**
- JWT authentication working end-to-end
- Passwords securely hashed
- Rate limiting preventing abuse
- All inputs validated
- Security headers present in responses
- Application runs on non-privileged port
- No XSS vulnerabilities

---

### Priority 2: Code Quality & Maintainability (Week 3-4)

#### 2.1 Testing Infrastructure
**Effort**: 16-24 hours

Tasks:
- Install Jest and Supertest
- Set up test environment
- Write unit tests for:
  - Gematria calculations
  - Distance calculations
  - Geocoding utilities
  - Input validators
- Write integration tests for:
  - Authentication flow
  - Project CRUD operations
  - Socket event handlers
- Write E2E tests with Puppeteer
- Aim for 70%+ code coverage
- Add test scripts to package.json
- Set up CI to run tests

**Success Criteria:**
- 70%+ code coverage
- All critical paths tested
- Tests run in < 30 seconds
- CI/CD pipeline running tests

#### 2.2 Linting & Code Formatting
**Effort**: 4-8 hours

Tasks:
- Install ESLint with Airbnb config
- Install Prettier
- Configure ESLint rules for project
- Add pre-commit hooks with Husky
- Fix existing linting errors
- Add lint scripts to package.json
- Configure VS Code/editor integration

**Success Criteria:**
- Consistent code style across project
- No linting errors
- Pre-commit hooks catching issues
- Documentation on code style

#### 2.3 Logging & Monitoring
**Effort**: 8-12 hours

Tasks:
- Install Winston for structured logging
- Configure log levels (error, warn, info, debug)
- Add request logging middleware (Morgan)
- Log all errors with stack traces
- Log authentication events
- Log project operations
- Add log rotation
- Consider log aggregation (optional)

**Success Criteria:**
- All errors logged with context
- Searchable structured logs
- Different log levels for dev/prod
- Log rotation configured

#### 2.4 Error Handling
**Effort**: 8-12 hours

Tasks:
- Create centralized error handling middleware
- Define custom error classes (ValidationError, AuthError, etc.)
- Add try-catch blocks to all async operations
- Implement graceful error responses
- Add error logging
- Handle socket errors properly
- Add client-side error boundary

**Success Criteria:**
- No unhandled promise rejections
- All errors logged and handled gracefully
- User-friendly error messages
- No sensitive info in error responses

#### 2.5 Documentation
**Effort**: 8-12 hours

Tasks:
- Add JSDoc comments to all functions
- Document all socket events
- Create API documentation
- Add architecture diagrams
- Document deployment process
- Create development guide
- Add troubleshooting guide

**Success Criteria:**
- All public functions documented
- API documentation complete
- New developers can onboard easily

---

### Priority 3: Enhancements & Features (Week 5+)

#### 3.1 Code Refactoring
**Effort**: 16-24 hours

Tasks:
- Break up `client.js` (575 lines) into modules:
  - `map.js` - Mapbox logic
  - `socket.js` - Socket event handlers
  - `ui.js` - UI updates and rendering
  - `commands.js` - Command parsing
- Implement proper state management
- Remove global variables
- Use ES6 modules
- Apply MVC/MVVM pattern
- Extract reusable components

**Success Criteria:**
- No file > 300 lines
- Clear separation of concerns
- Reusable components
- Maintainable codebase

#### 3.2 TypeScript Migration (Optional)
**Effort**: 40-60 hours

**Recommendation**: Only if team has TypeScript experience and project will scale

Tasks:
- Install TypeScript and types
- Configure tsconfig.json
- Convert one module at a time
- Add interfaces for all data structures
- Add type definitions for socket events
- Set up build pipeline
- Update documentation

**Alternative**: Use JSDoc for type hints instead (20% effort, 80% benefit)

**Success Criteria:**
- Full type coverage
- No `any` types
- Build passing with strict mode
- Better IDE support

#### 3.3 Docker & Deployment
**Effort**: 8-16 hours

Tasks:
- Create Dockerfile for application
- Create docker-compose.yml with MongoDB
- Add health check endpoints
- Document deployment process
- Set up staging environment
- Configure environment-specific settings
- Add backup/restore scripts

**Success Criteria:**
- One-command deployment
- Reproducible environments
- Easy rollback process

#### 3.4 CI/CD Pipeline
**Effort**: 8-12 hours

Tasks:
- Set up GitHub Actions or GitLab CI
- Configure automated testing
- Add linting checks
- Add security scanning (npm audit)
- Add automated deployment to staging
- Add deployment to production (manual trigger)

**Success Criteria:**
- All PRs run tests automatically
- Failed tests block merging
- Automated deployment working

#### 3.5 Performance Optimization
**Effort**: 16-24 hours

Tasks:
- Add Redis for session storage
- Implement caching for geocoding results
- Optimize socket event payload size
- Add database query optimization
- Implement pagination for large datasets
- Add CDN for static assets
- Optimize frontend bundle size
- Add service worker for offline support

**Success Criteria:**
- Page load < 2 seconds
- Socket latency < 100ms
- Database queries < 50ms
- Reduced bandwidth usage

#### 3.6 New Features
**Effort**: Varies per feature

**High Priority:**
- Project export (GeoJSON, KML)
- Project import from files
- User presence indicators
- Project search/filtering
- Undo/redo functionality

**Medium Priority:**
- Collaborative drawing tools
- Comments on locations
- Project templates
- Weather data overlays
- Custom map layers

**Low Priority:**
- User profiles and avatars
- Project permissions/roles
- Email notifications
- API for external integrations
- Mobile native app

---

## Implementation Timeline

### Week 1-2: Priority 1 (Critical Infrastructure)
- Days 1-2: Environment variables, dependency updates
- Days 3-6: Database integration
- Days 7-10: Security hardening (auth, rate limiting, validation)

### Week 3-4: Priority 2 (Code Quality)
- Days 11-13: Testing infrastructure
- Days 14-15: Linting and formatting
- Days 16-18: Logging and error handling
- Days 19-20: Documentation

### Week 5+: Priority 3 (Enhancements)
- Ongoing refactoring and feature development
- TypeScript migration (if decided)
- Performance optimization
- New features based on user feedback

---

## Decision Log

### Database Choice: MongoDB vs PostgreSQL
**Decision**: MongoDB with Mongoose  
**Rationale**:
- Document-oriented fits project structure naturally
- Built-in geospatial query support
- Easier learning curve
- Faster initial development
- Schema flexibility for evolving features

**Trade-offs**:
- Less ACID guarantees (acceptable for this use case)
- No built-in joins (use populate instead)

### TypeScript: Yes or No?
**Decision**: Deferred to Priority 3 (Optional)  
**Rationale**:
- Current codebase is small enough to manage with JSDoc
- Team may not have TypeScript experience
- Build complexity adds overhead
- Can add later if project scales
- ESLint + JSDoc provides 80% of benefits

**Alternative**: Use JSDoc for type annotations

### Port Configuration
**Decision**: Change from 80 to 3000  
**Rationale**:
- Port 80 requires root privileges (security risk)
- Standard ports: 3000 (dev), 8080 (alt HTTP)
- Reverse proxy (nginx) can handle port 80 → 3000 mapping
- Better security isolation

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|---------|------------|
| Database migration breaks features | Medium | High | Thorough testing, feature flags, rollback plan |
| Dependency updates cause breaking changes | Medium | Medium | Update one at a time, test thoroughly |
| Authentication changes lock out users | Low | High | Keep gematria as fallback, migration script |
| Performance degradation with DB | Low | Medium | Proper indexing, caching, load testing |
| Security vulnerabilities in new code | Medium | High | Security review, penetration testing |

---

## Success Metrics

### Technical Metrics
- Zero high/critical security vulnerabilities
- 70%+ test coverage
- < 100ms average response time
- < 100ms socket event latency
- Zero unhandled errors in production
- 99.9% uptime

### Code Quality Metrics
- No file > 300 lines
- < 10 complexity score per function
- Zero linting errors
- 100% documented public APIs

### User Metrics
- < 2 second page load time
- < 5 second time to first interaction
- Zero XSS/injection vulnerabilities
- Positive user feedback on performance

---

## Notes & Considerations

### Why Not Start with TypeScript?
For a small team or solo developer:
- **Learning curve**: If unfamiliar with TypeScript, adds complexity
- **Build overhead**: Adds compilation step and configuration
- **Diminishing returns**: For <5K LOC, JSDoc gives similar benefits
- **Can add later**: Not an irreversible decision

### Database Alternatives Considered
- **PostgreSQL + PostGIS**: More robust, better ACID, but steeper learning curve
- **SQLite**: Too limited for production geospatial queries
- **Firebase**: Vendor lock-in, cost concerns
- **MongoDB**: Best balance of features, ease, and geospatial support

### Authentication Alternatives Considered
- **OAuth**: Overkill for this project
- **Passport.js**: Good but adds complexity
- **JWT**: Simple, stateless, industry standard ✓
- **Sessions**: Requires Redis/Memcached for horizontal scaling

---

## Maintenance Plan

### Weekly
- Review error logs
- Check performance metrics
- Review security updates

### Monthly
- Dependency updates
- Security audit
- Performance optimization review
- User feedback review

### Quarterly
- Major feature releases
- Architecture review
- Technical debt assessment
- Disaster recovery drill

---

## Questions & Decisions Needed

1. **Database hosting**: Local MongoDB or MongoDB Atlas?
2. **Production deployment**: VPS, AWS, Heroku, or other?
3. **User data**: Do we need GDPR compliance?
4. **Scale expectations**: How many concurrent users?
5. **Budget**: Any constraints on hosting/services?

---

**Last Updated**: October 16, 2025  
**Next Review**: After Priority 1 completion

