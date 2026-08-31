# Промты для Grok Imagine (фоны и видеолупы)

Рабочий процесс: сначала генерируем **картинку** (постер), отбираем лучшую,
затем через image-to-video **оживляем** её — так стиль всех роликов будет
единым, а постер сразу становится фолбэком для экрана. Промты на английском
(модели понимают их стабильнее), пояснения — по-русски.

## Правила для всех генераций

- Формат **16:9**, горизонталь.
- **Никакого текста в кадре** — цены и названия мы кладём HTML-слоем.
- Композиция: объект в **левой трети** кадра, правые ⅔ уходят в ровный
  тёмный фон — там будет меню.
- Движение медленное, «рекламное», без резких смен плана.
- Для лупа добавляем: *seamless loop, the last frame matches the first frame*.
- Генерировать по 3–4 варианта, отбраковывать: текст/буквы в кадре, руки и
  лица, пересвет справа, дёрганое движение.

## Стилевой якорь (добавлять в конец каждого промта)

```
Premium dark coffee shop advertisement style, deep espresso brown and matte
black background, warm amber rim lighting, soft cinematic studio light,
photorealistic, ultra detailed, 4k, shallow depth of field, subject in the
left third of the frame, right side of the frame fades into a plain dark
brown background, no text, no letters, no logo, no watermark, no people,
no hands
```

---

## Экран 1 — «Горячие напитки»

**Постер (image):**
```
A glass cup of layered latte with dense milk foam on a dark walnut counter,
scattered roasted coffee beans, one gentle wisp of steam rising, a small
copper milk pitcher beside it + стилевой якорь
```

**Видео 1 — пролив молока (главный луп):**
```
Slow motion advertisement shot: steamed milk being poured into a glass of
espresso, latte layers slowly swirling and settling, gentle steam rising,
camera locked off, seamless loop, the last frame matches the first frame
+ стилевой якорь
```

**Видео 2 — пар и зёрна:**
```
Cinemagraph style: a ceramic cup of black coffee, soft steam slowly curling
upward, a few coffee beans gently falling in extreme slow motion and landing
softly around the cup, everything else still, seamless loop + стилевой якорь
```

**Видео 3 — раф/карамель:**
```
Extreme slow motion: warm caramel sauce drizzling down the inside of a glass
of creamy raf coffee, tiny popcorn pieces resting on whipped cream, soft
amber glow, camera locked off, seamless loop + стилевой якорь
```

---

## Экран 2 — «Холодные напитки»

**Постер (image):**
```
A tall glass of iced berry lemonade with condensation droplets, ice cubes,
fresh mint and strawberries, next to a glass of iced latte with cream
swirling into cold coffee, cool backlight with warm amber accents
+ стилевой якорь
```

**Видео 1 — лёд и splash (главный луп):**
```
Slow motion advertisement shot: a single ice cube falling into a tall glass
of citrus lemonade, gentle elegant splash, bubbles rising, mint leaf
floating down, droplets of condensation on the glass, seamless loop
+ стилевой якорь
```

**Видео 2 — вливание сливок в айс-кофе:**
```
Macro slow motion: cold cream slowly pouring into a glass of iced black
coffee over ice cubes, beautiful clouds of cream blooming and swirling in
the dark coffee, seamless loop + стилевой якорь
```

**Видео 3 — бабл-ти:**
```
Slow motion: dark tapioca pearls sinking one by one through creamy pink
strawberry bubble tea in a tall glass, soft bubbles rising, gentle swirl,
seamless loop + стилевой якорь
```

---

## Экран 3 — «Завтраки»

**Постер (image):**
```
A golden flaky croissant on a dark ceramic plate, soft steam, a stack of
fluffy syrniki pancakes with a glossy honey drizzle, fresh berries, a small
bowl of oatmeal porridge with banana slices, cozy morning side light
+ стилевой якорь
```

**Видео 1 — мёд на оладьях (главный луп):**
```
Extreme slow motion advertisement shot: golden honey drizzling onto a stack
of fluffy pancakes, honey slowly flowing down the sides, a few berries
resting on top, soft morning light, camera locked off, seamless loop
+ стилевой якорь
```

**Видео 2 — сборка сэндвича (реклама-стиль):**
```
Slow motion food commercial: a sandwich assembling itself in mid air,
ingredients gently falling and stacking one by one - bread slice, lettuce
leaf, tomato slices, ham, cheese - landing softly into a perfect sandwich,
seamless loop + стилевой якорь
```

**Видео 3 — круассан и пар:**
```
Cinemagraph style: a warm golden croissant being gently torn open in
extreme slow motion, delicate flaky layers, soft steam escaping,
crumbs floating slowly, seamless loop + стилевой якорь
```

---

## Экран 4 — «Фастфуд и десерты»

**Постер (image):**
```
A grilled chicken shawarma wrap cut in half showing juicy layers of chicken,
fresh vegetables and sauce, golden french fries in a dark paper cup,
crispy nuggets, one glazed donut on the side, appetizing warm light
+ стилевой якорь
```

**Видео 1 — сборка шаурмы (главный луп, референс McDonald's):**
```
Slow motion food commercial: shawarma ingredients gently falling and
layering in mid air onto an open flatbread - shredded cabbage, grilled
chicken pieces, tomato slices, red onion rings, cucumber, a ribbon of
garlic sauce - then the flatbread softly wraps itself into a perfect
shawarma roll, seamless loop + стилевой якорь
```

**Видео 2 — фри:**
```
Slow motion: golden crispy french fries flying up and falling gently into
a dark paper cup, a few salt crystals sparkling in the air, warm amber
backlight, seamless loop + стилевой якорь
```

**Видео 3 — десерт:**
```
Extreme slow motion: warm chocolate glaze pouring over a glazed donut on a
dark plate, glaze slowly dripping down the sides, a light dusting of sugar
powder falling like snow, seamless loop + стилевой якорь
```

---

## Технические требования к результату

| Параметр | Значение |
|---|---|
| Видео | MP4 H.264, 1920×1080, 24–30 fps, 6–15 с, ≤ 20 МБ |
| Постеры | JPG/PNG 1920×1080 |
| Именование | `screen-1-a.mp4`, `screen-1-b.mp4`, … `screen-1.jpg` |
| Звук | не нужен (дорожку удаляем — экраны без звука) |

Если луп всё равно «стыкуется» заметно — не страшно: плеер на экране
кроссфейдит стык двумя `<video>`. Если Grok упорно рисует текст или руки —
усилить в промте: *absolutely no text, no letters, no typography, no hands*.
