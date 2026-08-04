(function () {
  var capacitor = window.Capacitor;
  if (!capacitor || typeof capacitor.isNativePlatform !== "function" || !capacitor.isNativePlatform()) {
    return;
  }

  var splash = capacitor.Plugins && capacitor.Plugins.SplashScreen;
  if (!splash || typeof splash.hide !== "function") {
    return;
  }

  var hideSplash = function () {
    splash.hide().catch(function (error) {
      if (window.console && typeof window.console.warn === "function") {
        window.console.warn("Failed to hide native splash screen.", error);
      }
    });
  };

  if (document.readyState === "complete") {
    hideSplash();
    return;
  }

  window.addEventListener("load", hideSplash, { once: true });
})();
