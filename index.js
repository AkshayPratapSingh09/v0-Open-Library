const express = require("express");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const rimraf = require("rimraf");

const app = express();
const PORT = 3000;
const TEMP_COMPONENT_FILE = "./Component.jsx";
const PROJECT_DIR = "react-vite-project";

// Middleware to parse JSON
app.use(express.json());

// Function to build and deploy React project
async function buildReactVite(componentPath) {
  const projectName = PROJECT_DIR;
  const projectPath = path.join(process.cwd(), projectName);

  try {
    // Step 0: Cleanup Existing Project Folder
    if (fs.existsSync(projectPath)) {
      console.log("Cleaning up existing project folder...");
      rimraf.sync(projectPath);
    }

    // Step 1: Validate the component file
    if (!fs.existsSync(componentPath)) {
      throw new Error(`Component file ${componentPath} does not exist.`);
    }
    let componentContent = fs.readFileSync(componentPath, "utf-8");

    // Remove "use client" directive
    componentContent = componentContent.replace(/"use client";?\n?/, "");

    // Step 2: Create a new Vite React project
    console.log("Creating a new Vite React project...");
    execSync(`npm create vite@latest ${projectName} -- --template react`, {
      stdio: "inherit",
    });

    // Step 3: Navigate to project directory
    process.chdir(projectPath);

    // Step 4: Install base dependencies
    console.log("Installing base dependencies...");
    execSync("npm install", { stdio: "inherit" });

    // Step 5: Configure Tailwind CSS
    console.log("Configuring Tailwind CSS...");
    execSync("npm install -D tailwindcss postcss autoprefixer", {
      stdio: "inherit",
    });
    execSync("npx tailwindcss init -p", { stdio: "inherit" });

    // Write Tailwind CSS configuration
    fs.writeFileSync(
      "tailwind.config.js",
      `module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};`
    );

    // Add Tailwind CSS to index.css
    fs.writeFileSync(
      "src/index.css",
      `@tailwind base;
@tailwind components;
@tailwind utilities;`
    );

    // Step 6: Configure TypeScript Aliases
    console.log("Configuring TypeScript aliases...");
    const tsconfigPath = "tsconfig.json";
    const tsconfigContent = {
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/*": ["./src/*"],
        },
      },
    };
    fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfigContent, null, 2));

    // Step 7: Configure Vite Aliases
    console.log("Configuring Vite aliases...");
    const viteConfigPath = "vite.config.js";
    const aliasConfig = `
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
`;
    fs.writeFileSync(viteConfigPath, aliasConfig);

    // Step 8: Initialize ShadCN
    console.log("Initializing ShadCN...");
    try {
      execSync(`npx shadcn@latest init -d`, { stdio: "inherit", shell: true });
    } catch (error) {
      throw new Error(`ShadCN initialization failed.`);
    }

    // Step 9: Replace App.jsx with Component
    console.log("Replacing App.jsx...");
    const appPath = path.join("src", "App.jsx");

    const updatedComponent = componentContent.replace(
      /export\s+default\s+function\s+([a-zA-Z0-9_$]*)?/,
      "function App"
    );
    const finalComponent = `${updatedComponent}\n\nexport default App;`;
    fs.writeFileSync(appPath, finalComponent);

    // Ensure Tailwind or any CSS is imported in main.jsx
    const mainPath = path.join("src", "main.jsx");
    const mainContent = fs.readFileSync(mainPath, "utf-8");
    if (!mainContent.includes("import './index.css';")) {
      fs.writeFileSync(mainPath, `import './index.css';\n${mainContent}`);
    }

    // Step 10: Build the Project
    console.log("Building the project...");
    execSync("npm run build", { stdio: "inherit" });

    // Step 11: Deploy to Surge
    console.log("Deploying to Surge...");
    const distPath = path.join(projectPath, "dist");
    if (!fs.existsSync(distPath)) {
      throw new Error(`Build directory not found: ${distPath}`);
    }

    const surgeDomain = `https://${projectName}-${Date.now()}.surge.sh`;
    execSync(`surge ${distPath} ${surgeDomain} --token 83f152f16aa4ec10384cee9dddc3f674`, { stdio: "inherit" });

    console.log(`Deployment completed successfully! Access your app at:`);
    console.log(`${surgeDomain}`);

    return `${surgeDomain}`;
  } catch (error) {
    console.error("Error occurred:", error.message);
    throw error;
  } finally {
    // Cleanup project folder
    if (fs.existsSync(PROJECT_DIR)) {
      console.log("Cleaning up project folder...");
      rimraf.sync(PROJECT_DIR);
    }
  }
}

// API Route to handle component building and deployment
app.post("/build", async (req, res) => {
  const { code } = req.body;

  try {
    if (!code) {
      return res.status(400).json({ error: "No code provided" });
    }

    // Decode base64 and write to file
    // Step 2: Decode the Base64 string
const decodedCode = Buffer.from(code.trim(), "base64").toString("utf-8");
    if (fs.existsSync(TEMP_COMPONENT_FILE)) {
      fs.unlinkSync(TEMP_COMPONENT_FILE); // Remove previous component
    }
    fs.writeFileSync(TEMP_COMPONENT_FILE, decodedCode);

    // Perform operations
    const url = await buildReactVite(TEMP_COMPONENT_FILE);

    // Respond with the deployment URL
    res.json({ success: true, url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    // Cleanup component file
    if (fs.existsSync(TEMP_COMPONENT_FILE)) {
      console.log("Cleaning up component file...");
      fs.unlinkSync(TEMP_COMPONENT_FILE);
    }
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
