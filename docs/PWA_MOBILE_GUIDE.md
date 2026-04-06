# PWA & Mobile Implementation Guide

## Overview
Rumi has been transformed into a Progressive Web App (PWA) with full mobile support. The application now features:

- ✅ **Installable** - Can be installed as a native app on mobile and desktop
- ✅ **Offline Support** - Works offline with cached data and assets
- ✅ **Mobile-Optimized UI** - Responsive design with touch-friendly interactions
- ✅ **Service Worker** - Background caching and sync capabilities
- ✅ **App-like Experience** - Full-screen mode with native feel

## Features Implemented

### 1. PWA Configuration
- **Manifest**: `/public/manifest.json` with app metadata
- **Icons**: Multiple sizes (192x192, 512x512) with maskable variants
- **Theme Colors**: Dark theme (#0c0c0c) matching the app design
- **Service Worker**: Automatic caching with Workbox strategies

### 2. Mobile UI Components

#### MobileHeader (`/src/components/MobileHeader.tsx`)
- Fixed header at top on mobile devices
- Logo on the left, hamburger menu on the right
- Smooth transitions and touch-friendly buttons (44x44px minimum)

#### Responsive Sidebar (`/src/components/Sidebar.tsx`)
- Desktop: Always visible sidebar
- Mobile: Slide-out drawer from left
- Smooth 300ms animation
- Touch-friendly navigation items

#### Layout (`/src/components/Layout.tsx`)
- Responsive breakpoint at 1024px (lg)
- Mobile state management for drawer
- Backdrop overlay when drawer is open
- Swipe-to-close gesture support
- Body scroll prevention when drawer is open

### 3. PWA Install Prompt

#### PWAInstallBanner (`/src/components/PWAInstallBanner.tsx`)
- Appears when app is installable
- Dismissible banner with install button
- Slide-up animation
- Positioned at bottom of screen

#### usePWAInstall Hook (`/src/hooks/usePWAInstall.ts`)
- Detects PWA install capability
- Manages install prompt state
- Handles install events

### 4. Offline Support
- **Offline Page**: `/public/offline.html` with matching design
- **Caching Strategies**:
  - Google Fonts: CacheFirst (1 year)
  - API calls: NetworkFirst (1 day cache)
  - Static assets: CacheFirst
  - Analysis endpoints: NetworkFirst (1 hour cache)

### 5. Touch-Friendly Design
- Minimum tap target size: 44x44px
- Touch-manipulation CSS for better responsiveness
- Proper spacing on mobile (px-5 instead of px-8)
- Responsive text sizes (text-xl sm:text-2xl)

## Responsive Breakpoints

```css
Mobile:  < 1024px  (drawer mode)
Desktop: ≥ 1024px  (permanent sidebar)
```

## File Structure

```
frontend/
├── public/
│   ├── manifest.json           # PWA manifest
│   ├── offline.html            # Offline fallback page
│   └── icons/
│       ├── icon-192.png        # Standard icon
│       ├── icon-512.png        # Standard icon
│       ├── icon-maskable-192.png
│       └── icon-maskable-512.png
├── src/
│   ├── components/
│   │   ├── Layout.tsx          # Responsive layout with mobile support
│   │   ├── Sidebar.tsx         # Drawer-enabled sidebar
│   │   ├── MobileHeader.tsx    # Mobile-only header
│   │   └── PWAInstallBanner.tsx
│   ├── hooks/
│   │   └── usePWAInstall.ts    # PWA install detection
│   └── pages/
│       └── Dashboard.tsx       # Mobile-optimized spacing
└── vite.config.ts              # PWA plugin configuration
```

## Testing the PWA

### Local Development
```bash
cd frontend
npm run dev
```

The PWA features are enabled in development mode for testing.

### Production Build
```bash
cd frontend
npm run build
npm run preview
```

### Testing on Mobile Device

1. **Build and serve the app**:
   ```bash
   npm run build
   npm run preview -- --host
   ```

2. **Access from mobile device**:
   - Find your local IP: `ifconfig` or `ipconfig`
   - Open `http://YOUR_IP:4173` on mobile browser

3. **Install the PWA**:
   - Chrome/Edge: "Add to Home Screen" prompt
   - Safari: Share → "Add to Home Screen"

### Testing Offline Mode

1. Open DevTools → Application → Service Workers
2. Check "Offline" checkbox
3. Reload the page - should show cached content
4. Navigate - should work with cached data

## Mobile UI Behavior

### Desktop (≥ 1024px)
- Sidebar always visible on the left
- No mobile header
- Standard desktop layout

### Mobile (< 1024px)
- Mobile header fixed at top
- Sidebar hidden by default
- Hamburger menu opens drawer from left
- Backdrop overlay when drawer is open
- Swipe left to close drawer
- Tap backdrop to close drawer
- Body scroll locked when drawer is open

## Key Features

### 1. Installability
The app can be installed on:
- Android (Chrome, Edge, Samsung Internet)
- iOS (Safari - Add to Home Screen)
- Desktop (Chrome, Edge)

### 2. Offline Functionality
- Static assets cached automatically
- API responses cached with NetworkFirst strategy
- Offline fallback page shown when no connection
- Service worker updates automatically

### 3. Mobile Gestures
- **Swipe left** on drawer to close
- **Tap backdrop** to close drawer
- **Touch-friendly** buttons (minimum 44x44px)

### 4. Performance
- Lazy loading of routes
- Optimized bundle size
- Hardware-accelerated animations
- Efficient caching strategies

## Customization

### Changing Theme Colors
Edit `frontend/public/manifest.json`:
```json
{
  "theme_color": "#0c0c0c",
  "background_color": "#0c0c0c"
}
```

### Adjusting Mobile Breakpoint
Edit `frontend/src/components/Layout.tsx`:
```typescript
const checkMobile = () => {
  setIsMobile(window.innerWidth < 1024); // Change 1024 to your preferred breakpoint
};
```

### Modifying Cache Strategies
Edit `frontend/vite.config.ts` in the `workbox.runtimeCaching` section.

## Browser Support

- ✅ Chrome/Edge (Android & Desktop)
- ✅ Safari (iOS & macOS)
- ✅ Firefox (Android & Desktop)
- ✅ Samsung Internet
- ⚠️ iOS Safari has limited PWA features

## Troubleshooting

### PWA not installing
- Ensure HTTPS (or localhost)
- Check manifest.json is accessible
- Verify icons are loading
- Check browser console for errors

### Service Worker not updating
- Hard refresh (Ctrl+Shift+R)
- Clear site data in DevTools
- Check "Update on reload" in DevTools → Application → Service Workers

### Mobile drawer not working
- Check browser console for errors
- Verify breakpoint detection
- Test touch events in mobile DevTools

## Next Steps

1. **Test on real devices** at various screen sizes
2. **Add more offline features** (background sync, push notifications)
3. **Optimize performance** with code splitting
4. **Add app shortcuts** in manifest.json
5. **Implement update notifications** when new version is available

## Resources

- [PWA Documentation](https://web.dev/progressive-web-apps/)
- [Workbox Guide](https://developers.google.com/web/tools/workbox)
- [Web App Manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
