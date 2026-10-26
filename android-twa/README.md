# TWA Build for Google Play

To build an Android app for Google Play:

1. Host on HTTPS or use the GitHub Pages served URL.
2. Use Bubblewrap (https://github.com/GoogleChromeLabs/bubblewrap) or PWABuilder (https://www.pwabuilder.com) to generate an Android Project from manifest.webmanifest.
3. Use Play App Signing, generate AAB, and publish.

App details:
- Application ID: com.codefyx.apexdrift
- Short name: Apex Drift
- Display: fullscreen/standalone
- Orientation: landscape
- Start URL: ./index.html?source=pwa

The current manifest.webmanifest and icons are ready for TWA generation.
