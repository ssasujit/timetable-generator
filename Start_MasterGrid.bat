@echo off
title MasterGrid Server
echo ===================================================
echo      Starting MasterGrid Backend Server...
echo ===================================================
echo.
echo Please keep this window open while using the app!
echo To stop the server, simply close this window.
echo.

:: Start the Node.js server in the background of this window
start /B node server.js

:: Wait 2 seconds for the server to fully start
timeout /t 2 /nobreak >nul

:: Open the default web browser to the correct local URL
echo Opening MasterGrid in your web browser...
start http://localhost:8082

:: Keep the window open to show logs and keep the server running
cmd /k
