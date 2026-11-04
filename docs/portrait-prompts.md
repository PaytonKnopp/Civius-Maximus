# Leader portrait prompts

Everything needed to make the 30 painted leader portraits with an image AI (ChatGPT image generation, Midjourney, Gemini, Flux, Ideogram, Firefly...). The game already knows how to use them; see [portrait-style-guide.md](portrait-style-guide.md) for the technical rules. **Nothing here changes the game until the images are added.**

## The workflow (about two hours for all 30)

1. **Start one chat (or one Midjourney session) and keep every portrait in it.** One model, one session, is the single biggest factor in all 30 looking like one set.
2. Paste the **Master brief** below once.
3. Make the **anchor portrait first** (Julius Caesar). Regenerate until you love it: this one image sets the look of the whole game. Keep it.
4. For each of the other 29, paste that leader's prompt **and attach the Caesar portrait**, adding: "Match the painting style, light, brushwork, colour handling and framing of the attached reference portrait exactly. Only the person, costume and background colour change." (In Midjourney use the anchor with `--sref <image url>` instead, and add `--ar 5:6`.)
5. Generate four at a time and pick the best. Check each against the **checklist** at the bottom.
6. Save each as `leader_<name>.png` (the id is in each heading below; PNG or JPG at any size from 1000 px wide is fine, **I handle the cropping to 5:6, resizing and WebP conversion**).
7. Hand them back (drop the files into the repository folder `packages/client/public/leaders/`, or attach them in a Claude session) and say "portraits are in". I will convert, wire up every `portrait.image`, and check them in the gallery at desktop, tablet and phone size.

**Do the images in batches if you like.** Any leader without an image keeps its drawn portrait, so a half-finished set is fine to ship.

## Master brief (paste this first)

```text
I am making the leader portraits for a historical strategy game. I will give you one historical leader at a time and you will paint their portrait. Every portrait must look like it was painted by the same artist, in the same session, for the same book, so consistency matters more than anything else.

THE LOOK (the same for every leader)
- A painted historical portrait, like a museum oil painting brought to life: soft but visible brushwork, fine canvas texture, rich but slightly muted colours. Never line art, never anime or cartoon, never photographic, never a 3D render, never glossy.
- One warm golden key light from the upper left, a soft cool fill, a thin rim light on the right shoulder. Late-afternoon gold. Skin keeps warm highlights and cool shadows.
- Three-quarter view, the head and shoulders only, the face centred, the eyes about 40% down from the top, a little air above the head. The shoulders are cropped by the bottom edge. Portrait orientation, ratio 5:6.
- The background is a soft, dark, atmospheric painted wash in the colour I name, a little lighter behind the head and darker toward the edges, with a faint golden glow. No scenery, no props, no text, no frame, no border.
- Expression: dignified and individual, composed, never a caricature or a grin.
- Faces must be distinct, clear and readable even when the image is shrunk to a thumbnail: a strong silhouette (hat, hair, collar) and clear eyes.

ACCURACY
- Costume, hair and jewellery plausible for the leader's time and place. Where the historical record is thin, choose what is typical of their culture rather than inventing a fantasy costume. Treat every culture with respect: no stereotypes.
- Base likenesses on the general historical record; do not copy any specific existing painting, film still, game art or photograph.

NEVER: text, captions, signatures, watermarks, logos, frames, borders, extra people, modern objects, copies of other games' art.

First task: reply "ready" and wait for the first leader.
```

## Style block (already included in every prompt below)

```text
Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of [the colour named for that leader] ([its hex]), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

Negative prompt, for tools that take one (Stable Diffusion, Flux, Midjourney `--no`):

```text
text, letters, caption, signature, watermark, logo, frame, border, anime, cartoon, 3d render, photograph, glossy plastic skin, extra fingers, extra people, scenery, modern clothing, sunglasses, blurry face, asymmetrical eyes, deformed hands
```

## Per-leader prompts

Each prompt is complete on its own. The id is the file name to save it as. Order: start with Caesar (the anchor), then any order.

### 1. Julius Caesar, Rome  (anchor: make this one first)

- File: `leader_caesar.png`  |  Backdrop: deep Roman crimson (#7a1f2b)  |  Dictator of Rome

```text
Julius Caesar, dictator of Rome, about 55, lean long face with high cheekbones and a prominent nose, short thinning hair combed forward, clean-shaven. He wears a golden laurel wreath and a deep purple toga with gold trim draped over a white tunic, one shoulder covered by the heavy folds. Expression: stern, calculating, a faint tightness at the mouth. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep Roman crimson (#7a1f2b), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 2. Cleopatra, Egypt

- File: `leader_cleopatra.png`  |  Backdrop: deep teal-blue (#1f5f7a)  |  Pharaoh of the Two Lands

```text
Cleopatra VII, Ptolemaic queen and pharaoh, about 30, heart-shaped face, warm olive-brown skin, kohl-lined dark eyes, a straight black bob wig with fine gold beads. A slim gold circlet with a rearing cobra at the brow, a broad gold-and-lapis collar, and a pleated white linen gown with a teal trim. Expression: a small, knowing smile, intelligent and magnetic. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep teal-blue (#1f5f7a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 3. Alexander the Great, Macedon

- File: `leader_alexander.png`  |  Backdrop: deep violet-indigo (#3b2a6b)  |  King of Macedon

```text
Alexander the Great, King of Macedon, about 25, strong square jaw, clean-shaven, tousled golden-brown curly hair swept back, bright restless eyes. A crimson linen-and-bronze cuirass with gold trim and a crimson cloak pinned at the shoulder with a gold sunburst brooch. No crown or helmet. Expression: calm and far-seeing, his gaze lifted slightly, a trace of restless ambition. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep violet-indigo (#3b2a6b), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 4. Genghis Khan, Mongols

- File: `leader_genghis.png`  |  Backdrop: dark forest green (#2c5f4a)  |  Great Khan of the Mongols

```text
Genghis Khan, Great Khan of the Mongols, about 60, broad weathered round face, high cheekbones, narrow dark eyes, a thin grey-black moustache and small goatee, thin braids at the temples. A felt hat with a fur brim, a blue silk del with gold trim and a heavy fur collar. Expression: stern and unreadable, the calm of a man who has never lost a fight. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of dark forest green (#2c5f4a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 5. Elizabeth I, England

- File: `leader_elizabeth.png`  |  Backdrop: deep Tudor red (#a11d21)  |  Queen of England

```text
Elizabeth I of England, about 45, pale oval face, high forehead, red-gold hair frizzed and curled, a jewelled diadem. A black gown embroidered with silver thread, a large white lace cartwheel ruff, ropes of pearls, a slender hand resting at her collar. Expression: composed and watchful, lips closed, regal and a little guarded. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep Tudor red (#a11d21), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 6. Napoleon Bonaparte, France

- File: `leader_napoleon.png`  |  Backdrop: deep royal blue (#1d3b8a)  |  Emperor of the French

```text
Napoleon Bonaparte, Emperor of the French, about 40, pale oval face, short dark-brown hair combed forward over the brow, grey-blue eyes. A black bicorne worn sideways with a small tricolour cockade, a dark blue officer coat with gold epaulettes and a red-ribboned Legion of Honour cross, a white waistcoat. Expression: stern and intent, one eyebrow slightly raised. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep royal blue (#1d3b8a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 7. Abraham Lincoln, United States

- File: `leader_lincoln.png`  |  Backdrop: deep navy blue (#24477d)  |  President of the United States

```text
Abraham Lincoln, President of the United States, about 55, tall and gaunt, deeply lined long face, a dark chin beard with no moustache, thick black hair, deep-set kind tired eyes. A black stovepipe hat, a black frock coat, a white shirt and a black bow tie. Expression: grave and gentle, the weight of the war in his eyes. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep navy blue (#24477d), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 8. Qin Shi Huang, China

- File: `leader_qin.png`  |  Backdrop: dark antique gold-ochre (#b8862b)  |  First Emperor of China

```text
Qin Shi Huang, First Emperor of China, about 40, strong square face, a thin moustache and a small beard, hair in a black topknot under a mian crown (a flat board with hanging strings of jade beads). A black silk dragon robe with red trim and embroidered golden clouds. Expression: severe and absolute, unblinking. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of dark antique gold-ochre (#b8862b), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 9. Mansa Musa, Mali

- File: `leader_mansa.png`  |  Backdrop: warm terracotta (#c2572b)  |  Mansa of Mali

```text
Mansa Musa, Mansa of Mali, about 45, warm dark-brown skin, a neatly trimmed short beard, kind and shrewd eyes. A tall golden conical crown, a white kaftan with gold embroidery at the collar, layered gold necklaces and a heavy gold pendant. Expression: a calm, generous smile, wealth worn lightly. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of warm terracotta (#c2572b), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 10. Oda Nobunaga, Japan

- File: `leader_nobunaga.png`  |  Backdrop: smoky warm grey-ivory, with a muted crimson glow near the edges (#e8e2d4)  |  Lord of Owari

```text
Oda Nobunaga, lord of Owari, about 40, long narrow face, a shaved crown with the hair gathered in a black topknot (chonmage), a thin moustache, sharp eyes. A dark indigo kimono with stiff winged shoulders (kamishimo) and a small gold family crest. Expression: stern and impatient, a restless fierce intelligence. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of smoky warm grey-ivory, with a muted crimson glow near the edges (#e8e2d4), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 11. Harald Hardrada, Norse

- File: `leader_harald.png`  |  Backdrop: dark steel blue (#2b4a6b)  |  King of Norway

```text
Harald Hardrada, King of Norway, about 50, very tall and broad, a square scarred face, long golden-blond hair and a full braided beard, pale eyes. An iron helmet with a nose guard, a grey wolf-fur mantle fastened with a bronze brooch, a glimpse of a mail shirt. Expression: stern and hard, a hint of grim humour. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of dark steel blue (#2b4a6b), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 12. Shaka, Zulu

- File: `leader_shaka.png`  |  Backdrop: dark umber brown (#3a2a1a)  |  King of the Zulu

```text
Shaka, King of the Zulu, about 35, dark brown skin, a strong oval face, closely cropped hair, no beard, a powerful and watchful presence. A leopard-skin mantle over one shoulder, a broad collar of red, white and blue glass beads and strings of beads across the chest. No headwear. Expression: stern and commanding, steady eyes. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of dark umber brown (#3a2a1a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 13. Montezuma, Aztec

- File: `leader_montezuma.png`  |  Backdrop: deep turquoise (#1f7a6b)  |  Huey Tlatoani of the Mexica

```text
Montezuma II, Huey Tlatoani of the Mexica, about 40, square face, warm brown skin, straight black hair cut at the jaw. A tall fan of green quetzal feathers on a gold and turquoise diadem, a broad turquoise mosaic collar, a turquoise-green tunic (tilmatli) with gold borders, gold ear spools. Expression: stern and solemn, the stillness of a priest-king. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep turquoise (#1f7a6b), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 14. Hannibal Barca, Carthage

- File: `leader_hannibal.png`  |  Backdrop: deep purple (#5a2a7a)  |  General of Carthage

```text
Hannibal Barca, general of Carthage, about 35, lean long weathered face, dark curly hair and a short curly beard, tired and brilliant dark eyes. A bronze Montefortino helmet worn tilted back, a bronze muscled cuirass, a Tyrian-purple cloak pinned at the shoulder with a gold brooch. Expression: stern and calculating, the patience of a man planning an impossible march. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep purple (#5a2a7a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 15. Saladin, Ayyubids

- File: `leader_saladin.png`  |  Backdrop: deep saffron gold (#c8a030)  |  Sultan of Egypt and Syria

```text
Saladin, Sultan of Egypt and Syria, about 50, long lean face, a short full grey-black beard, calm dark eyes. A white turban with a loose tail, a dark green robe with gold embroidery at the collar and cuffs over a fine mail coat. Expression: calm and dignified, merciful, slightly weary. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep saffron gold (#c8a030), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 16. Catherine the Great, Russia

- File: `leader_catherine.png`  |  Backdrop: deep amber-gold (#e8c030)  |  Empress of All the Russias

```text
Catherine the Great, Empress of All the Russias, about 45, round face with a clear complexion, powdered grey-brown hair in a high updo, a small diamond crown. A pale blue-silver silk gown trimmed with ermine, a long rope of pearls. Expression: a small, shrewd, confident smile. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep amber-gold (#e8c030), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 17. Ashoka, Maurya

- File: `leader_ashoka.png`  |  Backdrop: deep saffron-orange (#e88a2b)  |  Emperor of the Maurya

```text
Ashoka, Emperor of the Maurya, about 45, an oval face, warm brown skin, a neat moustache, black hair tied back under a gold crown set with a ruby. A saffron-orange cloth draped over one bare shoulder, ropes of gold and pearl necklaces, gold armlets. Expression: calm and reflective, serene authority. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep saffron-orange (#e88a2b), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 18. Suleiman the Magnificent, Ottomans

- File: `leader_suleiman.png`  |  Backdrop: deep crimson (#8a1520)  |  Sultan of the Ottomans

```text
Suleiman the Magnificent, Sultan of the Ottomans, about 45, a long thin face with a hooked nose, a short full dark beard, heavy-lidded eyes. A very large white turban wound in layers, a crimson silk kaftan with gold embroidery and a sable collar. Expression: composed and aloof, a poet-king. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep crimson (#8a1520), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 19. Pachacuti, Inca

- File: `leader_pachacuti.png`  |  Backdrop: deep gold-ochre (#c8a030)  |  Sapa Inca

```text
Pachacuti, Sapa Inca, about 40, a square face, warm bronze-brown skin, short straight black hair. A woven headband with a red fringe (mascapaicha) across the brow, large gold ear spools, a yellow-ochre tunic (unku) with a red-and-black geometric pattern (tocapu). Expression: stern and rigorous, absolute authority. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep gold-ochre (#c8a030), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 20. Boudica, Celts

- File: `leader_boudica.png`  |  Backdrop: deep forest green (#2a5a2a)  |  Queen of the Iceni

```text
Boudica, Queen of the Iceni, about 35, a heart-shaped face, fair freckled skin, wild flowing red hair, fierce light eyes. A heavy gold torc at her throat, a slim gold circlet, a green tunic and a checked wool cloak pinned with an enamelled brooch. Expression: stern and burning, controlled fury. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep forest green (#2a5a2a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 21. Charlemagne, Franks

- File: `leader_charlemagne.png`  |  Backdrop: deep royal blue (#2a3a8a)  |  Emperor of the West

```text
Charlemagne, Emperor of the West, about 55, a broad square face, silver-white hair and a full white beard, clear grey-blue eyes. A jewelled gold imperial crown, a royal blue mantle with gold borders and an ermine collar, a jewelled brooch at the shoulder. Expression: stern and paternal, the gaze of a lawgiver. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep royal blue (#2a3a8a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 22. Cyrus the Great, Persia

- File: `leader_cyrus.png`  |  Backdrop: dark bronze-brown (#8a6a2a)  |  King of Kings

```text
Cyrus the Great, King of Kings of Persia, about 45, a long noble face, black curled hair and a long beard in tiered ringlets (Achaemenid style), dark calm eyes. A tall fluted royal tiara, a deep purple robe with gold embroidery, gold earrings. Expression: calm and tolerant, majestic composure. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of dark bronze-brown (#8a6a2a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 23. Sejong the Great, Korea

- File: `leader_sejong.png`  |  Backdrop: deep indigo blue (#1a3a7a)  |  King of Joseon

```text
Sejong the Great, King of Joseon, about 40, a round gentle face, a small beard at the chin, thoughtful eyes. A black winged royal cap (ikseongwan) and a crimson robe with a golden dragon roundel on the chest. Expression: a mild, thoughtful smile, a scholar-king. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep indigo blue (#1a3a7a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 24. Theodora, Byzantium

- File: `leader_theodora.png`  |  Backdrop: imperial purple (#6a1a6a)  |  Empress of the Romans

```text
Theodora, Empress of the Romans in Constantinople, about 35, a heart-shaped face, dark hair, large dark expressive eyes. A gold imperial crown with strands of pearls hanging at each side (pendilia), a broad jewelled collar, a purple silk gown embroidered with gold. Expression: composed and quietly formidable, the stare of someone who survived the Hippodrome. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of imperial purple (#6a1a6a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 25. Isabella, Spain

- File: `leader_isabella.png`  |  Backdrop: dark gold (#c8a030)  |  Queen of Castile

```text
Isabella I, Queen of Castile, about 40, an oval face, fair skin, auburn hair mostly covered by a fine white veil, light eyes. A small gold crown over the veil, a deep red gown with gold embroidery and a gold collar. Expression: devout, determined and calm. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of dark gold (#c8a030), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 26. Pericles, Greece

- File: `leader_pericles.png`  |  Backdrop: deep Aegean blue (#2a5a9a)  |  First Citizen of Athens

```text
Pericles, First Citizen of Athens, about 50, a long face with a high forehead, curly grey-brown hair and a full beard, thoughtful eyes. A Corinthian helmet pushed up on top of his head, a white himation with a blue border over a chiton. Expression: measured and thoughtful, the stillness of an orator. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep Aegean blue (#2a5a9a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 27. Lady Six Sky, Maya

- File: `leader_six_sky.png`  |  Backdrop: deep jade green (#2a7a5a)  |  Queen of Sa'aal

```text
Lady Six Sky, Queen of Sa'aal (Naranjo), about 35, an oval face, warm brown skin, long black hair. A tall headdress of green quetzal feathers on a jade-studded band, jade ear flares, a necklace of jade beads, an embroidered green-and-gold huipil. Expression: stern and imperious, the poise of a war-queen. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep jade green (#2a7a5a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 28. Hammurabi, Babylon

- File: `leader_hammurabi.png`  |  Backdrop: deep lapis blue (#2a4a8a)  |  King of Babylon

```text
Hammurabi, King of Babylon, about 50, a strong square face, a long beard in tight curled rows, black curled hair, steady eyes. A round brimmed royal cap with a rolled fillet, a deep blue fringed robe embroidered with gold. Expression: stern and just, the face of a lawgiver. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep lapis blue (#2a4a8a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 29. Pedro II, Brazil

- File: `leader_pedro.png`  |  Backdrop: deep emerald green (#2a8a3a)  |  Emperor of Brazil

```text
Pedro II, Emperor of Brazil, about 60, a long gentle face, white hair and a long white beard, kind pale eyes. A black frock coat with a green-and-yellow sash and a small gold medal. Expression: a gentle, warm smile, a scholar-emperor. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep emerald green (#2a8a3a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

### 30. Menelik II, Ethiopia

- File: `leader_menelik.png`  |  Backdrop: deep green (#2a7a2a)  |  Emperor of Ethiopia

```text
Menelik II, Emperor of Ethiopia, about 50, a long face, dark brown skin, a full short dark beard, shrewd dark eyes. A gold imperial crown, a dark navy coat with gold braid and a medal on a ribbon. Expression: stern and shrewd, the face of a victor of Adwa. Painted historical portrait in the manner of a museum oil painting: soft visible brushwork, fine canvas texture, rich but slightly muted natural colours, no line art, not anime, not photographic, not a 3D render. Warm golden key light from the upper left, soft cool fill, a gentle rim light on the right shoulder, as in late afternoon. Three-quarter view, head and shoulders, the face centred with the eyes about 40% down from the top, a little empty space above the head, shoulders cropped by the bottom edge. Portrait orientation, 5:6. The background is a soft, dark, atmospheric painted wash of deep green (#2a7a2a), a little lighter behind the head and darker toward the edges, with a faint glow of golden-hour light. No scenery, no props, no text, no frame, no border, no signature, no watermark.
```

## Checklist before you keep one

1. **Thumbnail test:** shrink it to the size of a postage stamp. Is the face clear and the silhouette (hat, hair, collar) distinct from the others?
2. **Same set:** put it beside the Caesar anchor. Same light direction, brushwork, saturation and framing? If it is brighter, glossier or more cartoonish, regenerate it.
3. **Background:** a dark soft wash in the civ colour, no scenery, no text, no frame.
4. **Faces:** two eyes of the same size, natural hands if any show (they should barely show), no extra jewellery blobs.
5. **Dignity:** no grin, no caricature, no stereotype. Skin tone and features respectful and varied.
6. **Not a copy:** if it looks like a famous painting or a film still, regenerate.

## When you bring them back

Tell me which leaders are done. For each image I will: crop it to 5:6, resize to 1000 × 1200, convert to WebP under 250 KB, save it as `packages/client/public/leaders/<id>.webp`, set `portrait.image` in `leaders.json`, rebuild, and screenshot every place a portrait appears (the chips, the leader picker, the intro, diplomacy, the gallery) at desktop and phone size. If one does not match the set, I will say which and why so you can regenerate just that one.
