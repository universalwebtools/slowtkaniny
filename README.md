# Slow Motion Tracker (GitHub + Firebase)

To jest świeża, niezależna wersja trackera tkanin (lista po lewej, kolory po prawej).
Domyślnie działa lokalnie (offline) i zapisuje dane w przeglądarce.
Opcjonalnie może synchronizować wszystko do chmury (Firebase Firestore).

## 1) Start lokalnie
Otwórz `index.html` w przeglądarce.

> Uwaga: logowanie Firebase zwykle NIE działa z `file://`.
> Do chmury użyj GitHub Pages / Firebase Hosting / localhost.

## 2) Chmura (Firebase) — bez edycji plików
1. Wejdź w **Ustawienia → Chmura (Firebase)**.
2. W Firebase Console utwórz nowy projekt, dodaj aplikację web.
3. Skopiuj obiekt `firebaseConfig` i wklej do pola **firebaseConfig (JSON)**.
4. Ustaw `Workspace ID` (np. `studio`) — to wspólna baza danych.
5. Kliknij **Zapisz konfigurację**, potem **Zaloguj**, potem **Synchronizuj**.

### Firebase: co włączyć
- **Firestore Database** (Production / test wg potrzeb)
- **Authentication** → Sign-in method:
  - Google (zalecane) lub Anonymous (gdy nie chcesz logowania)

### Firestore Rules (przykład: tylko zalogowani)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /slowMotionTrackerWorkspaces/{workspaceId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## 3) GitHub Pages (hosting)
1. Stwórz repo na GitHubie i wrzuć wszystkie pliki z tego folderu.
2. Repo → Settings → Pages → Deploy from branch (main) → /root.
3. Otwórz stronę i skonfiguruj chmurę w ustawieniach.

### Autoryzowane domeny dla logowania Google
W Firebase Console:
Authentication → Settings → Authorized domains
dodaj:
- `YOUR_GITHUB_USERNAME.github.io` (np. `loliwtfomg-jpg.github.io`)
- oraz ewentualnie własną domenę

## 4) Firebase Hosting (alternatywa)
Możesz hostować też na Firebase Hosting (opcjonalnie), ale sam tracker działa jako zwykła strona statyczna.

---
Kolekcje/tkaniny/kolory w `seed.js` są wygenerowane z Twojego Excela.


## Aktualizacja z listy MP4
Seed jest zaktualizowany na podstawie eksportu listy plików MP4 (te kolory są oznaczone jako ✓ nagrane).
W tej wersji zmienił się klucz zapisu w przeglądarce (v17), więc Chrome/Edge nie wciągną starego stanu.


## GitHub Pages update tip
If the page looks empty after updating files, an old Service Worker/cache may be serving stale scripts. Do a hard refresh (Ctrl+F5) or clear site data.
