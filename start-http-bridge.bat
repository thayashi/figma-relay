@echo off
REM Start the Figma HTTP Bridge server
REM Exposes REST API on localhost:3056 for curl / script access to Figma
npx tsx src/http-bridge.ts %*
