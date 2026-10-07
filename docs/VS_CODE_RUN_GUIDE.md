# Running AquaTracker in VS Code

AquaTracker is a server-rendered Node.js/Express application using EJS templates and plain browser JavaScript.

## One-click start

In VS Code, open **Run and Debug** (`Ctrl+Shift+D`), select **AquaTracker — Start and Open**, and press `F5`. VS Code will install dependencies if needed, start Express, and open the browser automatically.

You can also double-click `START_AQUATRACKER.bat` in the project folder. It performs the same dependency check, starts the server in a dedicated terminal, and opens the site.

The application opens at:

```text
http://127.0.0.1:3001/
```

Do not use the Live Server extension to run the application itself. Live Server only serves static files and cannot serve the application routes. If you open the project with Live Server, the root `index.html` forwards to Express on port 3001 when it is running; otherwise use the VS Code launcher above. Port 3001 avoids the common VS Code port 3000 conflict.

## Optional manual commands

If you do want to run it from a terminal:

```powershell
npm install
npm start
```

The application serves the same route set directly from Express, including `/client/index.html` for compatibility with existing links.
