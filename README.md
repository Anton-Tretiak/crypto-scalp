# Scalp Screener

Скринер монет Binance для скальпинга и глубокий анализ топ-5 монет: импульсы, уровни, плотности, лента, оценка лонг/шорт, рекомендации по стопам. Работает в браузере на публичном API Binance, ключи не нужны.

Подробности об архитектуре, формулах и порядке работы над проектом — в [CLAUDE.md](./CLAUDE.md).

## Быстрый старт

```bash
npm install
npm run dev      # http://localhost:5173
```

## Публикация на GitHub Pages

1. Создайте репозиторий на GitHub и загрузите проект:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<логин>/<репозиторий>.git
   git push -u origin main
   ```
2. В репозитории откройте **Settings → Pages** и в поле **Source** выберите **GitHub Actions**.
3. Дождитесь зелёной галочки во вкладке **Actions**. Сайт появится по адресу `https://<логин>.github.io/<репозиторий>/`.

После этого каждый `git push` в `main` автоматически запускает тесты, собирает и публикует новую версию.

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | локальная разработка с автоперезагрузкой |
| `npm test` | юнит-тесты |
| `npm run build` | сборка в `dist/` |
| `npm run preview` | просмотр собранной версии |
