# Graph Report - .  (2026-08-31)

## Corpus Check
- Corpus is ~17,967 words - fits in a single context window. You may not need a graph.

## Summary
- 200 nodes · 495 edges · 12 communities (11 shown, 1 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.65)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Frontend UI & API
- AI & Config
- Database CRUD
- DB Helpers & Settings
- Auth & Users
- Frontend Dependencies
- Backend Dependencies
- Channel/Contact Resolve
- Messages & DB Init
- App Shell & Login
- Pipeline Data

## God Nodes (most connected - your core abstractions)
1. `q()` - 65 edges
2. `api()` - 25 edges
3. `post()` - 23 edges
4. `tok()` - 11 edges
5. `mountAuth()` - 10 edges
6. `cfg()` - 10 edges
7. `patch()` - 9 edges
8. `requireAuth()` - 6 edges
9. `storeMedia()` - 6 edges
10. `phone()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Conversations()` --indirect_call--> `now()`  [INFERRED]
  web/src/pages/Conversations.jsx → server/db.js
- `initAuth()` --calls--> `q()`  [EXTRACTED]
  server/auth.js → server/db.js
- `createUser()` --calls--> `q()`  [EXTRACTED]
  server/auth.js → server/db.js
- `updateUser()` --calls--> `q()`  [EXTRACTED]
  server/auth.js → server/db.js
- `listUsers()` --calls--> `q()`  [EXTRACTED]
  server/auth.js → server/db.js

## Import Cycles
- None detected.

## Communities (12 total, 1 thin omitted)

### Community 0 - "Frontend UI & API"
Cohesion: 0.13
Nodes (25): api(), onLoading(), patch(), post(), subs, Broadcast(), ContactPanel(), GlobalLoader() (+17 more)

### Community 1 - "AI & Config"
Cohesion: 0.13
Nodes (28): aiReply(), toWhatsapp(), cache, cfg(), getConfigView(), KEYS, loadConfig(), SECRET_KEYS (+20 more)

### Community 2 - "Database CRUD"
Cohesion: 0.13
Nodes (30): agentReport(), createChannel(), createPipeline(), createReminder(), deleteChannel(), deleteMaster(), deletePipeline(), deleteRole() (+22 more)

### Community 3 - "DB Helpers & Settings"
Cohesion: 0.11
Nodes (17): addMaster(), assignRoundRobin(), createQuickReply(), deleteQuickReply(), deleteReminder(), getSetting(), listMasters(), listRoles() (+9 more)

### Community 4 - "Auth & Users"
Cohesion: 0.20
Nodes (15): createUser(), has(), initAuth(), listUsers(), mountAuth(), parseCookie(), requireAdmin(), requireAuth() (+7 more)

### Community 5 - "Frontend Dependencies"
Cohesion: 0.12
Nodes (16): react, react-dom, vite, @vitejs/plugin-react, dependencies, react, react-dom, devDependencies (+8 more)

### Community 6 - "Backend Dependencies"
Cohesion: 0.13
Nodes (14): @aws-sdk/client-s3, express, dependencies, @aws-sdk/client-s3, express, pg, name, private (+6 more)

### Community 7 - "Channel/Contact Resolve"
Cohesion: 0.40
Nodes (6): getChannel(), getContact(), listChannels(), updateContact(), chanOf(), pickChannel()

### Community 8 - "Messages & DB Init"
Cohesion: 0.40
Nodes (5): initDb(), insertMessage(), now(), updateStatus(), upsertContact()

### Community 9 - "App Shell & Login"
Cohesion: 0.47
Nodes (3): App(), Login(), Shell()

## Knowledge Gaps
- **31 isolated node(s):** `name`, `version`, `type`, `private`, `dev` (+26 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `now()` connect `Messages & DB Init` to `Frontend UI & API`, `Database CRUD`?**
  _High betweenness centrality (0.294) - this node is a cross-community bridge._
- **Why does `Conversations()` connect `Frontend UI & API` to `Messages & DB Init`?**
  _High betweenness centrality (0.291) - this node is a cross-community bridge._
- **What connects `name`, `version`, `type` to the rest of the system?**
  _31 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend UI & API` be split into smaller, more focused modules?**
  _Cohesion score 0.1321353065539112 - nodes in this community are weakly interconnected._
- **Should `AI & Config` be split into smaller, more focused modules?**
  _Cohesion score 0.12701612903225806 - nodes in this community are weakly interconnected._
- **Should `Database CRUD` be split into smaller, more focused modules?**
  _Cohesion score 0.12688172043010754 - nodes in this community are weakly interconnected._
- **Should `DB Helpers & Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.11255411255411256 - nodes in this community are weakly interconnected._