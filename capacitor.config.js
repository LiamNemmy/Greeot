const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const serverUrl = process.env.CAP_SERVER_URL?.trim();

/** @type {import('@capacitor/cli').CapacitorConfig} */
const config = {
  appId: "com.greeot.mobile",
  appName: "Greeot Mobile",
  webDir: "mobile-web",
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: "#0b0b0bff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    }
  },
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          cleartext: serverUrl.startsWith("http://")
        }
      }
    : {})
};

module.exports = config;
