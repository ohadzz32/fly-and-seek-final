# מערכת מעקב אחר כלי טיס - Fly and Seek

## תכונות עיקריות

### ✅ סעיף 6: אזור חיפוש רגיל (מומש)

המערכת תומכת בפתיחת אזור חיפוש למטוסים עם היכולות הבאות:

#### שימוש:
1. **לחץ קליק ימני** על מטוס במפה
2. **בחר "פתח אזור חיפוש רגיל"** מהתפריט
3. המטוס יקפא במקום ויופיע עיגול ירוק מתרחב סביבו
4. המטוס המקורי ימשיך לנוע כ**"טראק רפאים"** (אפור) עם קו אפור המחבר לנקודת הקיפאון
5. **לחץ קליק ימני שוב** על המטוס הקפוא או על הטראק הרפאים לסגירת אזור החיפוש

#### מאפיינים טכניים:
- **העיגול מתרחב** בהתאם למהירות המטוס בזמן הקיפאון (+ 50% מרווח בטיחות)
- **טראק רפאים** - המטוס הנע ממשיך להיות מוצג באפור
- **קו חיבור** - קו אפור מחבר בין המטוס הקפוא לטראק הרפאים
- **סגירה** - כל אזורי החיפוש נעלמים והמטוס חוזר למצבו הרגיל

---

## ארכיטקטורה ועקרונות SOLID

הקוד עבר רפקטורינג מלא לפי עקרונות **SOLID**:

### 1. **Single Responsibility Principle (SRP)**
כל מודול אחראי על משימה אחת בלבד:

- **`useSearchAreas`** - ניהול מצב אזורי החיפוש
- **`useContextMenu`** - ניהול תפריט הקליק הימני
- **`useSearchAreaLayers`** - יצירת שכבות המפה
- **`AircraftContextMenu`** - תצוגת התפריט בלבד
- **`searchAreaUtils`** - חישובים ועזרים

### 2. **Open/Closed Principle (OCP)**
הקוד פתוח להרחבה אך סגור לשינוי:

```typescript
// קל להוסיף סוגי אזור חיפוש חדשים
interface SearchArea {
  searchType: 'regular' | 'smart' | 'advanced'; // קל להרחיב
}
```

### 3. **Liskov Substitution Principle (LSP)**
ממשקים מוגדרים בבירור:

```typescript
export interface IFlight { ... }
export interface SearchArea extends IFlight { ... }
```

### 4. **Interface Segregation Principle (ISP)**
ממשקים קטנים וממוקדים - כל hook מחזיר רק את מה שצריך.

### 5. **Dependency Inversion Principle (DIP)**
תלות ב-abstractions ולא ב-implementations - שימוש ב-TypeScript interfaces.

---

## מבנה הקבצים (Frontend)

```
frontend/src/
├── components/
│   ├── AircraftContextMenu.tsx    # קומפוננטת תפריט קליק ימני
│   ├── ColorPicker.tsx
│   ├── LoadingSpinner.tsx
│   └── ModeSelector.tsx
├── hooks/
│   ├── useSearchAreas.ts          # ניהול אזורי חיפוש
│   ├── useContextMenu.ts          # ניהול תפריט
│   ├── useSearchAreaLayers.ts     # יצירת שכבות מפה
│   ├── useFlightData.ts
│   ├── useBirdData.ts
│   ├── useMapReady.ts
│   └── useSystemMode.ts
├── utils/
│   ├── searchAreaUtils.ts         # פונקציות עזר לחישובים
│   ├── colorUtils.ts
│   ├── deadReckoning.ts
│   └── validators.ts
├── types/
│   ├── Flight.types.ts            # הגדרות טיפוסים
│   └── Config.types.ts
├── constants/
│   └── mapConfig.ts
└── App.tsx                         # קומפוננטה ראשית (פשוטה ונקייה)
```

---

## שיפורים שבוצעו

### ✨ קוד נקי וקריא
- **הפרדה ברורה** בין לוגיקה, UI ו-state management
- **תיעוד מלא** בעברית לכל פונקציה
- **שמות משתנים** תיאוריים וברורים

### 🎯 עקרונות SOLID
- כל קומפוננטה ו-hook עם אחריות יחידה
- קוד מודולרי שקל להרחבה
- ממשקים מוגדרים היטב

### 🚀 ביצועים
- **useMemo** לשכבות המפה - מחשב מחדש רק כשצריך
- **אנימציה חלקה** (33 FPS) להתרחבות העיגול
- **עדכוני state** אופטימליים

### 🛡️ Type Safety
- **TypeScript** מלא עם types מפורטים
- **JSDoc** לכל פונקציה ציבורית
- אין שימוש ב-`any` ללא הצדקה

---

## התקנה והרצה

### דרישות מקדימות
- Node.js 18+
- MongoDB
- npm או yarn

### הרצת הפרויקט

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend (טרמינל נפרד)
cd frontend
npm install
npm run dev
```

הפרונטאנד יהיה זמין ב: `http://localhost:5174`

---

## API Documentation

### מצבי מערכת
- **REALTIME** - מעקב בזמן אמת
- **SNAP** - תמונת מצב
- **OFFLINE** - מצב לא מקוון (ציפורים)

### Endpoints
- `GET /api/flights` - קבלת כל המטוסים
- `PATCH /api/flights/:id/color` - עדכון צבע מטוס
- `GET /api/config/mode` - קבלת מצב נוכחי
- `PATCH /api/config/mode` - שינוי מצב

---

## מה הלאה?

### תכונות עתידיות:
- ⏳ **אזור חיפוש חכם** (סעיף 6 - חלק ב')
- 📊 היסטוריית תנועות מטוס
- 🎨 צבעים דינמיים לפי גובה/מהירות
- 🔔 התראות על חריגות

---

## רישיון
MIT License

---

## תורמים
נבנה עם ❤️ על ידי GitHub Copilot
