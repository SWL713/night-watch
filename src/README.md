# CME DASHBOARD V3 - ALL FIXES

## ✅ CHANGES IN V3:

1. ✅ Shrunk tab buttons (0.35rem padding, 0.8rem font)
2. ✅ Shrunk banner (0.4rem padding)
3. ✅ Teal button style matching Space Weather
4. ⚠️ **Bottom nav integration needed** - See below
5. ✅ Fixed visualization aspect ratio (1000x140)
6. ✅ STEREO-A positioned upstream, offset to side
7. ✅ Visualization at TOP 20%, cards get 80%
8. ✅ Compressed card text (0.75rem → 0.7rem)
9. ✅ CME selector buttons under classification panel (horizontal)

---

## ⚠️ BOTTOM NAVIGATION BAR

Your app has a bottom navigation bar (Map, Space Weather, Substorm Timing, etc.).

**The CME Dashboard needs to integrate with this existing pattern.**

I can't see your full app structure, but here's how to integrate:

### If you have a `BottomNav.jsx` component:
```jsx
// In your App.jsx or main routing file:
import CMEDashboard from './components/CMEDashboard';
import BottomNav from './components/BottomNav';

function App() {
  const [currentView, setCurrentView] = useState('map');

  return (
    <div className="app">
      {currentView === 'map' && <MapView />}
      {currentView === 'space-weather' && <SpaceWeatherView />}
      {currentView === 'cme' && <CMEDashboard />}
      {currentView === 'substorm' && <SubstormView />}
      
      <BottomNav 
        currentView={currentView}
        onNavigate={setCurrentView}
      />
    </div>
  );
}
```

### Update BottomNav to include CME button:
```jsx
<button 
  className={currentView === 'cme' ? 'active' : ''}
  onClick={() => onNavigate('cme')}
>
  CME Dashboard
</button>
```

---

## 🚀 DEPLOYMENT:

### Step 1: Replace Files
Extract and copy to your repo:
- All .jsx and .css files from `/components`
- `useCMEData.js` from `/hooks`

### Step 2: Integrate Bottom Nav
Follow pattern above to add CME Dashboard to your navigation

### Step 3: Git Push
```bash
cd "C:\GitHub Repos\night-watch"
git add src/components/CME* src/hooks/useCMEData.js
git commit -m "CME Dashboard V3 - compact teal theme, viz fixes, bottom nav ready"
git pull --rebase origin main
git push origin main
```

### Step 4: Deploy
Trigger workflow at: https://github.com/SWL713/night-watch/actions
